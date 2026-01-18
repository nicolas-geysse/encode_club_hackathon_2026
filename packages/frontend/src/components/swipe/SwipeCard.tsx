import { createSignal, onMount, Show } from 'solid-js';
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
} from 'lucide-solid';

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
  customWeeklyHours?: number;
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

  const getAdjustments = (): CardAdjustments => ({});

  const handlePointerDown = (e: PointerEvent) => {
    if (!props.isActive) return;

    const target = e.target as HTMLElement;
    if (target?.closest('button, input, [role="button"]')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    startPos = { x: e.clientX - position().x, y: e.clientY - position().y };
    cardRef?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
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
    if (!isDragging() || !props.isActive) return;
    setIsDragging(false);

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
      const timeSpent = Date.now() - startTime();
      const adjustments = getAdjustments();

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
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setSwipeDirection(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, any> = {
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
        'absolute w-80 h-[420px] rounded-3xl cursor-grab select-none transition-shadow duration-300',
        isDragging() ? 'cursor-grabbing' : '',
        !props.isActive && 'pointer-events-none'
      )}
      style={{
        transform: `translate(${position().x}px, ${position().y}px) rotate(${rotation()}deg)`,
        transition: isDragging() ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'z-index': props.isActive ? 50 : 10,
        opacity: props.isActive ? 1 : 0.6,
        'touch-action': 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <Card class="h-full w-full overflow-hidden border-border/50 shadow-xl bg-[#121215]">
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
          <div class="space-y-4 pt-6 border-t border-border/50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-2xl bg-green-500/10 text-green-600">
                  <DollarSign class="h-6 w-6" />
                </div>
                <div>
                  <div class="text-3xl font-extrabold text-foreground tracking-tight">
                    ${props.weeklyEarnings}
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
                <div class="text-xs text-muted-foreground">${props.hourlyRate}/h rate</div>
              </div>
            </div>
          </div>

          {/* Footer Hint */}
          <div class="mt-auto pt-6 flex justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-widest opacity-60">
            <span>← Nope</span>
            <span>Like →</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
