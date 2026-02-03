/**
 * FeedbackButton Component
 *
 * Phase 6: Thumb up/down buttons for rating suggestions.
 * Used across SkillsTab, ProspectionList, and SwipeCard.
 */

import { createSignal, Show } from 'solid-js';
import { ThumbsUp, ThumbsDown } from 'lucide-solid';
import { cn } from '~/lib/cn';

export type FeedbackValue = 'up' | 'down' | null;

export interface FeedbackButtonProps {
  /** Type of suggestion being rated */
  suggestionType: 'skill' | 'job' | 'swipe';
  /** ID of the suggestion (skill name, job id, scenario id) */
  suggestionId: string;
  /** Profile ID for tracking */
  profileId?: string;
  /** Optional metadata to store with feedback */
  metadata?: Record<string, unknown>;
  /** Called when feedback is submitted */
  onFeedback?: (value: FeedbackValue) => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Initial feedback value (for pre-populated state) */
  initialValue?: FeedbackValue;
  /** Whether to show labels */
  showLabels?: boolean;
  /** Custom class name */
  class?: string;
}

export function FeedbackButton(props: FeedbackButtonProps) {
  const [feedback, setFeedback] = createSignal<FeedbackValue>(props.initialValue ?? null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [animating, setAnimating] = createSignal<'up' | 'down' | null>(null);

  const submitFeedback = async (value: FeedbackValue) => {
    // Toggle if clicking the same button
    const newValue = feedback() === value ? null : value;
    setFeedback(newValue);
    setAnimating(value);

    // Reset animation after delay
    setTimeout(() => setAnimating(null), 300);

    // Call parent handler
    props.onFeedback?.(newValue);

    // Persist to backend
    if (props.profileId) {
      setIsSubmitting(true);
      try {
        await fetch('/api/suggestion-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: props.profileId,
            suggestionType: props.suggestionType,
            suggestionId: props.suggestionId,
            feedback: newValue,
            metadata: props.metadata,
          }),
        });
      } catch (err) {
        console.error('[FeedbackButton] Failed to submit:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const sizeClasses = () => (props.size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4');
  const buttonSizeClasses = () => (props.size === 'sm' ? 'p-1' : 'p-1.5');

  return (
    <div class={cn('flex items-center gap-1', props.class)}>
      {/* Thumb Up */}
      <button
        type="button"
        onClick={() => submitFeedback('up')}
        disabled={isSubmitting()}
        class={cn(
          'rounded-full transition-all duration-200',
          buttonSizeClasses(),
          feedback() === 'up'
            ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
            : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          animating() === 'up' && 'scale-125'
        )}
        title="Good suggestion"
      >
        <ThumbsUp class={cn(sizeClasses(), feedback() === 'up' && 'fill-current')} />
      </button>

      {/* Thumb Down */}
      <button
        type="button"
        onClick={() => submitFeedback('down')}
        disabled={isSubmitting()}
        class={cn(
          'rounded-full transition-all duration-200',
          buttonSizeClasses(),
          feedback() === 'down'
            ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
            : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          animating() === 'down' && 'scale-125'
        )}
        title="Not relevant"
      >
        <ThumbsDown class={cn(sizeClasses(), feedback() === 'down' && 'fill-current')} />
      </button>

      {/* Optional labels */}
      <Show when={props.showLabels && feedback()}>
        <span
          class={cn(
            'text-xs ml-1',
            feedback() === 'up' && 'text-green-600 dark:text-green-400',
            feedback() === 'down' && 'text-red-600 dark:text-red-400'
          )}
        >
          {feedback() === 'up' ? 'Helpful' : 'Not helpful'}
        </span>
      </Show>
    </div>
  );
}
