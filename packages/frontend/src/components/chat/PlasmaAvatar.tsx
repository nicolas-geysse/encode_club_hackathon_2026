/**
 * PlasmaAvatar Component
 *
 * An animated plasma/flame effect avatar for Bruno the AI coach.
 * Uses canvas particles with SVG gooey filter for organic blob effect.
 */

import { onMount, onCleanup } from 'solid-js';

interface PlasmaAvatarProps {
  /** Size of the avatar in pixels (default: 32) */
  size?: number;
  /** Primary color for the plasma effect (default: green) */
  color?: 'green' | 'blue' | 'purple';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  lifetime: number;
  maxLifetime: number;
}

export default function PlasmaAvatar(props: PlasmaAvatarProps) {
  const size = () => props.size || 32;
  const color = () => props.color || 'green';

  let canvasRef: HTMLCanvasElement | undefined;
  let animationId: number;
  let particles: Particle[] = [];

  // Color schemes
  const colorSchemes = {
    green: {
      fill: 'rgba(74, 222, 128, 0.6)',
      stroke: 'rgba(34, 197, 94, 0.8)',
      glow: 'rgba(74, 222, 128, 0.4)',
      core: 'rgba(187, 247, 208, 0.9)',
    },
    blue: {
      fill: 'rgba(96, 165, 250, 0.6)',
      stroke: 'rgba(59, 130, 246, 0.8)',
      glow: 'rgba(96, 165, 250, 0.4)',
      core: 'rgba(191, 219, 254, 0.9)',
    },
    purple: {
      fill: 'rgba(192, 132, 252, 0.6)',
      stroke: 'rgba(147, 51, 234, 0.8)',
      glow: 'rgba(192, 132, 252, 0.4)',
      core: 'rgba(233, 213, 255, 0.9)',
    },
  };

  const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

  const createParticle = (centerX: number, centerY: number, scale: number): Particle => {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomInt(1, 3) * scale * 0.3;
    return {
      x: centerX + (Math.random() - 0.5) * 4 * scale,
      y: centerY + (Math.random() - 0.5) * 4 * scale,
      vx: Math.cos(angle) * speed * 0.3,
      vy: -Math.abs(Math.sin(angle) * speed) - 0.5 * scale, // Bias upward for flame effect
      radius: randomInt(2, 5) * scale,
      lifetime: randomInt(30, 60),
      maxLifetime: 60,
    };
  };

  const animate = () => {
    if (!canvasRef) return;

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const w = size();
    const h = size();
    const scale = w / 32;
    const centerX = w / 2;
    const centerY = h / 2 + 2 * scale; // Slightly lower center for flame rising effect
    const colors = colorSchemes[color()];

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Add new particles
    if (particles.length < 12 && Math.random() < 0.4) {
      particles.push(createParticle(centerX, centerY, scale));
    }

    // Update and draw particles
    particles = particles.filter((p) => {
      p.lifetime--;
      p.x += p.vx;
      p.y += p.vy;

      // Slow down and shrink as lifetime decreases
      const lifeRatio = p.lifetime / p.maxLifetime;
      const currentRadius = p.radius * lifeRatio;

      if (currentRadius < 1) return false;

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.closePath();

      return p.lifetime > 0;
    });

    // Draw central core (always visible, pulsing)
    const pulse = 0.9 + Math.sin(Date.now() / 200) * 0.1;
    const coreRadius = 6 * scale * pulse;

    // Outer glow
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      coreRadius * 1.5
    );
    gradient.addColorStop(0, colors.core);
    gradient.addColorStop(0.5, colors.fill);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.closePath();

    // Inner core
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = colors.core;
    ctx.fill();
    ctx.closePath();

    animationId = requestAnimationFrame(animate);
  };

  onMount(() => {
    if (canvasRef) {
      // Set canvas size
      canvasRef.width = size();
      canvasRef.height = size();
      animate();
    }
  });

  onCleanup(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  });

  // Generate unique filter ID to avoid conflicts
  const filterId = `plasma-goo-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div
      class="relative flex-shrink-0 rounded-full shadow-md ring-2 ring-background overflow-hidden"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        background:
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%)',
      }}
    >
      {/* SVG filter for gooey effect */}
      <svg class="absolute" style={{ width: 0, height: 0 }}>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Canvas for particle animation */}
      <canvas ref={canvasRef} class="absolute inset-0" style={{ filter: `url(#${filterId})` }} />

      {/* Subtle outer glow */}
      <div
        class="absolute inset-0 rounded-full animate-pulse"
        style={{
          'box-shadow': `0 0 ${size() / 4}px ${size() / 8}px ${colorSchemes[color()].glow}`,
          'animation-duration': '2s',
        }}
      />
    </div>
  );
}
