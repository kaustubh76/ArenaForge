import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'rect' | 'circle';
}

const COLORS = [
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#22c55e', // green
  '#eab308', // gold
  '#f97316', // orange
];

const PARTICLE_COUNT = 120;
const GRAVITY = 0.12;
const FADE_RATE = 0.008;

export function VictoryConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to viewport
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles bursting from top-center
    const particles: Particle[] = [];
    const cx = canvas.width / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: cx + (Math.random() - 0.5) * 200,
        y: -20 + Math.random() * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 + 2,
        size: 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }

    let running = true;

    const animate = () => {
      if (!running) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let aliveCount = 0;

      for (const p of particles) {
        if (p.opacity <= 0) continue;
        aliveCount++;

        p.x += p.vx;
        p.vy += GRAVITY;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.opacity -= FADE_RATE;

        if (p.opacity <= 0) continue;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      if (aliveCount > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
