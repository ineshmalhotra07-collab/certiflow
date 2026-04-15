import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// In-memory storage for simplicity in this prototype.
// In a real app, use Cloud Storage (S3/GCS) or a persistent volume.
const certificates = new Map<string, Buffer>();
const masterPdfs = new Map<string, Buffer>();
const zipFiles = new Map<string, Buffer>();

app.post('/api/generate', upload.single('template'), async (req, res) => {
  try {
    const templateFile = req.file;
    if (!templateFile) {
      return res.status(400).json({ error: 'Template file is required' });
    }

    const dataStr = req.body.data;
    const x = parseFloat(req.body.x);
    const y = parseFloat(req.body.y);
    const fontSize = parseFloat(req.body.fontSize) || 40;
    const colorHex = req.body.color || '#000000';
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    if (!dataStr || isNaN(x) || isNaN(y)) {
      return res.status(400).json({ error: 'Missing required fields (data, x, y)' });
    }

    const participants: { name: string; [key: string]: any }[] = JSON.parse(dataStr);
    const batchId = uuidv4();
    const zip = new JSZip();

    // Parse color
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    const generatedCerts: { id: string; name: string; url: string }[] = [];

    // Generate individual certificates
    for (const participant of participants) {
      const name = participant.username || participant.Username || participant.userName || participant.name || participant.Name || Object.values(participant)[0];
      if (!name) continue;
      
      const nameStr = String(name);

      const pdfDoc = await PDFDocument.create();
      let page;

      if (templateFile.mimetype === 'application/pdf') {
        const templateDoc = await PDFDocument.load(templateFile.buffer);
        const [copiedPage] = await pdfDoc.copyPages(templateDoc, [0]);
        page = pdfDoc.addPage(copiedPage);
      } else if (templateFile.mimetype.startsWith('image/')) {
        let image;
        if (templateFile.mimetype === 'image/png') {
          image = await pdfDoc.embedPng(templateFile.buffer);
        } else if (templateFile.mimetype === 'image/jpeg' || templateFile.mimetype === 'image/jpg') {
          image = await pdfDoc.embedJpg(templateFile.buffer);
        } else {
          continue;
        }
        page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      } else {
        return res.status(400).json({ error: 'Unsupported template format' });
      }

      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const textWidth = font.widthOfTextAtSize(nameStr, fontSize);
      
      // x and y from frontend are percentages (0 to 1)
      const actualX = (page.getWidth() * x) - (textWidth / 2);
      // PDF y-axis is from bottom to top, so we invert the y percentage
      const actualY = page.getHeight() * (1 - y);

      page.drawText(nameStr, {
        x: actualX,
        y: actualY,
        size: fontSize,
        font,
        color: rgb(r, g, b),
      });

      const pdfBytes = await pdfDoc.save();
      const certId = uuidv4();
      const certBuffer = Buffer.from(pdfBytes);
      certificates.set(certId, certBuffer);

      const url = `${appUrl}/api/certificates/${certId}`;
      generatedCerts.push({ id: certId, name: nameStr, url });

      zip.file(`${nameStr.replace(/[^a-z0-9]/gi, '_')}_certificate.pdf`, certBuffer);
    }

    // Generate Master PDF
    const masterDoc = await PDFDocument.create();
    let masterPage = masterDoc.addPage();
    const font = await masterDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await masterDoc.embedFont(StandardFonts.HelveticaBold);
    
    let currentY = masterPage.getHeight() - 50;
    const margin = 50;

    masterPage.drawText('Master Certificate List', { x: margin, y: currentY, size: 24, font: boldFont });
    currentY -= 40;

    for (const cert of generatedCerts) {
      if (currentY < 100) {
        masterPage = masterDoc.addPage();
        currentY = masterPage.getHeight() - 50;
      }

      // Generate QR Code
      const qrDataUrl = await QRCode.toDataURL(cert.url);
      const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      const qrImage = await masterDoc.embedPng(qrImageBytes);

      masterPage.drawText(cert.name, { x: margin, y: currentY, size: 14, font });
      masterPage.drawImage(qrImage, {
        x: margin + 300,
        y: currentY - 20,
        width: 50,
        height: 50,
      });

      currentY -= 80;
    }

    const masterBytes = await masterDoc.save();
    const masterBuffer = Buffer.from(masterBytes);
    masterPdfs.set(batchId, masterBuffer);

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    zipFiles.set(batchId, zipBuffer);

    res.json({
      batchId,
      masterUrl: `/api/master/${batchId}`,
      zipUrl: `/api/zip/${batchId}`,
      count: generatedCerts.length
    });

  } catch (error) {
    console.error('Error generating certificates:', error);
    res.status(500).json({ error: 'Failed to generate certificates' });
  }
});

app.get('/api/certificates/:id', (req, res) => {
  const buffer = certificates.get(req.params.id);
  if (!buffer) return res.status(404).send('Certificate not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate_${req.params.id}.pdf"`);
  res.send(buffer);
});

app.get('/api/master/:batchId', (req, res) => {
  const buffer = masterPdfs.get(req.params.batchId);
  if (!buffer) return res.status(404).send('Master PDF not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="master_list_${req.params.batchId}.pdf"`);
  res.send(buffer);
});

app.get('/api/zip/:batchId', (req, res) => {
  const buffer = zipFiles.get(req.params.batchId);
  if (!buffer) return res.status(404).send('ZIP file not found');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="certificates_${req.params.batchId}.zip"`);
  res.send(buffer);
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
