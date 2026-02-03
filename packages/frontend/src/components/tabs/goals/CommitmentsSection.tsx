/**
 * Commitments Section Component
 *
 * Extracted from GoalsTab to reduce component size.
 * Manages regular commitments like classes, sports, clubs, etc.
 */

import { Show, For, type Accessor, type Setter } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Clock, Trash2, Plus } from 'lucide-solid';

export interface Commitment {
  id: string;
  type: 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
  name: string;
  hoursPerWeek: number;
}

interface CommitmentsSectionProps {
  /** Current list of commitments */
  commitments: Accessor<Commitment[]>;
  /** Set commitments list */
  setCommitments: Setter<Commitment[]>;
  /** New commitment form state */
  newCommitment: Accessor<Partial<Commitment>>;
  /** Set new commitment form state */
  setNewCommitment: Setter<Partial<Commitment>>;
  /** Callback when user clicks delete on a commitment */
  onDeleteRequest: (commitment: { id: string; name: string }) => void;
}

/**
 * Get emoji icon for commitment type
 */
const getCommitmentIcon = (type: Commitment['type']): string => {
  switch (type) {
    case 'sport':
      return '⚽';
    case 'class':
      return '📚';
    case 'club':
      return '👥';
    case 'family':
      return '🏠';
    case 'health':
      return '❤️';
    case 'other':
    default:
      return '📌';
  }
};

export function CommitmentsSection(props: CommitmentsSectionProps) {
  // Add a new commitment
  const addCommitment = () => {
    const commitment = props.newCommitment();
    if (!commitment.name || !commitment.hoursPerWeek) return;

    props.setCommitments([
      ...props.commitments(),
      { ...commitment, id: `commit_${Date.now()}` } as Commitment,
    ]);
    props.setNewCommitment({ type: 'class', name: '', hoursPerWeek: 2 });
  };

  return (
    <Card>
      <CardContent class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock class="h-5 w-5 text-primary" /> Current Commitments
        </h3>
        <p class="text-sm text-muted-foreground mb-4">Regular activities that take up your time</p>

        {/* Commitments List */}
        <Show when={props.commitments().length > 0}>
          <div class="space-y-2 mb-4">
            <For each={props.commitments()}>
              {(commitment) => (
                <div class="flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border">
                  <div class="flex items-center gap-3">
                    <span class="text-xl">{getCommitmentIcon(commitment.type)}</span>
                    <div>
                      <p class="font-medium text-foreground">{commitment.name}</p>
                      <p class="text-xs text-muted-foreground">{commitment.hoursPerWeek}h / week</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={() =>
                      props.onDeleteRequest({
                        id: commitment.id,
                        name: commitment.name,
                      })
                    }
                    title="Delete commitment"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Add Form */}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            value={props.newCommitment().type}
            onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
              props.setNewCommitment({
                ...props.newCommitment(),
                type: e.currentTarget.value as Commitment['type'],
              })
            }
            options={[
              { value: 'class', label: '📚 Class' },
              { value: 'sport', label: '⚽ Sport' },
              { value: 'club', label: '👥 Club' },
              { value: 'family', label: '🏠 Family' },
              { value: 'health', label: '❤️ Health' },
              { value: 'other', label: '📌 Other' },
            ]}
            class="w-full"
          />

          <Input
            type="text"
            placeholder="Activity name"
            value={props.newCommitment().name}
            onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
              props.setNewCommitment({ ...props.newCommitment(), name: e.currentTarget.value })
            }
          />

          <div class="relative">
            <Input
              type="number"
              min="1"
              max="168"
              placeholder="Hours/week"
              value={props.newCommitment().hoursPerWeek || ''}
              onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                props.setNewCommitment({
                  ...props.newCommitment(),
                  hoursPerWeek: parseInt(e.currentTarget.value) || 0,
                })
              }
              class="pr-8"
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              h
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="mt-3 w-full border-dashed"
          onClick={addCommitment}
        >
          <Plus class="h-4 w-4 mr-2" /> Add commitment
        </Button>
      </CardContent>
    </Card>
  );
}
