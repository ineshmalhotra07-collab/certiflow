import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Award, Settings, Check, Loader2, Download } from 'lucide-react';

const MagnetButton = ({ onClick, children }: { onClick: () => void, children: React.ReactNode }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current!.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPosition({ x: middleX * 0.2, y: middleY * 0.2 });
  };

  const reset = () => setPosition({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      onClick={onClick}
      className="relative px-6 py-3 bg-blue-600 text-white rounded-xl font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_20px_rgba(37,99,235,0.4)] active:shadow-[inset_0_4px_8px_rgba(0,0,0,0.3),0_2px_4px_rgba(37,99,235,0.3)] active:scale-95"
    >
      {children}
    </motion.button>
  );
};

const DownloadButton = () => {
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleClick = () => {
    if (state !== 'idle') return;
    setState('loading');
    setTimeout(() => setState('success'), 2000);
    setTimeout(() => setState('idle'), 4000);
  };

  return (
    <div className="flex justify-center items-center h-full">
      <motion.div
        layout
        className="flex items-center justify-center overflow-hidden"
        style={{
          borderRadius: state === 'idle' ? 12 : 50,
        }}
        initial={false}
        animate={{
          width: state === 'idle' ? 180 : 56,
          height: state === 'idle' ? 48 : 56,
          backgroundColor: state === 'success' ? '#10B981' : state === 'loading' ? '#1E293B' : '#3B82F6',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {state === 'idle' && (
           <MagnetButton onClick={handleClick}>
             <div className="flex items-center justify-center gap-2 w-full h-full">
               <Download className="w-5 h-5" /> Download PDF
             </div>
           </MagnetButton>
        )}
        
        {state === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white"
          >
            <Loader2 className="w-6 h-6 animate-spin" />
          </motion.div>
        )}

        {state === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-white"
          >
            <Check className="w-6 h-6" />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export const Dashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-slate-900 flex flex-col items-center py-8">
        <div className="w-12 h-12 bg-blue-600 rounded-xl mb-12 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] flex items-center justify-center">
            <Award className="w-6 h-6 text-white" />
        </div>
        <nav className="flex flex-col gap-2 w-full px-4">
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-500/10 text-blue-400 font-medium">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <Settings className="w-5 h-5" /> Settings
          </button>
        </nav>
        <div className="mt-auto">
          <button onClick={onBack} className="text-slate-500 text-sm hover:text-white transition-colors">
            ← Back to Generator
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 max-w-6xl">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Workspace Overview</h1>
          <p className="text-slate-400">Manage your generated certificates and analytics.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[250px]">
          {/* Stats Bento */}
          <div className="col-span-1 md:col-span-2 rounded-2xl bg-slate-900 border border-white/10 p-6 flex flex-col justify-between shadow-xl">
             <div>
               <h3 className="text-slate-400 text-sm font-medium mb-1">Total Issued</h3>
               <div className="text-5xl font-bold text-white">12,450</div>
             </div>
             <div className="w-full h-24 bg-gradient-to-t from-blue-500/20 to-transparent mt-4 rounded-b-xl border-b border-blue-500/50"></div>
          </div>

          {/* Action Bento */}
          <div className="col-span-1 rounded-2xl bg-slate-900 border border-white/10 p-6 shadow-xl flex flex-col items-center justify-center">
             <h3 className="text-slate-300 font-medium mb-6">Latest Batch Ready</h3>
             <DownloadButton />
          </div>

          {/* Recent list Bento */}
          <div className="col-span-1 md:col-span-3 rounded-2xl bg-slate-900 border border-white/10 p-6 shadow-xl">
             <h3 className="text-slate-300 font-medium mb-4">Recent Certificates</h3>
             <div className="divide-y divide-white/5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="py-3 flex justify-between items-center group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-white/5 group-hover:border-blue-500/30 transition-colors">
                        <Award className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
                      </div>
                      <span className="text-sm text-slate-300">UX Design Certificate #{1000 + i}</span>
                    </div>
                    <span className="text-xs text-slate-500">2 mins ago</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
};
