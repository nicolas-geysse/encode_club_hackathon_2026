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
export function Badge(props: {
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
export function ConnectivityBadge(props: { connected: boolean; target: string }) {
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
export function InfoTooltip(props: { text: string }) {
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
export function ImpactText(props: { children: JSX.Element | string; class?: string }) {
  return (
    <p class={cn('text-[11px] text-muted-foreground/80 italic leading-tight', props.class)}>
      {props.children}
    </p>
  );
}

export interface DebugState {
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

export async function fetchDebugState(profileId: string | undefined): Promise<DebugState | null> {
  if (!profileId) return null;

  try {
    const response = await fetch(`/api/debug-state?profileId=${profileId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// --- Reusable Widgets ---

export function EnergyStateWidget(props: { state: DebugState; compact?: boolean }) {
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

  // Compact Mode (for Profile Identity Card)
  if (props.compact) {
    const currentEnergy = props.state.currentEnergy;
    return (
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-muted-foreground uppercase flex gap-2 items-center">
            <Battery class="w-3 h-3" /> Energy State
          </span>
          <span
            class={cn(
              'text-[10px] px-1.5 py-0.5 rounded border font-medium',
              getStateColor(props.state.energyState)
            )}
          >
            {props.state.energyState}
          </span>
        </div>

        {/* Current Energy Level - More Prominent */}
        <div class="flex items-center gap-3">
          <div class="text-2xl font-bold text-foreground">{currentEnergy}%</div>
          <div class="flex-1">
            <div class="h-3 bg-secondary rounded-full overflow-hidden">
              <div
                class={cn(
                  'h-full transition-all duration-500 rounded-full',
                  currentEnergy >= 70
                    ? 'bg-green-500'
                    : currentEnergy >= 50
                      ? 'bg-yellow-500'
                      : currentEnergy >= 30
                        ? 'bg-orange-500'
                        : 'bg-red-500'
                )}
                style={{ width: `${currentEnergy}%` }}
              />
            </div>
          </div>
        </div>

        {/* History Bars - Taller and with spacing */}
        <div class="flex items-end gap-1 h-12">
          <For each={props.state.energyHistory}>
            {(level, i) => {
              const isCurrentWeek = i() === props.state.energyHistory.length - 1;
              return (
                <div class="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group relative">
                  <div
                    class={cn(
                      'w-full rounded-t transition-all',
                      level < 40 ? 'bg-red-500' : level < 60 ? 'bg-yellow-500' : 'bg-green-500',
                      isCurrentWeek
                        ? 'opacity-100 ring-1 ring-primary'
                        : 'opacity-70 hover:opacity-100'
                    )}
                    style={{ height: `${Math.max(level, 8)}%` }}
                  />
                  {/* Tooltip */}
                  <div class="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap">
                    W{i() + 1}: {level}%
                  </div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="flex justify-between text-[10px] text-muted-foreground">
          <span>Week 1</span>
          <span>Week {props.state.energyHistory.length}</span>
        </div>
      </div>
    );
  }

  // Full Widget Mode
  return (
    <Card class="p-4 space-y-3 h-full">
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
          getStateColor(props.state.energyState)
        )}
      >
        {props.state.energyState}
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Current Level</span>
        <span class="font-mono font-medium">{props.state.currentEnergy}%</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Confidence</span>
        <span class="font-mono font-medium">{props.state.energyConfidence}%</span>
      </div>
      {/* Mini energy chart */}
      <div class="flex items-end gap-1 h-8 pt-2">
        <For each={props.state.energyHistory}>
          {(level, i) => (
            <div
              class={cn(
                'flex-1 rounded-t-sm transition-all',
                level < 40 ? 'bg-red-500' : level < 60 ? 'bg-yellow-500' : 'bg-green-500',
                i() === props.state.energyHistory.length - 1 && 'ring-2 ring-primary'
              )}
              style={{ height: `${level}%` }}
              title={`Week ${i() + 1}: ${level}%`}
            />
          )}
        </For>
      </div>
      <ImpactText>
        {props.state.energyState === 'Normal'
          ? '→ Your weekly targets are at full capacity.'
          : props.state.energyState === 'Energy Debt'
            ? '→ Weekly targets reduced to help you recover.'
            : '→ Catch-up mode active: extra hours suggested.'}
      </ImpactText>
    </Card>
  );
}

export function ComebackWidget(props: { state: DebugState }) {
  return (
    <Card class="p-4 space-y-3 h-full">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Rocket class="w-4 h-4" />
          Comeback
          <InfoTooltip text="Detects when you bounce back from low energy. Suggests extra hours to catch up on savings." />
        </div>
        <ConnectivityBadge connected={props.state.comebackActive} target="Goals" />
      </div>
      <Show
        when={props.state.comebackActive}
        fallback={
          <>
            <Badge variant="secondary" class="text-xs">
              Inactive
            </Badge>
            <ImpactText>→ No catch-up needed. Regular pace.</ImpactText>
          </>
        }
      >
        <Badge class="bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs">ACTIVE</Badge>
        <div class="space-y-1.5 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Deficit</span>
            <span class="font-mono font-medium">{props.state.comebackDeficit}€</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Recovery</span>
            <span class="font-mono font-medium">{props.state.recoveryProgress}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Low weeks</span>
            <span class="font-mono font-medium">{props.state.deficitWeeks}</span>
          </div>
        </div>
        <ImpactText>
          {`→ Catch-up plan generated: ~${Math.ceil(props.state.comebackDeficit / 50)}h extra over 3 weeks.`}
        </ImpactText>
      </Show>
    </Card>
  );
}

export function DebtWidget(props: { state: DebugState }) {
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
    <Card class="p-4 space-y-3 h-full">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <AlertTriangle class="w-4 h-4" />
          Energy Debt
          <InfoTooltip text="Triggered after 3+ weeks below 40% energy. Protects you by reducing weekly targets." />
        </div>
        <ConnectivityBadge connected={props.state.debtDetected} target="Goals" />
      </div>
      <Show
        when={props.state.debtDetected}
        fallback={
          <>
            <Badge variant="secondary" class="text-xs">
              No debt
            </Badge>
            <ImpactText>→ Full capacity. No target reduction.</ImpactText>
          </>
        }
      >
        <Badge class={cn('text-xs uppercase', getSeverityColor(props.state.debtSeverity))}>
          {props.state.debtSeverity}
        </Badge>
        <div class="flex justify-between text-sm">
          <span class="text-muted-foreground">Weeks in debt</span>
          <span class="font-mono font-medium">{props.state.debtWeeks}</span>
        </div>
        <ImpactText>
          {`→ Goals reduced by ${props.state.debtSeverity === 'high' ? '85%' : props.state.debtSeverity === 'medium' ? '75%' : '50%'} to protect your health.`}
        </ImpactText>
      </Show>
    </Card>
  );
}

export function PreferencesWidget(props: { state: DebugState }) {
  return (
    <Card class="p-4 space-y-3 h-full">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sliders class="w-4 h-4" />
          Swipe Prefs
          <InfoTooltip text="Learned from your swipes in the Swipe tab. Affects how jobs are ranked." />
        </div>
        <ConnectivityBadge connected={true} target="Jobs" />
      </div>
      <div class="space-y-2">
        <PreferenceBar
          label="Effort"
          value={props.state.prefs.effortSensitivity}
          color="blue"
          description={
            props.state.prefs.effortSensitivity > 0.6
              ? 'Prefers easy jobs'
              : props.state.prefs.effortSensitivity < 0.4
                ? 'OK with hard work'
                : 'Neutral'
          }
        />
        <PreferenceBar
          label="Pay"
          value={props.state.prefs.hourlyRatePriority}
          color="green"
          description={
            props.state.prefs.hourlyRatePriority > 0.6
              ? 'Maximizes pay'
              : props.state.prefs.hourlyRatePriority < 0.4
                ? 'Pay not priority'
                : 'Neutral'
          }
        />
        <PreferenceBar
          label="Flex"
          value={props.state.prefs.timeFlexibility}
          color="purple"
          description={
            props.state.prefs.timeFlexibility > 0.6
              ? 'Needs flexibility'
              : props.state.prefs.timeFlexibility < 0.4
                ? 'Fixed hours OK'
                : 'Neutral'
          }
        />
        <PreferenceBar
          label="Stable"
          value={props.state.prefs.incomeStability}
          color="amber"
          description={
            props.state.prefs.incomeStability > 0.6
              ? 'Wants stable income'
              : props.state.prefs.incomeStability < 0.4
                ? 'OK with variable'
                : 'Neutral'
          }
        />
      </div>
      <ImpactText>{`→ Jobs sorted by preferences.`}</ImpactText>
    </Card>
  );
}

// Exportable content component -> Can now use the widgets
export function DebugContent(props: { profileId?: string }) {
  const [debugState, { refetch }] = createResource(() => props.profileId, fetchDebugState);

  const handleRefetch = () => refetch();

  return (
    <div class="space-y-4">
      <div class="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefetch}
          title="Refresh Data"
          class="h-8 px-2 text-xs"
        >
          Refresh Data
        </Button>
      </div>

      <Show
        when={!debugState.loading && debugState()}
        fallback={
          <div class="flex items-center justify-center py-12">
            <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        }
      >
        {(state) => (
          <div class="space-y-4">
            <EnergyStateWidget state={state()} />
            <ComebackWidget state={state()} />
            <DebtWidget state={state()} />
            <PreferencesWidget state={state()} />
          </div>
        )}
      </Show>
    </div>
  );
}

// Keep DebugPanel for compatibility if needed (but we will remove its usage)
export function DebugPanel(props: DebugPanelProps) {
  const { profile } = useProfile();
  const [isAnimating, setIsAnimating] = createSignal(false);

  // Animate on open
  onMount(() => {
    if (props.isOpen) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
  });

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
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                <X class="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div class="overflow-y-auto h-[calc(100%-60px)] p-4">
            <DebugContent profileId={profile()?.id} />
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
