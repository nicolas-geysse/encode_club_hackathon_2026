/**
 * ProspectionSwipeDeck Component
 *
 * Handles swipe gestures for prospection cards.
 * - Swipe right: Save lead
 * - Swipe left: Skip
 * - Swipe up: Open URL (if available)
 */

import { createSignal, Show, onMount, onCleanup } from 'solid-js';
import { ProspectionCard } from './ProspectionCard';
import { Button } from '~/components/ui/Button';
import { X, Heart, ExternalLink } from 'lucide-solid';
import { cn } from '~/lib/cn';
import type {
  ProspectionCard as CardType,
  SwipeDirection,
  SwipeResult,
} from '~/lib/prospectionTypes';

interface ProspectionSwipeDeckProps {
  cards: CardType[];
  onSwipe: (result: SwipeResult) => void;
  onComplete: (saved: CardType[], skipped: CardType[]) => void;
}

export function ProspectionSwipeDeck(props: ProspectionSwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [savedCards, setSavedCards] = createSignal<CardType[]>([]);
  const [skippedCards, setSkippedCards] = createSignal<CardType[]>([]);
  const [swipeDirection, setSwipeDirection] = createSignal<SwipeDirection | null>(null);
  const [cardPosition, setCardPosition] = createSignal({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = createSignal(false);

  let cardRef: HTMLDivElement | undefined;
  let startX = 0;
  let startY = 0;

  const currentCard = () => props.cards[currentIndex()];
  const progress = () => ((currentIndex() / props.cards.length) * 100).toFixed(0);
  const isComplete = () => currentIndex() >= props.cards.length;

  // Touch/Mouse handlers for swipe gestures
  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    startX = clientX;
    startY = clientY;
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging()) return;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    setCardPosition({ x: deltaX, y: deltaY });

    // Determine swipe direction for visual feedback
    const threshold = 50;
    if (deltaX > threshold) {
      setSwipeDirection('right');
    } else if (deltaX < -threshold) {
      setSwipeDirection('left');
    } else if (deltaY < -threshold) {
      setSwipeDirection('up');
    } else {
      setSwipeDirection(null);
    }
  };

  const handleEnd = () => {
    if (!isDragging()) return;
    setIsDragging(false);

    const { x, y } = cardPosition();
    const swipeThreshold = 100;

    if (x > swipeThreshold) {
      handleSwipe('right');
    } else if (x < -swipeThreshold) {
      handleSwipe('left');
    } else if (y < -swipeThreshold) {
      handleSwipe('up');
    } else {
      // Reset position
      setCardPosition({ x: 0, y: 0 });
      setSwipeDirection(null);
    }
  };

  const handleSwipe = (direction: SwipeDirection) => {
    const card = currentCard();
    if (!card) return;

    // Record swipe result
    const result: SwipeResult = {
      cardId: card.id,
      direction,
      timestamp: Date.now(),
    };
    props.onSwipe(result);

    // Handle based on direction
    switch (direction) {
      case 'right':
        setSavedCards([...savedCards(), card]);
        break;
      case 'left':
        setSkippedCards([...skippedCards(), card]);
        break;
      case 'up':
        // Open URL if available
        if (card.url) {
          window.open(card.url, '_blank');
        }
        // Don't save or skip, just move to next
        break;
    }

    // Animate card out
    setCardPosition({
      x: direction === 'right' ? 500 : direction === 'left' ? -500 : 0,
      y: direction === 'up' ? -500 : 0,
    });

    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex(currentIndex() + 1);
      setCardPosition({ x: 0, y: 0 });
      setSwipeDirection(null);

      // Check if complete
      if (currentIndex() >= props.cards.length) {
        props.onComplete(savedCards(), skippedCards());
      }
    }, 200);
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    if (isComplete()) return;

    switch (e.key) {
      case 'ArrowLeft':
        handleSwipe('left');
        break;
      case 'ArrowRight':
        handleSwipe('right');
        break;
      case 'ArrowUp':
        handleSwipe('up');
        break;
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  // Touch event handlers
  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const onMouseDown = (e: MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  };

  const onMouseMove = (e: MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  return (
    <div class="flex flex-col items-center space-y-4">
      {/* Progress bar */}
      <div class="w-full max-w-sm">
        <div class="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>
            {currentIndex() + 1} / {props.cards.length}
          </span>
          <span>{progress()}% explored</span>
        </div>
        <div class="h-2 bg-muted rounded-full overflow-hidden">
          <div
            class="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress()}%` }}
          />
        </div>
      </div>

      {/* Swipe direction indicators */}
      <div class="relative w-full max-w-sm h-[450px]">
        {/* Direction overlays */}
        <div
          class={cn(
            'absolute inset-0 rounded-xl bg-green-500/20 border-2 border-green-500 flex items-center justify-center z-10 transition-opacity duration-150',
            swipeDirection() === 'right' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <div class="bg-green-500 text-white px-4 py-2 rounded-full text-lg font-bold rotate-12">
            SAVE
          </div>
        </div>
        <div
          class={cn(
            'absolute inset-0 rounded-xl bg-red-500/20 border-2 border-red-500 flex items-center justify-center z-10 transition-opacity duration-150',
            swipeDirection() === 'left' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <div class="bg-red-500 text-white px-4 py-2 rounded-full text-lg font-bold -rotate-12">
            SKIP
          </div>
        </div>
        <div
          class={cn(
            'absolute inset-0 rounded-xl bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center z-10 transition-opacity duration-150',
            swipeDirection() === 'up' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <div class="bg-blue-500 text-white px-4 py-2 rounded-full text-lg font-bold">
            OPEN LINK
          </div>
        </div>

        {/* Card */}
        <Show
          when={currentCard()}
          fallback={
            <div class="h-full flex items-center justify-center text-muted-foreground">
              No more cards
            </div>
          }
        >
          <div
            ref={cardRef}
            class="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
            style={{
              transform: `translate(${cardPosition().x}px, ${cardPosition().y}px) rotate(${cardPosition().x * 0.05}deg)`,
              transition: isDragging() ? 'none' : 'transform 0.2s ease-out',
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={handleEnd}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
          >
            <ProspectionCard card={currentCard()!} isActive />
          </div>
        </Show>
      </div>

      {/* Action buttons */}
      <Show when={!isComplete()}>
        <div class="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            class="h-14 w-14 rounded-full border-2 border-red-200 hover:border-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:border-red-500 dark:hover:bg-red-950/30"
            onClick={() => handleSwipe('left')}
          >
            <X class="h-6 w-6 text-red-500" />
          </Button>

          <Show when={currentCard()?.url}>
            <Button
              variant="outline"
              size="icon"
              class="h-12 w-12 rounded-full border-2 border-blue-200 hover:border-blue-500 hover:bg-blue-50 dark:border-blue-900 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
              onClick={() => handleSwipe('up')}
            >
              <ExternalLink class="h-5 w-5 text-blue-500" />
            </Button>
          </Show>

          <Button
            variant="outline"
            size="icon"
            class="h-14 w-14 rounded-full border-2 border-green-200 hover:border-green-500 hover:bg-green-50 dark:border-green-900 dark:hover:border-green-500 dark:hover:bg-green-950/30"
            onClick={() => handleSwipe('right')}
          >
            <Heart class="h-6 w-6 text-green-500" />
          </Button>
        </div>

        {/* Keyboard hints */}
        <div class="flex items-center gap-4 text-xs text-muted-foreground">
          <span>← Skip</span>
          <span>↑ Open</span>
          <span>Save →</span>
        </div>
      </Show>

      {/* Stats */}
      <div class="flex items-center gap-6 text-sm">
        <div class="flex items-center gap-1.5">
          <Heart class="h-4 w-4 text-green-500" />
          <span class="font-medium text-foreground">{savedCards().length}</span>
          <span class="text-muted-foreground">saved</span>
        </div>
        <div class="flex items-center gap-1.5">
          <X class="h-4 w-4 text-red-500" />
          <span class="font-medium text-foreground">{skippedCards().length}</span>
          <span class="text-muted-foreground">skipped</span>
        </div>
      </div>
    </div>
  );
}
