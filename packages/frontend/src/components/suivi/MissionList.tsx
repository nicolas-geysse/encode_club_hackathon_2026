import { createSignal, For, Show, createMemo } from 'solid-js';
import { MissionCard, type Mission } from './MissionCard';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { Button } from '~/components/ui/Button';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { LogProgressDialog } from './LogProgressDialog';
import {
  CheckCircle2,
  Clock,
  Wallet,
  Target,
  Trophy,
  Inbox,
  Zap,
  Hand,
  ArrowRight,
} from 'lucide-solid';

interface MissionListProps {
  missions: Mission[];
  onMissionUpdate?: (id: string, updates: Partial<Mission>) => void;
  onMissionComplete?: (id: string) => void;
  onMissionDelete?: (id: string) => void;
  onMissionSkip?: (id: string) => void;
  currency?: Currency;
}

type FilterType = 'all' | 'active' | 'completed' | 'skipped';

export function MissionList(props: MissionListProps) {
  const [filter, setFilter] = createSignal<FilterType>('all');

  // Dialog States
  const [confirmState, setConfirmState] = createSignal<{
    isOpen: boolean;
    type: 'complete' | 'skip' | 'undo' | 'delete';
    missionId: string | null;
  }>({ isOpen: false, type: 'complete', missionId: null });

  const [logState, setLogState] = createSignal<{
    isOpen: boolean;
    missionId: string | null;
  }>({ isOpen: false, missionId: null });

  const filteredMissions = createMemo(() => {
    switch (filter()) {
      case 'active':
        return props.missions.filter((m) => m.status === 'active');
      case 'completed':
        return props.missions.filter((m) => m.status === 'completed');
      case 'skipped':
        return props.missions.filter((m) => m.status === 'skipped');
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

  const handleLogProgress = (hours: number, earnings: number) => {
    const id = logState().missionId;
    if (!id) return;

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

  const executeAction = () => {
    const { type, missionId } = confirmState();
    if (!missionId) return;

    if (type === 'complete') {
      props.onMissionComplete?.(missionId);
    } else if (type === 'skip') {
      props.onMissionSkip?.(missionId);
    } else if (type === 'delete') {
      props.onMissionDelete?.(missionId);
    } else if (type === 'undo') {
      // Undo completion/skip -> Set back to active without resetting progress/earnings
      // This preserves partial data if restoring from skipped, or full data if restoring from completed.
      props.onMissionUpdate?.(missionId, { status: 'active' });
    }
    setConfirmState({ ...confirmState(), isOpen: false });
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
        <TabsList class="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="all" class="flex-1 sm:flex-none">
            All ({stats().total})
          </TabsTrigger>
          <TabsTrigger value="active" class="flex-1 sm:flex-none">
            Active ({stats().active})
          </TabsTrigger>
          <TabsTrigger value="completed" class="flex-1 sm:flex-none">
            Completed ({stats().completed})
          </TabsTrigger>
          <TabsTrigger value="skipped" class="flex-1 sm:flex-none">
            Skipped ({props.missions.filter((m) => m.status === 'skipped').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Mission Cards */}
      <div class="space-y-3">
        <For each={filteredMissions()}>
          {(mission) => (
            <MissionCard
              mission={mission}
              currency={props.currency}
              onComplete={() =>
                setConfirmState({ isOpen: true, type: 'complete', missionId: mission.id })
              }
              onSkip={() => setConfirmState({ isOpen: true, type: 'skip', missionId: mission.id })}
              onDelete={() =>
                setConfirmState({ isOpen: true, type: 'delete', missionId: mission.id })
              }
              onUndo={() => setConfirmState({ isOpen: true, type: 'undo', missionId: mission.id })}
              onLogProgress={() => setLogState({ isOpen: true, missionId: mission.id })}
            />
          )}
        </For>

        {/* Empty State - BUG T FIX: Improved empty state with action button */}
        <Show when={filteredMissions().length === 0}>
          <Card class="border-dashed">
            <CardContent class="py-12">
              <div class="flex flex-col items-center justify-center text-center text-muted-foreground">
                <div class="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Show
                    when={filter() === 'active'}
                    fallback={
                      <Show
                        when={filter() === 'completed'}
                        fallback={
                          <Show
                            when={filter() === 'skipped'}
                            fallback={<Inbox class="h-8 w-8 opacity-50" />}
                          >
                            <Hand class="h-8 w-8 opacity-50" />
                          </Show>
                        }
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
                      ? 'No completed missions yet'
                      : filter() === 'skipped'
                        ? 'No skipped missions'
                        : 'No missions yet'}
                </h3>
                <p class="text-sm max-w-xs mx-auto mb-4">
                  {filter() === 'active' || filter() === 'all'
                    ? 'Use Swipe Scenarios in My Plan to discover and add missions'
                    : 'Complete your active missions to see them here'}
                </p>
                <Show when={filter() === 'all' || filter() === 'active'}>
                  <Button as="a" href="/plan?tab=swipe" variant="outline">
                    <Target class="h-4 w-4 mr-2" />
                    Go to Swipe
                    <ArrowRight class="h-4 w-4 ml-2" />
                  </Button>
                </Show>
              </div>
            </CardContent>
          </Card>
        </Show>
      </div>

      {/* Motivational Footer */}
      <Show when={stats().active > 0}>
        <div class="text-center text-sm text-muted-foreground pt-4 border-t border-border">
          💪 You have {stats().active} mission{stats().active > 1 ? 's' : ''} in progress. Keep it
          up!
        </div>
      </Show>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={confirmState().isOpen}
        title={
          confirmState().type === 'complete'
            ? 'Complete Mission'
            : confirmState().type === 'skip'
              ? 'Skip Mission'
              : confirmState().type === 'delete'
                ? 'Delete Mission'
                : 'Undo Status'
        }
        message={
          confirmState().type === 'complete'
            ? 'Are you sure you want to mark this mission as completed?'
            : confirmState().type === 'skip'
              ? 'Are you sure you want to skip this mission? It will be moved to the skipped tab.'
              : confirmState().type === 'delete'
                ? 'Are you sure you want to permanently delete this mission?'
                : 'Restore this mission to active status?'
        }
        confirmLabel={
          confirmState().type === 'complete'
            ? 'Complete'
            : confirmState().type === 'skip'
              ? 'Skip'
              : confirmState().type === 'delete'
                ? 'Delete'
                : 'Undo'
        }
        variant={
          confirmState().type === 'delete'
            ? 'danger'
            : confirmState().type === 'skip'
              ? 'warning'
              : 'default'
        }
        onConfirm={executeAction}
        onCancel={() => setConfirmState({ ...confirmState(), isOpen: false })}
      />

      <LogProgressDialog
        isOpen={logState().isOpen}
        onClose={() => setLogState({ ...logState(), isOpen: false })}
        onSave={handleLogProgress}
        title="Log Progress"
        currentHours={
          props.missions.find((m) => m.id === logState().missionId)?.hoursCompleted || 0
        }
        currentEarnings={
          props.missions.find((m) => m.id === logState().missionId)?.earningsCollected || 0
        }
        targetHours={props.missions.find((m) => m.id === logState().missionId)?.weeklyHours}
        targetEarnings={props.missions.find((m) => m.id === logState().missionId)?.weeklyEarnings}
        currency={props.currency}
      />
    </div>
  );
}
