/**
 * Swipe Card Component
 *
 * Tinder-style card with swipe animations for scenario selection.
 */

import { createSignal, onMount } from 'solid-js';

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
  onSwipe: (direction: 'left' | 'right', timeSpent: number) => void;
  isActive?: boolean;
}

export function SwipeCard(props: SwipeCardProps) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [rotation, setRotation] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [swipeDirection, setSwipeDirection] = createSignal<'left' | 'right' | null>(null);
  const [startTime, setStartTime] = createSignal(Date.now());

  let cardRef: HTMLDivElement | undefined;
  let startPos = { x: 0, y: 0 };

  onMount(() => {
    setStartTime(Date.now());
  });

  const handlePointerDown = (e: PointerEvent) => {
    if (!props.isActive) return;
    setIsDragging(true);
    startPos = { x: e.clientX - position().x, y: e.clientY - position().y };
    cardRef?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging() || !props.isActive) return;

    const x = e.clientX - startPos.x;
    const y = e.clientY - startPos.y;

    setPosition({ x, y });
    setRotation(x * 0.05);

    // Determine swipe direction
    if (x > 50) {
      setSwipeDirection('right');
    } else if (x < -50) {
      setSwipeDirection('left');
    } else {
      setSwipeDirection(null);
    }
  };

  const handlePointerUp = () => {
    if (!isDragging() || !props.isActive) return;
    setIsDragging(false);

    const x = position().x;
    const threshold = 100;

    if (Math.abs(x) > threshold) {
      // Swipe completed
      const direction = x > 0 ? 'right' : 'left';
      const timeSpent = Date.now() - startTime();

      // Animate out
      setPosition({
        x: direction === 'right' ? 500 : -500,
        y: position().y,
      });
      setRotation(direction === 'right' ? 30 : -30);

      setTimeout(() => {
        props.onSwipe(direction, timeSpent);
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

  const getEffortLabel = (level: number) => {
    const labels = ['', 'Tres facile', 'Facile', 'Modere', 'Difficile', 'Intense'];
    return labels[level] || 'Modere';
  };

  return (
    <div
      ref={cardRef}
      class={`absolute w-80 bg-white rounded-2xl shadow-xl border-2 overflow-hidden cursor-grab select-none transition-shadow ${
        isDragging() ? 'cursor-grabbing shadow-2xl' : ''
      } ${
        swipeDirection() === 'right'
          ? 'border-green-400'
          : swipeDirection() === 'left'
            ? 'border-red-400'
            : 'border-slate-200'
      }`}
      style={{
        transform: `translate(${position().x}px, ${position().y}px) rotate(${rotation()}deg)`,
        transition: isDragging() ? 'none' : 'transform 0.3s ease-out',
        'z-index': props.isActive ? 10 : 1,
        opacity: props.isActive ? 1 : 0.5,
        'pointer-events': props.isActive ? 'auto' : 'none',
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
          JE PRENDS !
        </div>
      </div>
      <div
        class={`absolute inset-0 bg-red-500/20 flex items-center justify-center transition-opacity z-20 ${
          swipeDirection() === 'left' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div class="bg-red-500 text-white px-6 py-3 rounded-full font-bold text-xl transform -rotate-12">
          PAS POUR MOI
        </div>
      </div>

      {/* Card Content */}
      <div class="p-6">
        {/* Category Badge */}
        <div class="flex items-center gap-2 mb-4">
          <span class="text-2xl">{getCategoryIcon(props.category)}</span>
          <span class="text-sm font-medium text-slate-500 uppercase tracking-wide">
            {props.category}
          </span>
        </div>

        {/* Title */}
        <h3 class="text-xl font-bold text-slate-900 mb-2">{props.title}</h3>

        {/* Description */}
        <p class="text-slate-600 text-sm mb-6">{props.description}</p>

        {/* Stats */}
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-slate-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-primary-600">{props.weeklyEarnings}€</div>
            <div class="text-xs text-slate-500">/semaine</div>
          </div>
          <div class="bg-slate-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-slate-700">{props.weeklyHours}h</div>
            <div class="text-xs text-slate-500">/semaine</div>
          </div>
        </div>

        {/* Effort & Flexibility */}
        <div class="flex justify-between text-sm">
          <div>
            <span class="text-slate-500">Effort: </span>
            <span class="font-medium">{getEffortLabel(props.effortLevel)}</span>
          </div>
          <div>
            <span class="text-slate-500">Flexibilite: </span>
            <span class="font-medium">{'⭐'.repeat(props.flexibilityScore)}</span>
          </div>
        </div>

        {/* Hourly Rate */}
        {props.hourlyRate > 0 && (
          <div class="mt-4 pt-4 border-t border-slate-100 text-center">
            <span class="text-lg font-bold text-green-600">{props.hourlyRate}€/h</span>
          </div>
        )}
      </div>

      {/* Swipe Hint */}
      <div class="bg-slate-50 px-6 py-3 flex justify-between text-xs text-slate-400">
        <span>← Refuser</span>
        <span>Accepter →</span>
      </div>
    </div>
  );
}
