/**
 * Global Event Bus
 *
 * Uses BroadcastChannel to sync events across tabs and components.
 * This is the backbone of our "Quickwin Realtime" strategy.
 */

// Define supported event types
export type AppEvent = 'DATA_CHANGED' | 'PROFILE_SWITCHED' | 'SIMULATION_UPDATED';

class GlobalEventBus {
  private channel: BroadcastChannel;
  private listeners: Map<AppEvent, Set<() => void>> = new Map();

  constructor() {
    this.channel = new BroadcastChannel('stride_event_bus');

    this.channel.onmessage = (event) => {
      const type = event.data as AppEvent;
      this.notifyListeners(type);
    };
  }

  /**
   * Emit an event to all listeners (including other tabs)
   */
  emit(type: AppEvent) {
    // Notify local listeners immediately
    this.notifyListeners(type);
    // Notify other tabs
    this.channel.postMessage(type);
  }

  /**
   * Subscribe to an event
   */
  on(type: AppEvent, callback: () => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private notifyListeners(type: AppEvent) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error(`Error in event listener for ${type}:`, e);
        }
      });
    }
  }
}

// Singleton instance
export const eventBus = new GlobalEventBus();
