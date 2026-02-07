import { Router, useLocation } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Show, Suspense, createSignal, onMount } from 'solid-js';
import './app.css';
import { ProfileSelector } from '~/components/ProfileSelector';
import { SimulationControls, type SimulationState } from '~/components/SimulationControls';

import { ThemeProvider } from '~/lib/themeContext';
import { ProfileProvider } from '~/lib/profileContext';
import { SimulationProvider } from '~/lib/simulationContext';
import { ThemeToggle } from '~/components/ThemeToggle';
import { AppLayout } from '~/components/layout/AppLayout';
import { ToastContainer } from '~/components/ui/Toast';
import { notifications, addNotification } from '~/lib/notificationStore';
import { eventBus } from '~/lib/eventBus';
import { initOnboardingState } from '~/lib/onboardingStateStore';
import { todayISO } from '~/lib/dateUtils';
import { computeSettingsFromConfig, type ProviderConfig } from '~/lib/providerPresets';

/**
 * Auto-apply saved provider settings to the server on startup.
 * This restores runtime config after a server restart.
 */
async function autoApplySettings() {
  try {
    const configStr = localStorage.getItem('stride_provider_config');
    const keysStr = localStorage.getItem('stride_api_keys');
    if (!configStr) return;

    const config: ProviderConfig = JSON.parse(configStr);
    const keys: Record<string, string> = keysStr ? JSON.parse(keysStr) : {};
    const settings = computeSettingsFromConfig(config, keys);

    if (Object.keys(settings).length === 0) return;

    await fetch('/api/settings/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
  } catch {
    // Silently ignore - server might not be ready yet
  }
}

export default function App() {
  // Simulation state (managed by SimulationControls, shared with app)
  const [simulationState, setSimulationState] = createSignal<SimulationState>({
    simulatedDate: todayISO(),
    realDate: todayISO(),
    offsetDays: 0,
    isSimulating: false,
  });
  const [_progressPercent, _setProgressPercent] = createSignal(0);

  // Client-side only flag for Portal-based components (avoids SSR hydration issues)
  const [mounted, setMounted] = createSignal(false);

  // Add welcome notification on mount
  onMount(() => {
    // Mark as mounted for client-only Portal components
    setMounted(true);

    // Initialize onboarding state from localStorage AFTER hydration
    // This must happen after mount() to avoid SSR mismatch
    initOnboardingState();

    // Auto-apply saved provider settings to server (restores config after server restart)
    autoApplySettings();

    // Only add welcome notification if no notifications exist yet
    if (notifications().length === 0) {
      addNotification('info', 'Welcome!', 'Start by defining your goal in the Me tab.');
    }
  });

  // Handle simulation state changes (from SimulationControls)
  const handleSimulationChange = (state: SimulationState) => {
    const prevState = simulationState();
    setSimulationState(state);

    // Sprint 13.8 Fix: Emit SIMULATION_UPDATED so SimulationContext refreshes
    // This ensures plan.tsx and suivi.tsx get the updated currentDate
    eventBus.emit('SIMULATION_UPDATED');

    // Generate notifications based on simulation changes
    if (state.isSimulating && state.offsetDays !== prevState.offsetDays) {
      const daysDiff = state.offsetDays - prevState.offsetDays;

      // Weekly milestone notification
      const prevWeek = Math.floor(prevState.offsetDays / 7);
      const newWeek = Math.floor(state.offsetDays / 7);
      if (newWeek > prevWeek) {
        addNotification(
          'success',
          `Week ${newWeek} completed!`,
          `You simulated ${state.offsetDays} days. Check your progress!`
        );
      }

      // Check-in reminder every 3 simulated days
      if (state.offsetDays % 3 === 0 && daysDiff > 0) {
        addNotification('info', 'Check-in reminder', 'Remember to update your progress!');
      }

      // Trigger data reload so pages reflect the new simulated time
      eventBus.emit('DATA_CHANGED');
    }

    // Also reload when resetting to real time
    if (!state.isSimulating && prevState.isSimulating) {
      eventBus.emit('DATA_CHANGED');
    }
  };

  // Update progress based on profile changes
  const handleProfileChange = () => {
    // Progress will be updated when we have actual goal data
    // For now, base it on simulation offset
    const dayProgress = (simulationState().offsetDays / 56) * 100;
    _setProgressPercent(Math.min(100, dayProgress));
  };

  return (
    <ThemeProvider>
      <SimulationProvider>
        <ProfileProvider>
          <Router
            root={(props) => {
              const location = useLocation();
              const isEmbedRoute = () => location.pathname.startsWith('/embed');

              return (
                <Show
                  when={!isEmbedRoute()}
                  fallback={
                    <Suspense
                      fallback={
                        <div class="flex items-center justify-center py-12">
                          <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                      }
                    >
                      {props.children}
                    </Suspense>
                  }
                >
                  <AppLayout
                    headerContent={
                      <>
                        <SimulationControls
                          compact={true}
                          onSimulationChange={handleSimulationChange}
                        />
                        <ProfileSelector onProfileChange={handleProfileChange} />
                        <ThemeToggle />
                      </>
                    }
                  >
                    <Suspense
                      fallback={
                        <div class="flex items-center justify-center py-12">
                          <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                      }
                    >
                      {props.children}
                    </Suspense>
                  </AppLayout>
                </Show>
              );
            }}
          >
            <FileRoutes />
          </Router>
          {/* Portal-based components render only on client to avoid SSR hydration issues */}
          <Show when={mounted()}>
            <ToastContainer />
          </Show>
        </ProfileProvider>
      </SimulationProvider>
    </ThemeProvider>
  );
}
