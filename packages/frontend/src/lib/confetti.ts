/**
 * Confetti Celebration Utilities
 *
 * Lightweight confetti effects for milestone celebrations.
 * Uses canvas-confetti library (3KB gzipped).
 */

import confetti from 'canvas-confetti';

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
 * Gold achievement celebration
 * Use for: gold tier achievements (Comeback King, Goal Achieved)
 */
export function celebrateGoldAchievement(): void {
  // Gold sparkles from center
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.5, x: 0.5 },
    colors: ['#FFD700', '#FFA500', '#FFEC8B', '#F0E68C'],
    shapes: ['star', 'circle'],
    scalar: 1.2,
    zIndex: 9999,
  });

  // Side bursts with delay
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: ['#FFD700', '#FFA500'],
      zIndex: 9999,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: ['#FFD700', '#FFA500'],
      zIndex: 9999,
    });
  }, 250);
}

export default {
  celebrateBig,
  celebrateGoalAchieved,
  celebrateComeback,
  celebrateGoldAchievement,
};
