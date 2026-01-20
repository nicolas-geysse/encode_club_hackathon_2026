/**
 * Array Merge Utilities
 *
 * Step-aware array merging for onboarding and data collection flows.
 * Handles complex merging scenarios based on which step the data comes from.
 */

/**
 * Step-aware array merging for onboarding flows.
 *
 * Behavior:
 * - undefined incoming -> keep existing
 * - empty array at step for this field -> user said "none" (clear)
 * - empty array at other step -> ignore (keep existing)
 * - non-empty array -> merge with deduplication
 *
 * @param existing - Current array value
 * @param incoming - New array value from extraction
 * @param currentStep - The step where this extraction happened
 * @param stepForField - The step that should collect this field
 * @returns Merged array or undefined
 */
export function smartMergeArrays<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  currentStep: string,
  stepForField: string
): T[] | undefined {
  // If incoming is undefined, keep existing
  if (incoming === undefined) return existing;

  // If empty array AND at the step that collects this field -> user said "none"
  if (incoming.length === 0 && currentStep === stepForField) {
    return [];
  }

  // If empty array but not at this step -> keep existing
  if (incoming.length === 0) return existing;

  // Non-empty array: merge with existing
  if (!existing || existing.length === 0) return incoming;

  // For strings: use Set for deduplication
  if (typeof incoming[0] === 'string') {
    return [...new Set([...(existing as string[]), ...(incoming as string[])])] as T[];
  }

  // For objects: merge by name field with deduplication
  return mergeObjectsByName(existing, incoming);
}

/**
 * Merge arrays of objects, deduplicating by 'name' field
 *
 * @param existing - Existing array of objects
 * @param incoming - Incoming array of objects
 * @returns Merged array with duplicates removed
 */
function mergeObjectsByName<T>(existing: T[], incoming: T[]): T[] {
  const merged = [...existing];

  for (const item of incoming) {
    const itemName = (item as { name?: string }).name;
    if (itemName) {
      const existsIdx = merged.findIndex((e) => (e as { name?: string }).name === itemName);
      if (existsIdx === -1) {
        merged.push(item);
      }
    } else {
      // No name field, just append
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Generic array merge by a key field
 *
 * @param existing - Existing array
 * @param incoming - Incoming array
 * @param keyField - The field to use for deduplication
 * @returns Merged array with duplicates by key removed
 */
export function mergeArraysByKey<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  keyField: keyof T
): T[] {
  if (!incoming || incoming.length === 0) return existing || [];
  if (!existing || existing.length === 0) return incoming;

  const merged = [...existing];

  for (const item of incoming) {
    const existsIdx = merged.findIndex((e) => e[keyField] === item[keyField]);
    if (existsIdx === -1) {
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Simple array merge with deduplication (for primitive types)
 *
 * @param existing - Existing array
 * @param incoming - Incoming array
 * @returns Merged and deduplicated array
 */
export function mergeArraysUnique<T>(existing: T[] | undefined, incoming: T[] | undefined): T[] {
  if (!incoming || incoming.length === 0) return existing || [];
  if (!existing || existing.length === 0) return incoming;

  // Use Set for deduplication
  return [...new Set([...existing, ...incoming])];
}

/**
 * Merge arrays, keeping the latest value for duplicates
 *
 * @param existing - Existing array of objects
 * @param incoming - Incoming array of objects
 * @param keyField - Field to use as unique identifier
 * @returns Merged array where incoming overrides existing for same key
 */
export function mergeArraysOverwrite<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  keyField: keyof T
): T[] {
  if (!incoming || incoming.length === 0) return existing || [];
  if (!existing || existing.length === 0) return incoming;

  // Create a map for quick lookup
  const map = new Map<unknown, T>();

  // Add existing items
  for (const item of existing) {
    map.set(item[keyField], item);
  }

  // Overwrite with incoming items
  for (const item of incoming) {
    map.set(item[keyField], item);
  }

  return Array.from(map.values());
}

/**
 * Create a step-aware merge function for a specific field
 *
 * @param stepForField - The step that collects this field
 * @returns A function that merges arrays based on current step
 */
export function createStepAwareMerger<T>(stepForField: string) {
  return (
    existing: T[] | undefined,
    incoming: T[] | undefined,
    currentStep: string
  ): T[] | undefined => {
    return smartMergeArrays(existing, incoming, currentStep, stepForField);
  };
}
