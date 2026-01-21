/**
 * OnboardingFormStep Component
 *
 * Renders contextual form fields for each onboarding step.
 * Supports autocomplete, multi-select pills, geolocation, and more.
 */

import { createSignal, For, Show, createEffect } from 'solid-js';
import type { OnboardingStep } from '../../lib/chat/types';
import { getStepFormConfig, type FormField } from '../../lib/chat/stepForms';
import {
  getCurrentLocation,
  isGeolocationSupported,
  type GeolocationResult,
  type GeolocationError,
} from '../../lib/geolocation';

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
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Show when={showSuggestions() && filteredSuggestions().length > 0}>
        <div class="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <For each={filteredSuggestions()}>
            {(suggestion) => (
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                class="w-full px-3 py-2 text-left text-white hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg"
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
              <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-sm rounded-full">
                {item}
                <button type="button" onClick={() => removeItem(item)} class="hover:text-red-300">
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
          class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Show when={showSuggestions() && availableSuggestions().length > 0}>
          <div class="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <For each={availableSuggestions().slice(0, 8)}>
              {(suggestion) => (
                <button
                  type="button"
                  onClick={() => addItem(suggestion)}
                  class="w-full px-3 py-2 text-left text-white hover:bg-slate-700"
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
      class="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg transition-colors"
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

// =============================================================================
// Main Component
// =============================================================================

export default function OnboardingFormStep(props: OnboardingFormStepProps) {
  const [formData, setFormData] = createSignal<Record<string, unknown>>({});
  const [geoError, setGeoError] = createSignal<string | null>(null);

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
            class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );

      case 'number':
        return (
          <div class="flex items-center gap-2">
            <Show when={field.suffix?.startsWith(currencySymbol())}>
              <span class="text-slate-400">{currencySymbol()}</span>
            </Show>
            <input
              type="number"
              value={(value() as number) || ''}
              onInput={(e) => updateField(field.name, parseInt(e.currentTarget.value, 10) || 0)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              required={field.required}
              class="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Show when={field.suffix}>
              <span class="text-slate-400 text-sm">{field.suffix}</span>
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
            class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );

      case 'select':
      case 'currency-select':
        return (
          <select
            value={(value() as string) || ''}
            onChange={(e) => updateField(field.name, e.currentTarget.value)}
            required={field.required}
            class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      default:
        return (
          <input
            type="text"
            value={(value() as string) || ''}
            onInput={(e) => updateField(field.name, e.currentTarget.value)}
            placeholder={field.placeholder}
            class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  return (
    <Show when={config()} fallback={null}>
      {(cfg) => (
        <form
          onSubmit={handleSubmit}
          class="space-y-4 bg-slate-900/50 rounded-lg p-4 border border-slate-700"
        >
          <For each={cfg().fields}>
            {(field) => (
              <div class="space-y-1">
                <label class="block text-sm font-medium text-slate-300">
                  {field.label}
                  {field.required && <span class="text-red-400 ml-1">*</span>}
                </label>
                {renderField(field)}
              </div>
            )}
          </For>

          {/* Geolocation button for greeting step */}
          <Show when={props.step === 'greeting'}>
            <div class="flex flex-col gap-2">
              <GeolocationButton
                onLocationDetected={handleLocationDetected}
                onError={handleGeoError}
              />
              <Show when={geoError()}>
                <p class="text-sm text-amber-400">{geoError()}</p>
              </Show>
            </div>
          </Show>

          {/* Help text */}
          <Show when={cfg().helpText}>
            <p class="text-xs text-slate-400">{cfg().helpText}</p>
          </Show>

          {/* Submit button */}
          <button
            type="submit"
            class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Continue
          </button>
        </form>
      )}
    </Show>
  );
}
