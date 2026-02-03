/**
 * Proactive Alerts Component (v4.2)
 *
 * Visual notification system for agent-triggered alerts.
 * Distinct from system toasts - uses Bruno avatar for "AI watching out for you" feel.
 *
 * Features:
 * - Listens to PROACTIVE_ALERT events from eventBus
 * - Shows in bottom-right with Bruno avatar
 * - Auto-dismiss after 8 seconds
 * - Click to navigate to action
 */

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { on, type ProactiveAlertPayload } from '~/lib/eventBus';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';
import { X, Sparkles, Target, Zap, Battery, Trophy } from 'lucide-solid';
import { cn } from '~/lib/cn';

// Alert type to icon/color mapping
const ALERT_CONFIG: Record<
  ProactiveAlertPayload['type'],
  { icon: typeof Sparkles; color: string; bg: string }
> = {
  skill_job: {
    icon: Sparkles,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
  goal_behind: {
    icon: Target,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  goal_achieved: {
    icon: Trophy,
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30',
  },
  energy_low: {
    icon: Battery,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
  },
  energy_recovered: {
    icon: Zap,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500/10 border-green-500/30',
  },
};

interface AlertWithTimeout extends ProactiveAlertPayload {
  timeout: ReturnType<typeof setTimeout>;
}

export function ProactiveAlerts() {
  const [alerts, setAlerts] = createSignal<AlertWithTimeout[]>([]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => {
      const alert = prev.find((a) => a.id === id);
      if (alert) clearTimeout(alert.timeout);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleNewAlert = (payload: ProactiveAlertPayload) => {
    // Auto-dismiss after 8 seconds
    const timeout = setTimeout(() => dismissAlert(payload.id), 8000);

    setAlerts((prev) => [
      ...prev.filter((a) => a.id !== payload.id), // Avoid duplicates
      { ...payload, timeout },
    ]);
  };

  onMount(() => {
    const unsubscribe = on('PROACTIVE_ALERT', handleNewAlert);
    onCleanup(unsubscribe);
  });

  return (
    <Portal>
      <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        <For each={alerts()}>
          {(alert) => {
            const config = ALERT_CONFIG[alert.type];
            const Icon = config.icon;

            return (
              <div
                class={cn(
                  'relative flex items-start gap-3 p-3 rounded-lg border shadow-lg backdrop-blur-sm',
                  'animate-in slide-in-from-right-5 fade-in duration-300',
                  config.bg
                )}
              >
                {/* Bruno Avatar */}
                <div class="flex-shrink-0">
                  <PlasmaAvatar size={36} color="green" />
                </div>

                {/* Content */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <Icon class={cn('h-4 w-4', config.color)} />
                    <h4 class="text-sm font-semibold text-foreground">{alert.title}</h4>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>

                  {/* Action button */}
                  <Show when={alert.action}>
                    <a
                      href={alert.action!.href}
                      class={cn(
                        'inline-flex items-center gap-1 mt-2 text-xs font-medium',
                        config.color,
                        'hover:underline'
                      )}
                      onClick={() => dismissAlert(alert.id)}
                    >
                      {alert.action!.label} →
                    </a>
                  </Show>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => dismissAlert(alert.id)}
                  class="flex-shrink-0 p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            );
          }}
        </For>
      </div>
    </Portal>
  );
}
