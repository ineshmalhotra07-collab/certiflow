import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, CheckCircle2, Download, FileArchive, ArrowRight, ArrowLeft } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { sendCertificateEmail } from './emailService';

import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { ParticleBackground } from './components/ParticleBackground';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'generator'>('landing');
  const [step, setStep] = useState(1);
  const [specialFeatures, setSpecialFeatures] = useState<{ id: string; file: File; preview: string }[]>([]);
  
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [markers, setMarkers] = useState<{ id: string; x: number; y: number; width?: number; height?: number }[]>([]);
  const [specialMarkers, setSpecialMarkers] = useState<{ id: string; index: number; x: number; y: number; size: number }[]>([]);
  const [activeSpecialFeatureIndex, setActiveSpecialFeatureIndex] = useState<number>(0);
  const [activeSpecialFeatureSize, setActiveSpecialFeatureSize] = useState<number>(100);
  const [placementMode, setPlacementMode] = useState<'text' | 'special'>('text');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  const FONTS = [
    'Cinzel', 'Cormorant Garamond', 'Playfair Display', 'Great Vibes', 
    'Dancing Script', 'Montserrat', 'EB Garamond', 'Libre Baskerville', 
    'Raleway', 'Lato'
  ];
  const [selectedFont, setSelectedFont] = useState<string>('Cinzel');

  const [dataFile, setDataFile] = useState<File | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<{ combinedUrl: string; zipUrl: string; count: number; failed: any[], generated: { id: string, name: string, email: string }[] } | null>(null);
  
  const [emailConfig, setEmailConfig] = useState({ column: '', subject: '', body: 'Hi [Name],\n\nPlease find your certificate attached.\n\nBest regards,' });
  
  const [emailjsCreds, setEmailjsCreds] = useState({ 
    serviceId: localStorage.getItem('emailjs_serviceId') || '', 
    templateId: localStorage.getItem('emailjs_templateId') || '', 
    publicKey: localStorage.getItem('emailjs_publicKey') || '' 
  });
  
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed';
  interface EmailItem {
    id: string;
    name: string;
    email: string;
    status: EmailStatus;
    timestamp?: string;
    error?: string;
  }
  const [emailList, setEmailList] = useState<EmailItem[]>([]);
  
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailProgress, setEmailProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emailGuideOpen, setEmailGuideOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; onCancel: () => void } | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('emailjs_serviceId', emailjsCreds.serviceId);
    localStorage.setItem('emailjs_templateId', emailjsCreds.templateId);
    localStorage.setItem('emailjs_publicKey', emailjsCreds.publicKey);
  }, [emailjsCreds]);

  useEffect(() => {
    if (step === 7 && results?.generated) {
      if (emailList.length === 0) {
        setEmailList(results.generated.filter(g => g.email).map(g => ({
          ...g,
          status: 'pending' as EmailStatus
        })));
      }
    }
  }, [step, results]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSpecialFeatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSpecialFeatures(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          file,
          preview: ev.target?.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSpecialDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSpecialFeatures(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          file,
          preview: ev.target?.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeSpecialFeature = (id: string) => {
    setSpecialFeatures(prev => prev.filter(sf => sf.id !== id));
    // Also remove any placed markers for this feature
    const indexToRemove = specialFeatures.findIndex(sf => sf.id === id);
    setSpecialMarkers(prev => prev.filter(sm => sm.index !== indexToRemove).map(sm => sm.index > indexToRemove ? { ...sm, index: sm.index - 1 } : sm));
  };

  // Handle template upload
  const processTemplateFile = async (file: File) => {
    setTemplateFile(file);
    setMarkers([]);
    setSpecialMarkers([]);

    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // @ts-ignore
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
    
    if (placementMode === 'special') {
      setSpecialMarkers([...specialMarkers, { id: Date.now().toString(), index: activeSpecialFeatureIndex, x, y, size: activeSpecialFeatureSize }]);
      setPlacementMode('text');
    } else {
      setMarkers([...markers, { id: Date.now().toString(), x, y, width: 0.4, height: 0.1 }]);
    }
  };

  const updateMarkerRect = (id: string, x: number, y: number, width: number, height: number, rectW: number, rectH: number) => {
    setMarkers(prev => prev.map(m => m.id === id ? {
      ...m,
      x: x / rectW,
      y: y / rectH,
      width: width / rectW,
      height: height / rectH
    } : m));
  };

  // Handle data upload
  const processDataFile = (file: File) => {
    setDataFile(file);

    const handleParsedData = (data: any[]) => {
      setParticipants(data);
      if (data.length > 0) {
        const cols = Object.keys(data[0] as object);
        setHeaders(cols);
        
        // Auto-detect email column
        const emailCol = cols.find(c => c.toLowerCase().includes('email') || c.toLowerCase().includes('mail') || c.toLowerCase().includes('e-mail'));
        if (emailCol) {
           setEmailConfig(prev => ({ ...prev, column: emailCol }));
        }
      }
    };

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          handleParsedData(results.data);
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        handleParsedData(jsonData);
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

  const startGenerationProcess = async () => {
    setIsGenerating(true);
    setGenerateProgress({ current: 0, total: participants.length, name: 'Starting...' });
    
    abortControllerRef.current = new AbortController();

    const formData = new FormData();
    formData.append('template', templateFile!);
    formData.append('data', JSON.stringify(participants));
    formData.append('markers', JSON.stringify(markers));
    formData.append('mappings', JSON.stringify(mappings));
    formData.append('specialMarkers', JSON.stringify(specialMarkers));
    formData.append('font', selectedFont);
    formData.append('fontSize', '40'); 
    formData.append('color', '#000000'); 
    if (emailConfig.column) {
      formData.append('emailColumn', emailConfig.column);
    }

    specialFeatures.forEach((sf, i) => {
      formData.append(`specialFeature_${i}`, sf.file);
    });

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Unsupported browser');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete piece

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'init') {
               setGenerateProgress(prev => prev ? { ...prev, total: ev.total } : null);
            } else if (ev.type === 'progress') {
               setGenerateProgress(prev => prev ? { ...prev, current: ev.index, name: ev.name } : null);
            } else if (ev.type === 'fatal') {
               throw new Error(ev.error || 'Server error');
            } else if (ev.type === 'complete') {
               finalResult = ev;
            }
          } catch(e) {
            console.error("Failed to parse chunk", e, line);
          }
        }
      }
      
      if (finalResult) {
        setResults(finalResult);
        setStep(6);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
         setErrorDialog('Generation cancelled.');
      } else {
         console.error(error);
         setErrorDialog(`Failed to generate certificates: ${error.message}`);
      }
    } finally {
      setIsGenerating(false);
      setGenerateProgress(null);
      abortControllerRef.current = null;
    }
  };

  const generateCertificates = async () => {
    if (!templateFile || markers.length === 0 || participants.length === 0) return;
    
    // Duplicate check
    const firstColDataArray = participants.map((p) => {
       const mappedCol = mappings[markers[0]?.id];
       return mappedCol ? String(p[mappedCol]) : '';
    }).filter(v => v);
    
    const duplicates = firstColDataArray.filter((item, index) => firstColDataArray.indexOf(item) !== index);
    if (duplicates.length > 0) {
      const uniqueDupes = Array.from(new Set(duplicates));
      setConfirmDialog({
        title: 'Duplicate Names Detected',
        message: `${uniqueDupes.length} duplicate names detected: ${uniqueDupes.slice(0, 5).join(', ')}${uniqueDupes.length > 5 ? '...' : ''}. \n\nDo you want to continue anyway or go back and fix the data?`,
        onConfirm: () => {
          setConfirmDialog(null);
          startGenerationProcess();
        },
        onCancel: () => {
          setConfirmDialog(null);
        }
      });
      return;
    }
    
    startGenerationProcess();
  };

  if (currentView === 'landing') {
    return (
      <div className="relative overflow-hidden bg-slate-950">
        <ParticleBackground lightEmission={true} glowIntensity={1} />
        <LandingPage onGetStarted={() => setCurrentView('generator')} />
      </div>
    );
  }

  if (currentView === 'dashboard') {
    return <Dashboard onBack={() => setCurrentView('generator')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="max-w-5xl flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('landing')}>
          <FileType className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-semibold tracking-tight">CertiFlow</h1>
        </div>
        <button onClick={() => setCurrentView('dashboard')} className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
          Dashboard
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-12 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors min-w-[40px] shrink-0 ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {s}
              </div>
              {s < 6 && (
                <div className={`w-10 h-1 mx-2 sm:w-16 sm:mx-4 rounded transition-colors shrink-0 ${
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
                <h2 className="text-2xl font-semibold mb-2">Upload Special Features</h2>
                <p className="text-gray-500">Do you have any special features you would want to add to the certificate which are not present in the excel file? (e.g., Signatures, Logos, Stamps). You can upload multiple.</p>
              </div>

              <div className="space-y-4">
                <label 
                  className="flex flex-col items-center justify-center w-full h-40 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                  onDrop={handleSpecialDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="mb-1 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500">PNG, JPG or PDF</p>
                  </div>
                  <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" multiple onChange={handleSpecialFeatureUpload} />
                </label>
                
                {specialFeatures.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                    {specialFeatures.map((sf, idx) => (
                      <div key={sf.id} className="relative group border rounded-lg p-2 bg-white shadow-sm flex flex-col items-center justify-center">
                        <img src={sf.preview} alt={`Special Feature ${idx + 1}`} className="max-h-24 object-contain" />
                        <button 
                          onClick={() => removeSpecialFeature(sf.id)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between pt-4">
                  <button 
                    onClick={() => setStep(2)}
                    className="text-gray-600 hover:text-gray-900 font-medium px-4 py-2"
                  >
                    {specialFeatures.length > 0 ? "Done with specials" : "Skip this step"}
                  </button>
                  {specialFeatures.length > 0 && (
                    <button 
                      onClick={() => setStep(2)}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Next Step <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Upload Template</h2>
                <p className="text-gray-500">Upload your certificate design (PNG, JPG, or PDF) and click to add markers where data should appear.</p>
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
                  {specialFeatures.length > 0 && (
                    <div className="flex flex-col items-center justify-center mb-4 gap-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                      <div className="flex gap-4">
                        <button
                          onClick={() => setPlacementMode('text')}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${placementMode === 'text' ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          Add Text Markers
                        </button>
                        <button
                          onClick={() => setPlacementMode('special')}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${placementMode === 'special' ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          Place Special Feature
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 font-medium">Font:</span>
                        <select 
                          value={selectedFont} 
                          onChange={e => setSelectedFont(e.target.value)}
                          className="border-gray-300 rounded-md py-1.5 px-3 text-sm focus:ring-blue-500 focus:border-blue-500 border bg-white"
                          style={{ fontFamily: selectedFont }}
                        >
                          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                        </select>
                      </div>

                      {placementMode === 'special' && (
                        <div className="flex flex-col gap-2 bg-white p-3 rounded-lg border shadow-sm w-64 text-sm mt-3 sm:mt-0">
                          <label className="flex flex-col gap-1">
                            <span className="font-semibold text-gray-700">Select feature to place:</span>
                            <select 
                              className="border-gray-300 rounded-md py-1 px-2 border"
                              value={activeSpecialFeatureIndex}
                              onChange={(e) => setActiveSpecialFeatureIndex(Number(e.target.value))}
                            >
                              {specialFeatures.map((sf, idx) => (
                                <option key={sf.id} value={idx}>Special Feature #{idx + 1}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 mt-2">
                            <span className="font-semibold text-gray-700">Display Size (px): {activeSpecialFeatureSize}</span>
                            <input 
                              type="range" 
                              min="20" 
                              max="400" 
                              value={activeSpecialFeatureSize}
                              onChange={(e) => setActiveSpecialFeatureSize(Number(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`relative inline-block border rounded-lg overflow-hidden shadow-sm ${placementMode === 'special' ? 'cursor-alias' : 'cursor-crosshair'}`}>
                    <img 
                      ref={imageRef}
                      src={templatePreview} 
                      alt="Template preview" 
                      className="max-w-full h-auto"
                      onClick={handleImageClick}
                    />
                    {markers.map((m, i) => {
                      const mWidth = (m.width || 0.4) * 100;
                      const mHeight = (m.height || 0.1) * 100;
                      
                      return (
                      <div 
                        key={m.id}
                        className="absolute border-2 border-red-500 bg-red-500/10 shadow-sm overflow-hidden flex items-center justify-center cursor-move pointer-events-auto"
                        style={{ 
                          left: `${m.x * 100}%`, top: `${m.y * 100}%`,
                          width: `${mWidth}%`, height: `${mHeight}%`,
                        }}
                        onMouseDown={(e) => {
                           e.stopPropagation();
                           e.preventDefault();
                           const startX = e.clientX;
                           const startY = e.clientY;
                           const startLeft = m.x;
                           const startTop = m.y;
                           
                           const onMouseMove = (moveEv: MouseEvent) => {
                             if (!imageRef.current) return;
                             const rect = imageRef.current.getBoundingClientRect();
                             const diffX = (moveEv.clientX - startX) / rect.width;
                             const diffY = (moveEv.clientY - startY) / rect.height;
                             setMarkers(prev => prev.map(p => p.id === m.id ? { ...p, x: startLeft + diffX, y: startTop + diffY } : p));
                           };
                           const onMouseUp = () => {
                             window.removeEventListener('mousemove', onMouseMove);
                             window.removeEventListener('mouseup', onMouseUp);
                           };
                           window.addEventListener('mousemove', onMouseMove);
                           window.addEventListener('mouseup', onMouseUp);
                        }}
                      >
                        <span className="text-gray-800 text-sm opacity-80 whitespace-nowrap pointer-events-none" style={{ fontFamily: selectedFont, fontSize: '100%' }}>Sample {i+1}</span>
                        <div 
                          className="absolute bottom-0 right-0 w-4 h-4 bg-red-600 cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                             e.stopPropagation();
                             e.preventDefault();
                             const startX = e.clientX;
                             const startY = e.clientY;
                             const startWidth = m.width || 0.4;
                             const startHeight = m.height || 0.1;

                             const onMouseMove = (moveEv: MouseEvent) => {
                               if (!imageRef.current) return;
                               const rect = imageRef.current.getBoundingClientRect();
                               const diffX = (moveEv.clientX - startX) / rect.width;
                               const diffY = (moveEv.clientY - startY) / rect.height;
                               setMarkers(prev => prev.map(p => p.id === m.id ? { ...p, width: Math.max(0.05, startWidth + diffX), height: Math.max(0.02, startHeight + diffY) } : p));
                             };
                             const onMouseUp = () => {
                               window.removeEventListener('mousemove', onMouseMove);
                               window.removeEventListener('mouseup', onMouseUp);
                             };
                             window.addEventListener('mousemove', onMouseMove);
                             window.addEventListener('mouseup', onMouseUp);
                          }}
                        />
                      </div>
                    )})}
                    {specialMarkers.map((sm, i) => (
                      <div 
                        key={sm.id}
                        className="absolute bg-purple-600/20 border-2 border-purple-600 border-dashed transform -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
                        style={{ left: `${sm.x * 100}%`, top: `${sm.y * 100}%`, width: `${Math.max(20, sm.size / 2)}px`, height: `${Math.max(20, sm.size / 2)}px` }}
                      >
                        <span className="text-xs font-bold text-purple-700 leading-none">★</span>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm">
                          {`Special #${sm.index + 1}`}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setStep(1)}
                        className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                      >
                        <ArrowLeft className="w-4 h-4 inline mr-1" />
                        Back to Special Feature
                      </button>
                      <button 
                        onClick={() => { setTemplatePreview(null); setMarkers([]); setTemplateFile(null); setSpecialMarkers([]); }}
                        className="text-sm text-gray-500 hover:text-gray-700 ml-4"
                      >
                        Different template
                      </button>
                      {(markers.length > 0 || specialMarkers.length > 0) && (
                        <button 
                          onClick={() => { setMarkers([]); setSpecialMarkers([]); }}
                          className="text-sm text-red-500 hover:text-red-700"
                        >
                          Clear all markers
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => setStep(3)}
                      disabled={markers.length === 0}
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
                <p className="text-gray-500">
                  Upload a CSV or Excel file containing the participant data.
                </p>
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
                        onClick={() => { setParticipants([]); setDataFile(null); setMappings({}); }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Upload different file
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 shadow-sm z-10">
                          <tr>
                            {headers.map((h, i) => (
                              <th 
                                key={i} 
                                className="px-6 py-3 transition-colors whitespace-nowrap text-gray-700 font-semibold"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {participants.slice(0, 10).map((row, i) => (
                            <tr key={i} className="bg-white border-b hover:bg-gray-50">
                              {headers.map((h, j) => (
                                <td 
                                  key={j} 
                                  className="px-6 py-4 whitespace-nowrap"
                                >
                                  {row[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {participants.length > 10 && (
                        <div className="text-center py-3 text-sm text-gray-500 bg-white border-t">
                          Showing first 10 rows...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setStep(2)}
                      className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button 
                      onClick={() => setStep(4)}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Next Step <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Map Data Fields</h2>
                <p className="text-gray-500">Match each marker on your template with a column from your data file.</p>
                {specialFeatures.length > 0 && specialMarkers.length > 0 && (
                  <div className="mt-4 p-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{specialMarkers.length} special marker(s) have been successfully placed and linked! They will be automatically rendered on generation.</span>
                  </div>
                )}
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {markers.map((m, index) => (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <span className="font-medium text-gray-700">Marker {index + 1}</span>
                      </div>
                      <div className="w-64">
                        <select 
                          className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          value={mappings[m.id] || ''}
                          onChange={(e) => setMappings({ ...mappings, [m.id]: e.target.value })}
                        >
                          <option value="">Select column...</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  
                  <div className="p-4 flex items-center justify-between hover:bg-gray-50 bg-indigo-50 border-t-2 border-indigo-100">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
                        @
                      </div>
                      <span className="font-medium text-indigo-900">Email Address (Optional)</span>
                    </div>
                    <div className="w-64">
                      <select 
                        className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        value={emailConfig.column}
                        onChange={(e) => setEmailConfig({ ...emailConfig, column: e.target.value })}
                      >
                        <option value="">No Email Mapping</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <button 
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button 
                  onClick={() => setStep(5)}
                  disabled={Object.values(mappings).length !== markers.length || Object.values(mappings).some(v => !v)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Review & Generate <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 text-center py-8">
              {!generateProgress ? (
                <>
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
                      onClick={() => setStep(4)}
                      disabled={isGenerating}
                      className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      Go Back
                    </button>
                    <button 
                      onClick={generateCertificates}
                      disabled={isGenerating}
                      className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      Generate Certificates
                    </button>
                  </div>
                </>
              ) : (
                <div className="max-w-xl mx-auto space-y-6">
                  <h2 className="text-2xl font-semibold">Generating Certificates...</h2>
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${(generateProgress.current / generateProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-gray-600">
                    Generating: <strong>{generateProgress.name}</strong> ({generateProgress.current} of {generateProgress.total})
                  </p>
                  <div className="pt-4">
                    <button 
                      onClick={() => abortControllerRef.current?.abort()}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      Cancel Generation
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 6 && results && (
            <div className="space-y-8 text-center py-8">
              <div className="max-w-md mx-auto space-y-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${results.failed && results.failed.length > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                  <CheckCircle2 className={`w-10 h-10 ${results.failed && results.failed.length > 0 ? 'text-orange-600' : 'text-green-600'}`} />
                </div>
                <h2 className="text-3xl font-semibold">Generation Complete!</h2>
                <p className="text-gray-600 text-lg">
                  <strong>{results.count}</strong> certificates generated successfully.
                  {results.failed && results.failed.length > 0 && (
                     <span className="text-red-500 ml-2"><strong>{results.failed.length}</strong> failed.</span>
                  )}
                </p>
              </div>

              {results.failed && results.failed.length > 0 && (
                <div className="max-w-xl mx-auto bg-red-50 text-red-700 p-4 rounded-lg text-left overflow-y-auto max-h-48 border border-red-100">
                  <h3 className="font-semibold mb-2">Failed Certificates:</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {results.failed.map((fc, i) => (
                      <li key={i}><strong>{fc.name}</strong>: {fc.reason}</li>
                    ))}
                  </ul>
                  <button className="mt-4 text-sm font-medium hover:underline text-red-800">Retry Failed Only</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto pt-4">
                <a 
                  href={results.combinedUrl}
                  download
                  className="flex flex-col items-center p-6 border-2 border-gray-100 rounded-2xl hover:border-blue-100 hover:bg-blue-50 transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Download className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Combined PDF</h3>
                  <p className="text-sm text-gray-500 text-center">Contains all generated certificates grouped into a single PDF document.</p>
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

              <div className="flex flex-col items-center gap-4 pt-8">
                {emailConfig.column && (
                  <button 
                    onClick={() => setStep(7)}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Send Certificates by Email
                  </button>
                )}
                <button 
                  onClick={() => {
                    setStep(1);
                    setSpecialFeatures([]);
                    setSpecialMarkers([]);
                    setPlacementMode('text');
                    setTemplateFile(null);
                    setTemplatePreview(null);
                    setMarkers([]);
                    setMappings({});
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

          {step === 7 && results && (
            <div className="space-y-6 max-w-3xl mx-auto py-4 transition-all duration-200">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Send Emails via EmailJS</h2>
                <p className="text-gray-500">Configure your EmailJS credentials and email template to deliver the certificates.</p>
              </div>

              {/* Setup Guide Collapsible */}
              <div className="bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-200">
                <button 
                  onClick={() => setEmailGuideOpen(!emailGuideOpen)}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">EmailJS Setup Guide</span>
                  <span className="text-gray-500 text-sm">{emailGuideOpen ? 'Hide' : 'Show'} details</span>
                </button>
                {emailGuideOpen && (
                  <div className="p-4 bg-white border-t text-sm text-gray-600 space-y-2 leading-relaxed transition-all duration-200">
                    <p>1. Go to <strong>emailjs.com</strong> and create a free account.</p>
                    <p>2. Add a Gmail or Outlook service and copy the <strong>Service ID</strong>.</p>
                    <p>3. Create an email template. Use these exact variables in your template text: <code>{`{{to_name}}`}</code>, <code>{`{{to_email}}`}</code>, <code>{`{{subject}}`}</code>, <code>{`{{message}}`}</code>.</p>
                    <p>4. Make sure your template allows attachments. Copy the <strong>Template ID</strong>.</p>
                    <p>5. Go to Account Settings to find your <strong>Public Key</strong>.</p>
                    <p>6. Paste all three below and click "Test Connection" to verify.</p>
                  </div>
                )}
              </div>

              {/* Credentials Form */}
              <div className="bg-white p-5 rounded-xl border shadow-sm transition-all duration-200 space-y-4">
                <h3 className="font-semibold text-gray-800">EmailJS Credentials</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Service ID</label>
                    <input type="text" className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200" value={emailjsCreds.serviceId} onChange={e => setEmailjsCreds({...emailjsCreds, serviceId: e.target.value})} placeholder="service_xyz123" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Template ID</label>
                    <input type="text" className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200" value={emailjsCreds.templateId} onChange={e => setEmailjsCreds({...emailjsCreds, templateId: e.target.value})} placeholder="template_abc456" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Public Key</label>
                    <input type="text" className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200" value={emailjsCreds.publicKey} onChange={e => setEmailjsCreds({...emailjsCreds, publicKey: e.target.value})} placeholder="publicKey789" />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
                  <input type="email" className="border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 w-full sm:w-64" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Your email for testing..." />
                  <button 
                    disabled={isTesting || !emailjsCreds.serviceId || !emailjsCreds.templateId || !emailjsCreds.publicKey || !testEmail}
                    onClick={async () => {
                      setIsTesting(true);
                      setTestResult(null);
                      try {
                        const dummyPdfBase64 = 'JVBERi0xLjcKCjEgMCBvYmogICUKPDwKIC9UeXBlIC9DYXRhbG9nCiAvUGFnZXMgMiAwIFIKPj4KZW5kb2JqCgoyIDAgb2JqCjwwCiAvVHlwZSAvUGFnZXMKIC9LaWRzIFszIDAgUl0KIC9Db3VudCAxCj4+CmVuZG9iagoKMyAwIG9iago8PAogL1R5cGUgL1BhZ2UKIC9QYXJlbnQgMiAwIFIKIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCj4+CmVuZG9iagoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExMyAwMDAwMCBuIAp0cmFpbGVyCjw8CiAvU2l6ZSA0CiAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMTczCiUlRU9GCg==';
                        await sendCertificateEmail(emailjsCreds.serviceId, emailjsCreds.templateId, emailjsCreds.publicKey, testEmail, 'Test User', 'Test Connection', 'This is a test connection email.', dummyPdfBase64);
                        setTestResult({ success: true, message: 'Connection successful' });
                      } catch (err: any) {
                        setTestResult({ success: false, message: 'Connection failed: ' + (err.text || err.message || 'Unknown error') });
                      }
                      setIsTesting(false);
                    }}
                    className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 disabled:opacity-50 whitespace-nowrap outline-none"
                  >
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testResult && (
                    <span className={`text-sm font-medium transition-all duration-200 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Email Content Config */}
              <div className="bg-white p-5 rounded-xl border shadow-sm transition-all duration-200 space-y-4">
                <h3 className="font-semibold text-gray-800">Email Contents</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input 
                    type="text" 
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2 border outline-none transition-all duration-200"
                    value={emailConfig.subject}
                    onChange={(e) => setEmailConfig({ ...emailConfig, subject: e.target.value })}
                    placeholder="Your Certificate"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Body (Use [Name] to insert recipient's name)</label>
                  <textarea 
                    rows={4}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2 border outline-none transition-all duration-200"
                    value={emailConfig.body}
                    onChange={(e) => setEmailConfig({ ...emailConfig, body: e.target.value })}
                  />
                </div>
              </div>

              {/* Progress and Live List */}
              {(isSendingEmails || emailResult || emailList.some(e => e.status !== 'pending')) && (
                <div className="bg-white p-5 rounded-xl border shadow-sm transition-all duration-200 flex flex-col gap-4">
                  
                  {emailProgress && (
                    <div className="transition-all duration-200">
                      <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                        <span>Sending email {emailProgress.current} of {emailProgress.total} — {emailProgress.name}</span>
                        <span>{Math.round((emailProgress.current / emailProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="border border-gray-100 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-50 transition-all duration-200 bg-gray-50">
                    {emailList.map(item => (
                      <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 hover:bg-gray-100 transition-colors duration-200">
                        <div className="flex items-center gap-3">
                          {item.status === 'pending' && <span className="text-gray-400 font-medium text-sm w-20">⏳ Pending</span>}
                          {item.status === 'sending' && <span className="text-blue-500 font-medium text-sm w-20 animate-pulse">📤 Sending</span>}
                          {item.status === 'sent' && <span className="text-green-600 font-medium text-sm w-20 flex items-center gap-1">✅ Sent</span>}
                          {item.status === 'failed' && <span className="text-red-500 font-medium text-sm w-20">❌ Failed</span>}
                          
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800 text-sm">{item.name}</span>
                            <span className="text-gray-500 text-xs">{item.email}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                           {item.status === 'sent' && item.timestamp && <span className="text-gray-400">{item.timestamp}</span>}
                           {item.status === 'failed' && item.error && <span className="text-red-500 block max-w-xs truncate" title={item.error}>{item.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {emailResult && (
                    <div className={`p-4 rounded-lg mt-2 font-medium transition-all duration-500 border ${emailResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                      {emailResult.message}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4 transition-all duration-200">
                <button 
                  onClick={() => setStep(6)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg transition-colors duration-200 outline-none"
                >
                  <ArrowLeft className="w-4 h-4" /> Skip / Back to Downloads
                </button>
                <div className="flex items-center gap-3">
                    {emailResult && (
                      <button 
                        onClick={() => {
                          setStep(1);
                          // Full reset state code
                          setSpecialFeatures([]); setSpecialMarkers([]); setTemplateFile(null); setTemplatePreview(null);
                          setMarkers([]); setMappings({}); setDataFile(null); setParticipants([]); setResults(null);
                          setCurrentView('dashboard');
                        }}
                        className="bg-gray-100 text-gray-800 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors duration-200"
                      >
                        Done
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        setIsSendingEmails(true);
                        setEmailResult(null);
                        
                        // Decide which items to process (all pending/failed)
                        const itemsToProcess = emailList.filter(e => e.status === 'pending' || e.status === 'failed');
                        if (itemsToProcess.length === 0) {
                          setIsSendingEmails(false);
                          return;
                        }

                        let successes = emailList.filter(e => e.status === 'sent').length;
                        let failures = 0;
                        let processedThisRun = 0;

                        try {
                          for (let i = 0; i < itemsToProcess.length; i++) {
                            const cert = itemsToProcess[i];
                            
                            // Mark sending
                            setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'sending', error: undefined } : p));
                            setEmailProgress({ current: i + 1, total: itemsToProcess.length, name: cert.name });

                            try {
                              const base64Res = await fetch(`/api/certificates/${cert.id}/base64`);
                              if (!base64Res.ok) throw new Error('Failed to fetch certificate PDF');
                              const { base64 } = await base64Res.json();
                              const pdfBase64Data = base64.split(',')[1] || base64; // Extract actual b64 if URI format

                              const personalizedMsg = emailConfig.body.replace(/\[Name\]/gi, cert.name);

                              await sendCertificateEmail(
                                emailjsCreds.serviceId, emailjsCreds.templateId, emailjsCreds.publicKey, 
                                cert.email, cert.name, emailConfig.subject, personalizedMsg, pdfBase64Data
                              );

                              // Mark sent
                              setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'sent', timestamp: new Date().toLocaleTimeString() } : p));
                              successes++;
                              processedThisRun++;

                              // Delay
                              if (i < itemsToProcess.length - 1) await new Promise(r => setTimeout(r, 1000));
                            } catch (err: any) {
                              console.error(`Failed to send to ${cert.email}:`, err);
                              setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'failed', error: err.text || err.message || 'Unknown error' } : p));
                              failures++;
                            }
                          }

                          if (failures > 0) {
                            setEmailResult({ success: false, message: `Sent ${successes} successfully ✅. ${failures} failed ❌.` });
                          } else {
                            setEmailResult({ success: true, message: `All ${successes} certificates sent successfully ✅` });
                          }

                        } catch(err: any) {
                          setEmailResult({ success: false, message: err.message });
                        } finally {
                          setIsSendingEmails(false);
                          setEmailProgress(null);
                        }
                      }}
                      disabled={isSendingEmails}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50 outline-none"
                    >
                      {isSendingEmails ? 'Sending...' : (emailList.some(e => e.status === 'failed') ? 'Retry Failed' : 'Send Emails')}
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Custom Dialogs to avoid iframe blocks */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
            <h3 className="text-xl font-semibold mb-2">{confirmDialog.title}</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex justify-center gap-4">
               <button onClick={confirmDialog.onCancel} className="px-5 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
                 Go Back
               </button>
               <button onClick={confirmDialog.onConfirm} className="px-5 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm">
                 Continue Anyway
               </button>
            </div>
          </div>
        </div>
      )}

      {errorDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-100 font-bold text-2xl">
              !
            </div>
            <h3 className="text-xl font-semibold mb-2">Notice</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-wrap">{errorDialog}</p>
            <button onClick={() => setErrorDialog(null)} className="px-8 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-lg font-medium transition-colors shadow-sm w-full">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
