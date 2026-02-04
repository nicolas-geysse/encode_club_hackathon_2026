/**
 * Daily Mood Check-in Modal
 *
 * Shows once per day when user visits Progress page.
 * Uses emoji scale for quick mood input.
 * Stores last check timestamp in localStorage.
 */

import { createSignal, Show, onMount, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Button } from '~/components/ui/Button';
import { X, Zap, Calendar } from 'lucide-solid';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';
import { cn } from '~/lib/cn';

const MOOD_STORAGE_KEY = 'stride_last_mood_check';

interface DailyMoodModalProps {
  /** Called when user selects a mood */
  onMoodSelect: (level: number) => void;
  /** Called when modal is dismissed */
  onDismiss: () => void;
  /** Current week number for context */
  currentWeek: number;
}

const MOOD_OPTIONS = [
  {
    emoji: '😴',
    level: 20,
    label: 'Exhausted',
    color: 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50',
  },
  {
    emoji: '😔',
    level: 40,
    label: 'Tired',
    color: 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50',
  },
  {
    emoji: '😐',
    level: 60,
    label: 'Okay',
    color: 'bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50',
  },
  {
    emoji: '😊',
    level: 80,
    label: 'Good',
    color: 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50',
  },
  {
    emoji: '😄',
    level: 100,
    label: 'Great!',
    color:
      'bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50',
  },
];

/**
 * Check if we should show the daily mood modal
 * Returns true if not shown today
 */
export function shouldShowDailyMood(): boolean {
  if (typeof window === 'undefined') return false;

  const lastCheck = localStorage.getItem(MOOD_STORAGE_KEY);
  if (!lastCheck) return true;

  const today = new Date().toDateString();
  const lastCheckDate = new Date(lastCheck).toDateString();

  return today !== lastCheckDate;
}

/**
 * Mark mood check as done for today
 */
export function markMoodCheckDone(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MOOD_STORAGE_KEY, new Date().toISOString());
}

export function DailyMoodModal(props: DailyMoodModalProps) {
  const [selectedMood, setSelectedMood] = createSignal<number | null>(null);
  const [isClosing, setIsClosing] = createSignal(false);

  const handleMoodClick = (level: number) => {
    setSelectedMood(level);
  };

  const handleConfirm = () => {
    const mood = selectedMood();
    if (mood !== null) {
      markMoodCheckDone();
      setIsClosing(true);
      // Small delay for animation
      setTimeout(() => {
        props.onMoodSelect(mood);
      }, 150);
    }
  };

  const handleSkip = () => {
    markMoodCheckDone();
    setIsClosing(true);
    setTimeout(() => {
      props.onDismiss();
    }, 150);
  };

  return (
    <Portal>
      <div
        class={cn(
          'fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm',
          isClosing() ? 'animate-out fade-out duration-150' : 'animate-in fade-in duration-200'
        )}
      >
        <div
          class={cn(
            'bg-card dark:bg-card border border-border rounded-2xl max-w-sm w-full shadow-2xl',
            isClosing()
              ? 'animate-out zoom-out-95 duration-150'
              : 'animate-in zoom-in-95 duration-200'
          )}
        >
          {/* Header with Bruno */}
          <div class="p-6 pb-2 text-center">
            <div class="flex justify-center mb-3">
              <PlasmaAvatar size={48} color="green" />
            </div>
            <h3 class="text-xl font-semibold text-foreground mb-1">Hey! How are you feeling?</h3>
            <p class="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Calendar class="h-3.5 w-3.5" />
              Week {props.currentWeek} check-in
            </p>
          </div>

          {/* Mood Selection */}
          <div class="px-6 py-4">
            <div class="grid grid-cols-5 gap-2">
              <For each={MOOD_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    class={cn(
                      'flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200',
                      option.color,
                      selectedMood() === option.level
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105'
                        : 'hover:scale-105'
                    )}
                    onClick={() => handleMoodClick(option.level)}
                  >
                    <span class="text-3xl">{option.emoji}</span>
                    <span class="text-[10px] text-muted-foreground font-medium">
                      {option.label}
                    </span>
                  </button>
                )}
              </For>
            </div>

            {/* Energy indicator when selected */}
            <Show when={selectedMood() !== null}>
              <div class="mt-4 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                <Zap class="h-5 w-5 text-yellow-500 fill-yellow-500" />
                <div class="flex-1">
                  <div class="text-sm font-medium text-foreground">
                    Energy Level: {selectedMood()}%
                  </div>
                  <div class="h-2 bg-secondary rounded-full overflow-hidden mt-1">
                    <div
                      class={cn(
                        'h-full transition-all duration-300',
                        selectedMood()! >= 70
                          ? 'bg-green-500'
                          : selectedMood()! >= 50
                            ? 'bg-yellow-500'
                            : selectedMood()! >= 30
                              ? 'bg-orange-500'
                              : 'bg-red-500'
                      )}
                      style={{ width: `${selectedMood()}%` }}
                    />
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Footer */}
          <div class="p-4 pt-2 flex gap-2 border-t border-border">
            <Button variant="ghost" class="flex-1" onClick={handleSkip}>
              Skip today
            </Button>
            <Button class="flex-1" disabled={selectedMood() === null} onClick={handleConfirm}>
              Save mood
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default DailyMoodModal;
