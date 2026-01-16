/**
 * Chat Input Component
 *
 * Text input with send button for chat interfaces.
 */

import { createSignal } from 'solid-js';

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput(props: ChatInputProps) {
  const [text, setText] = createSignal('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const message = text().trim();
    if (message && !props.disabled) {
      props.onSend(message);
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form class="border-t border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
      <div class="flex gap-3 items-end max-w-3xl mx-auto">
        <div class="flex-1 relative">
          <textarea
            class="input-field resize-none min-h-[44px] max-h-32 py-3 pr-12 w-full"
            placeholder={props.placeholder || 'Ecris un message...'}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={props.disabled}
            rows={1}
          />
        </div>
        <button
          type="submit"
          class={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            text().trim() && !props.disabled
              ? 'bg-primary-600 hover:bg-primary-700 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
          disabled={!text().trim() || props.disabled}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </form>
  );
}
