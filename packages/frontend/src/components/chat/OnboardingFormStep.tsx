/**
 * OnboardingFormStep Component
 *
 * Renders contextual form fields for each onboarding step.
 * Supports autocomplete, multi-select pills, geolocation, and more.
 */

import { createSignal, For, Show, createEffect, Index, Switch, Match } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { OnboardingStep } from '../../lib/chat/types';
import {
  getStepFormConfig,
  type FormField,
  type DynamicListFieldConfig,
} from '../../lib/chat/stepForms';
import {
  getCurrentLocation,
  isGeolocationSupported,
  type GeolocationResult,
  type GeolocationError,
} from '../../lib/geolocation';
import MapPicker, { type MapCoordinates } from './MapPicker';

// =============================================================================
// Types
// =============================================================================

interface OnboardingFormStepProps {
  step: OnboardingStep;
  /** Initial values to pre-fill the form */
  initialValues?: Record<string, unknown>;
  /** Currency symbol for displaying amounts */
  currencySymbol?: string;
  /** Called when form is submitted */
  onSubmit: (data: Record<string, unknown>) => void;
  /** Called when user starts typing (for text-based input fallback) */
  onTextInput?: (text: string) => void;
}

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Autocomplete Input with suggestions dropdown
 */
function AutocompleteInput(props: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const [showSuggestions, setShowSuggestions] = createSignal(false);
  const [filteredSuggestions, setFilteredSuggestions] = createSignal<string[]>([]);
  let inputRef: HTMLInputElement | undefined;

  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    props.onChange(value);

    if (value.length >= 1 && props.field.suggestions) {
      const filtered = props.field.suggestions.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 8));
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelect = (suggestion: string) => {
    props.onSelect(suggestion);
    setShowSuggestions(false);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  };

  return (
    <div class="relative">
      <input
        ref={inputRef}
        type="text"
        value={props.value}
        onInput={handleInput}
        onFocus={() => props.value && handleInput({ target: inputRef } as unknown as InputEvent)}
        onBlur={handleBlur}
        placeholder={props.field.placeholder}
        class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Show when={showSuggestions() && filteredSuggestions().length > 0}>
        <div class="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <For each={filteredSuggestions()}>
            {(suggestion) => (
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                class="w-full px-3 py-2 text-left text-foreground hover:bg-muted first:rounded-t-lg last:rounded-b-lg"
              >
                {suggestion}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/**
 * Multi-select pills for skills, certifications, etc.
 */
function MultiSelectPills(props: {
  field: FormField;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [inputValue, setInputValue] = createSignal('');
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const availableSuggestions = () => {
    const suggestions = props.field.suggestions || [];
    return suggestions.filter(
      (s) => !props.selected.includes(s) && s.toLowerCase().includes(inputValue().toLowerCase())
    );
  };

  const addItem = (item: string) => {
    if (!props.selected.includes(item)) {
      props.onChange([...props.selected, item]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeItem = (item: string) => {
    props.onChange(props.selected.filter((s) => s !== item));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue().trim()) {
      e.preventDefault();
      addItem(inputValue().trim());
    }
  };

  return (
    <div class="space-y-2">
      {/* Selected pills */}
      <Show when={props.selected.length > 0}>
        <div class="flex flex-wrap gap-2">
          <For each={props.selected}>
            {(item) => (
              <span class="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground text-sm rounded-full">
                {item}
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  class="hover:text-destructive"
                >
                  ×
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Input with suggestions */}
      <div class="relative">
        <input
          type="text"
          value={inputValue()}
          onInput={(e) => {
            setInputValue(e.currentTarget.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={props.field.placeholder || 'Type to add...'}
          class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Show when={showSuggestions() && availableSuggestions().length > 0}>
          <div class="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <For each={availableSuggestions().slice(0, 8)}>
              {(suggestion) => (
                <button
                  type="button"
                  onClick={() => addItem(suggestion)}
                  class="w-full px-3 py-2 text-left text-foreground hover:bg-muted"
                >
                  {suggestion}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

/**
 * Geolocation button that triggers location detection
 */
function GeolocationButton(props: {
  onLocationDetected: (result: GeolocationResult) => void;
  onError: (error: GeolocationError) => void;
}) {
  const [isLoading, setIsLoading] = createSignal(false);

  const handleClick = async () => {
    if (!isGeolocationSupported()) {
      props.onError({
        code: 'NOT_SUPPORTED',
        message: 'Geolocation is not supported by your browser',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await getCurrentLocation();
      props.onLocationDetected(result);
    } catch (error) {
      props.onError(error as GeolocationError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading() || !isGeolocationSupported()}
      class="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 disabled:bg-muted/50 disabled:text-muted-foreground text-foreground rounded-lg transition-colors"
    >
      <Show
        when={!isLoading()}
        fallback={
          <svg
            class="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </Show>
      {isLoading() ? 'Detecting...' : 'Use my location'}
    </button>
  );
}

/**
 * DynamicSubField - Individual field within a dynamic list item
 * This is a proper SolidJS component to preserve DOM identity on updates.
 */
function DynamicSubField(props: {
  subField: FormField;
  value: unknown;
  currencySymbol: string;
  onUpdate: (value: unknown) => void;
}) {
  return (
    <Switch>
      <Match when={props.subField.type === 'text'}>
        <input
          type="text"
          value={(props.value as string) || ''}
          onInput={(e) => props.onUpdate(e.currentTarget.value)}
          placeholder={props.subField.placeholder}
          required={props.subField.required}
          class="w-full px-2 py-1.5 bg-background border border-input rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm"
        />
      </Match>
      <Match when={props.subField.type === 'number'}>
        <div class="flex items-center gap-1">
          <input
            type="number"
            value={(props.value as number) || ''}
            onInput={(e) => props.onUpdate(parseInt(e.currentTarget.value, 10) || 0)}
            placeholder={props.subField.placeholder}
            min={props.subField.min}
            max={props.subField.max}
            required={props.subField.required}
            class="flex-1 px-2 py-1.5 bg-background border border-input rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm"
          />
          <Show when={props.subField.suffix}>
            <span class="text-muted-foreground text-xs">
              {props.subField.suffix === '$' ? props.currencySymbol : props.subField.suffix}
            </span>
          </Show>
        </div>
      </Match>
      <Match when={props.subField.type === 'select'}>
        <select
          value={(props.value as string) || ''}
          onChange={(e) => props.onUpdate(e.currentTarget.value)}
          required={props.subField.required}
          class="w-full px-2 py-1.5 bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm"
        >
          <option value="">Select...</option>
          <For each={props.subField.options}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </Match>
      {/* Default: text input */}
      <Match when={!['text', 'number', 'select', 'date'].includes(props.subField.type)}>
        <input
          type="text"
          value={(props.value as string) || ''}
          onInput={(e) => props.onUpdate(e.currentTarget.value)}
          placeholder={props.subField.placeholder}
          class="w-full px-2 py-1.5 bg-background border border-input rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm"
        />
      </Match>
    </Switch>
  );
}

/**
 * DynamicDatePair - Renders startDate and endDate with "Same day" checkbox between them
 */
function DynamicDatePair(props: {
  startDateField: FormField;
  endDateField: FormField;
  startValue: string;
  endValue: string;
  onUpdateStart: (value: string) => void;
  onUpdateEnd: (value: string) => void;
}) {
  /* eslint-disable solid/reactivity */
  const [sameDay, setSameDay] = createSignal(
    Boolean(props.startValue && props.startValue === props.endValue)
  );
  /* eslint-enable solid/reactivity */

  // When sameDay is toggled on, sync endDate to startDate
  const handleSameDayChange = (checked: boolean) => {
    setSameDay(checked);
    if (checked && props.startValue) {
      props.onUpdateEnd(props.startValue);
    }
  };

  // When startDate changes and sameDay is active, update endDate too
  const handleStartDateChange = (value: string) => {
    props.onUpdateStart(value);
    if (sameDay()) {
      props.onUpdateEnd(value);
    }
  };

  return (
    <>
      {/* Start date */}
      <div class="col-span-1">
        <label class="block text-xs text-muted-foreground mb-1">
          {props.startDateField.label}
          {props.startDateField.required && <span class="text-destructive ml-0.5">*</span>}
        </label>
        <input
          type="date"
          value={props.startValue || ''}
          onInput={(e) => handleStartDateChange(e.currentTarget.value)}
          required={props.startDateField.required}
          class="w-full px-2 py-1.5 bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm"
        />
      </div>

      {/* Same day checkbox - placed between dates */}
      <div class="col-span-2 flex items-center justify-center -my-1">
        <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          <input
            type="checkbox"
            checked={sameDay()}
            onChange={(e) => handleSameDayChange(e.currentTarget.checked)}
            class="w-3.5 h-3.5 rounded border-input accent-primary"
          />
          Same day event
        </label>
      </div>

      {/* End date */}
      <div class="col-span-1">
        <label class="block text-xs text-muted-foreground mb-1">
          {props.endDateField.label}
          {props.endDateField.required && <span class="text-destructive ml-0.5">*</span>}
        </label>
        <input
          type="date"
          value={props.endValue || ''}
          onInput={(e) => props.onUpdateEnd(e.currentTarget.value)}
          required={props.endDateField.required}
          disabled={sameDay()}
          class="w-full px-2 py-1.5 bg-background border border-input rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
    </>
  );
}

/**
 * DynamicListItem - A single item in the dynamic list
 * Proper component to preserve DOM identity and prevent re-renders.
 */
function DynamicListItem(props: {
  item: Record<string, unknown>;
  index: number;
  config: DynamicListFieldConfig;
  currencySymbol: string;
  onUpdate: (field: string, value: unknown) => void;
  onRemove: () => void;
}) {
  // Check if this config has startDate/endDate pair for the "Same day" feature
  const hasDatePair = () => {
    const fields = props.config.itemFields;
    return fields.some((f) => f.name === 'startDate') && fields.some((f) => f.name === 'endDate');
  };

  const getDateFields = () => {
    const startDate = props.config.itemFields.find((f) => f.name === 'startDate');
    const endDate = props.config.itemFields.find((f) => f.name === 'endDate');
    return { startDate, endDate };
  };

  // Non-date fields (or all fields if no date pair)
  const nonDateFields = () => {
    if (!hasDatePair()) {
      return props.config.itemFields;
    }
    return props.config.itemFields.filter((f) => f.name !== 'startDate' && f.name !== 'endDate');
  };

  return (
    <div class="p-3 bg-muted/50 rounded-lg border border-border space-y-2">
      <div class="flex justify-between items-center">
        <span class="text-xs text-muted-foreground font-medium">#{props.index + 1}</span>
        <button
          type="button"
          onClick={() => props.onRemove()}
          class="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
          title="Remove"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        {/* Render non-date fields */}
        <For each={nonDateFields()}>
          {(subField) => (
            <div class={subField.type === 'date' || subField.name === 'name' ? 'col-span-1' : ''}>
              <label class="block text-xs text-muted-foreground mb-1">
                {subField.label}
                {subField.required && <span class="text-destructive ml-0.5">*</span>}
              </label>
              <DynamicSubField
                subField={subField}
                value={props.item[subField.name]}
                currencySymbol={props.currencySymbol}
                onUpdate={(val) => props.onUpdate(subField.name, val)}
              />
            </div>
          )}
        </For>

        {/* Render date pair with "Same day" checkbox if applicable */}
        <Show when={hasDatePair()}>
          {(() => {
            const { startDate, endDate } = getDateFields();
            return (
              <Show when={startDate && endDate}>
                <DynamicDatePair
                  startDateField={startDate!}
                  endDateField={endDate!}
                  startValue={(props.item.startDate as string) || ''}
                  endValue={(props.item.endDate as string) || ''}
                  onUpdateStart={(val) => props.onUpdate('startDate', val)}
                  onUpdateEnd={(val) => props.onUpdate('endDate', val)}
                />
              </Show>
            );
          })()}
        </Show>
      </div>
    </div>
  );
}

/**
 * Dynamic List Field for multi-item inputs (events, inventory, trades)
 * Uses createStore + Index for fine-grained reactivity without DOM recreation.
 */
function DynamicListField(props: {
  field: FormField;
  items: Array<Record<string, unknown>>;
  onChange: (items: Array<Record<string, unknown>>) => void;
  currencySymbol: string;
}) {
  const config = () => props.field.config as DynamicListFieldConfig;

  // Use a store for fine-grained reactivity
  // eslint-disable-next-line solid/reactivity
  const [items, setItems] = createStore<Array<Record<string, unknown>>>(props.items);

  // Track if we should sync from props (for external changes)
  let skipSync = false;

  // Sync store to parent onChange
  createEffect(() => {
    if (!skipSync) {
      // Convert store back to plain array for parent
      const plainArray = items.map((item) => ({ ...item }));
      props.onChange(plainArray);
    }
    skipSync = false;
  });

  // Sync from props when initialValues change (e.g., form reset)
  createEffect(() => {
    const propsItems = props.items;
    // Only sync if lengths differ or it's a complete reset
    if (propsItems.length !== items.length) {
      skipSync = true;
      setItems(propsItems);
    }
  });

  const addItem = () => {
    const cfg = config();
    if (cfg.maxItems && items.length >= cfg.maxItems) return;

    const emptyItem: Record<string, unknown> = { id: `item_${Date.now()}` };
    cfg.itemFields.forEach((f) => {
      emptyItem[f.name] = '';
    });
    setItems(produce((draft) => draft.push(emptyItem)));
  };

  const removeItem = (index: number) => {
    setItems(produce((draft) => draft.splice(index, 1)));
  };

  const updateItem = (index: number, fieldName: string, value: unknown) => {
    // Fine-grained update - only changes the specific field
    setItems(index, fieldName, value);
  };

  return (
    <div class="space-y-3">
      {/* List of items using Index for stable identity by index */}
      <Index each={items}>
        {(item, index) => (
          <DynamicListItem
            item={item()}
            index={index}
            config={config()}
            currencySymbol={props.currencySymbol}
            onUpdate={(field, val) => updateItem(index, field, val)}
            onRemove={() => removeItem(index)}
          />
        )}
      </Index>

      {/* Add button */}
      <button
        type="button"
        onClick={addItem}
        disabled={(() => {
          const max = config().maxItems;
          return max != null && items.length >= max;
        })()}
        class="w-full px-3 py-2 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        {config().addLabel}
      </button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function OnboardingFormStep(props: OnboardingFormStepProps) {
  const [formData, setFormData] = createSignal<Record<string, unknown>>({});
  const [geoError, setGeoError] = createSignal<string | null>(null);
  const [detectedLocation, setDetectedLocation] = createSignal<{
    city: string;
    coordinates: MapCoordinates;
  } | null>(null);
  const [showMapPicker, setShowMapPicker] = createSignal(false);

  // Get form config for current step
  const config = () => getStepFormConfig(props.step);

  // Initialize form data from props
  createEffect(() => {
    if (props.initialValues) {
      setFormData({ ...props.initialValues });
    }
  });

  // Update a single field
  const updateField = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    props.onSubmit(formData());
  };

  // Handle geolocation result
  const handleLocationDetected = (result: GeolocationResult) => {
    setGeoError(null);
    updateField('city', result.city);
    if (result.currency) {
      updateField('currency', result.currency);
    }
    // Store coordinates for map picker
    setDetectedLocation({
      city: result.city,
      coordinates: {
        latitude: result.coordinates.latitude,
        longitude: result.coordinates.longitude,
      },
    });
    // Store coordinates in form data
    updateField('coordinates', result.coordinates);
    // Show the map picker
    setShowMapPicker(true);
  };

  // Handle map coordinates change
  const handleMapCoordinatesChange = (coords: MapCoordinates) => {
    updateField('coordinates', coords);
  };

  // Handle geolocation error
  const handleGeoError = (error: GeolocationError) => {
    setGeoError(error.message);
  };

  // Get currency symbol
  const currencySymbol = () => props.currencySymbol || '$';

  // Render individual field
  const renderField = (field: FormField) => {
    const value = () => formData()[field.name];

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value() as string) || ''}
            onInput={(e) => updateField(field.name, e.currentTarget.value)}
            placeholder={field.placeholder}
            required={field.required}
            class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        );

      case 'number':
        return (
          <div class="flex items-center gap-2">
            <Show when={field.suffix?.startsWith(currencySymbol())}>
              <span class="text-muted-foreground">{currencySymbol()}</span>
            </Show>
            <input
              type="number"
              value={(value() as number) || ''}
              onInput={(e) => updateField(field.name, parseInt(e.currentTarget.value, 10) || 0)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              required={field.required}
              class="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Show when={field.suffix}>
              <span class="text-muted-foreground text-sm">{field.suffix}</span>
            </Show>
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            value={(value() as string) || ''}
            onInput={(e) => updateField(field.name, e.currentTarget.value)}
            required={field.required}
            class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        );

      case 'select':
      case 'currency-select':
        return (
          <select
            value={(value() as string) || ''}
            onChange={(e) => updateField(field.name, e.currentTarget.value)}
            required={field.required}
            class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select...</option>
            <For each={field.options}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        );

      case 'autocomplete':
        return (
          <AutocompleteInput
            field={field}
            value={(value() as string) || ''}
            onChange={(v) => updateField(field.name, v)}
            onSelect={(v) => updateField(field.name, v)}
          />
        );

      case 'multi-select-pills':
        return (
          <MultiSelectPills
            field={field}
            selected={(value() as string[]) || []}
            onChange={(v) => updateField(field.name, v)}
          />
        );

      case 'dynamic-list':
        return (
          <DynamicListField
            field={field}
            items={(value() as Array<Record<string, unknown>>) || []}
            onChange={(items) => updateField(field.name, items)}
            currencySymbol={currencySymbol()}
          />
        );

      default:
        return (
          <input
            type="text"
            value={(value() as string) || ''}
            onInput={(e) => updateField(field.name, e.currentTarget.value)}
            placeholder={field.placeholder}
            class="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        );
    }
  };

  return (
    <Show when={config()} fallback={null}>
      {(cfg) => (
        <form onSubmit={handleSubmit} class="space-y-4 bg-card rounded-lg p-4 border border-border">
          <For each={cfg().fields}>
            {(field) => (
              <div class="space-y-1">
                <label class="block text-sm font-medium text-foreground">
                  {field.label}
                  {field.required && <span class="text-destructive ml-1">*</span>}
                </label>
                {renderField(field)}
              </div>
            )}
          </For>

          {/* Geolocation button for greeting step */}
          <Show when={props.step === 'greeting'}>
            <div class="flex flex-col gap-3">
              <GeolocationButton
                onLocationDetected={handleLocationDetected}
                onError={handleGeoError}
              />
              <Show when={geoError()}>
                <p class="text-sm text-amber-500">{geoError()}</p>
              </Show>

              {/* Map picker after geolocation detection */}
              <Show when={showMapPicker() && detectedLocation()}>
                {(location) => (
                  <MapPicker
                    initialCoordinates={location().coordinates}
                    cityName={location().city}
                    onCoordinatesChange={handleMapCoordinatesChange}
                    height="180px"
                  />
                )}
              </Show>
            </div>
          </Show>

          {/* Help text */}
          <Show when={cfg().helpText}>
            <p class="text-xs text-muted-foreground">{cfg().helpText}</p>
          </Show>

          {/* Submit button */}
          <button
            type="submit"
            class="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
          >
            Continue
          </button>
        </form>
      )}
    </Show>
  );
}
