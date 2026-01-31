/**
 * GridMultiSelect Component
 *
 * A grid-based multi-select component with clickable chips.
 * Used for skills and certifications selection in onboarding.
 */

import { createSignal, For, Show } from 'solid-js';

// =============================================================================
// Types
// =============================================================================

interface GridMultiSelectProps {
  /** Available options to display */
  options: string[];
  /** Currently selected items */
  selected: string[];
  /** Callback when selection changes */
  onChange: (selected: string[]) => void;
  /** Placeholder text for filter input */
  placeholder?: string;
  /** Maximum height for scrollable container (default: 200px) */
  maxHeight?: string;
  /** Display variant - 'wide' uses more columns for wider containers */
  variant?: 'default' | 'wide';
}

// =============================================================================
// Component
// =============================================================================

export default function GridMultiSelect(props: GridMultiSelectProps) {
  const [filter, setFilter] = createSignal('');

  // Filter options based on search input
  const filteredOptions = () => {
    const query = filter().toLowerCase().trim();
    if (!query) {
      return props.options;
    }
    return props.options.filter((option) => option.toLowerCase().includes(query));
  };

  // Toggle selection of an item
  const toggleItem = (item: string) => {
    const isSelected = props.selected.includes(item);
    if (isSelected) {
      props.onChange(props.selected.filter((s) => s !== item));
    } else {
      props.onChange([...props.selected, item]);
    }
  };

  // Check if an item is selected
  const isSelected = (item: string) => props.selected.includes(item);

  // Get max height style
  const maxHeightStyle = () => props.maxHeight || '200px';

  return (
    <div class="space-y-3">
      {/* Filter input */}
      <input
        type="text"
        value={filter()}
        onInput={(e) => setFilter(e.currentTarget.value)}
        placeholder={props.placeholder || 'Search...'}
        class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
      />

      {/* Scrollable grid container */}
      <div class="overflow-y-auto" style={{ 'max-height': maxHeightStyle() }}>
        <div
          class={`grid gap-2 ${
            (props.variant || 'default') === 'wide'
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          <For each={filteredOptions()}>
            {(option) => (
              <button
                type="button"
                onClick={() => toggleItem(option)}
                class={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors whitespace-normal text-left ${
                  isSelected(option)
                    ? 'bg-primary border border-primary text-primary-foreground'
                    : 'bg-muted border border-border text-foreground hover:bg-muted/80'
                }`}
                title={option}
              >
                {option}
              </button>
            )}
          </For>
          <Show when={filteredOptions().length === 0}>
            <p class="text-sm text-muted-foreground py-4 text-center col-span-full">
              {filter() ? 'No matches found. Try a different search.' : 'No options available.'}
            </p>
          </Show>
        </div>
      </div>

      {/* Selected counter */}
      <Show when={props.selected.length > 0}>
        <p class="text-sm text-muted-foreground">Selected: {props.selected.length} items</p>
      </Show>
    </div>
  );
}
