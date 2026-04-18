import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, CheckCircle2, Download, FileArchive, ArrowRight, ArrowLeft } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { sendCertificateEmail } from './emailService';

import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { ParticleBackground } from './components/ParticleBackground';
import { PaperButton } from './components/PaperButton';

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
      <div className="relative overflow-hidden bg-black">
        <ParticleBackground lightEmission={true} glowIntensity={1} />
        <LandingPage onGetStarted={() => setCurrentView('generator')} />
      </div>
    );
  }

  if (currentView === 'dashboard') {
    return <Dashboard onBack={() => setCurrentView('generator')} />;
  }

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans relative">
      <ParticleBackground lightEmission={true} glowIntensity={0.4} />
      
      <header className="bg-black/60 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex justify-between items-center relative z-10">
        <div className="max-w-5xl flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('landing')}>
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]">
            <FileType className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">CertiFlow</h1>
        </div>
        <button onClick={() => setCurrentView('dashboard')} className="text-sm font-medium text-slate-400 hover:text-emerald-400 transition-colors">
          Dashboard
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-12 overflow-x-auto pb-4 no-scrollbar">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 min-w-[40px] shrink-0 ${
                step >= s 
                  ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(6,78,59,0.4)]' 
                  : 'bg-slate-800 text-slate-500 border border-white/5'
              }`}>
                {s}
              </div>
              {s < 6 && (
                <div className={`w-10 h-1 mx-2 sm:w-16 sm:mx-4 rounded transition-all duration-500 shrink-0 ${
                  step > s ? 'bg-emerald-600 shadow-[0_0_10px_rgba(6,78,59,0.3)]' : 'bg-slate-800'
                }`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-black/40 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Upload Special Features</h2>
                <p className="text-slate-400">Add signatures, logos, or stamps to your certificates. You can place these markers later.</p>
              </div>

              <div className="space-y-4">
                <label 
                  className="flex flex-col items-center justify-center w-full h-40 border-2 border-white/10 border-dashed rounded-xl cursor-pointer bg-black/40 hover:bg-black/60 hover:border-emerald-500/50 transition-all duration-300 group"
                  onDrop={handleSpecialDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 mb-2 transition-colors" />
                    <p className="mb-1 text-sm text-slate-400 font-medium transition-colors group-hover:text-slate-200">Click to upload or drag features</p>
                    <p className="text-xs text-slate-500">PNG, JPG or PDF</p>
                  </div>
                  <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" multiple onChange={handleSpecialFeatureUpload} />
                </label>
                
                {specialFeatures.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                    {specialFeatures.map((sf, idx) => (
                      <div key={sf.id} className="relative group border border-white/10 rounded-xl p-3 bg-black/40 shadow-lg flex flex-col items-center justify-center transition-all hover:border-emerald-500/30">
                        <img src={sf.preview} alt={`Special Feature ${idx + 1}`} className="max-h-24 object-contain brightness-95" />
                        <button 
                          onClick={() => removeSpecialFeature(sf.id)}
                          className="absolute -top-2 -right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between items-center pt-4">
                  <button 
                    onClick={() => setStep(2)}
                    className="text-slate-400 hover:text-white font-medium px-4 py-2 transition-colors"
                  >
                    {specialFeatures.length > 0 ? "Done with specials" : "Skip this step"}
                  </button>
                  {specialFeatures.length > 0 && (
                    <PaperButton 
                      onClick={() => setStep(2)}
                      text="Next Step"
                      width={160}
                      height={46}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Upload Template</h2>
                <p className="text-slate-400">Upload your certificate design and click to add markers where data should appear.</p>
              </div>

              {!templatePreview ? (
                <label 
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-white/10 border-dashed rounded-xl cursor-pointer bg-black/40 hover:bg-black/60 hover:border-emerald-500/50 transition-all duration-300 group"
                  onDrop={handleTemplateDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-10 h-10 text-slate-500 group-hover:text-emerald-400 mb-3 transition-colors" />
                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload template</span> or drag and drop</p>
                    <p className="text-xs text-slate-500">PNG, JPG or PDF</p>
                  </div>
                  <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleTemplateUpload} />
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center mb-4 gap-4 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setPlacementMode('text')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${placementMode === 'text' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(6,78,59,0.4)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                      >
                        Add Text Markers
                      </button>
                      <button
                        onClick={() => setPlacementMode('special')}
                        disabled={specialFeatures.length === 0}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${placementMode === 'special' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(6,78,59,0.4)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30'}`}
                      >
                        Place Special Feature
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 font-medium font-mono">Font Family:</span>
                      <select 
                        value={selectedFont} 
                        onChange={e => setSelectedFont(e.target.value)}
                        className="border-white/10 rounded-lg py-1.5 px-3 text-sm focus:ring-emerald-500 focus:border-emerald-500 border bg-slate-800 text-white outline-none"
                        style={{ fontFamily: selectedFont }}
                      >
                        {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                      </select>
                    </div>

                    {placementMode === 'special' && (
                      <div className="flex flex-col gap-2 bg-slate-800 p-4 rounded-xl border border-white/10 shadow-xl w-64 text-sm mt-3 sm:mt-0">
                        <label className="flex flex-col gap-1">
                          <span className="font-semibold text-slate-300">Select feature:</span>
                          <select 
                            className="bg-slate-900 border-white/10 rounded-lg py-1 px-2 border text-slate-200 outline-none"
                            value={activeSpecialFeatureIndex}
                            onChange={(e) => setActiveSpecialFeatureIndex(Number(e.target.value))}
                          >
                            {specialFeatures.map((sf, idx) => (
                              <option key={sf.id} value={idx}>Special Feature #{idx + 1}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 mt-2">
                          <span className="font-semibold text-slate-300">Display Size: {activeSpecialFeatureSize}px</span>
                          <input 
                            type="range" 
                            min="20" 
                            max="400" 
                            value={activeSpecialFeatureSize}
                            onChange={(e) => setActiveSpecialFeatureSize(Number(e.target.value))}
                            className="w-full accent-emerald-600"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className={`relative inline-block border border-white/10 rounded-xl overflow-hidden shadow-2xl ${placementMode === 'special' ? 'cursor-alias' : 'cursor-crosshair'}`}>
                    <img 
                      ref={imageRef}
                      src={templatePreview} 
                      alt="Template preview" 
                      className="max-w-full h-auto brightness-90"
                      onClick={handleImageClick}
                    />
                    {markers.map((m, i) => {
                      const mWidth = (m.width || 0.4) * 100;
                      const mHeight = (m.height || 0.1) * 100;
                      
                      return (
                      <div 
                        key={m.id}
                        className="absolute border-2 border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(6,78,59,0.3)] overflow-hidden flex items-center justify-center cursor-move pointer-events-auto group"
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
                        <span className="text-white text-sm font-semibold whitespace-nowrap pointer-events-none drop-shadow-md" style={{ fontFamily: selectedFont }}>Sample {i+1}</span>
                        <div 
                          className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-600 cursor-nwse-resize pointer-events-auto shadow-lg"
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
                        <button 
                           onClick={(e) => { e.stopPropagation(); setMarkers(prev => prev.filter(p => p.id !== m.id)); }}
                           className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white"
                        >
                           <span className="text-[10px]">✕</span>
                        </button>
                      </div>
                    )})}
                    {specialMarkers.map((sm, i) => (
                      <div 
                        key={sm.id}
                        className="absolute bg-emerald-600/30 border-2 border-emerald-500 border-dashed transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex items-center justify-center cursor-pointer group"
                        style={{ left: `${sm.x * 100}%`, top: `${sm.y * 100}%`, width: `${Math.max(20, sm.size / 2)}px`, height: `${Math.max(20, sm.size / 2)}px` }}
                        onClick={(e) => { e.stopPropagation(); setSpecialMarkers(prev => prev.filter(p => p.id !== sm.id)); }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow-md">★</span>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap shadow-xl">
                          {`Special #${sm.index + 1}`}
                        </div>
                        <div className="absolute inset-0 border-4 border-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <span className="text-[10px] text-white bg-red-500 px-1 rounded">Remove</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-white/5">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setStep(1)}
                        className="text-sm text-slate-400 hover:text-white font-medium transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4 inline mr-1" />
                        Back to Specials
                      </button>
                      <button 
                        onClick={() => { setTemplatePreview(null); setMarkers([]); setTemplateFile(null); setSpecialMarkers([]); }}
                        className="text-sm text-slate-400 hover:text-white transition-colors ml-4"
                      >
                        Different template
                      </button>
                    </div>
                    <PaperButton 
                      onClick={() => setStep(3)}
                      disabled={markers.length === 0}
                      text="Next Step"
                      width={160}
                      height={46}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Upload Data</h2>
                <p className="text-slate-400">
                  Upload a CSV or Excel file containing the participant data.
                </p>
              </div>

              {!participants.length ? (
                <label 
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-white/10 border-dashed rounded-xl cursor-pointer bg-black/40 hover:bg-black/60 hover:border-emerald-500/50 transition-all duration-300 group"
                  onDrop={handleDataDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                    <Upload className="w-10 h-10 text-slate-500 group-hover:text-emerald-400 mb-3 transition-colors" />
                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload data</span> or drag and drop</p>
                    <p className="text-xs text-slate-500">CSV or Excel (.xlsx)</p>
                  </div>
                  <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleDataUpload} />
                </label>
              ) : (
                <div className="space-y-6">
                  <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    <div className="px-4 py-3 border-b border-white/5 bg-slate-800/20 flex justify-between items-center">
                      <h3 className="font-medium text-slate-300">Data Preview ({participants.length} rows)</h3>
                      <button 
                        onClick={() => { setParticipants([]); setDataFile(null); setMappings({}); }}
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        Upload different file
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm text-left text-slate-400">
                        <thead className="text-xs text-slate-300 uppercase bg-black/60 sticky top-0 shadow-sm z-10">
                          <tr>
                            {headers.map((h, i) => (
                              <th 
                                key={i} 
                                className="px-6 py-3 transition-colors whitespace-nowrap font-bold"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {participants.slice(0, 10).map((row, i) => (
                            <tr key={i} className="bg-transparent border-b border-white/5 hover:bg-white/5 transition-colors">
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
                        <div className="text-center py-3 text-sm text-slate-500 bg-black/40 border-t border-white/5">
                          Showing first 10 rows...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-800/30 p-4 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setStep(2)}
                      className="flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <PaperButton 
                      onClick={() => setStep(4)}
                      text="Next Step"
                      width={160}
                      height={46}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Map Data Fields</h2>
                <p className="text-slate-400">Match each marker on your template with a column from your data file.</p>
                {specialFeatures.length > 0 && specialMarkers.length > 0 && (
                  <div className="mt-4 p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-sm shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">{specialMarkers.length} special marker(s) successfully placed and synchronized!</span>
                  </div>
                )}
              </div>
              
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  {markers.map((m, index) => (
                    <div key={m.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold shadow-lg">
                          {index + 1}
                        </div>
                        <span className="font-bold text-slate-200">Marker {index + 1}</span>
                      </div>
                      <div className="w-72">
                        <select 
                          className="w-full bg-slate-900 border-white/10 rounded-xl shadow-lg focus:ring-emerald-500 focus:border-emerald-500 text-slate-200 py-2.5 px-4 outline-none border"
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
                  
                  <div className="p-5 flex items-center justify-between bg-emerald-600/5 border-t-2 border-emerald-500/20">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-700 text-emerald-400 rounded-xl flex items-center justify-center font-bold shadow-lg border border-emerald-500/30">
                        @
                      </div>
                      <span className="font-bold text-emerald-300">Email Address Mapping</span>
                    </div>
                    <div className="w-72">
                      <select 
                        className="w-full bg-slate-900 border-emerald-500/20 rounded-xl shadow-lg focus:ring-emerald-500 focus:border-emerald-500 text-slate-200 py-2.5 px-4 outline-none border"
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

              <div className="flex justify-between items-center pt-4 bg-slate-800/30 p-4 rounded-xl border border-white/5">
                <button 
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Data
                </button>
                <PaperButton 
                  onClick={() => setStep(5)}
                  disabled={Object.values(mappings).length !== markers.length || Object.values(mappings).some(v => !v)}
                  text="Review & Generate"
                  width={200}
                  height={50}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 text-center py-8">
              {!generateProgress ? (
                <>
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="w-24 h-24 bg-emerald-600/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-[0_0_30px_rgba(6,78,59,0.15)]">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-white">Ready to Generate</h2>
                    <p className="text-slate-400 text-lg">
                      Preparing <strong>{participants.length}</strong> premium certificates for generation.
                    </p>
                  </div>

                  <div className="flex justify-center items-center gap-8 pt-4">
                    <button 
                      onClick={() => setStep(4)}
                      disabled={isGenerating}
                      className="px-6 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl font-medium transition-all disabled:opacity-30"
                    >
                      Go Back
                    </button>
                    <PaperButton 
                      onClick={generateCertificates}
                      disabled={isGenerating}
                      text="Generate Certificates"
                      width={240}
                      height={60}
                    />
                  </div>
                </>
              ) : (
                <div className="max-w-xl mx-auto space-y-8 bg-black/40 backdrop-blur-2xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                  <h2 className="text-2xl font-bold text-white">Crafting Certificates...</h2>
                  <div className="w-full bg-slate-900 rounded-full h-4 relative overflow-hidden ring-1 ring-white/10 shadow-inner">
                    <div 
                      className="bg-emerald-600 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(6,78,59,0.5)] relative"
                      style={{ width: `${(generateProgress.current / generateProgress.total) * 100}%` }}
                    >
                       <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span className="text-slate-400">Processing: <span className="text-emerald-400">{generateProgress.name}</span></span>
                    <span className="text-white bg-emerald-600/30 px-2 py-1 rounded-md">{generateProgress.current} / {generateProgress.total}</span>
                  </div>
                  <div className="pt-4">
                    <button 
                      onClick={() => abortControllerRef.current?.abort()}
                      className="text-red-400 hover:text-red-300 font-bold text-sm transition-colors hover:underline"
                    >
                      ABORT GENERATION
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 6 && results && (
            <div className="space-y-8 text-center py-8">
              <div className="max-w-md mx-auto space-y-4">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl ${results.failed && results.failed.length > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                  <CheckCircle2 className={`w-12 h-12 ${results.failed && results.failed.length > 0 ? 'text-orange-400' : 'text-green-400'}`} />
                </div>
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Success!</h2>
                <p className="text-slate-400 text-lg">
                  <strong className="text-white">{results.count}</strong> certificates generated with precision.
                  {results.failed && results.failed.length > 0 && (
                     <span className="text-red-400 ml-2 font-bold">— {results.failed.length} failed artifacts.</span>
                  )}
                </p>
              </div>

              {results.failed && results.failed.length > 0 && (
                <div className="max-w-xl mx-auto bg-red-500/5 text-red-300 p-6 rounded-2xl text-left overflow-y-auto max-h-48 border border-red-500/20 shadow-inner">
                  <h3 className="font-bold mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                    Failed Certificates:
                  </h3>
                  <ul className="pl-4 space-y-1 text-sm font-mono list-none">
                    {results.failed.map((fc, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-red-500 opacity-50">›</span>
                        <span><strong className="text-white">{fc.name}</strong>: {fc.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="mt-4 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">Retry Failed Protocols</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto pt-4">
                <a 
                  href={results.combinedUrl}
                  download
                  className="flex flex-col items-center p-8 bg-black/40 backdrop-blur-xl border border-white/5 rounded-3xl hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group relative overflow-hidden shadow-xl"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-emerald-600/10 transition-colors" />
                  <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(6,78,59,0.3)]">
                    <Download className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-xl text-white mb-2">Combined Vault</h3>
                  <p className="text-sm text-slate-400 text-center leading-relaxed">Single master document containing all generated certificates in perfect sequence.</p>
                </a>

                <a 
                  href={results.zipUrl}
                  download
                  className="flex flex-col items-center p-8 bg-black/40 backdrop-blur-xl border border-white/5 rounded-3xl hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group relative overflow-hidden shadow-xl"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-emerald-600/10 transition-colors" />
                  <div className="w-16 h-16 bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-lg">
                    <FileArchive className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-xl text-white mb-2">Artifact Library</h3>
                  <p className="text-sm text-slate-400 text-center leading-relaxed">Compressed package with individual high-fidelity certificate files for distribution.</p>
                </a>
              </div>

              <div className="flex flex-col items-center gap-6 pt-8">
                {emailConfig.column && (
                  <PaperButton 
                    onClick={() => setStep(7)}
                    text="Deliver via Email"
                    width={220}
                    height={54}
                  />
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
                  className="text-slate-400 hover:text-white font-bold tracking-widest text-xs uppercase transition-colors"
                >
                  Initiate New Batch +
                </button>
              </div>
            </div>
          )}

          {step === 7 && results && (
            <div className="space-y-6 max-w-3xl mx-auto py-4 transition-all duration-200">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Send Emails via EmailJS</h2>
                <p className="text-slate-400">Configure your EmailJS credentials and email template to deliver the certificates.</p>
              </div>

              {/* Setup Guide Collapsible */}
              <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl transition-all duration-200">
                <button 
                  onClick={() => setEmailGuideOpen(!emailGuideOpen)}
                  className="w-full flex justify-between items-center p-4 bg-slate-800/20 hover:bg-slate-700/30 transition-colors"
                >
                  <span className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                    EmailJS Setup Guide
                  </span>
                  <span className="text-emerald-400 text-xs font-bold uppercase">{emailGuideOpen ? 'Hide' : 'Show'} details</span>
                </button>
                {emailGuideOpen && (
                  <div className="p-5 bg-black/60 border-t border-white/5 text-sm text-slate-400 space-y-3 leading-relaxed transition-all duration-200 font-medium">
                    <p className="flex gap-2"><span className="text-emerald-500 font-bold">01.</span> Go to <strong>emailjs.com</strong> and create a free account.</p>
                    <p className="flex gap-2"><span className="text-emerald-500 font-bold">02.</span> Add a SMTP service and copy the <strong>Service ID</strong>.</p>
                    <p className="flex gap-2"><span className="text-emerald-500 font-bold">03.</span> Build your template with variables: <code>{`{{to_name}}`}</code>, <code>{`{{to_email}}`}</code>, <code>{`{{subject}}`}</code>, <code>{`{{message}}`}</code>.</p>
                    <p className="flex gap-2"><span className="text-emerald-500 font-bold">04.</span> Ensure attachments are enabled. Copy the <strong>Template ID</strong>.</p>
                    <p className="flex gap-2"><span className="text-emerald-500 font-bold">05.</span> Locate your <strong>Public Key</strong> in Account Settings.</p>
                  </div>
                )}
              </div>

              {/* Credentials Form */}
              <div className="bg-black/40 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 shadow-2xl transition-all duration-200 space-y-5">
                <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-widest">
                   <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                   EmailJS Credentials
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Service ID</label>
                    <input type="text" className="bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200 shadow-inner" value={emailjsCreds.serviceId} onChange={e => setEmailjsCreds({...emailjsCreds, serviceId: e.target.value})} placeholder="service_xyz123" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Template ID</label>
                    <input type="text" className="bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200 shadow-inner" value={emailjsCreds.templateId} onChange={e => setEmailjsCreds({...emailjsCreds, templateId: e.target.value})} placeholder="template_abc456" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Public Key</label>
                    <input type="text" className="bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200 shadow-inner" value={emailjsCreds.publicKey} onChange={e => setEmailjsCreds({...emailjsCreds, publicKey: e.target.value})} placeholder="publicKey789" />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2 border-t border-white/5 mt-4">
                  <input type="email" className="bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200 w-full sm:w-64" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Email for testing..." />
                  <button 
                    disabled={isTesting || !emailjsCreds.serviceId || !emailjsCreds.templateId || !emailjsCreds.publicKey || !testEmail}
                    onClick={async () => {
                      setIsTesting(true);
                      setTestResult(null);
                      try {
                        const dummyPdfBase64 = 'JVBERi0xLjcKCjEgMCBvYmogICUKPDwKIC9UeXBlIC9DYXRhbG9nCiAvUGFnZXMgMiAwIFIKPj4KZW5kb2JqCgoyIDAgb2JqCjwwCiAvVHlwZSAvUGFnZXMKIC9LaWRzIFszIDAgUl0KIC9Db3VudCAxCj4+CmVuZG9iagoKMyAwIG9iago8PAogL1R5cGUgL1BhZ2UKIC9QYXJlbnQgMiAwIFIKIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCj4+CmVuZG9iagoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExMyAwMDAwMCBuIAp0cmFpbGVyCjw8CiAvU2l6ZSA0CiAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMTczCiUlRU9GCg==';
                        await sendCertificateEmail(emailjsCreds.serviceId, emailjsCreds.templateId, emailjsCreds.publicKey, testEmail, 'Tester', 'Certiflow Test', 'Connection verification email.', dummyPdfBase64);
                        setTestResult({ success: true, message: 'Connection successful' });
                      } catch (err: any) {
                        setTestResult({ success: false, message: 'Connection failed: ' + (err.text || err.message || 'Unknown error') });
                      }
                      setIsTesting(false);
                    }}
                    className="bg-slate-700 text-white hover:bg-slate-600 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-200 disabled:opacity-30 shadow-lg"
                  >
                    {isTesting ? 'Verifying...' : 'Test Connection'}
                  </button>
                  {testResult && (
                    <span className={`text-xs font-bold uppercase tracking-wider transition-all duration-200 px-3 py-1 rounded-md ${testResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Email Content Config */}
              <div className="bg-black/40 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 shadow-2xl transition-all duration-200 space-y-5">
                <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-widest">
                   <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                   Email Contents
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Subject</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200"
                      value={emailConfig.subject}
                      onChange={(e) => setEmailConfig({ ...emailConfig, subject: e.target.value })}
                      placeholder="Your Certificate of Achievement"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Email Body (Use [Name] to insert recipient's name)</label>
                    <textarea 
                      rows={4}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all duration-200 resize-none"
                      value={emailConfig.body}
                      onChange={(e) => setEmailConfig({ ...emailConfig, body: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Progress and Live List */}
              {(isSendingEmails || emailResult || emailList.some(e => e.status !== 'pending')) && (
                <div className="bg-black/40 backdrop-blur-3xl p-6 rounded-2xl border border-white/10 shadow-2xl transition-all duration-200 space-y-6">
                  
                  {emailProgress && (
                    <div className="transition-all duration-200">
                      <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
                        <span>Dispatching Artifact {emailProgress.current} / {emailProgress.total} — <span className="text-emerald-400">{emailProgress.name}</span></span>
                        <span className="text-white">{Math.round((emailProgress.current / emailProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-2 shadow-inner ring-1 ring-white/5">
                        <div 
                          className="bg-emerald-600 h-2 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(6,78,59,0.4)]"
                          style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="border border-white/5 rounded-2xl max-h-64 overflow-y-auto divide-y divide-white/5 transition-all duration-200 bg-slate-900/50 shadow-inner custom-scrollbar">
                    {emailList.map(item => (
                      <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-2 hover:bg-white/5 transition-colors duration-200">
                        <div className="flex items-center gap-4">
                          {item.status === 'pending' && <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider bg-slate-800 px-2 py-1 rounded">⏳ Pending</span>}
                          {item.status === 'sending' && <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded animate-pulse">📤 Sending</span>}
                          {item.status === 'sent' && <span className="text-green-400 font-bold text-[10px] uppercase tracking-wider bg-green-500/10 px-2 py-1 rounded flex items-center gap-1">✅ Delivered</span>}
                          {item.status === 'failed' && <span className="text-red-400 font-bold text-[10px] uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded">❌ Failed</span>}
                          
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-200 text-sm">{item.name}</span>
                            <span className="text-slate-500 text-xs font-mono">{item.email}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                           {item.status === 'sent' && item.timestamp && <span className="text-slate-500 font-medium">{item.timestamp}</span>}
                           {item.status === 'failed' && item.error && <span className="text-red-400 font-bold max-w-xs truncate block" title={item.error}>{item.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {emailResult && (
                    <div className={`p-4 rounded-xl mt-2 font-bold text-center text-sm tracking-wide transition-all duration-500 border ${emailResult.success ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {emailResult.message}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4 bg-slate-800/30 p-4 rounded-xl border border-white/5">
                <button 
                  onClick={() => setStep(6)}
                  className="flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors duration-200 outline-none"
                >
                  <ArrowLeft className="w-4 h-4" /> Skip / Back
                </button>
                <div className="flex items-center gap-3">
                    {emailResult && (
                      <button 
                        onClick={() => {
                          setStep(1);
                          setSpecialFeatures([]); setSpecialMarkers([]); setTemplateFile(null); setTemplatePreview(null);
                          setMarkers([]); setMappings({}); setDataFile(null); setParticipants([]); setResults(null);
                          setCurrentView('dashboard');
                        }}
                        className="bg-slate-700 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-600 transition-all shadow-lg"
                      >
                        Done
                      </button>
                    )}
                    <PaperButton 
                      onClick={async () => {
                        setIsSendingEmails(true);
                        setEmailResult(null);
                        const itemsToProcess = emailList.filter(e => e.status === 'pending' || e.status === 'failed');
                        if (itemsToProcess.length === 0) { setIsSendingEmails(false); return; }
                        let successes = emailList.filter(e => e.status === 'sent').length;
                        let failures = 0;
                        try {
                          for (let i = 0; i < itemsToProcess.length; i++) {
                            const cert = itemsToProcess[i];
                            setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'sending', error: undefined } : p));
                            setEmailProgress({ current: i + 1, total: itemsToProcess.length, name: cert.name });
                            try {
                              const base64Res = await fetch(`/api/certificates/${cert.id}/base64`);
                              if (!base64Res.ok) throw new Error('Failed to fetch certificate PDF');
                              const { base64 } = await base64Res.json();
                              const pdfBase64Data = base64.split(',')[1] || base64;
                              const personalizedMsg = emailConfig.body.replace(/\[Name\]/gi, cert.name);
                              await sendCertificateEmail(emailjsCreds.serviceId, emailjsCreds.templateId, emailjsCreds.publicKey, cert.email, cert.name, emailConfig.subject, personalizedMsg, pdfBase64Data);
                              setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'sent', timestamp: new Date().toLocaleTimeString() } : p));
                              successes++;
                              if (i < itemsToProcess.length - 1) await new Promise(r => setTimeout(r, 1000));
                            } catch (err: any) {
                              setEmailList(prev => prev.map(p => p.id === cert.id ? { ...p, status: 'failed', error: err.text || err.message || 'Unknown error' } : p));
                              failures++;
                            }
                          }
                          if (failures > 0) setEmailResult({ success: false, message: `Batch Incomplete: ${successes} delivered, ${failures} failed.` });
                          else setEmailResult({ success: true, message: `Mission accomplished: All ${successes} certificates delivered.` });
                        } catch(err: any) {
                          setEmailResult({ success: false, message: err.message });
                        } finally { setIsSendingEmails(false); setEmailProgress(null); }
                      }}
                      disabled={isSendingEmails}
                      text={isSendingEmails ? 'Dispatching...' : (emailList.some(e => e.status === 'failed') ? 'Retry Failed' : 'Send Emails')}
                      width={200}
                      height={50}
                    />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Custom Dialogs */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-black/60 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
               <FileType className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">{confirmDialog.title}</h3>
            <p className="text-slate-400 mb-8 whitespace-pre-wrap leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-center gap-4">
               <button onClick={confirmDialog.onCancel} className="px-6 py-3 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
                 Cancel
               </button>
               <button onClick={confirmDialog.onConfirm} className="px-6 py-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40">
                 Proceed Anyway
               </button>
            </div>
          </div>
        </div>
      )}

      {errorDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-black/60 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-red-500/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20 font-black text-red-500 text-3xl">
              !
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Notice</h3>
            <p className="text-slate-400 mb-8 leading-relaxed">{errorDialog}</p>
            <button onClick={() => setErrorDialog(null)} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg">
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
