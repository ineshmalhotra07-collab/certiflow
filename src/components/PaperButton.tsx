import React, { useEffect, useRef } from 'react';

export const PaperButton: React.FC<{ 
  onClick: () => void, 
  text: string, 
  width?: number, 
  height?: number, 
  className?: string,
  disabled?: boolean
}> = ({ onClick, text, width = 240, height = 70, className = '', disabled = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas settings
    const w = width;
    const h = height;
    canvas.width = w;
    canvas.height = h;

    // Cache texture
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = w;
    textureCanvas.height = h;
    const tCtx = textureCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#064e3b'; // dark forest green
      tCtx.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) {
        tCtx.fillStyle = Math.random() > 0.5 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.1)';
        tCtx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 20 + 5, 1);
      }
    }

    // Precomputed fibers
    const fibers: {x1: number, y1: number, x2: number, y2: number, alpha: number}[] = [];
    for(let i=0; i<15; i++) {
      fibers.push({
        x1: Math.random() * w, y1: Math.random() * h,
        x2: Math.random() * w, y2: Math.random() * h,
        alpha: Math.random() * 0.1
      });
    }

    // Dynamic Geometry
    const points: {x: number, y: number}[] = [];
    const numPoints = 80;
    for (let i = 0; i < numPoints; i++) {
      let t = i / numPoints;
      let px, py;
      if (t < 0.25) { px = (t / 0.25) * w; py = 0; }
      else if (t < 0.5) { px = w; py = ((t - 0.25) / 0.25) * h; }
      else if (t < 0.75) { px = w - ((t - 0.5) / 0.25) * w; py = h; }
      else { px = 0; py = h - ((t - 0.75) / 0.25) * h; }
      
      const jitter = 1.8;
      px += (Math.random() - 0.5) * jitter;
      py += (Math.random() - 0.5) * jitter;
      points.push({ x: px, y: py });
    }

    const creases: {p1: {x:number, y:number}, p2: {x:number, y:number}}[] = [];

    // Animation State
    let pressing = false;
    let pressDepth = 0;
    let isFolded = false;
    let foldProgress = 0;
    let rippleTime = 0;
    let rippleActive = false;
    let rippleOrigin = {x: w/2, y: h/2};
    let animationFrameId: number;

    const drawFrame = () => {
      ctx.clearRect(0, 0, w, h);

      // Interpolate states
      pressDepth += ((pressing ? 1 : 0) - pressDepth) * (pressing ? 0.12 : 0.15);
      foldProgress += ((isFolded ? 1 : 0) - foldProgress) * 0.1;
      
      if (rippleActive) {
        rippleTime += 0.05;
        if (rippleTime > 1.5) rippleActive = false;
      }

      ctx.save();
      
      // Interaction Scaling
      const shudderScale = 1 - (pressDepth * 0.025);
      ctx.translate(w/2, h/2);
      ctx.scale(shudderScale, shudderScale);
      ctx.translate(-w/2, -h/2);

      // Silhouette Clipping
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();

      // Base Texture
      ctx.drawImage(textureCanvas, 0, 0);
      
      // Static Fibers (Emerald/Green tint)
      ctx.strokeStyle = '#10b981'; 
      fibers.forEach(f => {
        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // Click Creases
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      creases.forEach(c => {
         ctx.beginPath();
         ctx.moveTo(c.p1.x, c.p1.y);
         ctx.lineTo(c.p2.x, c.p2.y);
         ctx.stroke();
      });

      // Press Ripples
      if (rippleActive) {
        const pulse = rippleTime * (w * 0.8);
        for (let i = 0; i < 3; i++) {
          const r = pulse - (i * 30);
          if (r > 0) {
            const alpha = Math.max(0, 0.35 * (1 - r/(w*1.2)));
            ctx.beginPath();
            ctx.arc(rippleOrigin.x, rippleOrigin.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = i % 2 === 0 ? `rgba(209, 250, 229, ${alpha})` : `rgba(0,0,0,${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Interaction Shadow
      if (pressDepth > 0.01) {
        const grd = ctx.createRadialGradient(rippleOrigin.x, rippleOrigin.y, 0, rippleOrigin.x, rippleOrigin.y, w/2);
        grd.addColorStop(0, `rgba(0,0,0,${pressDepth * 0.4})`);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }

      // Button Label
      if (foldProgress < 0.5) {
        ctx.font = `600 ${h * 0.22}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `rgba(16, 185, 129, ${1 - (pressDepth * 0.15)})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
        ctx.fillText(text.toUpperCase(), w/2, h/2 + (pressDepth * 2));
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // Fold Morph Effect
      if (foldProgress > 0.01) {
         ctx.save();
         ctx.beginPath();
         ctx.rect(w/2, 0, w/2, h);
         ctx.clip();
         ctx.fillStyle = '#022c22'; // Darkest emerald for fold-back
         ctx.fillRect(w/2, 0, w/2, h);
         ctx.restore();
         
         ctx.save();
         ctx.translate(w/2, 0);
         ctx.scale(1 - (foldProgress * 2), 1);
         ctx.translate(-w/2, 0);
         
         ctx.beginPath();
         ctx.rect(w/2, 0, w/2, h);
         ctx.clip();
         
         ctx.drawImage(textureCanvas, 0, 0);
         ctx.fillStyle = 'rgba(0,0,0,0.5)';
         ctx.fillRect(w/2, 0, w/2, h);
         ctx.restore();

         ctx.fillStyle = `rgba(16, 185, 129, ${foldProgress * 0.4})`; // Crease tint
         ctx.fillRect(w/2 - 1, 0, 2, h);
      }

      if (disabled) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, w, h);
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const onMouseDown = (e: MouseEvent) => { 
      if (!isFolded && !disabled) {
        pressing = true; 
        const rect = canvas.getBoundingClientRect();
        rippleOrigin = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        rippleActive = true;
        rippleTime = 0;
      }
    };
    
    const onMouseUp = () => { 
      if (!isFolded && pressing && !disabled) {
        // Crumple - deformation toward click point
        for (let i=0; i<8; i++) {
           let idx = Math.floor(Math.random() * points.length);
           let dx = rippleOrigin.x - points[idx].x;
           let dy = rippleOrigin.y - points[idx].y;
           points[idx].x += dx * 0.08;
           points[idx].y += dy * 0.08;
        }
        // Add creases
        creases.push({
          p1: { x: Math.random() * w, y: Math.random() * h },
          p2: { x: Math.random() * w, y: Math.random() * h }
        });
        if (creases.length > 20) creases.shift();

        onClick();
      }
      pressing = false; 
    };
    const onMouseLeave = () => { pressing = false; };
    
    // Double click fold toggle
    let lastClick = 0;
    const onCanvasClick = () => {
       if(disabled) return;
       const now = Date.now();
       if (now - lastClick < 350) {
          isFolded = !isFolded;
       }
       lastClick = now;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onCanvasClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('click', onCanvasClick);
    };
  }, [text, onClick, width, height, disabled]);

  return <canvas ref={canvasRef} className={`cursor-pointer select-none touch-none ${className} ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}`} />;
};
