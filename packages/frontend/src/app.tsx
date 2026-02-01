import { Router, useLocation } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Show, Suspense, createSignal, onMount } from 'solid-js';
import './app.css';
import { ProfileSelector } from '~/components/ProfileSelector';
import { SimulationControls, type SimulationState } from '~/components/SimulationControls';
import { NotificationBell } from '~/components/NotificationBell';

import { ThemeProvider } from '~/lib/themeContext';
import { ProfileProvider } from '~/lib/profileContext';
import { SimulationProvider } from '~/lib/simulationContext';
import { ThemeToggle } from '~/components/ThemeToggle';
import { AppLayout } from '~/components/layout/AppLayout';
import { ToastContainer } from '~/components/ui/Toast';
import { DebugPanel } from '~/components/debug/DebugPanel';
import {
  notifications,
  addNotification,
  markAsRead,
  clearAllNotifications,
} from '~/lib/notificationStore';
import { eventBus } from '~/lib/eventBus';
import { initOnboardingState } from '~/lib/onboardingStateStore';

export default function App() {
  // Simulation state (managed by SimulationControls, shared with app)
  const [simulationState, setSimulationState] = createSignal<SimulationState>({
    simulatedDate: new Date().toISOString().split('T')[0],
    realDate: new Date().toISOString().split('T')[0],
    offsetDays: 0,
    isSimulating: false,
  });
  const [progressPercent, setProgressPercent] = createSignal(0);

  // Debug panel state
  const [debugOpen, setDebugOpen] = createSignal(false);

  // Client-side only flag for Portal-based components (avoids SSR hydration issues)
  const [mounted, setMounted] = createSignal(false);

  // Add welcome notification on mount
  onMount(() => {
    // Mark as mounted for client-only Portal components
    setMounted(true);

    // Initialize onboarding state from localStorage AFTER hydration
    // This must happen after mount() to avoid SSR mismatch
    initOnboardingState();

    // Only add welcome notification if no notifications exist yet
    if (notifications().length === 0) {
      addNotification('info', 'Welcome!', 'Start by defining your goal in My Plan.');
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

  const handleMarkNotificationAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleClearAllNotifications = () => {
    clearAllNotifications();
  };

  // Update progress based on profile changes
  const handleProfileChange = () => {
    // Progress will be updated when we have actual goal data
    // For now, base it on simulation offset
    const dayProgress = (simulationState().offsetDays / 56) * 100;
    setProgressPercent(Math.min(100, dayProgress));
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
                    onDebugOpen={() => setDebugOpen(true)}
                    headerContent={
                      <>
                        <SimulationControls
                          compact={true}
                          onSimulationChange={handleSimulationChange}
                        />
                        <ProfileSelector onProfileChange={handleProfileChange} />
                        <ThemeToggle />
                        <NotificationBell
                          notifications={notifications()}
                          onMarkAsRead={handleMarkNotificationAsRead}
                          onClearAll={handleClearAllNotifications}
                        />
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
            <DebugPanel isOpen={debugOpen()} onClose={() => setDebugOpen(false)} />
          </Show>
        </ProfileProvider>
      </SimulationProvider>
    </ThemeProvider>
  );
}
