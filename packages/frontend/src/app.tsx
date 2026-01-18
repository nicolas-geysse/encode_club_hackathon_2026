import { Router, useLocation } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, createMemo, createSignal, For } from 'solid-js';
import './app.css';
import { ProfileSelector } from '~/components/ProfileSelector';
import { SimulationControls, type SimulationState } from '~/components/SimulationControls';
import { NotificationBell, type Notification } from '~/components/NotificationBell';
import { ProgressMini } from '~/components/ProgressMini';
import { RouteProgress } from '~/components/RouteProgress';
import { ThemeProvider } from '~/lib/themeContext';
import { ProfileProvider } from '~/lib/profileContext';
import { ThemeToggle } from '~/components/ThemeToggle';
import { Logo } from '~/components/Logo';

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
          root={(props) => {
            const location = useLocation();
            const currentPath = createMemo(() => location.pathname);

            const navItems = [
              { href: '/', label: 'Onboarding', icon: '👋' },
              { href: '/plan', label: 'My Plan', icon: '📋' },
              { href: '/suivi', label: 'Tracking', icon: '📊' },
            ];

            return (
              <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col transition-colors">
                <RouteProgress />
                <header class="sticky top-0 z-50 bg-surface dark:bg-slate-900 shadow-sm border-b border-slate-200 dark:border-slate-700">
                  <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div class="flex items-center justify-between">
                      <a href="/" class="flex items-center">
                        <Logo height={56} class="hidden sm:block" />
                        <Logo height={44} compact class="sm:hidden" />
                      </a>
                      <div class="flex items-center gap-3">
                        <nav class="flex space-x-1">
                          <For each={navItems}>
                            {(item) => (
                              <a
                                href={item.href}
                                class={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  currentPath() === item.href
                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                <span>{item.icon}</span>
                                <span class="hidden sm:inline">{item.label}</span>
                              </a>
                            )}
                          </For>
                        </nav>
                        <div class="hidden md:flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
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
                      </div>
                    </div>
                  </div>
                </header>
                <main class="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
                  <Suspense
                    fallback={
                      <div class="flex items-center justify-center py-12">
                        <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                      </div>
                    }
                  >
                    {props.children}
                  </Suspense>
                </main>
                <footer class="bg-surface dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                  <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <p class="text-center text-slate-500 dark:text-slate-400 text-sm">
                      Stride - Encode Club Hackathon 2026 | Powered by Groq GPT-OSS 120B | Traced by
                      Opik
                    </p>
                  </div>
                </footer>
              </div>
            );
          }}
        >
          <FileRoutes />
        </Router>
      </ProfileProvider>
    </ThemeProvider>
  );
}
