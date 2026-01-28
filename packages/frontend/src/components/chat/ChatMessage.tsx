import { Show, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { cn } from '~/lib/cn';
import { OpikTraceLinkInline } from '~/components/ui/OpikTraceLink';
import { ThumbsUp, ThumbsDown } from 'lucide-solid';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  avatar?: string;
  name?: string;
  /** Source badge (e.g., 'mastra', 'groq', 'fallback') */
  badge?: string;
  /** Opik trace ID for feedback API */
  traceId?: string;
  /** Opik trace URL for "Explain This" feature */
  traceUrl?: string;
}

// Safe text parser - no innerHTML needed
function parseFormattedText(text: string): JSX.Element[] {
  if (!text) return [];
  const elements: JSX.Element[] = [];
  const lines = text.split('\n');

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      elements.push(<br />);
    }

    // Parse bold and code in line
    const parts = line.split(/(\*\*.*?\*\*|`[^`]+`)/g);
    parts.forEach((part) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        elements.push(<strong>{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        elements.push(
          <code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
            {part.slice(1, -1)}
          </code>
        );
      } else if (part) {
        elements.push(<span>{part}</span>);
      }
    });
  });

  return elements;
}

export function ChatMessage(props: ChatMessageProps) {
  const isAssistant = () => props.role === 'assistant';
  const formattedContent = () => (isAssistant() ? parseFormattedText(props.content) : null);

  // Feedback state: null = not voted, 'up' = helpful, 'down' = not helpful
  const [feedbackGiven, setFeedbackGiven] = createSignal<'up' | 'down' | null>(null);

  // Send feedback to Opik via API
  const handleFeedback = async (isHelpful: boolean) => {
    if (!props.traceId) return;

    const vote = isHelpful ? 'up' : 'down';
    setFeedbackGiven(vote);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: props.traceId,
          scores: [
            {
              name: 'User feedback',
              value: isHelpful ? 1 : 0,
              reason: isHelpful ? 'User found this helpful' : 'User did not find this helpful',
            },
          ],
        }),
      });
    } catch {
      // Non-blocking - don't reset state on error
    }
  };

  return (
    <div
      class={cn(
        'flex mb-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both',
        isAssistant() ? 'justify-start' : 'justify-end'
      )}
    >
      <div
        class={cn(
          'flex items-start gap-3 max-w-[85%] md:max-w-[75%]',
          isAssistant() ? 'flex-row' : 'flex-row-reverse'
        )}
      >
        <Show when={isAssistant()}>
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground text-sm font-bold shadow-md ring-2 ring-background">
            {props.avatar || 'B'}
          </div>
        </Show>

        <div class="flex flex-col gap-1 min-w-0">
          <Show when={isAssistant() && props.name}>
            <div class="flex items-center gap-2 px-1">
              <span class="text-xs font-semibold text-muted-foreground">{props.name}</span>
              <Show when={props.badge}>
                <span
                  class={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider',
                    props.badge === 'mastra'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : props.badge === 'groq'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {props.badge}
                </span>
              </Show>
            </div>
          </Show>

          <div
            class={cn(
              'rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed',
              isAssistant()
                ? 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-border/50 text-foreground rounded-tl-sm'
                : 'bg-secondary/50 backdrop-blur-md border border-white/10 text-foreground rounded-tr-sm'
            )}
          >
            <div class="whitespace-pre-wrap break-words">
              <Show when={isAssistant()} fallback={props.content}>
                {formattedContent()}
              </Show>
            </div>
          </div>

          {/* "Why this?" Opik trace link for assistant messages */}
          <Show when={isAssistant() && props.traceUrl}>
            <div class="px-1 mt-1">
              <OpikTraceLinkInline traceUrl={props.traceUrl} label="Why this response?" />
            </div>
          </Show>

          {/* Feedback buttons for assistant messages with traceId */}
          <Show when={isAssistant() && props.traceId}>
            <div class="flex items-center gap-1 px-1 mt-1.5">
              <Show
                when={feedbackGiven() === null}
                fallback={
                  <span class="text-xs text-muted-foreground">
                    {feedbackGiven() === 'up' ? 'Thanks!' : "Noted, we'll improve"}
                  </span>
                }
              >
                <button
                  onClick={() => handleFeedback(true)}
                  class="p-1.5 rounded-md hover:bg-green-500/10 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 transition-colors"
                  title="Helpful"
                >
                  <ThumbsUp class="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  class="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Not helpful"
                >
                  <ThumbsDown class="h-3.5 w-3.5" />
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
