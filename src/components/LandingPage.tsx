import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Shield, Zap, FileJson, Mail, Settings, Database } from 'lucide-react';
import { PaperButton } from './PaperButton';

const FlashlightCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current || isFocused) return;
    const div = divRef.current;
    const rect = div.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(1);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 backdrop-blur-2xl shadow-2xl p-6 flex flex-col justify-between ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 z-10"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(16, 185, 129, 0.15), transparent 40%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 z-0"
        style={{
          opacity,
          background: `radial-gradient(800px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.02), transparent 40%)`,
        }}
      >
        <div className="w-full h-full text-[10rem] font-bold text-white/[0.02] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none flex items-center justify-center rotate-[-15deg]">
          SECURE
        </div>
      </div>
      <div className="relative z-20 h-full">{children}</div>
    </div>
  );
};

export const LandingPage: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  const { scrollY } = useScroll();
  const maskOpacity = useTransform(scrollY, [0, 300], [0, 1]);

  const features = [
    { title: 'Bulk Issue', icon: FileJson, desc: 'Import CSV or Excel files natively to construct 100+ documents concurrently.', span: 'col-span-1 md:col-span-2 row-span-2' },
    { title: 'EmailJS Connect', icon: Mail, desc: 'Deliver automatically directly tracking inbox success reliably.', span: 'col-span-1 md:col-span-1 row-span-1' },
    { title: 'Data Security', icon: Shield, desc: 'We do not permanently store templates locally. Session cleared reliably.', span: 'col-span-1 md:col-span-1 row-span-1' },
    { title: 'Custom Mapping', icon: Settings, desc: 'Precisely define bounds utilizing robust draggable interface mechanisms.', span: 'col-span-1 md:col-span-2 row-span-1' },
  ];

  return (
    <div className="relative min-h-screen text-slate-200 z-10 pt-20 px-6 max-w-7xl mx-auto font-sans pb-32">
       
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center mt-24 mb-32"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
          <Zap className="w-4 h-4" />
          <span>Certiflow V2.1 Network Active</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
          Certificates <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-600">Accelerated.</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          The premium paperless infrastructure designed for institutions. Secure rendering, precise typography, bulk orchestration, natively.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
          <PaperButton 
            onClick={onGetStarted}
            text="Launch Generator Workspace"
            width={280}
            height={80}
          />
          
          <div className="hidden sm:flex items-center justify-center opacity-70 scale-90" title="Try double clicking to fold!">
             <PaperButton onClick={() => {}} text="DEMO TEXTURE" />
          </div>
        </div>
      </motion.div>

      {/* Scroll-Driven Reveal Bento Grid */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative"
      >
        {/* Top edge line tracer */}
        <motion.div 
           initial={{ scaleX: 0 }}
           whileInView={{ scaleX: 1 }}
           viewport={{ once: true }}
           transition={{ duration: 1.5, ease: "easeInOut" }}
           className="absolute -top-10 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent origin-left"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[220px]">
          {features.map((feat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className={feat.span}
            >
              <FlashlightCard className="h-full">
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 border border-white/10 group-hover:border-emerald-500 transition-colors">
                  <feat.icon className="text-emerald-400 w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{feat.title}</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">{feat.desc}</p>
                </div>
              </FlashlightCard>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
