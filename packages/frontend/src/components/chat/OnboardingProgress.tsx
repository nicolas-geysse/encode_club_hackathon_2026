import { Component, createMemo, For } from 'solid-js';
import './OnboardingProgress.css';

interface TimelineStep {
  id: string;
  leftLabel: string;
  rightLabel: string;
}

interface OnboardingProgressProps {
  currentStepId: string;
}

// Map logical steps to visual milestones
// Simplified phases per user request
const TIMELINE_STEPS: TimelineStep[] = [
  { id: 'identity', leftLabel: 'Who are you?', rightLabel: '' },
  { id: 'money', leftLabel: 'Money', rightLabel: '' },
  { id: 'goal', leftLabel: 'Your Goal', rightLabel: '' },
  { id: 'plan', leftLabel: 'Generating Plan', rightLabel: '' },
];

export const OnboardingProgress: Component<OnboardingProgressProps> = (props) => {
  const getCurrentIndex = createMemo(() => {
    const step = props.currentStepId;

    // Phase 1: Identity
    // starts after greeting (city) -> name
    if (['name', 'studies', 'skills', 'certifications'].includes(step)) return 0;

    // Phase 2: Money
    if (['budget', 'work_preferences'].includes(step)) return 1;

    // Phase 3: Your Goal
    if (['goal', 'academic_events', 'inventory', 'trade', 'subscriptions'].includes(step)) return 2;

    // Phase 4: Generating Plan
    if (['lifestyle', 'complete'].includes(step)) return 3;

    return 0; // Default
  });

  return (
    <div class="relative py-4 w-full">
      {/* Continuous Vertical Line - Centered */}
      <div class="absolute left-1/2 top-6 bottom-6 w-0.5 bg-border -translate-x-[0.5px] -z-10" />

      <div class="flex flex-col gap-6">
        <For each={TIMELINE_STEPS}>
          {(step, index) => {
            const status = () => {
              const current = getCurrentIndex();
              const idx = index();
              if (idx < current) return 'done';
              if (idx === current) return 'current';
              return 'future';
            };

            return (
              <div class="grid grid-cols-[1fr_auto_1fr] gap-4 items-center group">
                {/* Label (Left) */}
                <div
                  class={`text-right text-sm font-medium transition-colors duration-300 ${
                    step.id === 'plan' && (status() === 'current' || status() === 'done')
                      ? 'text-green-500 font-semibold'
                      : status() === 'current'
                        ? 'text-primary scale-105 origin-right'
                        : status() === 'done'
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/40'
                  }`}
                >
                  {step.leftLabel}
                </div>

                {/* Dot Indicator (Center) */}
                <div class="relative flex items-center justify-center w-4">
                  <div
                    class={`rounded-full transition-all duration-500 z-10 ${
                      step.id === 'plan' && (status() === 'current' || status() === 'done')
                        ? 'w-3 h-3 bg-green-500 ring-4 ring-green-500/20'
                        : status() === 'current'
                          ? 'w-3 h-3 bg-emerald-500 dark:bg-emerald-400 ring-4 ring-emerald-500/20 dark:ring-emerald-400/30'
                          : status() === 'done'
                            ? 'w-2.5 h-2.5 bg-emerald-500/60 dark:bg-emerald-400/60'
                            : 'w-2 h-2 bg-muted-foreground/30'
                    }`}
                    style={
                      status() === 'current'
                        ? {
                            animation: 'subtle-pulse 2s ease-in-out infinite',
                          }
                        : undefined
                    }
                  />

                  {/* Active Glow for current */}
                  {status() === 'current' && (
                    <div class="absolute inset-0 bg-emerald-500/40 dark:bg-emerald-400/40 rounded-full animate-ping opacity-75 lg:hidden" />
                  )}
                </div>

                {/* Right Spacer */}
                <div class="hidden sm:block" />
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};
