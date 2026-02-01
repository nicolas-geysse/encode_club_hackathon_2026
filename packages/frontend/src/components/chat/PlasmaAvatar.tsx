/**
 * PlasmaAvatar Component
 *
 * An animated plasma/blob effect avatar for Bruno the AI coach.
 * Uses canvas particles with SVG gooey filter for organic blob effect.
 * Particles move organically in all directions (not flame-like).
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
  angle: number;
  angularSpeed: number;
  orbitRadius: number;
  phase: number;
}

export default function PlasmaAvatar(props: PlasmaAvatarProps) {
  const size = () => props.size || 32;
  const color = () => props.color || 'green';

  let canvasRef: HTMLCanvasElement | undefined;
  let animationId: number;
  const particles: Particle[] = [];
  let time = 0;

  // Color schemes
  const colorSchemes = {
    green: {
      fill: 'rgba(74, 222, 128, 0.7)',
      stroke: 'rgba(34, 197, 94, 0.9)',
      glow: 'rgba(74, 222, 128, 0.4)',
      core: 'rgba(187, 247, 208, 0.95)',
    },
    blue: {
      fill: 'rgba(96, 165, 250, 0.7)',
      stroke: 'rgba(59, 130, 246, 0.9)',
      glow: 'rgba(96, 165, 250, 0.4)',
      core: 'rgba(191, 219, 254, 0.95)',
    },
    purple: {
      fill: 'rgba(192, 132, 252, 0.7)',
      stroke: 'rgba(147, 51, 234, 0.9)',
      glow: 'rgba(192, 132, 252, 0.4)',
      core: 'rgba(233, 213, 255, 0.95)',
    },
  };

  const createParticle = (
    centerX: number,
    centerY: number,
    scale: number,
    index: number
  ): Particle => {
    const baseAngle = (index / 8) * Math.PI * 2; // Distribute evenly around center
    return {
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      radius: (2 + Math.random() * 3) * scale,
      angle: baseAngle + Math.random() * 0.5,
      angularSpeed: 0.01 + Math.random() * 0.02,
      orbitRadius: (3 + Math.random() * 6) * scale,
      phase: Math.random() * Math.PI * 2,
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
    const centerY = h / 2;
    const colors = colorSchemes[color()];

    time += 0.016; // ~60fps time increment

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Initialize particles if needed
    if (particles.length === 0) {
      for (let i = 0; i < 8; i++) {
        particles.push(createParticle(centerX, centerY, scale, i));
      }
    }

    // Update and draw particles - organic blob movement
    particles.forEach((p, i) => {
      // Organic movement: combination of orbital motion and noise-like wandering
      p.angle += p.angularSpeed;

      // Pulsing orbit radius for breathing effect
      const breathe = Math.sin(time * 2 + p.phase) * 0.3 + 1;
      const currentOrbit = p.orbitRadius * breathe;

      // Add some wobble for organic feel
      const wobbleX = Math.sin(time * 3 + i) * 2 * scale;
      const wobbleY = Math.cos(time * 2.5 + i * 0.7) * 2 * scale;

      // Calculate position
      p.x = centerX + Math.cos(p.angle) * currentOrbit + wobbleX;
      p.y = centerY + Math.sin(p.angle) * currentOrbit + wobbleY;

      // Pulsing radius
      const radiusPulse = Math.sin(time * 4 + p.phase) * 0.2 + 1;
      const currentRadius = p.radius * radiusPulse;

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1 * scale;
      ctx.stroke();
      ctx.closePath();
    });

    // Draw central core (always visible, pulsing)
    const pulse = 0.85 + Math.sin(time * 3) * 0.15;
    const coreRadius = 5 * scale * pulse;

    // Outer glow gradient
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      coreRadius * 2
    );
    gradient.addColorStop(0, colors.core);
    gradient.addColorStop(0.4, colors.fill);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.closePath();

    // Inner bright core
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 0.5, 0, Math.PI * 2);
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
      class="relative flex-shrink-0 rounded-full overflow-hidden"
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
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
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
        class="absolute inset-0 rounded-full"
        style={{
          'box-shadow': `0 0 ${size() / 4}px ${size() / 8}px ${colorSchemes[color()].glow}`,
          animation: 'plasma-glow 2s ease-in-out infinite',
        }}
      />

      <style>{`
        @keyframes plasma-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
