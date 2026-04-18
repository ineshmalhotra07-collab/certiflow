import React, { useEffect, useRef, useState } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  glowFactor: number; // 0 to 1
  lastHitTime: number;
}

export const ParticleBackground: React.FC<{
  lightEmission: boolean;
  glowIntensity: number;
}> = ({ lightEmission, glowIntensity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    const numParticles = 100;
    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2 + 1,
          baseAlpha: Math.random() * 0.3 + 0.1,
          glowFactor: 0,
          lastHitTime: 0
        });
      }
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;
      const interactionRadius = 100;
      const glowDuration = 1000; // 1 second persistence

      particles.forEach(p => {
        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Interaction
        if (lightEmission) {
          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < interactionRadius) {
            p.lastHitTime = time;
            p.glowFactor = 1;
          } else {
            const timeSinceHit = time - p.lastHitTime;
            if (timeSinceHit < glowDuration) {
              p.glowFactor = 1 - (timeSinceHit / glowDuration);
            } else {
              p.glowFactor = 0;
            }
          }
        } else {
          p.glowFactor = 0;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        
        const alpha = p.baseAlpha + (p.glowFactor * 0.7);
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`; // Electric blue base
        
        if (p.glowFactor > 0 && glowIntensity > 0) {
          ctx.shadowBlur = 15 * p.glowFactor * glowIntensity;
          ctx.shadowColor = 'rgba(59, 130, 246, 1)';
        } else {
          ctx.shadowBlur = 0;
        }
        
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    animationFrameId = requestAnimationFrame(draw);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [lightEmission, glowIntensity]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: '#020617' }} // slate-950
    />
  );
};
