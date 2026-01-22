import { createSignal, onMount, createEffect, on } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { cn } from '~/lib/cn';
import {
  Briefcase,
  GraduationCap,
  ShoppingBag,
  Home,
  RefreshCw,
  Clock,
  DollarSign,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-solid';
import { formatCurrency, formatCurrencyWithSuffix, type Currency } from '~/lib/dateUtils';
import './HoloCard.css';

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
  currency?: Currency;
  onSwipe: (direction: SwipeDirection, timeSpent: number, adjustments?: CardAdjustments) => void;
  isActive?: boolean;
  triggerSwipe?: SwipeDirection | null;
  returnFrom?: SwipeDirection | null; // For undo animation - card returns from this direction
}

export interface CardAdjustments {
  perceivedEffort?: number;
  perceivedFlexibility?: number;
  customHourlyRate?: number;
  customWeeklyHours?: number;
}

export function SwipeCard(props: SwipeCardProps) {
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [rotation, setRotation] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [swipeDirection, setSwipeDirection] = createSignal<SwipeDirection | null>(null);
  const [startTime, setStartTime] = createSignal(Date.now());
  const [tilt, setTilt] = createSignal({ x: 50, y: 50 });
  const [isExiting, setIsExiting] = createSignal(false);

  let cardRef: HTMLDivElement | undefined;
  let startPos = { x: 0, y: 0 };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isReturning, setIsReturning] = createSignal(false);

  onMount(() => {
    setStartTime(Date.now());

    // If returnFrom is set, start from exited position and animate back
    if (props.returnFrom) {
      const flyDistance = 800;
      const startPositions: Record<SwipeDirection, { x: number; y: number }> = {
        right: { x: flyDistance, y: 0 },
        left: { x: -flyDistance, y: 0 },
        up: { x: 0, y: -flyDistance },
        down: { x: 0, y: flyDistance },
      };
      const startRotations: Record<SwipeDirection, number> = {
        right: 45,
        left: -45,
        up: 0,
        down: 0,
      };

      // Start from exited position
      setPosition(startPositions[props.returnFrom]);
      setRotation(startRotations[props.returnFrom]);
      setIsReturning(true);

      // Animate back to center after a tiny delay (for CSS transition to kick in)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPosition({ x: 0, y: 0 });
          setRotation(0);
          setTimeout(() => setIsReturning(false), 500);
        });
      });
    }
  });

  // Reset state when the card ID updates (recycling the component)
  createEffect(() => {
    // specific dependency on props.id
    void props.id;
    // Don't reset if we're doing a return animation
    if (props.returnFrom) return;
    setIsExiting(false);
    setIsReturning(false);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setSwipeDirection(null);
    setTilt({ x: 50, y: 50 });
  });

  const getAdjustments = (): CardAdjustments => ({});

  const animateSwipe = (direction: SwipeDirection) => {
    const timeSpent = Date.now() - startTime();
    const adjustments = getAdjustments();

    setIsExiting(true);

    const flyDistance = 800; // Reduced to avoid scrollbars, still clears view
    const exitPositions = {
      right: { x: flyDistance, y: position().y * 2 },
      left: { x: -flyDistance, y: position().y * 2 },
      up: { x: position().x, y: -flyDistance },
      down: { x: position().x, y: flyDistance },
    };
    const exitRotations = {
      right: 45,
      left: -45,
      up: 0,
      down: 0,
    };

    setPosition(exitPositions[direction]);
    setRotation(exitRotations[direction]);
    setSwipeDirection(direction);

    // Wait for animation to finish before destroying
    setTimeout(() => {
      props.onSwipe(direction, timeSpent, adjustments);
      // State reset is now handled by the createEffect on props.id
    }, 700); // 700ms matches transform duration
  };

  createEffect(
    on(
      () => props.triggerSwipe,
      (trigger) => {
        if (props.isActive && trigger) {
          animateSwipe(trigger);
        }
      },
      { defer: true }
    )
  );

  const handlePointerDown = (e: PointerEvent) => {
    if (!props.isActive) return;

    const target = e.target as HTMLElement;
    if (target?.closest('button, input, [role="button"]')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    // Calc start offset relative to current transformed position
    startPos = { x: e.clientX - position().x, y: e.clientY - position().y };
    cardRef?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    // Always track tilt if active or dragging
    if (props.isActive && cardRef) {
      const rect = cardRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Clamp to 0-100%
      const perX = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const perY = Math.max(0, Math.min(100, (y / rect.height) * 100));
      setTilt({ x: perX, y: perY });
    }

    if (!isDragging() || !props.isActive) return;
    e.preventDefault();

    const x = e.clientX - startPos.x;
    const y = e.clientY - startPos.y;

    setPosition({ x, y });
    setRotation(x * 0.05);

    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const threshold = 50;

    if (absX > absY && absX > threshold) {
      setSwipeDirection(x > 0 ? 'right' : 'left');
    } else if (absY > absX && absY > threshold) {
      setSwipeDirection(y > 0 ? 'down' : 'up');
    } else {
      setSwipeDirection(null);
    }
  };

  const handlePointerUp = () => {
    // Reset tilt slightly towards center but keep some lean if hovering?
    // Actually standard is to reset tilt on leave, but 'up' might still remain hovered.
    // We'll leave tilt as is if mouse sits there, handled by 'Move'.

    if (!isDragging() || !props.isActive) return;
    setIsDragging(false);

    // Reset rotation (Z) and Position if not swiped
    // But preserve Tilt (X/Y) until mouse leaves (handled by onPointerLeave)

    const { x, y } = position();
    const threshold = 100;
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    let direction: SwipeDirection | null = null;

    if (absX > absY && absX > threshold) {
      direction = x > 0 ? 'right' : 'left';
    } else if (absY > absX && absY > threshold) {
      direction = y > 0 ? 'down' : 'up';
    }

    if (direction) {
      animateSwipe(direction);
    } else {
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setSwipeDirection(null);
    }
  };

  const handlePointerLeave = () => {
    setTilt({ x: 50, y: 50 });
    handlePointerUp();
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, typeof Briefcase> = {
      freelance: Briefcase,
      tutoring: GraduationCap,
      selling: ShoppingBag,
      lifestyle: Home,
      trade: RefreshCw,
    };
    const Icon = icons[category] || Briefcase;
    return <Icon class="h-5 w-5" />;
  };

  const getCategoryLabel = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  return (
    <div
      ref={cardRef}
      class={cn(
        'absolute w-80 h-[420px] cursor-grab select-none holo-container',
        isDragging() ? 'cursor-grabbing' : '',
        !props.isActive && 'pointer-events-none'
      )}
      style={{
        transform: `translate(${position().x}px, ${position().y}px) rotate(${rotation()}deg)`,
        transition: isDragging()
          ? 'none'
          : 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease-out',
        'z-index': props.isActive ? 50 : 10,
        opacity: isExiting() ? 0 : props.isActive ? 1 : 0.6,
        'touch-action': 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <div
        class="holo-card w-full h-full relative rounded-3xl"
        style={
          /* eslint-disable @typescript-eslint/no-explicit-any */
          {
            '--pointer-x': tilt().x,
            '--pointer-y': tilt().y,
            '--card-scale': isDragging() ? 1.05 : 1,
          } as any
          /* eslint-enable @typescript-eslint/no-explicit-any */
        }
      >
        {/* Holographic Effects Layers */}
        <div class="holo-glare absolute inset-0 rounded-3xl" />
        <div class="holo-shine absolute inset-0 rounded-3xl" />

        <Card class="h-full w-full overflow-hidden border-border/50 shadow-xl bg-card relative z-0">
          {/* Swipe Indicator Overlays */}
          <div
            class={cn(
              'absolute inset-0 flex items-center justify-center z-50 transition-all duration-200 backdrop-blur-[2px]',
              swipeDirection() === 'right' ? 'bg-green-500/10 opacity-100' : 'opacity-0'
            )}
          >
            <div class="border-4 border-green-500 text-green-600 bg-white/90 px-8 py-2 rounded-2xl font-black text-2xl transform -rotate-12 shadow-lg">
              YES!
            </div>
          </div>
          <div
            class={cn(
              'absolute inset-0 flex items-center justify-center z-50 transition-all duration-200 backdrop-blur-[2px]',
              swipeDirection() === 'left' ? 'bg-red-500/10 opacity-100' : 'opacity-0'
            )}
          >
            <div class="border-4 border-red-500 text-red-600 bg-white/90 px-8 py-2 rounded-2xl font-black text-2xl transform rotate-12 shadow-lg">
              NOPE
            </div>
          </div>
          <div
            class={cn(
              'absolute inset-0 flex items-center justify-center z-50 transition-all duration-200 backdrop-blur-[2px]',
              swipeDirection() === 'up' ? 'bg-blue-500/10 opacity-100' : 'opacity-0'
            )}
          >
            <div class="border-4 border-blue-500 text-blue-600 bg-white/90 px-8 py-2 rounded-2xl font-black text-2xl transform shadow-lg">
              SUPER
            </div>
          </div>
          <div
            class={cn(
              'absolute inset-0 flex items-center justify-center z-50 transition-all duration-200 backdrop-blur-[2px]',
              swipeDirection() === 'down' ? 'bg-orange-500/10 opacity-100' : 'opacity-0'
            )}
          >
            <div class="border-4 border-orange-500 text-orange-600 bg-white/90 px-8 py-2 rounded-2xl font-black text-2xl transform shadow-lg">
              MEH
            </div>
          </div>

          <CardContent class="p-6 h-full flex flex-col relative z-20">
            {/* Header */}
            <div class="flex items-start justify-between mb-4">
              <div class="inline-flex items-center rounded-full border border-primary/20 pl-2 pr-3 py-1 gap-1.5 text-xs font-semibold bg-primary/5 text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                {getCategoryIcon(props.category)}
                {getCategoryLabel(props.category)}
              </div>
            </div>

            {/* Title */}
            <h3 class="text-2xl font-bold text-foreground leading-tight mb-3">{props.title}</h3>

            {/* Description */}
            <p class="text-muted-foreground text-sm leading-relaxed mb-6 flex-grow">
              {props.description}
            </p>

            {/* Stats */}
            <div class="space-y-4 mb-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2.5 rounded-2xl bg-green-500/10 text-green-600">
                    <DollarSign class="h-6 w-6" />
                  </div>
                  <div>
                    <div class="text-3xl font-extrabold text-foreground tracking-tight">
                      {formatCurrency(props.weeklyEarnings, props.currency)}
                    </div>
                    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Per week
                    </div>
                  </div>
                </div>

                <div class="text-right">
                  <div class="flex items-center justify-end gap-1.5 text-foreground font-bold text-lg">
                    <Clock class="h-4 w-4 text-muted-foreground" />
                    {props.weeklyHours}h
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {formatCurrencyWithSuffix(props.hourlyRate, props.currency, '/h')} rate
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Hint */}
            <div class="mt-auto pt-6 flex justify-between items-center w-full px-2">
              <div class="flex gap-6">
                <ArrowLeft class="h-5 w-5 text-red-500/80" />
                <ArrowDown class="h-5 w-5 text-orange-500/80" />
              </div>
              <div class="flex gap-6">
                <ArrowUp class="h-5 w-5 text-blue-500/80" />
                <ArrowRight class="h-5 w-5 text-green-500/80" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
