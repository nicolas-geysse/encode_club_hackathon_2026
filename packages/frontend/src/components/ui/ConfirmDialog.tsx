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
  variant?: 'danger' | 'warning';
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-xl">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{props.title}</h3>
          <p class="mt-2 text-slate-600 dark:text-slate-400">{props.message}</p>
          <div class="mt-4 flex gap-3 justify-end">
            <button
              type="button"
              class="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              onClick={() => props.onCancel()}
            >
              {props.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button"
              class={`px-4 py-2 rounded-lg font-medium transition-colors ${
                props.variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
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
