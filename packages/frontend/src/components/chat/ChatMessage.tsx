import { Show } from 'solid-js';
import type { JSX } from 'solid-js';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  avatar?: string;
  name?: string;
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
            <p class="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-1">
              {props.name}
            </p>
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
