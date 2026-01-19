/**
 * Notification Store
 *
 * Global state management for toast notifications.
 * Works with NotificationBell component to display alerts.
 */

import { createSignal } from 'solid-js';
import type { Notification } from '~/components/NotificationBell';

// Global notification state
const [notifications, setNotifications] = createSignal<Notification[]>([]);

// Auto-increment ID for notifications
let notificationId = 0;

/**
 * Generate a unique notification ID.
 */
function generateId(): string {
  return `notification_${Date.now()}_${++notificationId}`;
}

/**
 * Add a notification to the store.
 * Returns the notification ID for reference.
 */
export function addNotification(
  type: Notification['type'],
  title: string,
  message: string
): string {
  const id = generateId();
  const notification: Notification = {
    id,
    type,
    title,
    message,
    timestamp: new Date(),
    read: false,
  };

  setNotifications((prev) => [notification, ...prev]);

  // Auto-dismiss after 10 seconds for success notifications
  if (type === 'success') {
    setTimeout(() => {
      markAsRead(id);
    }, 10000);
  }

  return id;
}

/**
 * Show a success toast notification.
 */
export function showSuccess(title: string, message: string): string {
  return addNotification('success', title, message);
}

/**
 * Show a warning toast notification.
 */
export function showWarning(title: string, message: string): string {
  return addNotification('warning', title, message);
}

/**
 * Show an info toast notification.
 */
export function showInfo(title: string, message: string): string {
  return addNotification('info', title, message);
}

/**
 * Show an error toast notification.
 * Alias for warning with more severe connotation.
 */
export function showError(title: string, message: string): string {
  return addNotification('warning', title, message);
}

/**
 * Mark a notification as read.
 */
export function markAsRead(id: string): void {
  setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
}

/**
 * Remove a notification from the store.
 */
export function removeNotification(id: string): void {
  setNotifications((prev) => prev.filter((n) => n.id !== id));
}

/**
 * Clear all notifications.
 */
export function clearAllNotifications(): void {
  setNotifications([]);
}

/**
 * Get all notifications (reactive signal).
 */
export function getNotifications() {
  return notifications;
}

/**
 * Get unread notification count.
 */
export function getUnreadCount(): number {
  return notifications().filter((n) => !n.read).length;
}

/**
 * Toast-style helper for quick inline toasts.
 * Provides a simple API: toast.success(), toast.warning(), toast.info()
 */
export const toast = {
  success: (title: string, message: string) => showSuccess(title, message),
  warning: (title: string, message: string) => showWarning(title, message),
  info: (title: string, message: string) => showInfo(title, message),
  error: (title: string, message: string) => showError(title, message),
};

// Export the signal for direct access in components
export { notifications };
