import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, CheckCircle2, Download, FileArchive, ArrowRight, ArrowLeft } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const [step, setStep] = useState(1);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<{ masterUrl: string; zipUrl: string; count: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Handle template upload
  const processTemplateFile = async (file: File) => {
    setTemplateFile(file);
    setPosition(null);

    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context!, viewport }).promise;
      setTemplatePreview(canvas.toDataURL());
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setTemplatePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processTemplateFile(file);
  };

  const handleTemplateDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processTemplateFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPosition({ x, y });
  };

  // Handle data upload
  const processDataFile = (file: File) => {
    setDataFile(file);

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setParticipants(results.data);
          if (results.data.length > 0) {
            setHeaders(Object.keys(results.data[0] as object));
          }
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        setParticipants(jsonData);
        if (jsonData.length > 0) {
          setHeaders(Object.keys(jsonData[0] as object));
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processDataFile(file);
  };

  const handleDataDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processDataFile(file);
  };

  const generateCertificates = async () => {
    if (!templateFile || !position || participants.length === 0) return;
    
    setIsGenerating(true);
    const formData = new FormData();
    formData.append('template', templateFile);
    formData.append('data', JSON.stringify(participants));
    formData.append('x', position.x.toString());
    formData.append('y', position.y.toString());
    formData.append('fontSize', '40'); // Could be made configurable
    formData.append('color', '#000000'); // Could be made configurable

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Generation failed');
      
      const data = await response.json();
      setResults(data);
      setStep(4);
    } catch (error) {
      console.error(error);
      alert('Failed to generate certificates. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <FileType className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-semibold tracking-tight">CertiFlow</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-12">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {s}
              </div>
              {s < 4 && (
                <div className={`w-24 h-1 mx-4 rounded transition-colors ${
                  step > s ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Upload Template</h2>
                <p className="text-gray-500">Upload your certificate design (PNG, JPG, or PDF) and click where the name should appear.</p>
              </div>

              {!templatePreview ? (
                <label 
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                  onDrop={handleTemplateDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">PNG, JPG or PDF</p>
                  </div>
                  <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleTemplateUpload} />
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="relative inline-block border rounded-lg overflow-hidden shadow-sm">
                    <img 
                      ref={imageRef}
                      src={templatePreview} 
                      alt="Template preview" 
                      className="max-w-full h-auto cursor-crosshair"
                      onClick={handleImageClick}
                    />
                    {position && (
                      <div 
                        className="absolute w-4 h-4 bg-blue-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-lg border-2 border-white pointer-events-none"
                        style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
                      >
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          Name Position
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => { setTemplatePreview(null); setPosition(null); setTemplateFile(null); }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Upload different template
                    </button>
                    <button 
                      onClick={() => setStep(2)}
                      disabled={!position}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next Step <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Upload Data</h2>
                <p className="text-gray-500">Upload a CSV or Excel file containing the participant names.</p>
              </div>

              {!participants.length ? (
                <label 
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                  onDrop={handleDataDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">CSV or Excel (.xlsx)</p>
                  </div>
                  <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleDataUpload} />
                </label>
              ) : (
                <div className="space-y-6">
                  <div className="bg-gray-50 border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-100/50 flex justify-between items-center">
                      <h3 className="font-medium text-gray-700">Data Preview ({participants.length} rows)</h3>
                      <button 
                        onClick={() => { setParticipants([]); setDataFile(null); }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Upload different file
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 shadow-sm">
                          <tr>
                            {headers.map((h, i) => (
                              <th key={i} className="px-6 py-3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {participants.slice(0, 10).map((row, i) => (
                            <tr key={i} className="bg-white border-b hover:bg-gray-50">
                              {headers.map((h, j) => (
                                <td key={j} className="px-6 py-4">{row[h]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {participants.length > 10 && (
                        <div className="text-center py-3 text-sm text-gray-500 bg-white">
                          Showing first 10 rows...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setStep(1)}
                      className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button 
                      onClick={() => setStep(3)}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Review & Generate <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 text-center py-8">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-3xl font-semibold">Ready to Generate</h2>
                <p className="text-gray-500 text-lg">
                  We'll generate <strong>{participants.length}</strong> certificates using your template.
                </p>
              </div>

              <div className="flex justify-center gap-4 pt-4">
                <button 
                  onClick={() => setStep(2)}
                  disabled={isGenerating}
                  className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Go Back
                </button>
                <button 
                  onClick={generateCertificates}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Certificates'
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 4 && results && (
            <div className="space-y-8 text-center py-8">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-3xl font-semibold">Success!</h2>
                <p className="text-gray-500 text-lg">
                  Successfully generated {results.count} certificates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto pt-4">
                <a 
                  href={results.masterUrl}
                  download
                  className="flex flex-col items-center p-6 border-2 border-gray-100 rounded-2xl hover:border-blue-100 hover:bg-blue-50 transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Download className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Master PDF</h3>
                  <p className="text-sm text-gray-500 text-center">Contains all names and QR codes linking to individual certificates.</p>
                </a>

                <a 
                  href={results.zipUrl}
                  download
                  className="flex flex-col items-center p-6 border-2 border-gray-100 rounded-2xl hover:border-blue-100 hover:bg-blue-50 transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <FileArchive className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">ZIP Archive</h3>
                  <p className="text-sm text-gray-500 text-center">Download all individual certificate PDFs in a single ZIP file.</p>
                </a>
              </div>

              <div className="pt-8">
                <button 
                  onClick={() => {
                    setStep(1);
                    setTemplateFile(null);
                    setTemplatePreview(null);
                    setPosition(null);
                    setDataFile(null);
                    setParticipants([]);
                    setResults(null);
                  }}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Create another batch
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
