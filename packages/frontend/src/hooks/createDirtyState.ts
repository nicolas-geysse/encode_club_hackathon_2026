/**
 * Dirty State Hook
 *
 * Tracks whether form values have changed from their original state.
 * Used to show "unsaved changes" warnings before navigating away or canceling.
 */

import { createSignal, createMemo, type Accessor } from 'solid-js';

export interface DirtyStateConfig<T> {
  /** Function that returns the current form values */
  getCurrentValues: () => T;
  /** Custom equality function (defaults to JSON.stringify comparison) */
  isEqual?: (a: T, b: T) => boolean;
}

export interface DirtyStateResult<T> {
  /** Whether the current values differ from the original */
  isDirty: Accessor<boolean>;
  /** Set the original values (call when form opens or after save) */
  setOriginal: (values?: T) => void;
  /** Get the original values (for restoring on cancel) */
  getOriginal: () => T | undefined;
  /** Clear the original values (form closed) */
  clear: () => void;
}

/**
 * Creates a dirty state tracker for form values.
 *
 * @example
 * ```ts
 * const { isDirty, setOriginal, getOriginal, clear } = createDirtyState({
 *   getCurrentValues: () => ({
 *     name: name(),
 *     amount: amount(),
 *   }),
 * });
 *
 * // When opening form for edit:
 * setOriginal(); // Captures current values
 *
 * // When opening form for new item:
 * setOriginal({ name: '', amount: 0 }); // Set explicit initial state
 *
 * // Check if dirty:
 * if (isDirty()) { ... }
 *
 * // On cancel, restore original:
 * const orig = getOriginal();
 * if (orig) {
 *   setName(orig.name);
 *   setAmount(orig.amount);
 * }
 *
 * // After save or close:
 * clear();
 * ```
 */
export function createDirtyState<T>(config: DirtyStateConfig<T>): DirtyStateResult<T> {
  const [original, setOriginalInternal] = createSignal<T | undefined>(undefined);

  const isEqual = config.isEqual || ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));

  const isDirty = createMemo(() => {
    const orig = original();
    if (orig === undefined) return false;
    return !isEqual(orig, config.getCurrentValues());
  });

  const setOriginal = (values?: T) => {
    // If no values provided, capture current state
    const captured = values !== undefined ? values : config.getCurrentValues();
    // Use function form to avoid TypeScript issue with generic T potentially being a function
    setOriginalInternal(() => captured);
  };

  const getOriginal = () => original();

  const clear = () => {
    setOriginalInternal(undefined);
  };

  return { isDirty, setOriginal, getOriginal, clear };
}
