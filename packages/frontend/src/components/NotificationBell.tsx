/**
 * Notification Bell Component
 *
 * Bell icon with unread count badge and dropdown list.
 * Supports success, warning, and info notification types.
 */

import { createSignal, For, Show } from 'solid-js';
import { Button } from '~/components/ui/Button';
import { Bell, Check, AlertTriangle, Info, BellOff } from 'lucide-solid';

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
        return <Check class="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle class="h-4 w-4 text-amber-600" />;
      case 'info':
        return <Info class="h-4 w-4 text-blue-600" />;
      default:
        return <Bell class="h-4 w-4 text-primary" />;
    }
  };

  const getTypeBgClass = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-100/50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-amber-100/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      case 'info':
        return 'bg-blue-100/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-muted border-border';
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen())}
        class="relative rounded-full"
        title="Notifications"
      >
        <Bell class="h-5 w-5" />
        {/* Unread Badge */}
        <Show when={unreadCount() > 0}>
          <span class="absolute top-0 right-0 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold text-white bg-destructive rounded-full border-2 border-background">
            {unreadCount() > 9 ? '9+' : unreadCount()}
          </span>
        </Show>
      </Button>

      {/* Dropdown */}
      <Show when={isOpen()}>
        <div class="absolute right-0 mt-2 w-80 bg-popover rounded-lg shadow-lg border border-border z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div class="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
            <h3 class="font-semibold text-foreground text-sm">Notifications</h3>
            <Show when={props.notifications.length > 0}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => props.onClearAll?.()}
                class="h-auto p-0 text-xs text-muted-foreground hover:text-destructive"
              >
                Clear all
              </Button>
            </Show>
          </div>

          <div class="max-h-80 overflow-y-auto">
            <Show
              when={props.notifications.length > 0}
              fallback={
                <div class="px-4 py-8 text-center text-muted-foreground">
                  <BellOff class="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p class="text-sm">No notifications</p>
                </div>
              }
            >
              <For each={props.notifications}>
                {(notification) => (
                  <div
                    class={`px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                      !notification.read ? 'bg-primary/5' : ''
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
                          <h4 class="font-medium text-foreground text-sm truncate">
                            {notification.title}
                          </h4>
                          <span class="text-xs text-muted-foreground flex-shrink-0">
                            {formatTime(notification.timestamp)}
                          </span>
                        </div>
                        <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      <Show when={!notification.read}>
                        <span class="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-1.5" />
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
