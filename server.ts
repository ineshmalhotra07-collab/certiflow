import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// In-memory storage
const certificates = new Map<string, Buffer>();
const combinedPdfs = new Map<string, Buffer>();
const zipFiles = new Map<string, Buffer>();
// Link batchId to names/emails/ids
const batchMetadata = new Map<string, { id: string, name: string, email: string }[]>();

app.post('/api/generate', upload.any(), async (req, res) => {
  res.setHeader('Content-Type', 'application/json-stream'); // We will stream json frames separated by newlines
  res.setHeader('Transfer-Encoding', 'chunked');

  const emit = (data: any) => {
    res.write(JSON.stringify(data) + '\n');
  };

  try {
    const files = req.files as Express.Multer.File[];
    const templateFile = files.find(f => f.fieldname === 'template');
    if (!templateFile) {
      emit({ type: 'fatal', error: 'Template file is required' });
      return res.end();
    }

    const specialFiles = files.filter(f => f.fieldname.startsWith('specialFeature_'));

    const dataStr = req.body.data;
    const markersStr = req.body.markers;
    const specialMarkersStr = req.body.specialMarkers; // array of { index: number, x, y }
    const mappingsStr = req.body.mappings;
    const fontSize = parseFloat(req.body.fontSize) || 40;
    const colorHex = req.body.color || '#000000';
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    if (!dataStr || !markersStr || !mappingsStr) {
      emit({ type: 'fatal', error: 'Missing required fields (data, markers, mappings)' });
      return res.end();
    }

    const participants: any[] = JSON.parse(dataStr);
    const markers: { id: string; x: number; y: number; width?: number; height?: number }[] = JSON.parse(markersStr);
    const mappings: Record<string, string> = JSON.parse(mappingsStr);
    const specialMarkers: { index: number; x: number; y: number; size?: number }[] = specialMarkersStr ? JSON.parse(specialMarkersStr) : [];
    const selectedFontName = req.body.font || 'Helvetica';

    const batchId = uuidv4();
    const zip = new JSZip();

    // Parse color
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const generatedCerts: { id: string; name: string; url: string }[] = [];
    const failedCerts: { name: string; reason: string }[] = [];

    // ====== COMBINED PDF SETUP ======
    const combinedDoc = await PDFDocument.create();
    combinedDoc.registerFontkit(fontkit);
    let isPdfTemplate = templateFile.mimetype === 'application/pdf';
    let sourcePdfDoc;
    let templateImage;
    let templateWidth = 500;
    let templateHeight = 500;

    if (isPdfTemplate) {
      sourcePdfDoc = await PDFDocument.load(templateFile.buffer);
    } else {
      if (templateFile.mimetype === 'image/png') {
        templateImage = await combinedDoc.embedPng(templateFile.buffer);
      } else if (templateFile.mimetype === 'image/jpeg' || templateFile.mimetype === 'image/jpg') {
        templateImage = await combinedDoc.embedJpg(templateFile.buffer);
      } else {
        emit({ type: 'fatal', error: 'Unsupported template format: ' + templateFile.mimetype });
        return res.end();
      }
      templateWidth = templateImage.width;
      templateHeight = templateImage.height;
    }

    let combinedFont;
    const fontPath = path.join(process.cwd(), `server-fonts/${selectedFontName.replace(/ /g, '')}.ttf`);
    if (selectedFontName !== 'Helvetica' && fs.existsSync(fontPath)) {
      const fontBytes = fs.readFileSync(fontPath);
      combinedFont = await combinedDoc.embedFont(fontBytes);
    } else {
      combinedFont = await combinedDoc.embedFont(StandardFonts.Helvetica);
    }

    // Embed all special features
    const embeddedSpecialsCombined = [];
    for (const sf of specialFiles) {
      let em;
      if (sf.mimetype === 'image/png') em = await combinedDoc.embedPng(sf.buffer);
      else if (sf.mimetype === 'image/jpeg' || sf.mimetype === 'image/jpg') em = await combinedDoc.embedJpg(sf.buffer);
      if (em) embeddedSpecialsCombined.push(em);
    }

    emit({ type: 'init', total: participants.length });

    // Generate individual certificates
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      let mainName = 'certificate';
      if (markers.length > 0) {
        const firstCol = mappings[markers[0].id];
        if (firstCol && participant[firstCol]) {
          mainName = String(participant[firstCol]);
        }
      }

      req.on('close', () => {
         // Connection closed by client
         // Since we can't easily break the outer loop from here without a flag, we check a flag.
      });

      try {
        // --- Generate Combined Page ---
        let combinedPage;
        if (isPdfTemplate) {
          const [copiedPage] = await combinedDoc.copyPages(sourcePdfDoc, [0]);
          combinedPage = combinedDoc.addPage(copiedPage);
        } else {
          combinedPage = combinedDoc.addPage([templateWidth, templateHeight]);
          combinedPage.drawImage(templateImage, { x: 0, y: 0, width: templateWidth, height: templateHeight });
        }

        // --- Generate Single Page ---
        const singlePdfDoc = await PDFDocument.create();
        singlePdfDoc.registerFontkit(fontkit);
        let singleFont;
        if (selectedFontName !== 'Helvetica' && fs.existsSync(fontPath)) {
          const fontBytes = fs.readFileSync(fontPath);
          singleFont = await singlePdfDoc.embedFont(fontBytes);
        } else {
          singleFont = await singlePdfDoc.embedFont(StandardFonts.Helvetica);
        }
        let singlePage;
        if (isPdfTemplate) {
          const [copiedSingle] = await singlePdfDoc.copyPages(sourcePdfDoc, [0]);
          singlePage = singlePdfDoc.addPage(copiedSingle);
        } else {
          let singleImage = (templateFile.mimetype === 'image/png') 
            ? await singlePdfDoc.embedPng(templateFile.buffer) 
            : await singlePdfDoc.embedJpg(templateFile.buffer);
          singlePage = singlePdfDoc.addPage([templateWidth, templateHeight]);
          singlePage.drawImage(singleImage, { x: 0, y: 0, width: templateWidth, height: templateHeight });
        }

        const embeddedSpecialsSingle = [];
        for (const sf of specialFiles) {
          let em;
          if (sf.mimetype === 'image/png') em = await singlePdfDoc.embedPng(sf.buffer);
          else if (sf.mimetype === 'image/jpeg' || sf.mimetype === 'image/jpg') em = await singlePdfDoc.embedJpg(sf.buffer);
          if (em) embeddedSpecialsSingle.push(em);
        }

        // Draw Special Features
        for (const sm of specialMarkers) {
          const cEm = embeddedSpecialsCombined[sm.index];
          const sEm = embeddedSpecialsSingle[sm.index];
          if (!cEm || !sEm) continue;

          // Target drawn size. Adjust as needed. Let's make it 100px wide for now.
          const sfWidth = sm.size || 100; 
          const sfHeight = (cEm.height / cEm.width) * sfWidth;

          combinedPage.drawImage(cEm, {
            x: (combinedPage.getWidth() * sm.x) - (sfWidth / 2),
            y: combinedPage.getHeight() * (1 - sm.y) - (sfHeight / 2),
            width: sfWidth, height: sfHeight
          });
          singlePage.drawImage(sEm, {
            x: (singlePage.getWidth() * sm.x) - (sfWidth / 2),
            y: singlePage.getHeight() * (1 - sm.y) - (sfHeight / 2),
            width: sfWidth, height: sfHeight
          });
        }

        // Draw Texts with Auto-Fit
        let drawnValidText = false;
        for (const marker of markers) {
          const colName = mappings[marker.id];
          if (!colName) continue;
          
          const rawValue = participant[colName];
          if (rawValue === undefined || rawValue === null || rawValue === '') continue;
          
          const textStr = String(rawValue);
          // Keep all characters including unicode
          const sanitizedTextStr = textStr.trim();
          if (!sanitizedTextStr) continue;

          drawnValidText = true;

          const cx = combinedPage.getWidth() * marker.x;
          const cy = combinedPage.getHeight() * (1 - marker.y);
          const boxWidth = marker.width ? combinedPage.getWidth() * marker.width : undefined;
          const boxHeight = marker.height ? combinedPage.getHeight() * marker.height : undefined;
          
          let margin = 20;
          let maxTextWidth = boxWidth || ((Math.min(cx, combinedPage.getWidth() - cx) * 2) - margin);
          if (maxTextWidth < 50) maxTextWidth = 50;

          let scaledFontSize = fontSize;
          let textWidth = combinedFont.widthOfTextAtSize(sanitizedTextStr, scaledFontSize);

          // Auto-Fit Logic
          while (textWidth > maxTextWidth && scaledFontSize > 8) {
            scaledFontSize -= 1;
            textWidth = combinedFont.widthOfTextAtSize(sanitizedTextStr, scaledFontSize);
          }
          
          // Vertically align if user provided box height, or just center around the clicked point
          const yPos = boxHeight ? (cy - (scaledFontSize / 3)) : cy;

          combinedPage.drawText(sanitizedTextStr, {
            x: cx - (textWidth / 2),
            y: yPos,
            size: scaledFontSize,
            font: combinedFont,
            color: rgb(r, g, b),
          });

          // Single page
          const sx = singlePage.getWidth() * marker.x;
          const sy = singlePage.getHeight() * (1 - marker.y);
          const singleBoxHeight = marker.height ? singlePage.getHeight() * marker.height : undefined;
          const sYPos = singleBoxHeight ? (sy - (scaledFontSize / 3)) : sy;
          
          let singleTextWidth = singleFont.widthOfTextAtSize(sanitizedTextStr, scaledFontSize);
          singlePage.drawText(sanitizedTextStr, {
            x: sx - (singleTextWidth / 2),
            y: sYPos,
            size: scaledFontSize,
            font: singleFont,
            color: rgb(r, g, b),
          });
        }

        if (!drawnValidText && specialMarkers.length === 0) {
          throw new Error('No valid text fields found for mapping, and no special markers placed.');
        }

        const singlePdfBytes = await singlePdfDoc.save();
        const certId = uuidv4();
        const certBuffer = Buffer.from(singlePdfBytes);
        certificates.set(certId, certBuffer);

        const url = `${appUrl}/api/certificates/${certId}`;
        const sanitizedMainName = mainName.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '_').substring(0, 50) || certId;
        generatedCerts.push({ id: certId, name: sanitizedMainName, url });
        zip.file(`${sanitizedMainName}_certificate.pdf`, certBuffer);

        // Store metadata for email step
        let email = '';
        if (req.body.emailColumn && participant[req.body.emailColumn]) {
          email = String(participant[req.body.emailColumn]);
        }
        if (!batchMetadata.has(batchId)) batchMetadata.set(batchId, []);
        batchMetadata.get(batchId)!.push({ id: certId, name: sanitizedMainName, email });

        emit({ type: 'progress', index: i + 1, name: mainName, status: 'success' });
      } catch (err: any) {
        console.error('Error generating certificate for participant:', participant, err);
        failedCerts.push({ name: mainName, reason: err.message || 'Unknown error' });
        emit({ type: 'progress', index: i + 1, name: mainName, status: 'error', reason: err.message });
      }
    }

    if (generatedCerts.length === 0) {
      emit({ type: 'fatal', error: 'No valid certificates were generated. Please check your template and data.' });
      return res.end();
    }

    // Save optimized combined PDF
    const combinedBytes = await combinedDoc.save();
    combinedPdfs.set(batchId, Buffer.from(combinedBytes));

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    zipFiles.set(batchId, zipBuffer);

    emit({
      type: 'complete',
      batchId,
      combinedUrl: `/api/combined/${batchId}`,
      zipUrl: `/api/zip/${batchId}`,
      count: generatedCerts.length,
      failed: failedCerts,
      generated: batchMetadata.get(batchId) || []
    });

    res.end();

  } catch (error: any) {
    console.error('Error generating certificates:', error);
    emit({ type: 'fatal', error: 'Failed to generate certificates', details: error.message });
    res.end();
  }
});

app.get('/api/certificates/:id', (req, res) => {
  const buffer = certificates.get(req.params.id);
  if (!buffer) return res.status(404).send('Certificate not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate_${req.params.id}.pdf"`);
  res.send(buffer);
});

app.get('/api/certificates/:id/base64', (req, res) => {
  const buffer = certificates.get(req.params.id);
  if (!buffer) return res.status(404).json({ error: 'Certificate not found' });
  const base64 = buffer.toString('base64');
  res.json({ base64: `data:application/pdf;base64,${base64}` });
});

app.get('/api/combined/:batchId', (req, res) => {
  const buffer = combinedPdfs.get(req.params.batchId);
  if (!buffer) return res.status(404).send('Combined PDF not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="combined_certificates_${req.params.batchId}.pdf"`);
  res.send(buffer);
});

app.get('/api/zip/:batchId', (req, res) => {
  const buffer = zipFiles.get(req.params.batchId);
  if (!buffer) return res.status(404).send('ZIP file not found');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="certificates_${req.params.batchId}.zip"`);
  res.send(buffer);
});

app.post('/api/send-emails', async (req, res) => {
  const { batchId, subject, body } = req.body;
  const meta = batchMetadata.get(batchId);
  if (!meta) return res.status(404).json({ error: 'Batch not found' });

  // For prototype, we generate an Ethereal test account (real emails won't be spammed, works out of the box zero-config)
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });

    let sentCount = 0;
    for (const cert of meta) {
      if (!cert.email) continue;
      const pdfBuffer = certificates.get(cert.id);
      if (!pdfBuffer) continue;

      // Replace generic placeholder in body
      const personalizedBody = body.replace(/\[Name\]/gi, cert.name);

      await transporter.sendMail({
        from: '"CertiFlow Sender" <noreply@certiflow.app>',
        to: cert.email,
        subject: subject || 'Your Certificate',
        text: personalizedBody,
        attachments: [{
          filename: `${cert.name}_certificate.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });
      sentCount++;
    }

    // Since this is ethereal, we can provide a preview link to the inbox, but standard success is enough for UI
    res.json({ success: true, count: sentCount, message: `Dispatched ${sentCount} emails via Test SMTP` });
  } catch (err: any) {
    console.error('Email send failed:', err);
    res.status(500).json({ error: 'Failed to send emails', details: err.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
