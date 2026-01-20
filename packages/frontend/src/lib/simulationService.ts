/**
 * Simulation Service
 *
 * Frontend service for time simulation.
 * Allows advancing simulated time for testing goal progress.
 */

import { eventBus } from './eventBus';

export interface SimulationState {
  simulatedDate: string;
  realDate: string;
  offsetDays: number;
  isSimulating: boolean;
}

/**
 * Get current simulation state
 */
export async function getSimulationState(): Promise<SimulationState> {
  try {
    const response = await fetch('/api/simulation');
    if (!response.ok) {
      console.error('Failed to get simulation state');
      return getDefaultState();
    }
    return response.json();
  } catch (error) {
    console.error('Error getting simulation state:', error);
    return getDefaultState();
  }
}

/**
 * Get the current (possibly simulated) date
 */
export async function getCurrentDate(): Promise<Date> {
  const state = await getSimulationState();
  return new Date(state.simulatedDate);
}

/**
 * Advance the simulation by N days
 */
export async function advanceDays(days: number = 1): Promise<SimulationState> {
  try {
    const response = await fetch('/api/simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', days }),
    });

    if (!response.ok) {
      console.error('Failed to advance simulation');
      return getSimulationState();
    }

    return response.json();
  } catch (error) {
    console.error('Error advancing simulation:', error);
    return getSimulationState();
  }
}

/**
 * Reset simulation to real time
 */
export async function resetToRealTime(): Promise<SimulationState> {
  try {
    const response = await fetch('/api/simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });

    if (!response.ok) {
      console.error('Failed to reset simulation');
      return getSimulationState();
    }

    return response.json();
  } catch (error) {
    console.error('Error resetting simulation:', error);
    return getSimulationState();
  }
}

/**
 * Check if currently simulating
 */
export async function isSimulating(): Promise<boolean> {
  const state = await getSimulationState();
  return state.isSimulating;
}

/**
 * Format simulated date for display
 */
export function formatSimulatedDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  return d.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Get default simulation state (real time)
 */
function getDefaultState(): SimulationState {
  const now = new Date().toISOString().split('T')[0];
  return {
    simulatedDate: now,
    realDate: now,
    offsetDays: 0,
    isSimulating: false,
  };
}

export const simulationService = {
  getSimulationState,
  getCurrentDate,
  advanceDays,
  resetToRealTime,
  isSimulating,
  formatSimulatedDate,
};

export default simulationService;
