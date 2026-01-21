/**
 * Toast Component
 *
 * Visual toast notifications that appear on screen.
 * Auto-dismisses after a timeout.
 */

import { createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-solid';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

// Global toast state
const [toasts, setToasts] = createSignal<ToastItem[]>([]);

let toastId = 0;

/**
 * Show a toast notification
 */
export function showToast(
  type: ToastItem['type'],
  title: string,
  message?: string,
  duration = 4000
): string {
  const id = `toast_${++toastId}`;
  const toast: ToastItem = { id, type, title, message };

  setToasts((prev) => [...prev, toast]);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: string): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

/**
 * Toast helpers
 */
export const toastPopup = {
  success: (title: string, message?: string) => showToast('success', title, message),
  error: (title: string, message?: string) => showToast('error', title, message),
  warning: (title: string, message?: string) => showToast('warning', title, message),
  info: (title: string, message?: string) => showToast('info', title, message),
};

/**
 * Toast Container - renders all active toasts
 * Add this component once at the app root level
 */
export function ToastContainer() {
  const getIcon = (type: ToastItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle class="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle class="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle class="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info class="w-5 h-5 text-blue-500" />;
    }
  };

  const getBorderColor = (type: ToastItem['type']) => {
    switch (type) {
      case 'success':
        return 'border-l-green-500';
      case 'error':
        return 'border-l-red-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'info':
        return 'border-l-blue-500';
    }
  };

  return (
    <Portal>
      <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        <For each={toasts()}>
          {(toast) => (
            <div
              class={`
                bg-card border border-border border-l-4 ${getBorderColor(toast.type)}
                rounded-lg shadow-lg p-4 pr-10
                animate-in slide-in-from-right-5 fade-in duration-300
                relative
              `}
            >
              <button
                class="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors"
                onClick={() => dismissToast(toast.id)}
              >
                <X class="w-4 h-4 text-muted-foreground" />
              </button>
              <div class="flex items-start gap-3">
                {getIcon(toast.type)}
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-foreground text-sm">{toast.title}</p>
                  <Show when={toast.message}>
                    <p class="text-muted-foreground text-xs mt-0.5">{toast.message}</p>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}

export default ToastContainer;
