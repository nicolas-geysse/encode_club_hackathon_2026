/**
 * Simulation Context
 *
 * Provides shared simulation state across the app.
 * When simulation time advances, all consumers refresh automatically.
 * Follows the same pattern as ProfileContext.
 */

import {
  createContext,
  useContext,
  createSignal,
  ParentComponent,
  onMount,
  onCleanup,
} from 'solid-js';
import { eventBus } from './eventBus';
import { simulationService, type SimulationState } from './simulationService';
import { createLogger } from './logger';

const logger = createLogger('SimulationContext');

interface SimulationContextValue {
  /** Current simulation state (reactive) */
  simulationState: () => SimulationState;
  /** Current (possibly simulated) date as Date object (reactive) */
  currentDate: () => Date;
  /** Refresh simulation state from API */
  refreshSimulation: () => Promise<void>;
}

const SimulationContext = createContext<SimulationContextValue>();

export const SimulationProvider: ParentComponent = (props) => {
  const [simulationState, setSimulationState] = createSignal<SimulationState>({
    isSimulating: false,
    offsetDays: 0,
    simulatedDate: new Date().toISOString(),
    realDate: new Date().toISOString(),
  });

  // Derived signal for currentDate
  const currentDate = () => new Date(simulationState().simulatedDate);

  const refreshSimulation = async () => {
    try {
      const state = await simulationService.getSimulationState();
      setSimulationState(state);
      logger.info('Simulation state refreshed', { offsetDays: state.offsetDays });
    } catch (error) {
      logger.error('Failed to refresh simulation state', { error });
    }
  };

  onMount(() => {
    // Initial load
    void refreshSimulation();

    // Listen for SIMULATION_UPDATED event to refresh state
    const unsubSimulation = eventBus.on('SIMULATION_UPDATED', () => {
      logger.info('SIMULATION_UPDATED received, refreshing...');
      void refreshSimulation();
    });

    onCleanup(() => {
      unsubSimulation();
    });
  });

  return (
    <SimulationContext.Provider value={{ simulationState, currentDate, refreshSimulation }}>
      {props.children}
    </SimulationContext.Provider>
  );
};

/**
 * Hook to access simulation context
 * Must be used within a SimulationProvider
 */
export const useSimulation = (): SimulationContextValue => {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return ctx;
};

export default SimulationContext;
