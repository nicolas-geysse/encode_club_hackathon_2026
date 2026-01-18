/**
 * ConfirmDialog Component
 *
 * A reusable confirmation dialog for destructive actions like deletion.
 */

import { Show } from 'solid-js';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'success' | 'default';
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const getButtonClass = () => {
    switch (props.variant) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-white';
      case 'success':
        return 'bg-green-600 hover:bg-green-700 text-white';
      default:
        return 'bg-primary hover:bg-primary/90 text-primary-foreground';
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-card dark:bg-card border border-border rounded-lg p-6 max-w-sm w-full shadow-xl">
          <h3 class="text-lg font-semibold text-foreground">{props.title}</h3>
          <p class="mt-2 text-muted-foreground">{props.message}</p>
          <div class="mt-4 flex gap-3 justify-end">
            <button
              type="button"
              class="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => props.onCancel()}
            >
              {props.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button"
              class={`px-4 py-2 rounded-lg font-medium transition-colors ${getButtonClass()}`}
              onClick={() => props.onConfirm()}
            >
              {props.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
