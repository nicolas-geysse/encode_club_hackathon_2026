/**
 * Swipe Card Component
 *
 * Tinder-style card with swipe animations for scenario selection.
 */

import { createSignal, onMount, For } from 'solid-js';

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
  onSwipe: (direction: 'left' | 'right', timeSpent: number, adjustments?: CardAdjustments) => void;
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
  const [swipeDirection, setSwipeDirection] = createSignal<'left' | 'right' | null>(null);
  const [startTime, setStartTime] = createSignal(Date.now());

  // Perceived values (user adjustments) - initialized to 0, set in onMount
  const [perceivedEffort, setPerceivedEffort] = createSignal(0);
  const [perceivedFlexibility, setPerceivedFlexibility] = createSignal(0);
  const [customRate, setCustomRate] = createSignal(0);
  const [isEditingRate, setIsEditingRate] = createSignal(false);

  let cardRef: HTMLDivElement | undefined;
  let startPos = { x: 0, y: 0 };

  onMount(() => {
    setStartTime(Date.now());
    // Access props within onMount to initialize state
    const effort = props.effortLevel;
    const flex = props.flexibilityScore;
    const rate = props.hourlyRate;
    setPerceivedEffort(effort);
    setPerceivedFlexibility(flex);
    setCustomRate(rate);
  });

  // Adjust perceived effort (+1 or -1)
  const adjustEffort = (delta: number) => {
    const newValue = Math.max(1, Math.min(5, perceivedEffort() + delta));
    setPerceivedEffort(newValue);
  };

  // Adjust perceived flexibility (+1 or -1)
  const adjustFlexibility = (delta: number) => {
    const newValue = Math.max(1, Math.min(5, perceivedFlexibility() + delta));
    setPerceivedFlexibility(newValue);
  };

  // Get current adjustments
  const getAdjustments = (): CardAdjustments => ({
    perceivedEffort: perceivedEffort() !== props.effortLevel ? perceivedEffort() : undefined,
    perceivedFlexibility:
      perceivedFlexibility() !== props.flexibilityScore ? perceivedFlexibility() : undefined,
    customHourlyRate: customRate() !== props.hourlyRate ? customRate() : undefined,
  });

  const handlePointerDown = (e: PointerEvent) => {
    if (!props.isActive) return;

    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target?.closest('button, input, [role="button"]')) {
      return;
    }

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
      const adjustments = getAdjustments();

      // Animate out
      setPosition({
        x: direction === 'right' ? 500 : -500,
        y: position().y,
      });
      setRotation(direction === 'right' ? 30 : -30);

      setTimeout(() => {
        props.onSwipe(direction, timeSpent, adjustments);
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

  // Star meter component for effort/flexibility
  const StarMeter = (currentProps: {
    value: number;
    onChange?: (delta: number) => void;
    label: string;
  }) => (
    <div class="flex items-center gap-1">
      <span class="text-xs text-slate-500 mr-1">{currentProps.label}:</span>
      {currentProps.onChange && (
        <button
          type="button"
          class="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            currentProps.onChange!(-1);
          }}
        >
          👎
        </button>
      )}
      <div class="flex">
        <For each={[1, 2, 3, 4, 5]}>
          {(i) => (
            <span
              class={`text-sm ${i <= currentProps.value ? 'text-amber-500' : 'text-slate-300'}`}
            >
              ★
            </span>
          )}
        </For>
      </div>
      {currentProps.onChange && (
        <button
          type="button"
          class="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            currentProps.onChange!(1);
          }}
        >
          👍
        </button>
      )}
    </div>
  );

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

        {/* Effort & Flexibility with adjustment controls */}
        <div class="space-y-2">
          <StarMeter value={perceivedEffort()} onChange={adjustEffort} label="Effort" />
          <StarMeter value={perceivedFlexibility()} onChange={adjustFlexibility} label="Flex" />
        </div>

        {/* Hourly Rate (editable) */}
        {props.hourlyRate > 0 && (
          <div class="mt-4 pt-4 border-t border-slate-100 text-center">
            {isEditingRate() ? (
              <div class="flex items-center justify-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  class="w-20 px-2 py-1 text-center border border-slate-300 rounded-lg text-green-600 font-bold"
                  value={customRate()}
                  onInput={(e) =>
                    setCustomRate(parseInt(e.currentTarget.value) || props.hourlyRate)
                  }
                  onBlur={() => setIsEditingRate(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingRate(false)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span class="text-green-600 font-bold">€/h</span>
              </div>
            ) : (
              <button
                type="button"
                class="text-lg font-bold text-green-600 hover:text-green-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingRate(true);
                }}
              >
                {customRate()}€/h ✏️
              </button>
            )}
            {customRate() !== props.hourlyRate && (
              <div class="text-xs text-slate-400 mt-1">(original: {props.hourlyRate}€/h)</div>
            )}
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
