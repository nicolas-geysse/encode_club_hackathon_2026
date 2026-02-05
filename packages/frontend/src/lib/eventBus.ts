/**
 * Global Event Bus
 *
 * Uses BroadcastChannel to sync events across tabs and components.
 * This is the backbone of our "Quickwin Realtime" strategy.
 */

import { createLogger } from './logger';

const logger = createLogger('EventBus');

// Define supported event types
export type AppEvent =
  | 'DATA_CHANGED' // Generic data update (skills, inventory, etc.)
  | 'DATA_RESET' // Full data reset (user clicked "Reset all data")
  | 'PROFILE_SWITCHED'
  | 'SIMULATION_UPDATED'
  | 'MOOD_UPDATED' // Mood logged via daily check-in
  | 'PROACTIVE_ALERT'; // v4.2: Agent-triggered proactive notification

// v4.2: Proactive alert payload
export interface ProactiveAlertPayload {
  id: string;
  type: 'skill_job' | 'goal_behind' | 'goal_achieved' | 'energy_low' | 'energy_recovered';
  title: string;
  message: string;
  action?: { label: string; href: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventPayload = any;

class GlobalEventBus {
  private channel: BroadcastChannel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<AppEvent, Set<(payload?: any) => void>> = new Map();

  constructor() {
    this.channel = new BroadcastChannel('stride_event_bus');

    this.channel.onmessage = (event) => {
      const { type, payload } = event.data as { type: AppEvent; payload?: EventPayload };
      this.notifyListeners(type, payload);
    };
  }

  /**
   * Emit an event to all listeners (including other tabs)
   */
  emit(type: AppEvent, payload?: EventPayload) {
    // Notify local listeners immediately
    this.notifyListeners(type, payload);
    // Notify other tabs
    this.channel.postMessage({ type, payload });
  }

  /**
   * Subscribe to an event
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(type: AppEvent, callback: (payload?: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private notifyListeners(type: AppEvent, payload?: EventPayload) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          logger.error(`Error in event listener for ${type}`, { error: e });
        }
      });
    }
  }
}

// Singleton instance
export const eventBus = new GlobalEventBus();

// Export convenience functions
export const emit = (type: AppEvent, payload?: EventPayload) => eventBus.emit(type, payload);
export const on = (type: AppEvent, callback: (payload?: EventPayload) => void) =>
  eventBus.on(type, callback);

// v4.2: Helper to emit proactive alerts
export function showProactiveAlert(alert: ProactiveAlertPayload) {
  eventBus.emit('PROACTIVE_ALERT', alert);
}
