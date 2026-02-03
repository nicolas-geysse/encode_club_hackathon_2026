/**
 * Debug Panel Component
 *
 * Shows internal algorithm state for demo/debugging purposes.
 * Displays: Energy state, Comeback detection, Energy debt, Preferences.
 *
 * P2-Health: Added tooltips, connectivity status, and impact explanations.
 */

import { Show, For, createResource, createSignal, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  Wrench,
  X,
  Battery,
  Rocket,
  AlertTriangle,
  Sliders,
  Info,
  Link,
  Unlink,
} from 'lucide-solid';
import { useProfile } from '~/lib/profileContext';
import { cn } from '~/lib/cn';

// Simple Badge component for status display

function Badge(props: {
  children: JSX.Element | string | number;
  class?: string;
  variant?: 'default' | 'secondary';
}) {
  return (
    <span
      class={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        props.variant === 'secondary'
          ? 'bg-muted text-muted-foreground'
          : 'bg-primary/10 text-primary',
        props.class
      )}
    >
      {props.children}
    </span>
  );
}

// P2-Health: Connectivity status badge
function ConnectivityBadge(props: { connected: boolean; target: string }) {
  return (
    <span
      class={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        props.connected
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-gray-500/10 text-gray-500'
      )}
      title={props.connected ? `Connected to ${props.target}` : `Not connected to ${props.target}`}
    >
      {props.connected ? <Link class="w-3 h-3" /> : <Unlink class="w-3 h-3" />}
      {props.target}
    </span>
  );
}

// P2-Health: Info tooltip for explanations
function InfoTooltip(props: { text: string }) {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <span
      class="relative inline-flex"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <Info class="w-3.5 h-3.5 text-muted-foreground cursor-help" />
      <Show when={isOpen()}>
        <div class="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-48 p-2 rounded-md bg-popover text-popover-foreground text-xs shadow-lg border border-border">
          {props.text}
        </div>
      </Show>
    </span>
  );
}

// P2-Health: Impact explanation text
function ImpactText(props: { children: JSX.Element | string; class?: string }) {
  return (
    <p class={cn('text-[11px] text-muted-foreground/80 italic leading-tight', props.class)}>
      {props.children}
    </p>
  );
}

interface DebugState {
  energyState: 'Normal' | 'Energy Debt' | 'Comeback Active';
  energyConfidence: number;
  currentEnergy: number;
  energyHistory: number[];

  comebackActive: boolean;
  comebackDeficit: number;
  recoveryProgress: number;
  deficitWeeks: number;

  debtDetected: boolean;
  // P2-Health: Unified severity terminology (low/medium/high)
  debtSeverity: 'low' | 'medium' | 'high' | null;
  debtWeeks: number;

  prefs: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
}

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

async function fetchDebugState(profileId: string | undefined): Promise<DebugState | null> {
  if (!profileId) return null;

  try {
    const response = await fetch(`/api/debug-state?profileId=${profileId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function DebugPanel(props: DebugPanelProps) {
  const { profile } = useProfile();
  const [debugState, { refetch }] = createResource(
    () => (props.isOpen ? profile()?.id : undefined),
    fetchDebugState
  );
  const [isAnimating, setIsAnimating] = createSignal(false);

  // Animate on open
  onMount(() => {
    if (props.isOpen) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
  });

  // Refetch when panel opens
  const handleRefetch = () => {
    refetch();
  };

  const getStateColor = (state: DebugState['energyState']) => {
    switch (state) {
      case 'Normal':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30';
      case 'Energy Debt':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      case 'Comeback Active':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    }
  };

  // P2-Health: Unified severity terminology (low/medium/high)
  const getSeverityColor = (severity: DebugState['debtSeverity']) => {
    switch (severity) {
      case 'low':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
      case 'medium':
        return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
      case 'high':
        return 'bg-red-500/20 text-red-700 dark:text-red-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Show when={props.isOpen}>
      <Portal>
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-black/50 z-[100] transition-opacity duration-200"
          classList={{ 'opacity-0': isAnimating() }}
          onClick={() => props.onClose()}
        />

        {/* Panel */}
        <div
          class={cn(
            'fixed right-4 top-20 bottom-4 w-80 bg-card border border-border rounded-lg shadow-xl z-[101] overflow-hidden',
            'transition-transform duration-200',
            isAnimating() ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
          )}
        >
          {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-border">
            <h2 class="font-bold text-lg flex items-center gap-2">
              <Wrench class="w-5 h-5 text-primary" />
              System Internals
            </h2>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleRefetch} title="Refresh">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </Button>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                <X class="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div class="overflow-y-auto h-[calc(100%-60px)] p-4 space-y-4">
            <Show
              when={!debugState.loading && debugState()}
              fallback={
                <div class="flex items-center justify-center py-12">
                  <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              }
            >
              {(state) => (
                <>
                  {/* Energy State */}
                  <Card class="p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Battery class="w-4 h-4" />
                        Energy State
                        <InfoTooltip text="Your weekly energy level based on check-ins. Low energy triggers protective measures." />
                      </div>
                      <ConnectivityBadge connected={true} target="Goals" />
                    </div>
                    <div
                      class={cn(
                        'text-xl font-bold px-3 py-1.5 rounded-md border inline-block',
                        getStateColor(state().energyState)
                      )}
                    >
                      {state().energyState}
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Current Level</span>
                      <span class="font-mono font-medium">{state().currentEnergy}%</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Confidence</span>
                      <span class="font-mono font-medium">{state().energyConfidence}%</span>
                    </div>
                    {/* Mini energy chart */}
                    <div class="flex items-end gap-1 h-8 pt-2">
                      <For each={state().energyHistory}>
                        {(level, i) => (
                          <div
                            class={cn(
                              'flex-1 rounded-t-sm transition-all',
                              level < 40
                                ? 'bg-red-500'
                                : level < 60
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500',
                              i() === state().energyHistory.length - 1 && 'ring-2 ring-primary'
                            )}
                            style={{ height: `${level}%` }}
                            title={`Week ${i() + 1}: ${level}%`}
                          />
                        )}
                      </For>
                    </div>
                    <ImpactText>
                      {state().energyState === 'Normal'
                        ? '→ Your weekly targets are at full capacity.'
                        : state().energyState === 'Energy Debt'
                          ? '→ Weekly targets reduced to help you recover.'
                          : '→ Catch-up mode active: extra hours suggested.'}
                    </ImpactText>
                  </Card>

                  {/* Comeback Detection */}
                  <Card class="p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Rocket class="w-4 h-4" />
                        Comeback Detection
                        <InfoTooltip text="Detects when you bounce back from low energy. Suggests extra hours to catch up on savings." />
                      </div>
                      <ConnectivityBadge connected={state().comebackActive} target="Goals" />
                    </div>
                    <Show
                      when={state().comebackActive}
                      fallback={
                        <>
                          <Badge variant="secondary" class="text-xs">
                            Inactive
                          </Badge>
                          <ImpactText>→ No catch-up needed. Regular pace.</ImpactText>
                        </>
                      }
                    >
                      <Badge class="bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs">
                        ACTIVE
                      </Badge>
                      <div class="space-y-1.5 text-sm">
                        <div class="flex justify-between">
                          <span class="text-muted-foreground">Deficit</span>
                          <span class="font-mono font-medium">{state().comebackDeficit}€</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-muted-foreground">Recovery</span>
                          <span class="font-mono font-medium">{state().recoveryProgress}%</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-muted-foreground">Low weeks</span>
                          <span class="font-mono font-medium">{state().deficitWeeks}</span>
                        </div>
                      </div>
                      <ImpactText>
                        {`→ Catch-up plan generated: ~${Math.ceil(state().comebackDeficit / 50)}h extra over 3 weeks.`}
                      </ImpactText>
                    </Show>
                  </Card>

                  {/* Energy Debt */}
                  <Card class="p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <AlertTriangle class="w-4 h-4" />
                        Energy Debt
                        <InfoTooltip text="Triggered after 3+ weeks below 40% energy. Protects you by reducing weekly targets." />
                      </div>
                      <ConnectivityBadge connected={state().debtDetected} target="Goals" />
                    </div>
                    <Show
                      when={state().debtDetected}
                      fallback={
                        <>
                          <Badge variant="secondary" class="text-xs">
                            No debt
                          </Badge>
                          <ImpactText>→ Full capacity. No target reduction.</ImpactText>
                        </>
                      }
                    >
                      <Badge
                        class={cn('text-xs uppercase', getSeverityColor(state().debtSeverity))}
                      >
                        {state().debtSeverity}
                      </Badge>
                      <div class="flex justify-between text-sm">
                        <span class="text-muted-foreground">Weeks in debt</span>
                        <span class="font-mono font-medium">{state().debtWeeks}</span>
                      </div>
                      <ImpactText>
                        {`→ Goals reduced by ${state().debtSeverity === 'high' ? '85%' : state().debtSeverity === 'medium' ? '75%' : '50%'} to protect your health.`}
                      </ImpactText>
                    </Show>
                  </Card>

                  {/* Preference Weights */}
                  <Card class="p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Sliders class="w-4 h-4" />
                        Swipe Preferences
                        <InfoTooltip text="Learned from your swipes in the Swipe tab. Affects how jobs are ranked." />
                      </div>
                      <ConnectivityBadge connected={true} target="Jobs" />
                    </div>
                    <div class="space-y-2">
                      <PreferenceBar
                        label="Effort"
                        value={state().prefs.effortSensitivity}
                        color="blue"
                        description={
                          state().prefs.effortSensitivity > 0.6
                            ? 'Prefers easy jobs'
                            : state().prefs.effortSensitivity < 0.4
                              ? 'OK with hard work'
                              : 'Neutral'
                        }
                      />
                      <PreferenceBar
                        label="Pay"
                        value={state().prefs.hourlyRatePriority}
                        color="green"
                        description={
                          state().prefs.hourlyRatePriority > 0.6
                            ? 'Maximizes pay'
                            : state().prefs.hourlyRatePriority < 0.4
                              ? 'Pay not priority'
                              : 'Neutral'
                        }
                      />
                      <PreferenceBar
                        label="Flexibility"
                        value={state().prefs.timeFlexibility}
                        color="purple"
                        description={
                          state().prefs.timeFlexibility > 0.6
                            ? 'Needs flexibility'
                            : state().prefs.timeFlexibility < 0.4
                              ? 'Fixed hours OK'
                              : 'Neutral'
                        }
                      />
                      <PreferenceBar
                        label="Stability"
                        value={state().prefs.incomeStability}
                        color="amber"
                        description={
                          state().prefs.incomeStability > 0.6
                            ? 'Wants stable income'
                            : state().prefs.incomeStability < 0.4
                              ? 'OK with variable'
                              : 'Neutral'
                        }
                      />
                    </div>
                    <ImpactText>
                      {`→ Jobs tab is sorted based on these weights (${state().prefs.effortSensitivity === 0.5 && state().prefs.hourlyRatePriority === 0.5 ? 'default' : 'personalized'}).`}
                    </ImpactText>
                  </Card>
                </>
              )}
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

// P2-Health: Enhanced with description tooltip
function PreferenceBar(props: {
  label: string;
  value: number;
  color: string;
  description?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  };

  const bgColorClasses: Record<string, string> = {
    blue: 'bg-blue-200 dark:bg-blue-900/30',
    green: 'bg-green-200 dark:bg-green-900/30',
    purple: 'bg-purple-200 dark:bg-purple-900/30',
    amber: 'bg-amber-200 dark:bg-amber-900/30',
  };

  return (
    <div class="flex items-center gap-3" title={props.description}>
      <span class="text-xs text-muted-foreground w-16">{props.label}</span>
      <div class={cn('flex-1 h-2 rounded-full', bgColorClasses[props.color])}>
        <div
          class={cn('h-full rounded-full transition-all duration-500', colorClasses[props.color])}
          style={{ width: `${props.value * 100}%` }}
        />
      </div>
      <span class="text-xs font-mono w-10 text-right">{Math.round(props.value * 100)}%</span>
    </div>
  );
}
