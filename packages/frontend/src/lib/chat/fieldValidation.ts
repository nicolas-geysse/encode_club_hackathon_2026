/**
 * Field Validation Module
 *
 * Detects sensitive profile field changes and validates field values.
 * Part of Bruno Chat 2.0 - Coach Financier Intelligent (Checkpoint B.1)
 *
 * Sensitive fields require user confirmation before being applied to prevent
 * accidental profile modifications (e.g., typos being interpreted as name changes).
 */

// =============================================================================
// Sensitive Fields Definition
// =============================================================================

/**
 * Fields that require user confirmation before being updated.
 * These are core identity fields that are unlikely to change frequently.
 */
export const SENSITIVE_FIELDS = ['name', 'city', 'diploma', 'field'] as const;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

/**
 * Human-readable labels for sensitive fields
 */
export const FIELD_LABELS: Record<SensitiveField, string> = {
  name: 'name',
  city: 'city',
  diploma: 'education level',
  field: 'field of study',
};

// =============================================================================
// Field Change Detection
// =============================================================================

export interface FieldChange {
  field: SensitiveField;
  oldValue: string;
  newValue: string;
}

/**
 * Profile type for change detection (minimal interface)
 */
export interface ProfileSnapshot {
  name?: string;
  city?: string;
  diploma?: string;
  field?: string;
}

/**
 * Detects if extracted data contains changes to sensitive profile fields.
 *
 * @param extracted - Data extracted from user message by LLM
 * @param current - Current profile state
 * @returns The first detected sensitive change, or null if none
 *
 * @example
 * ```ts
 * const change = detectSensitiveChanges(
 *   { name: 'Mqst' },
 *   { name: 'Nicolas', city: 'Paris' }
 * );
 * // Returns: { field: 'name', oldValue: 'Nicolas', newValue: 'Mqst' }
 * ```
 */
export function detectSensitiveChanges(
  extracted: Record<string, unknown>,
  current: ProfileSnapshot
): FieldChange | null {
  for (const field of SENSITIVE_FIELDS) {
    const newValue = extracted[field];
    const oldValue = current[field];

    // Skip if field not in extracted data
    if (newValue === undefined || newValue === null) continue;

    // Skip if new value is empty
    const newValueStr = String(newValue).trim();
    if (!newValueStr) continue;

    // Skip if no old value (initial setup, not a change)
    if (!oldValue || !oldValue.trim()) continue;

    // Skip if values are the same (case-insensitive for strings)
    if (newValueStr.toLowerCase() === oldValue.toLowerCase()) continue;

    // Detected a change to a sensitive field
    return {
      field,
      oldValue: oldValue.trim(),
      newValue: newValueStr,
    };
  }

  return null;
}

// =============================================================================
// Field Value Validation
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a field value for format and sanity checks.
 * These are basic checks to catch obvious typos or invalid input.
 *
 * @param field - The field being validated
 * @param value - The value to validate
 * @returns Validation result with optional error message
 */
export function validateFieldChange(field: SensitiveField, value: string): ValidationResult {
  const trimmed = value.trim();

  switch (field) {
    case 'name':
      // Name validation: 2+ chars, only letters and common name characters
      if (trimmed.length < 2) {
        return { valid: false, error: 'Name must be at least 2 characters' };
      }
      // Allow letters (including accented), spaces, hyphens, and apostrophes
      if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
        return { valid: false, error: 'Name contains invalid characters' };
      }
      // Check for suspicious patterns (likely typos)
      if (/^[^aeiouAEIOUÀ-ÿ]{4,}$/i.test(trimmed)) {
        return { valid: false, error: 'This looks like a typo' };
      }
      return { valid: true };

    case 'city':
      // City validation: 2+ chars, letters and common city name characters
      if (trimmed.length < 2) {
        return { valid: false, error: 'City name must be at least 2 characters' };
      }
      // Allow letters, spaces, hyphens (e.g., "Saint-Denis", "New York")
      if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
        return { valid: false, error: 'City name contains invalid characters' };
      }
      return { valid: true };

    case 'diploma':
      // Diploma validation: reasonable length
      if (trimmed.length < 2) {
        return { valid: false, error: 'Education level must be at least 2 characters' };
      }
      return { valid: true };

    case 'field':
      // Field of study validation: reasonable length
      if (trimmed.length < 2) {
        return { valid: false, error: 'Field of study must be at least 2 characters' };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Checks if a value looks like a typo based on common patterns.
 * Used for extra confirmation on suspicious inputs.
 *
 * @param value - The value to check
 * @returns true if the value looks suspicious
 */
export function looksLikeTypo(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  // Too short (single character that's not a valid abbreviation)
  if (trimmed.length === 1) return true;

  // No vowels at all (except for very short strings)
  if (trimmed.length >= 4 && !/[aeiouàâäéèêëïîôùûüÿæœ]/i.test(trimmed)) {
    return true;
  }

  // Too many consecutive consonants (more than 4)
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(trimmed)) {
    return true;
  }

  // Keyboard mash patterns (qwerty sequences)
  const keyboardPatterns = [
    'qwer',
    'asdf',
    'zxcv',
    'uiop',
    'hjkl',
    'bnm',
    'qaz',
    'wsx',
    'edc',
    'rfv',
    'tgb',
    'yhn',
    'ujm',
    'azer',
    'qsdf',
  ];
  if (keyboardPatterns.some((pattern) => trimmed.includes(pattern))) {
    return true;
  }

  return false;
}
