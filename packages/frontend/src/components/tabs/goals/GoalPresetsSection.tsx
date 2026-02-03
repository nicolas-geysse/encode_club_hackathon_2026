/**
 * Goal Presets Section Component
 *
 * Extracted from GoalsTab to reduce component size.
 * Provides quick preset buttons for common financial goals.
 */

import { Show, For, type Accessor } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Target } from 'lucide-solid';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import type { GoalComponent } from '~/lib/profileContext';

export interface GoalPreset {
  name: string;
  amount: number;
  icon: string;
  components: Array<{
    name: string;
    type: GoalComponent['type'];
    estimatedHours?: number;
    estimatedCost?: number;
    dependsOn?: string[];
  }>;
}

/** Default presets for common goals */
export const DEFAULT_PRESETS: GoalPreset[] = [
  { name: 'Vacation', amount: 500, icon: '🏖️', components: [] },
  {
    name: "Driver's license",
    amount: 1500,
    icon: '🚗',
    components: [
      {
        name: 'Theory classes',
        type: 'time_allocation',
        estimatedHours: 10,
        estimatedCost: 50,
      },
      { name: 'Code exam', type: 'exam', estimatedHours: 2, estimatedCost: 30 },
      {
        name: 'Driving lessons (20h)',
        type: 'time_allocation',
        estimatedHours: 20,
        estimatedCost: 800,
      },
      {
        name: 'Driving test',
        type: 'exam',
        estimatedHours: 1,
        estimatedCost: 100,
        dependsOn: ['Code exam', 'Driving lessons (20h)'],
      },
    ],
  },
  { name: 'Computer', amount: 800, icon: '💻', components: [] },
  { name: 'Emergency fund', amount: 1000, icon: '🛡️', components: [] },
];

interface GoalPresetsSectionProps {
  /** Currently selected goal name (for highlight) */
  selectedName: Accessor<string>;
  /** Callback when a preset is selected */
  onSelect: (preset: GoalPreset) => void;
  /** Currency for display */
  currency: Currency;
  /** Optional custom presets (defaults to DEFAULT_PRESETS) */
  presets?: GoalPreset[];
}

export function GoalPresetsSection(props: GoalPresetsSectionProps) {
  const presets = () => props.presets ?? DEFAULT_PRESETS;

  return (
    <Card>
      <CardContent class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target class="h-5 w-5 text-primary" /> Quick goal
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <For each={presets()}>
            {(preset) => (
              <button
                type="button"
                class={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 text-center hover:scale-[1.02] active:scale-[0.98] ${
                  props.selectedName() === preset.name
                    ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                    : 'border-border bg-card hover:border-primary/50 text-foreground'
                }`}
                onClick={() => props.onSelect(preset)}
              >
                <span class="text-2xl mb-1">{preset.icon}</span>
                <div class="flex flex-col">
                  <span class="font-medium text-sm">{preset.name}</span>
                  <span class="text-xs text-muted-foreground">
                    {formatCurrency(preset.amount, props.currency)}
                  </span>
                </div>
                <Show when={preset.components.length > 0}>
                  <span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1">
                    {preset.components.length} steps
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </CardContent>
    </Card>
  );
}
