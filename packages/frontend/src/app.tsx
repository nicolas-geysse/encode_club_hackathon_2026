import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, createSignal } from 'solid-js';
import './app.css';
import { ProfileSelector } from '~/components/ProfileSelector';
import { SimulationControls, type SimulationState } from '~/components/SimulationControls';
import { NotificationBell, type Notification } from '~/components/NotificationBell';
import { ProgressMini } from '~/components/ProgressMini';
import { ThemeProvider } from '~/lib/themeContext';
import { ProfileProvider } from '~/lib/profileContext';
import { ThemeToggle } from '~/components/ThemeToggle';
import { AppLayout } from '~/components/layout/AppLayout';

export default function App() {
  // Simulation state (managed by SimulationControls, shared with app)
  const [simulationState, setSimulationState] = createSignal<SimulationState>({
    simulatedDate: new Date().toISOString().split('T')[0],
    realDate: new Date().toISOString().split('T')[0],
    offsetDays: 0,
    isSimulating: false,
  });
  const [progressPercent, setProgressPercent] = createSignal(0);
  const [notifications, setNotifications] = createSignal<Notification[]>([
    {
      id: '1',
      type: 'info',
      title: 'Welcome!',
      message: 'Start by defining your goal in My Plan.',
      timestamp: new Date(),
      read: false,
    },
  ]);

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
        setNotifications([
          {
            id: `week_${state.offsetDays}_${Date.now()}`,
            type: 'success',
            title: `Week ${newWeek} completed!`,
            message: `You simulated ${state.offsetDays} days. Check your progress!`,
            timestamp: new Date(),
            read: false,
          },
          ...notifications(),
        ]);
      }

      // Check-in reminder every 3 simulated days
      if (state.offsetDays % 3 === 0 && daysDiff > 0) {
        setNotifications([
          {
            id: `checkin_${state.offsetDays}_${Date.now()}`,
            type: 'info',
            title: 'Check-in reminder',
            message: 'Remember to update your progress!',
            timestamp: new Date(),
            read: false,
          },
          ...notifications(),
        ]);
      }
    }
  };

  const handleMarkNotificationAsRead = (id: string) => {
    setNotifications(notifications().map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
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
      </ProfileProvider>
    </ThemeProvider>
  );
}
