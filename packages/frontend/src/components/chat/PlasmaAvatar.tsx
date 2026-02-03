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

interface EyeState {
  // Position of gaze (offset from center, very subtle)
  lookX: number; // -1 to 1
  lookY: number; // -1 to 1
  targetLookX: number;
  targetLookY: number;

  // Blinking
  blinkProgress: number; // 0 = open, 1 = closed
  isBlinking: boolean;
  nextBlinkTime: number; // Time before next blink
  nextGazeTime: number; // Time before next gaze shift
}

export default function PlasmaAvatar(props: PlasmaAvatarProps) {
  const size = () => props.size || 32;
  const color = () => props.color || 'green';

  let canvasRef: HTMLCanvasElement | undefined;
  let animationId: number;
  const particles: Particle[] = [];
  let time = 0;

  // Eye state for blink and gaze animation
  const eyeState: EyeState = {
    lookX: 0,
    lookY: 0,
    targetLookX: 0,
    targetLookY: 0,
    blinkProgress: 0,
    isBlinking: false,
    nextBlinkTime: 3 + Math.random() * 5, // First blink in 3-8 seconds
    nextGazeTime: 1 + Math.random() * 2, // First gaze shift
  };

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

  /**
   * Draw manga/kawaii style eye with blink and gaze animation
   */
  const drawEye = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    scale: number,
    lookX: number,
    lookY: number,
    blinkProgress: number
  ) => {
    const eyeRadius = 2.5 * scale;
    const pupilWidth = 1.8 * scale;
    const pupilHeight = 2.2 * scale; // Slightly elongated (almond shape)

    // Gaze offset (white + pupil move together)
    const lookOffset = 0.8 * scale;
    const eyeCenterX = centerX + lookX * lookOffset;
    const eyeCenterY = centerY + lookY * lookOffset;

    // Calculate blink (0→1→0)
    const blink = blinkProgress <= 1 ? blinkProgress : 2 - blinkProgress;

    // Draw sclera (white of the eye)
    ctx.beginPath();
    ctx.ellipse(
      eyeCenterX,
      eyeCenterY,
      eyeRadius,
      eyeRadius * (1 - blink * 0.9), // Squashes vertically during blink
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.closePath();

    // Draw pupil (or horizontal line when blinking)
    if (blink > 0.7) {
      // Blinking: horizontal line
      ctx.beginPath();
      ctx.moveTo(eyeCenterX - eyeRadius * 0.7, eyeCenterY);
      ctx.lineTo(eyeCenterX + eyeRadius * 0.7, eyeCenterY);
      ctx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
      ctx.lineWidth = 1.2 * scale;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.closePath();
    } else {
      // Eye open: almond-shaped pupil
      ctx.beginPath();
      ctx.ellipse(
        eyeCenterX + lookX * 0.3 * scale, // Pupil follows gaze
        eyeCenterY + lookY * 0.2 * scale,
        pupilWidth * (1 - blink * 0.5),
        pupilHeight * (1 - blink * 0.8),
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
      ctx.fill();
      ctx.closePath();
    }
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
      angularSpeed: 0.003 + Math.random() * 0.005,
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

    time += 0.006; // Slow, calm animation

    // === Eye animation logic ===

    // Trigger random blink (every 3-8 seconds)
    if (time > eyeState.nextBlinkTime && !eyeState.isBlinking) {
      eyeState.isBlinking = true;
      eyeState.nextBlinkTime = time + 3 + Math.random() * 5;
    }

    // Blink animation (fast: ~150ms)
    if (eyeState.isBlinking) {
      eyeState.blinkProgress += 0.15;
      if (eyeState.blinkProgress >= 2) {
        // Round-trip complete
        eyeState.blinkProgress = 0;
        eyeState.isBlinking = false;
      }
    }

    // Saccadic Gaze Movement
    // Human eyes move in quick jumps (saccades) followed by fixation
    if (time > eyeState.nextGazeTime) {
      // 30% chance to look directly at user (center)
      if (Math.random() < 0.3) {
        eyeState.targetLookX = 0;
        eyeState.targetLookY = 0;
      } else {
        // Random look direction (wider range for alert look)
        // Range: -0.7 to 0.7 (was 0.5)
        eyeState.targetLookX = (Math.random() - 0.5) * 1.4;
        eyeState.targetLookY = (Math.random() - 0.5) * 1.0;
      }

      // Next saccade in 200ms (quick glance) to 2.5s (stare)
      // Weighted towards shorter intervals for more "active" feel
      const saccadeInterval =
        Math.random() < 0.6 ? 0.2 + Math.random() * 0.8 : 1 + Math.random() * 1.5;
      eyeState.nextGazeTime = time + saccadeInterval;

      // Occasional blink synced with large eye movements (natural behavior)
      if (
        Math.abs(eyeState.targetLookX - eyeState.lookX) > 0.5 &&
        !eyeState.isBlinking &&
        Math.random() < 0.5
      ) {
        eyeState.isBlinking = true;
      }
    }

    // Snappier interpolation for saccades (was 0.02)
    // Eyes move quickly, they don't drift
    eyeState.lookX += (eyeState.targetLookX - eyeState.lookX) * 0.25;
    eyeState.lookY += (eyeState.targetLookY - eyeState.lookY) * 0.25;

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

      // Pulsing orbit radius for breathing effect (slow)
      const breathe = Math.sin(time * 0.8 + p.phase) * 0.2 + 1;
      const currentOrbit = p.orbitRadius * breathe;

      // Add some wobble for organic feel (gentle)
      const wobbleX = Math.sin(time * 1.2 + i) * 1.5 * scale;
      const wobbleY = Math.cos(time * 1.0 + i * 0.7) * 1.5 * scale;

      // Calculate position
      p.x = centerX + Math.cos(p.angle) * currentOrbit + wobbleX;
      p.y = centerY + Math.sin(p.angle) * currentOrbit + wobbleY;

      // Pulsing radius (slow)
      const radiusPulse = Math.sin(time * 1.5 + p.phase) * 0.15 + 1;
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

    // Draw central core (always visible, slow pulsing)
    const pulse = 0.9 + Math.sin(time * 1.0) * 0.1;
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

    // Draw the eye at the center (replaces inner bright core)
    drawEye(ctx, centerX, centerY, scale, eyeState.lookX, eyeState.lookY, eyeState.blinkProgress);

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
          animation: 'plasma-glow 6s ease-in-out infinite',
        }}
      />

      <style>{`
        @keyframes plasma-glow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
