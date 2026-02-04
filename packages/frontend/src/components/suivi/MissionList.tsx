import { createSignal, For, Show, createMemo } from 'solid-js';
import { MissionCard, type Mission } from './MissionCard';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { Button } from '~/components/ui/Button';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { LogProgressDialog } from './LogProgressDialog';
import { Target, Trophy, Inbox, Hand, ArrowRight } from 'lucide-solid';

interface MissionListProps {
  missions: Mission[];
  onMissionUpdate?: (id: string, updates: Partial<Mission>) => void;
  onMissionComplete?: (id: string) => void;
  onMissionDelete?: (id: string) => void;
  onMissionSkip?: (id: string) => void;
  currency?: Currency;
  daysRemaining?: number;
  weeklyTarget?: number;
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
    let result: Mission[] = [];
    switch (filter()) {
      case 'active':
        result = props.missions.filter((m) => m.status === 'active');
        break;
      case 'completed':
        result = props.missions.filter((m) => m.status === 'completed');
        break;
      case 'skipped':
        result = props.missions.filter((m) => m.status === 'skipped');
        break;
      default:
        result = [...props.missions];
        break;
    }

    // Sort:
    // 1. Status priority (Active > Completed > Skipped)
    // 2. Earnings priority (Highest first)
    return result.sort((a, b) => {
      const getStatusScore = (s: string) => (s === 'active' ? 3 : s === 'completed' ? 2 : 1);
      const scoreA = getStatusScore(a.status);
      const scoreB = getStatusScore(b.status);

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // High score first
      }

      // Secondary: Earnings desc
      return b.weeklyEarnings - a.weeklyEarnings;
    });
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
      {/* Streamlined Stats Row */}
      {/* Streamlined Stats Row */}
      {/* Streamlined Stats Row - More breathing room */}
      <div class="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-8 py-8 shadow-sm mb-8 flex flex-wrap items-center justify-between gap-x-12 gap-y-8">
        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Active
          </span>
          <span class="text-2xl font-bold text-foreground">{stats().active}</span>
        </div>

        <div class="w-px h-12 bg-border/50 hidden sm:block" />

        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Completed
          </span>
          <span class="text-2xl font-bold text-green-600">{stats().completed}</span>
        </div>

        <div class="w-px h-12 bg-border/50 hidden sm:block" />

        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Worked
          </span>
          <span class="text-2xl font-bold text-foreground">{stats().totalHours}h</span>
        </div>

        <div class="w-px h-12 bg-border/50 hidden sm:block" />

        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Earned
          </span>
          <span class="text-2xl font-bold text-green-700 dark:text-green-400">
            {formatCurrency(stats().totalEarnings, props.currency)}
          </span>
        </div>

        <div class="w-px h-12 bg-border/50 hidden sm:block" />

        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Days Left
          </span>
          <span class="text-2xl font-bold text-foreground">{props.daysRemaining ?? 0}</span>
        </div>

        <div class="w-px h-12 bg-border/50 hidden sm:block" />

        <div class="flex flex-col">
          <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Target/Week
          </span>
          <span class="text-2xl font-bold text-foreground">
            {formatCurrency(props.weeklyTarget || 0, props.currency)}
          </span>
        </div>
      </div>

      {/* Filter Tabs using Kobalte Tabs */}
      {/* Filter Tabs using Kobalte Tabs */}
      <Tabs value={filter()} onChange={(v: string) => setFilter(v as FilterType)} class="w-full">
        <TabsList class="flex w-full items-center gap-2 p-1.5 bg-muted/40 rounded-xl mb-6 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="all"
            class="flex-1 sm:flex-none px-6 py-2.5 rounded-lg data-[selected]:bg-white dark:data-[selected]:bg-slate-800 data-[selected]:text-primary data-[selected]:shadow-sm transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            All <span class="ml-1 opacity-70">({stats().total})</span>
          </TabsTrigger>
          <TabsTrigger
            value="active"
            class="flex-1 sm:flex-none px-6 py-2.5 rounded-lg data-[selected]:bg-white dark:data-[selected]:bg-slate-800 data-[selected]:text-primary data-[selected]:shadow-sm transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Active <span class="ml-1 opacity-70">({stats().active})</span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            class="flex-1 sm:flex-none px-6 py-2.5 rounded-lg data-[selected]:bg-white dark:data-[selected]:bg-slate-800 data-[selected]:text-green-600 dark:data-[selected]:text-green-400 data-[selected]:shadow-sm transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Completed <span class="ml-1 opacity-70">({stats().completed})</span>
          </TabsTrigger>
          <TabsTrigger
            value="skipped"
            class="flex-1 sm:flex-none px-6 py-2.5 rounded-lg data-[selected]:bg-white dark:data-[selected]:bg-slate-800 data-[selected]:shadow-sm transition-all text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Skipped{' '}
            <span class="ml-1 opacity-70">
              ({props.missions.filter((m) => m.status === 'skipped').length})
            </span>
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
                    ? 'Use Swipe to discover and add missions'
                    : 'Complete your active missions to see them here'}
                </p>
                <Show when={filter() === 'all' || filter() === 'active'}>
                  <Button as="a" href="/swipe" variant="outline">
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
