/**
 * SkillMultiSelect Component
 *
 * Enhanced multi-select for skills with:
 * - Star ratings (1-5) showing relevance to user's studies
 * - "Bruno's pick" tag for top recommendations
 * - Sorted by relevance
 * - Visual distinction for primary vs connected field skills
 */

import { createSignal, createMemo, For, Show } from 'solid-js';
import type { SkillSuggestion } from '~/lib/data/skillSuggestionEngine';

// =============================================================================
// Types
// =============================================================================

interface SkillMultiSelectProps {
  /** Available skill suggestions with ratings */
  options: SkillSuggestion[] | (() => SkillSuggestion[]);
  /** Currently selected skill names */
  selected: string[];
  /** Callback when selection changes */
  onChange: (selected: string[]) => void;
  /** Placeholder text for filter input */
  placeholder?: string;
  /** Maximum height for scrollable container */
  maxHeight?: string;
}

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Star rating display (filled vs empty stars)
 */
function StarRating(props: { stars: number; size?: 'sm' | 'md' }) {
  const sizeClass = () => (props.size === 'md' ? 'text-sm' : 'text-xs');

  return (
    <span class={`${sizeClass()} flex gap-0.5`} title={`${props.stars}/5 étoiles`}>
      <For each={[1, 2, 3, 4, 5]}>
        {(i) => (
          <span class={i <= props.stars ? 'text-yellow-500' : 'text-muted-foreground/30'}>★</span>
        )}
      </For>
    </span>
  );
}

/**
 * Bruno's pick badge
 */
function BrunoPick() {
  return (
    <span
      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] font-medium rounded-full whitespace-nowrap"
      title="Recommandé par Bruno - facile à démarrer et adapté à ton profil"
    >
      <span class="text-xs">🎯</span>
      Bruno
    </span>
  );
}

/**
 * Field match indicator
 */
function FieldMatchBadge(props: { match: 'primary' | 'strong' | 'medium' | 'general' }) {
  const config = () => {
    switch (props.match) {
      case 'primary':
        return { label: 'Direct', class: 'bg-green-500/20 text-green-700 dark:text-green-400' };
      case 'strong':
        return { label: 'Connexe', class: 'bg-blue-500/20 text-blue-700 dark:text-blue-400' };
      case 'medium':
        return {
          label: 'Transférable',
          class: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
        };
      default:
        return { label: 'Général', class: 'bg-muted text-muted-foreground' };
    }
  };

  // Only show for primary and strong matches
  if (props.match !== 'primary' && props.match !== 'strong') return null;

  return (
    <span class={`text-[10px] px-1.5 py-0.5 rounded-full ${config().class}`}>{config().label}</span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function SkillMultiSelect(props: SkillMultiSelectProps) {
  const [filter, setFilter] = createSignal('');

  // Get options - wrapped in createMemo for proper SolidJS reactivity
  const options = createMemo(() => {
    const opts = typeof props.options === 'function' ? props.options() : props.options;
    return opts || [];
  });

  // Filter options based on search input
  const filteredOptions = createMemo(() => {
    const query = filter().toLowerCase().trim();
    if (!query) {
      return options();
    }
    return options().filter((opt) => opt.name.toLowerCase().includes(query));
  });

  // Toggle selection of an item
  const toggleItem = (name: string) => {
    const isSelected = props.selected.includes(name);
    if (isSelected) {
      props.onChange(props.selected.filter((s) => s !== name));
    } else {
      props.onChange([...props.selected, name]);
    }
  };

  // Check if an item is selected
  const isSelected = (name: string) => props.selected.includes(name);

  // Get max height style
  const maxHeightStyle = () => props.maxHeight || '320px';

  // Group options by star rating for visual hierarchy
  const groupedOptions = createMemo(() => {
    const filtered = filteredOptions();
    const brunoPicks = filtered.filter((o) => o.isBrunoPick);
    const fiveStars = filtered.filter((o) => !o.isBrunoPick && o.stars === 5);
    const fourStars = filtered.filter((o) => !o.isBrunoPick && o.stars === 4);
    const rest = filtered.filter((o) => !o.isBrunoPick && o.stars < 4);
    return { brunoPicks, fiveStars, fourStars, rest };
  });

  return (
    <div class="space-y-3">
      {/* Filter input */}
      <input
        type="text"
        value={filter()}
        onInput={(e) => setFilter(e.currentTarget.value)}
        placeholder={props.placeholder || 'Rechercher une compétence...'}
        class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
      />

      {/* Scrollable container */}
      <div class="overflow-y-auto" style={{ 'max-height': maxHeightStyle() }}>
        <div class="space-y-4">
          {/* Bruno's Picks Section */}
          <Show when={groupedOptions().brunoPicks.length > 0}>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span class="text-base">🎯</span>
                <span>Recommandés pour toi</span>
              </div>
              <div class="grid grid-cols-1 gap-2">
                <For each={groupedOptions().brunoPicks}>
                  {(skill) => (
                    <SkillChip
                      skill={skill}
                      isSelected={isSelected(skill.name)}
                      onToggle={() => toggleItem(skill.name)}
                      showBadge
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* 5-star skills */}
          <Show when={groupedOptions().fiveStars.length > 0}>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <StarRating stars={5} size="sm" />
                <span>Parfaitement adaptés</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <For each={groupedOptions().fiveStars}>
                  {(skill) => (
                    <SkillChip
                      skill={skill}
                      isSelected={isSelected(skill.name)}
                      onToggle={() => toggleItem(skill.name)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* 4-star skills */}
          <Show when={groupedOptions().fourStars.length > 0}>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <StarRating stars={4} size="sm" />
                <span>Très compatibles</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <For each={groupedOptions().fourStars}>
                  {(skill) => (
                    <SkillChip
                      skill={skill}
                      isSelected={isSelected(skill.name)}
                      onToggle={() => toggleItem(skill.name)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Rest (3 stars and below) */}
          <Show when={groupedOptions().rest.length > 0}>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <StarRating stars={3} size="sm" />
                <span>Autres options</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <For each={groupedOptions().rest}>
                  {(skill) => (
                    <SkillChip
                      skill={skill}
                      isSelected={isSelected(skill.name)}
                      onToggle={() => toggleItem(skill.name)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Empty state */}
          <Show when={filteredOptions().length === 0}>
            <p class="text-sm text-muted-foreground py-4 text-center">
              {filter()
                ? 'Aucun résultat. Essaie une autre recherche.'
                : 'Aucune suggestion disponible.'}
            </p>
          </Show>
        </div>
      </div>

      {/* Selected counter */}
      <Show when={props.selected.length > 0}>
        <p class="text-sm text-muted-foreground">
          {props.selected.length} compétence{props.selected.length > 1 ? 's' : ''} sélectionnée
          {props.selected.length > 1 ? 's' : ''}
        </p>
      </Show>
    </div>
  );
}

// =============================================================================
// Skill Chip Component
// =============================================================================

interface SkillChipProps {
  skill: SkillSuggestion;
  isSelected: boolean;
  onToggle: () => void;
  showBadge?: boolean;
}

function SkillChip(props: SkillChipProps) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      class={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
        props.isSelected
          ? 'bg-primary border-primary text-primary-foreground'
          : props.skill.isBrunoPick
            ? 'bg-primary/5 border-primary/30 hover:border-primary/50 text-foreground'
            : 'bg-muted border-border hover:bg-muted/80 text-foreground'
      }`}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          {/* Skill name */}
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-sm">{props.skill.name}</span>
            <Show when={props.showBadge && props.skill.isBrunoPick}>
              <BrunoPick />
            </Show>
          </div>

          {/* Metadata row */}
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <StarRating stars={props.skill.stars} />
            <FieldMatchBadge match={props.skill.fieldMatch} />
            <span class="text-xs text-muted-foreground">{props.skill.hourlyRate}€/h</span>
          </div>
        </div>

        {/* Selection indicator */}
        <div
          class={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            props.isSelected
              ? 'bg-primary-foreground border-primary-foreground text-primary'
              : 'border-muted-foreground/30'
          }`}
        >
          <Show when={props.isSelected}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3 w-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </Show>
        </div>
      </div>
    </button>
  );
}
