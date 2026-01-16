/**
 * Confetti Celebration Utilities
 *
 * Lightweight confetti effects for milestone celebrations.
 * Uses canvas-confetti library (3KB gzipped).
 */

import confetti from 'canvas-confetti';

/**
 * Basic celebration confetti burst
 * Use for: mission completion, small achievements
 */
export function celebrateSmall(): void {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.7 },
  });
}

/**
 * Medium celebration with multiple bursts
 * Use for: goal milestones, comeback mode activation
 */
export function celebrateMedium(): void {
  const count = 100;
  const defaults = {
    origin: { y: 0.7 },
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
}

/**
 * Big celebration with fireworks effect
 * Use for: goal completion, major achievements
 */
export function celebrateBig(): void {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    // Random side bursts
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

/**
 * Goal achieved celebration with gold theme
 * Use for: reaching savings goal
 */
export function celebrateGoalAchieved(): void {
  const defaults = {
    spread: 360,
    ticks: 100,
    gravity: 0,
    decay: 0.94,
    startVelocity: 30,
    colors: ['#FFD700', '#FFA500', '#FFE4B5', '#FAFAD2', '#DAA520'],
  };

  function shoot() {
    confetti({
      ...defaults,
      particleCount: 40,
      scalar: 1.2,
      shapes: ['star'],
    });

    confetti({
      ...defaults,
      particleCount: 10,
      scalar: 0.75,
      shapes: ['circle'],
    });
  }

  setTimeout(shoot, 0);
  setTimeout(shoot, 100);
  setTimeout(shoot, 200);
}

/**
 * Comeback mode celebration (rocket theme)
 * Use for: comeback mode activated
 */
export function celebrateComeback(): void {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.9, x: 0.5 },
    colors: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0'],
    angle: 90,
    startVelocity: 45,
  });
}

/**
 * Energy recovery celebration
 * Use for: energy going from low (<40) to high (>80)
 */
export function celebrateEnergyRecovery(): void {
  const end = Date.now() + 1500;

  const colors = ['#10B981', '#3B82F6', '#8B5CF6'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

export default {
  celebrateSmall,
  celebrateMedium,
  celebrateBig,
  celebrateGoalAchieved,
  celebrateComeback,
  celebrateEnergyRecovery,
};
