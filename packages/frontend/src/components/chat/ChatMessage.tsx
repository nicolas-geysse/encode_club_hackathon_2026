import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { cn } from '~/lib/cn';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  avatar?: string;
  name?: string;
  /** Source badge (e.g., 'mastra', 'groq', 'fallback') */
  badge?: string;
}

// Safe text parser - no innerHTML needed
function parseFormattedText(text: string): JSX.Element[] {
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

  return (
    <div
      class={cn(
        'flex mb-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both',
        isAssistant() ? 'justify-start' : 'justify-end'
      )}
    >
      <div
        class={cn(
          'flex items-end gap-3 max-w-[85%] md:max-w-[75%]',
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
                : 'bg-primary text-primary-foreground rounded-tr-sm'
            )}
          >
            <div class="whitespace-pre-wrap break-words">
              <Show when={isAssistant()} fallback={props.content}>
                {formattedContent()}
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
