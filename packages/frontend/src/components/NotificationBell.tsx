/**
 * Notification Bell Component
 *
 * Bell icon with unread count badge and dropdown list.
 * Supports success, warning, and info notification types.
 */

import { createSignal, For, Show } from 'solid-js';

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read?: boolean;
}

interface NotificationBellProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onClearAll?: () => void;
}

export function NotificationBell(props: NotificationBellProps) {
  const [isOpen, setIsOpen] = createSignal(false);

  const unreadCount = () => props.notifications.filter((n) => !n.read).length;

  const getTypeIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📌';
    }
  };

  const getTypeBgClass = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div class="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        title="Notifications"
      >
        <svg
          class="w-5 h-5 text-slate-600 dark:text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        <Show when={unreadCount() > 0}>
          <span class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount() > 9 ? '9+' : unreadCount()}
          </span>
        </Show>
      </button>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute right-0 mt-2 w-80 bg-[#FAFBFC] dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
            <h3 class="font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            <Show when={props.notifications.length > 0}>
              <button
                onClick={() => props.onClearAll?.()}
                class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear all
              </button>
            </Show>
          </div>

          <div class="max-h-80 overflow-y-auto">
            <Show
              when={props.notifications.length > 0}
              fallback={
                <div class="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  <div class="text-3xl mb-2">🔔</div>
                  <p class="text-sm">No notifications</p>
                </div>
              }
            >
              <For each={props.notifications}>
                {(notification) => (
                  <div
                    class={`px-4 py-3 border-b dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                      !notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => props.onMarkAsRead?.(notification.id)}
                  >
                    <div class="flex items-start gap-3">
                      <span
                        class={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border ${getTypeBgClass(notification.type)}`}
                      >
                        {getTypeIcon(notification.type)}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                          <h4 class="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                            {notification.title}
                          </h4>
                          <span class="text-xs text-slate-400 flex-shrink-0">
                            {formatTime(notification.timestamp)}
                          </span>
                        </div>
                        <p class="text-sm text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      <Show when={!notification.read}>
                        <span class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>

      {/* Click outside to close */}
      <Show when={isOpen()}>
        <div class="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      </Show>
    </div>
  );
}

export default NotificationBell;
