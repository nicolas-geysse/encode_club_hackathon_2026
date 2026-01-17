/**
 * Swipe Card Component
 *
 * Tinder-style card with swipe animations for scenario selection.
 */

import { createSignal, onMount } from 'solid-js';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeCardProps {
  id: string;
  title: string;
  description: string;
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number;
  flexibilityScore: number;
  hourlyRate: number;
  category: string;
  onSwipe: (direction: SwipeDirection, timeSpent: number, adjustments?: CardAdjustments) => void;
  isActive?: boolean;
}

export interface CardAdjustments {
  perceivedEffort?: number;
  perceivedFlexibility?: number;
  customHourlyRate?: number;
}

export function SwipeCard(props: SwipeCardProps) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [rotation, setRotation] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [swipeDirection, setSwipeDirection] = createSignal<SwipeDirection | null>(null);
  const [startTime, setStartTime] = createSignal(Date.now());

  let cardRef: HTMLDivElement | undefined;
  let startPos = { x: 0, y: 0 };

  onMount(() => {
    setStartTime(Date.now());
  });

  // Get current adjustments (now passed from parent via props if needed)
  const getAdjustments = (): CardAdjustments => ({});

  const handlePointerDown = (e: PointerEvent) => {
    if (!props.isActive) return;

    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target?.closest('button, input, [role="button"]')) {
      return;
    }

    e.preventDefault(); // Prevent scroll
    setIsDragging(true);
    startPos = { x: e.clientX - position().x, y: e.clientY - position().y };
    cardRef?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging() || !props.isActive) return;
    e.preventDefault(); // Prevent scroll during drag

    const x = e.clientX - startPos.x;
    const y = e.clientY - startPos.y;

    setPosition({ x, y });
    // Rotation based on horizontal movement only
    setRotation(x * 0.05);

    // Determine swipe direction (4-way)
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const threshold = 50;

    if (absX > absY && absX > threshold) {
      // Horizontal dominant
      setSwipeDirection(x > 0 ? 'right' : 'left');
    } else if (absY > absX && absY > threshold) {
      // Vertical dominant
      setSwipeDirection(y > 0 ? 'down' : 'up');
    } else {
      setSwipeDirection(null);
    }
  };

  const handlePointerUp = () => {
    if (!isDragging() || !props.isActive) return;
    setIsDragging(false);

    const { x, y } = position();
    const threshold = 100;
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    let direction: SwipeDirection | null = null;

    // Determine final swipe direction (4-way)
    if (absX > absY && absX > threshold) {
      direction = x > 0 ? 'right' : 'left';
    } else if (absY > absX && absY > threshold) {
      direction = y > 0 ? 'down' : 'up';
    }

    if (direction) {
      const timeSpent = Date.now() - startTime();
      const adjustments = getAdjustments();

      // Animate out based on direction (keep within reasonable bounds)
      const exitPositions = {
        right: { x: 400, y: position().y },
        left: { x: -400, y: position().y },
        up: { x: position().x, y: -400 },
        down: { x: position().x, y: 400 },
      };
      const exitRotations = {
        right: 30,
        left: -30,
        up: 0,
        down: 0,
      };

      setPosition(exitPositions[direction]);
      setRotation(exitRotations[direction]);

      setTimeout(() => {
        props.onSwipe(direction!, timeSpent, adjustments);
      }, 200);
    } else {
      // Spring back
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setSwipeDirection(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      freelance: '💻',
      tutoring: '📚',
      selling: '📦',
      lifestyle: '🏠',
      trade: '🔄',
    };
    return icons[category] || '💼';
  };

  return (
    <div
      ref={cardRef}
      class={`absolute w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border-2 overflow-hidden cursor-grab select-none transition-shadow ${
        isDragging() ? 'cursor-grabbing shadow-2xl' : ''
      } ${
        swipeDirection() === 'right'
          ? 'border-green-400'
          : swipeDirection() === 'left'
            ? 'border-red-400'
            : swipeDirection() === 'up'
              ? 'border-blue-400'
              : swipeDirection() === 'down'
                ? 'border-orange-400'
                : 'border-slate-200 dark:border-slate-600'
      }`}
      style={{
        transform: `translate(${position().x}px, ${position().y}px) rotate(${rotation()}deg)`,
        transition: isDragging() ? 'none' : 'transform 0.3s ease-out',
        'z-index': props.isActive ? 10 : 1,
        opacity: props.isActive ? 1 : 0.5,
        'pointer-events': props.isActive ? 'auto' : 'none',
        'touch-action': 'none', // Prevent scroll during swipe
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Swipe Indicator Overlays */}
      <div
        class={`absolute inset-0 bg-green-500/20 flex items-center justify-center transition-opacity z-20 ${
          swipeDirection() === 'right' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div class="bg-green-500 text-white px-6 py-3 rounded-full font-bold text-xl transform rotate-12">
          ♥ I'LL TAKE IT!
        </div>
      </div>
      <div
        class={`absolute inset-0 bg-red-500/20 flex items-center justify-center transition-opacity z-20 ${
          swipeDirection() === 'left' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div class="bg-red-500 text-white px-6 py-3 rounded-full font-bold text-xl transform -rotate-12">
          ✕ NOT FOR ME
        </div>
      </div>
      <div
        class={`absolute inset-0 bg-blue-500/20 flex items-center justify-center transition-opacity z-20 ${
          swipeDirection() === 'up' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div class="bg-blue-500 text-white px-6 py-3 rounded-full font-bold text-xl">
          ⭐ SUPER LIKE!
        </div>
      </div>
      <div
        class={`absolute inset-0 bg-orange-500/20 flex items-center justify-center transition-opacity z-20 ${
          swipeDirection() === 'down' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div class="bg-orange-500 text-white px-6 py-3 rounded-full font-bold text-xl">
          👎 NOT GREAT
        </div>
      </div>

      {/* Card Content */}
      <div class="p-6">
        {/* Category Badge */}
        <div class="flex items-center gap-2 mb-4">
          <span class="text-2xl">{getCategoryIcon(props.category)}</span>
          <span class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {props.category}
          </span>
        </div>

        {/* Title */}
        <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{props.title}</h3>

        {/* Description */}
        <p class="text-slate-600 dark:text-slate-300 text-sm mb-6">{props.description}</p>

        {/* Stats - only earnings and hours */}
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">
              ${props.weeklyEarnings}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">/week</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-slate-700 dark:text-slate-200">
              {props.weeklyHours}h
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">/week</div>
          </div>
        </div>
      </div>

      {/* Swipe Hint */}
      <div class="bg-slate-50 dark:bg-slate-700 px-4 py-2 flex justify-between text-xs text-slate-400">
        <span>← No</span>
        <span>↑ Super</span>
        <span>↓ Meh</span>
        <span>Yes →</span>
      </div>
    </div>
  );
}
