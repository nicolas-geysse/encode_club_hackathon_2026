/**
 * Goal Components Section Component
 *
 * Extracted from GoalsTab to reduce component size.
 * Manages goal components like milestones, exams, time allocations, etc.
 */

import { Show, For, type Accessor, type Setter } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Package, Plus, X } from 'lucide-solid';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import type { GoalComponent } from '~/lib/profileContext';

export interface ComponentFormItem {
  id: string;
  name: string;
  type: GoalComponent['type'];
  estimatedHours: number;
  estimatedCost: number;
  dependsOn: string[];
}

interface GoalComponentsSectionProps {
  /** Current list of components */
  components: Accessor<ComponentFormItem[]>;
  /** Set components list */
  setComponents: Setter<ComponentFormItem[]>;
  /** New component form state */
  newComponent: Accessor<Partial<ComponentFormItem>>;
  /** Set new component form state */
  setNewComponent: Setter<Partial<ComponentFormItem>>;
  /** Currency for display */
  currency: Currency;
  /** Currency symbol (e.g., $, €) */
  currencySymbol: string;
}

/**
 * Get emoji icon for component type
 */
const getTypeIcon = (type: GoalComponent['type']): string => {
  switch (type) {
    case 'exam':
      return '📝';
    case 'time_allocation':
      return '⏰';
    case 'purchase':
      return '🛒';
    case 'milestone':
      return '🎯';
    case 'other':
    default:
      return '📋';
  }
};

export function GoalComponentsSection(props: GoalComponentsSectionProps) {
  // Add a new component
  const addComponent = () => {
    const comp = props.newComponent();
    if (!comp.name) return;

    props.setComponents([
      ...props.components(),
      {
        id: `comp_${Date.now()}`,
        name: comp.name || '',
        type: comp.type || 'milestone',
        estimatedHours: comp.estimatedHours || 0,
        estimatedCost: comp.estimatedCost || 0,
        dependsOn: comp.dependsOn || [],
      },
    ]);
    props.setNewComponent({
      name: '',
      type: 'milestone',
      estimatedHours: 0,
      estimatedCost: 0,
      dependsOn: [],
    });
  };

  // Remove a component
  const removeComponent = (id: string) => {
    props.setComponents(props.components().filter((c) => c.id !== id));
  };

  return (
    <Card class="border-primary/20">
      <CardContent class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Package class="h-5 w-5 text-primary" /> Goal Components
        </h3>
        <p class="text-sm text-muted-foreground mb-4">
          Break down your goal into smaller steps or milestones
        </p>

        {/* Components List */}
        <Show when={props.components().length > 0}>
          <div class="space-y-2 mb-4">
            <For each={props.components()}>
              {(comp) => (
                <div class="flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border">
                  <div class="flex items-center gap-3">
                    <span class="text-xl">{getTypeIcon(comp.type)}</span>
                    <div>
                      <p class="font-medium text-foreground">{comp.name}</p>
                      <div class="flex gap-3 text-xs text-muted-foreground">
                        <Show when={comp.estimatedHours > 0}>
                          <span>{comp.estimatedHours}h</span>
                        </Show>
                        <Show when={comp.estimatedCost > 0}>
                          <span>{formatCurrency(comp.estimatedCost, props.currency)}</span>
                        </Show>
                        <Show when={comp.dependsOn.length > 0}>
                          <span class="text-amber-600">Requires: {comp.dependsOn.join(', ')}</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={() => removeComponent(comp.id)}
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Add Form */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            type="text"
            placeholder="Component name"
            value={props.newComponent().name}
            onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
              props.setNewComponent({ ...props.newComponent(), name: e.currentTarget.value })
            }
          />
          <Select
            value={props.newComponent().type}
            onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
              props.setNewComponent({
                ...props.newComponent(),
                type: e.currentTarget.value as GoalComponent['type'],
              })
            }
            options={[
              { value: 'milestone', label: '🎯 Milestone' },
              { value: 'exam', label: '📝 Exam/Test' },
              { value: 'time_allocation', label: '⏰ Time allocation' },
              { value: 'purchase', label: '🛒 Purchase' },
              { value: 'other', label: '📋 Other' },
            ]}
            class="w-full"
          />
          <div class="relative">
            <Input
              type="number"
              placeholder="Hours"
              min="0"
              value={props.newComponent().estimatedHours || ''}
              onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                props.setNewComponent({
                  ...props.newComponent(),
                  estimatedHours: parseInt(e.currentTarget.value) || 0,
                })
              }
              class="pr-8"
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              h
            </span>
          </div>
          <Input
            type="number"
            placeholder={`Cost (${props.currencySymbol})`}
            min="0"
            value={props.newComponent().estimatedCost || ''}
            onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
              props.setNewComponent({
                ...props.newComponent(),
                estimatedCost: parseInt(e.currentTarget.value) || 0,
              })
            }
          />
        </div>

        {/* Dependencies */}
        <Show when={props.components().length > 0}>
          <div class="mt-3">
            <label class="block text-sm font-medium text-muted-foreground mb-1">
              Depends on (optional)
            </label>
            <div class="relative">
              <select
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                multiple
                value={props.newComponent().dependsOn}
                onChange={(e: Event & { currentTarget: HTMLSelectElement }) => {
                  const selected = Array.from(e.currentTarget.selectedOptions).map(
                    (o: HTMLOptionElement) => o.value
                  );
                  props.setNewComponent({ ...props.newComponent(), dependsOn: selected });
                }}
              >
                <For each={props.components()}>
                  {(comp) => <option value={comp.name}>{comp.name}</option>}
                </For>
              </select>
            </div>
          </div>
        </Show>

        <Button
          variant="outline"
          size="sm"
          class="mt-3 w-full border-dashed"
          onClick={addComponent}
        >
          <Plus class="h-4 w-4 mr-2" /> Add component
        </Button>
      </CardContent>
    </Card>
  );
}
