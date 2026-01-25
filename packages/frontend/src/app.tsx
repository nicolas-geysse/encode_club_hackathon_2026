import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, createSignal, onMount } from 'solid-js';
import './app.css';
import { ProfileSelector } from '~/components/ProfileSelector';
import { SimulationControls, type SimulationState } from '~/components/SimulationControls';
import { NotificationBell } from '~/components/NotificationBell';
import { ProgressMini } from '~/components/ProgressMini';
import { ThemeProvider } from '~/lib/themeContext';
import { ProfileProvider } from '~/lib/profileContext';
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

  // Add welcome notification on mount
  onMount(() => {
    // Only add welcome notification if no notifications exist yet
    if (notifications().length === 0) {
      addNotification('info', 'Welcome!', 'Start by defining your goal in My Plan.');
    }
  });

  // Handle simulation state changes (from SimulationControls)
  const handleSimulationChange = (state: SimulationState) => {
    const prevState = simulationState();
    setSimulationState(state);

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
      <ProfileProvider>
        <Router
          root={(props) => (
            <AppLayout
              onDebugOpen={() => setDebugOpen(true)}
              headerContent={
                <>
                  <div class="hidden md:flex items-center gap-3 pl-3 border-l border-border/50">
                    <ProgressMini
                      percent={progressPercent()}
                      goalAmount={500}
                      currentAmount={Math.round(progressPercent() * 5)}
                      breakdown={[
                        {
                          label: 'Jobs',
                          value: Math.round(progressPercent() * 2),
                          color: '#3b82f6',
                        },
                        {
                          label: 'Sales',
                          value: Math.round(progressPercent() * 2),
                          color: '#22c55e',
                        },
                        {
                          label: 'Savings',
                          value: Math.round(progressPercent()),
                          color: '#f59e0b',
                        },
                      ]}
                    />
                  </div>
                  <SimulationControls compact={true} onSimulationChange={handleSimulationChange} />
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
          )}
        >
          <FileRoutes />
        </Router>
        <ToastContainer />
        <DebugPanel isOpen={debugOpen()} onClose={() => setDebugOpen(false)} />
      </ProfileProvider>
    </ThemeProvider>
  );
}
