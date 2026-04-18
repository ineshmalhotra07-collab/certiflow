import React, { useEffect, useRef } from 'react';

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
    const numParticles = 80; // Reduced for performance with lines
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
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: Math.random() * 2 + 1.5,
          baseAlpha: Math.random() * 0.4 + 0.2,
          glowFactor: 0,
          lastHitTime: 0
        });
      }
    };

    const draw = (time: number) => {
      // Clear with true black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;
      const interactionRadius = 200;
      const repulsionRadius = 150;
      const repulsionStrength = 0.5;
      const glowDuration = 800;

      // Draw Dynamic Mesh Network
      ctx.lineWidth = 1;
      for (let i = 0; i < numParticles; i++) {
        for (let j = i + 1; j < numParticles; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            
            // Oscillating lines for "digital brain" feel
            const oscillation = Math.sin(time / 500 + i + j) * 0.05;
            const lineAlpha = (1 - dist / 180) * (0.12 + oscillation);
            
            // Forest Green connecting lines (#064e3b equivalent)
            ctx.strokeStyle = `rgba(16, 185, 129, ${lineAlpha})`; 
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        // Radial Repulsion (Touch/Mouse)
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < repulsionRadius) {
          const force = (repulsionRadius - dist) / repulsionRadius;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * repulsionStrength * 2;
          p.vy -= Math.sin(angle) * force * repulsionStrength * 2;
        }

        // Apply friction and subtle brain-like pulse movement
        p.vx += (Math.random() - 0.5) * 0.02 + Math.sin(time / 1000 + p.x) * 0.001;
        p.vy += (Math.random() - 0.5) * 0.02 + Math.cos(time / 1000 + p.y) * 0.001;
        
        p.vx *= 0.98;
        p.vy *= 0.98;
        
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Interaction Glow
        if (lightEmission) {
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
        }

        // Draw node (Minute vertices)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
        
        // Forest Green base
        const alpha = (p.baseAlpha * 0.5) + (p.glowFactor * 0.7);
        ctx.fillStyle = `rgba(6, 78, 59, ${alpha})`;
        
        if (p.glowFactor > 0 && glowIntensity > 0) {
          ctx.shadowBlur = 15 * p.glowFactor * glowIntensity;
          ctx.shadowColor = 'rgba(16, 185, 129, 0.9)';
        }
        ctx.fill();

        // Accent: Bright emerald/white glowing center
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.3, 0, Math.PI * 2);
        const centerAlpha = (p.baseAlpha + 0.4) + (p.glowFactor * 0.6);
        ctx.fillStyle = `rgba(209, 250, 229, ${Math.min(1, centerAlpha)})`;
        ctx.fill();
        
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    animationFrameId = requestAnimationFrame(draw);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [lightEmission, glowIntensity]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};
