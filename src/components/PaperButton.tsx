import React, { useEffect, useRef } from 'react';

export const PaperButton: React.FC<{ onClick: () => void, text: string }> = ({ onClick, text }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas settings
    const w = 240;
    const h = 70;
    canvas.width = w;
    canvas.height = h;

    // Cache texture
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = w;
    textureCanvas.height = h;
    const tCtx = textureCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#2C2410';
      tCtx.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) {
        tCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
        tCtx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 20 + 5, 1);
      }
    }

    // Geometry
    const points: {x: number, y: number}[] = [];
    const numPoints = 60;
    for (let i = 0; i < numPoints; i++) {
      let t = i / numPoints;
      let px, py;
      if (t < 0.25) { px = (t / 0.25) * w; py = 0; }
      else if (t < 0.5) { px = w; py = ((t - 0.25) / 0.25) * h; }
      else if (t < 0.75) { px = w - ((t - 0.5) / 0.25) * w; py = h; }
      else { px = 0; py = h - ((t - 0.75) / 0.25) * h; }
      
      const jitter = 1.5;
      px += (Math.random() - 0.5) * jitter;
      py += (Math.random() - 0.5) * jitter;
      points.push({ x: px, y: py });
    }

    // State
    let pressing = false;
    let pressDepth = 0;
    let clickCount = 0;
    let isFolded = false;
    let foldProgress = 0;
    let animationFrameId: number;

    const drawFrame = () => {
      ctx.clearRect(0, 0, w, h);

      // Interpolate states
      pressDepth += ((pressing ? 1 : 0) - pressDepth) * (pressing ? 0.1 : 0.14);
      foldProgress += ((isFolded ? 1 : 0) - foldProgress) * 0.1;

      ctx.save();
      
      // Inherit shudder / zoom
      const shudderScale = 1 - (pressDepth * 0.02);
      ctx.translate(w/2, h/2);
      ctx.scale(shudderScale, shudderScale);
      ctx.translate(-w/2, -h/2);

      // Draw paper silhouette
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();

      // Texture
      ctx.drawImage(textureCanvas, 0, 0);

      // Dent Shadow
      if (pressDepth > 0.01) {
        const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w);
        grd.addColorStop(0, `rgba(0,0,0,${pressDepth * 0.4})`);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }

      // Label
      if (foldProgress < 0.5) {
        ctx.font = '500 13.5px system-ui';
        ctx.fillStyle = `rgba(212, 168, 74, ${1 - (pressDepth * 0.2)})`; // #D4A84A
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w/2, h/2 + (pressDepth * 2.5));
      }

      ctx.restore();

      // Fold logic (visual simplified for frame performance)
      if (foldProgress > 0.01) {
         ctx.save();
         ctx.beginPath();
         ctx.rect(w/2, 0, w/2, h);
         ctx.clip();
         ctx.fillStyle = 'rgba(0,0,0,0.8)';
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
         ctx.fillStyle = 'rgba(0,0,0,0.3)';
         ctx.fillRect(w/2, 0, w/2, h);
         ctx.restore();

         // Crease line
         ctx.fillStyle = `rgba(0,0,0,${foldProgress * 0.5})`;
         ctx.fillRect(w/2 - 1, 0, 2, h);
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const onMouseDown = () => { if (!isFolded) pressing = true; };
    const onMouseUp = () => { 
      if (!isFolded && pressing) {
        clickCount++;
        // Crumple 
        if (clickCount > 0) {
           for (let i=0; i<4; i++) {
             let idx = Math.floor(Math.random() * points.length);
             let dx = (w/2) - points[idx].x;
             let dy = (h/2) - points[idx].y;
             points[idx].x += dx * 0.05;
             points[idx].y += dy * 0.05;
           }
        }
        onClick();
      }
      pressing = false; 
    };
    const onMouseLeave = () => { pressing = false; };
    
    // Double click fold
    let lastClick = 0;
    const onCanvasClick = () => {
       const now = Date.now();
       if (now - lastClick < 300) {
          isFolded = !isFolded;
       }
       lastClick = now;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onCanvasClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('click', onCanvasClick);
    };
  }, [text, onClick]);

  return <canvas ref={canvasRef} className="cursor-pointer select-none" />;
};
