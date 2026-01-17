import { Show } from 'solid-js';
import type { JSX } from 'solid-js';

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
          <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded text-sm">
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
    <div class={`flex ${isAssistant() ? 'justify-start' : 'justify-end'} mb-4`}>
      <div class={`flex items-start gap-3 max-w-[85%] ${isAssistant() ? '' : 'flex-row-reverse'}`}>
        <Show when={isAssistant()}>
          <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-lg shadow-sm">
            {props.avatar || 'B'}
          </div>
        </Show>

        <div
          class={`rounded-2xl px-4 py-3 ${
            isAssistant()
              ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm'
              : 'bg-primary-600 text-white'
          }`}
        >
          <Show when={isAssistant() && props.name}>
            <div class="flex items-center gap-2 mb-1">
              <p class="text-xs font-semibold text-primary-600 dark:text-primary-400">
                {props.name}
              </p>
              <Show when={props.badge}>
                <span
                  class={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    props.badge === 'mastra'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : props.badge === 'groq'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {props.badge}
                </span>
              </Show>
            </div>
          </Show>
          <div
            class={`whitespace-pre-wrap ${isAssistant() ? 'text-slate-800 dark:text-slate-200' : 'text-white'}`}
          >
            <Show when={isAssistant()} fallback={props.content}>
              {formattedContent()}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
