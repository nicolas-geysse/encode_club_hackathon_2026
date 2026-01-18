import { createSignal, For, Show, createMemo } from 'solid-js';
import { Motion, Presence } from 'solid-motionone';
import { MissionCard, type Mission } from './MissionCard';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { CheckCircle2, Clock, Wallet, Target, Trophy, Inbox, Zap } from 'lucide-solid';
import { cn } from '~/lib/cn';

interface MissionListProps {
  missions: Mission[];
  onMissionUpdate?: (id: string, updates: Partial<Mission>) => void;
  onMissionComplete?: (id: string) => void;
  onMissionSkip?: (id: string) => void;
  currency?: Currency;
}

type FilterType = 'all' | 'active' | 'completed';

export function MissionList(props: MissionListProps) {
  const [filter, setFilter] = createSignal<FilterType>('all');

  const filteredMissions = createMemo(() => {
    switch (filter()) {
      case 'active':
        return props.missions.filter((m) => m.status === 'active');
      case 'completed':
        return props.missions.filter((m) => m.status === 'completed');
      default:
        return props.missions;
    }
  });

  const stats = createMemo(() => {
    const active = props.missions.filter((m) => m.status === 'active');
    const completed = props.missions.filter((m) => m.status === 'completed');

    return {
      total: props.missions.length,
      active: active.length,
      completed: completed.length,
      totalEarnings: props.missions.reduce((sum, m) => sum + m.earningsCollected, 0),
      totalHours: props.missions.reduce((sum, m) => sum + m.hoursCompleted, 0),
      weeklyPotential: active.reduce((sum, m) => sum + m.weeklyEarnings, 0),
    };
  });

  const handleLogProgress = (id: string, hours: number, earnings: number) => {
    const mission = props.missions.find((m) => m.id === id);
    if (!mission) return;

    const newHours = mission.hoursCompleted + hours;
    const newEarnings = mission.earningsCollected + earnings;
    const progress = Math.min(100, Math.round((newHours / mission.weeklyHours) * 100));

    props.onMissionUpdate?.(id, {
      hoursCompleted: newHours,
      earningsCollected: newEarnings,
      progress,
      status: progress >= 100 ? 'completed' : 'active',
    });
  };

  return (
    <div class="space-y-6">
      {/* Stats Summary */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active
              </p>
              <p class="text-2xl font-bold text-primary mt-1">{stats().active}</p>
            </div>
            <div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Zap class="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completed
              </p>
              <p class="text-2xl font-bold text-green-600 mt-1">{stats().completed}</p>
            </div>
            <div class="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400">
              <CheckCircle2 class="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worked
              </p>
              <p class="text-2xl font-bold text-foreground mt-1">{stats().totalHours}h</p>
            </div>
            <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Clock class="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        <Card class="bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-900">
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                Earned
              </p>
              <p class="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                {formatCurrency(stats().totalEarnings, props.currency)}
              </p>
            </div>
            <div class="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400">
              <Wallet class="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Potential */}
      <Show when={stats().weeklyPotential > 0}>
        <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Target class="h-5 w-5" />
              </div>
              <div>
                <h4 class="font-medium text-foreground">This week's potential</h4>
                <p class="text-sm text-muted-foreground">
                  If you complete all your active missions
                </p>
              </div>
            </div>
            <div class="text-2xl font-bold text-primary">
              {formatCurrency(stats().weeklyPotential, props.currency, { showSign: true })}
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Filter Tabs using Kobalte Tabs */}
      <Tabs value={filter()} onChange={(v: string) => setFilter(v as FilterType)} class="w-full">
        <TabsList class="mb-4 w-full justify-start">
          <TabsTrigger value="all" class="flex-1 sm:flex-none">
            All ({stats().total})
          </TabsTrigger>
          <TabsTrigger value="active" class="flex-1 sm:flex-none">
            Active ({stats().active})
          </TabsTrigger>
          <TabsTrigger value="completed" class="flex-1 sm:flex-none">
            Completed ({stats().completed})
          </TabsTrigger>
        </TabsList>

        {/* We can render the list directly since logic handles filtering, 
            but for animation/structure, we could use TabsContent. 
            However, we want to animate the list changes.
            Let's just use the filtered list directly below the tabs control.
        */}
      </Tabs>

      {/* Mission Cards */}
      <div class="space-y-3">
        <Presence>
          <For each={filteredMissions()}>
            {(mission) => (
              <Motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, easing: [0.4, 0, 0.2, 1] }}
                class="w-full"
              >
                <MissionCard
                  mission={mission}
                  currency={props.currency}
                  onComplete={() => props.onMissionComplete?.(mission.id)}
                  onSkip={() => props.onMissionSkip?.(mission.id)}
                  onLogProgress={(hours, earnings) =>
                    handleLogProgress(mission.id, hours, earnings)
                  }
                />
              </Motion.div>
            )}
          </For>
        </Presence>

        {/* Empty State */}
        <Show when={filteredMissions().length === 0}>
          <div class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <div class="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Show
                when={filter() === 'active'}
                fallback={
                  <Show
                    when={filter() === 'completed'}
                    fallback={<Inbox class="h-8 w-8 opacity-50" />}
                  >
                    <Trophy class="h-8 w-8 opacity-50" />
                  </Show>
                }
              >
                <Target class="h-8 w-8 opacity-50" />
              </Show>
            </div>
            <h3 class="text-lg font-medium text-foreground mb-1">
              {filter() === 'active'
                ? 'No active missions'
                : filter() === 'completed'
                  ? 'No completed missions'
                  : 'No missions'}
            </h3>
            <p class="text-sm max-w-xs mx-auto">
              {filter() === 'active'
                ? 'Use Swipe Scenarios to create missions'
                : filter() === 'completed'
                  ? 'Complete missions to see them here'
                  : 'Go to the Swipe tab to generate missions'}
            </p>
          </div>
        </Show>
      </div>

      {/* Motivational Footer */}
      <Show when={stats().active > 0}>
        <div class="text-center text-sm text-muted-foreground pt-4 border-t border-border">
          💪 You have {stats().active} mission{stats().active > 1 ? 's' : ''} in progress. Keep it
          up!
        </div>
      </Show>
    </div>
  );
}
