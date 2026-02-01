/**
 * Location Privacy Utilities
 *
 * FERPA/GDPR-compliant location handling utilities.
 * Ensures no raw GPS coordinates are stored or logged.
 *
 * Privacy approach:
 * - Fuzzy coordinates: Round to 2 decimal places (~1.1km precision)
 * - PII sanitization: Replace raw coordinates in logs/traces
 * - Detection helpers: Identify unsanitized coordinate values
 *
 * @see https://en.wikipedia.org/wiki/FERPA - US student privacy law
 * @see https://gdpr.eu/what-is-gdpr/ - EU privacy regulation
 */

// =============================================================================
// Types
// =============================================================================

export interface FuzzyCoordinates {
  latitude: number;
  longitude: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Placeholder value for redacted location data in logs and traces.
 * Used to ensure no raw coordinates appear in observability systems.
 */
export const PRIVACY_PLACEHOLDER = '[LOCATION_REDACTED]' as const;

/**
 * Keys that may contain location PII and should be sanitized.
 * Case-insensitive matching is used.
 */
const LOCATION_PII_KEYS = ['latitude', 'longitude', 'lat', 'lon', 'coords', 'coordinates'] as const;

// =============================================================================
// Fuzzy Coordinate Functions
// =============================================================================

/**
 * Convert precise GPS coordinates to fuzzy coordinates.
 *
 * Rounding to 2 decimal places provides ~1.1km precision at the equator.
 * This is sufficient for city-level job matching while protecting
 * user privacy (no street-level tracking).
 *
 * Formula: 0.01 degree = ~1.11km at equator
 *
 * @example
 * fuzzyCoordinates(48.8566, 2.3522) // Paris
 * // Returns: { latitude: 48.86, longitude: 2.35 }
 *
 * @param lat - Raw latitude from GPS
 * @param lon - Raw longitude from GPS
 * @returns Coordinates rounded to 2 decimal places
 */
export function fuzzyCoordinates(lat: number, lon: number): FuzzyCoordinates {
  return {
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lon * 100) / 100,
  };
}

// =============================================================================
// PII Sanitization
// =============================================================================

/**
 * Check if a key name is a known location PII field.
 *
 * @param key - Object key to check
 * @returns true if key matches a location PII pattern
 */
function isLocationPIIKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return LOCATION_PII_KEYS.some((piiKey) => lowerKey === piiKey || lowerKey.includes(piiKey));
}

/**
 * Recursively sanitize location PII from an object.
 *
 * Replaces values of known location keys with PRIVACY_PLACEHOLDER.
 * Safe for logging and Opik traces.
 *
 * @example
 * sanitizeLocationPII({ user: 'Alice', latitude: 48.8566, longitude: 2.3522 })
 * // Returns: { user: 'Alice', latitude: '[LOCATION_REDACTED]', longitude: '[LOCATION_REDACTED]' }
 *
 * @example
 * sanitizeLocationPII({ nested: { coords: { lat: 48.85, lon: 2.35 } } })
 * // Returns: { nested: { coords: '[LOCATION_REDACTED]' } }
 *
 * @param data - Object that may contain location PII
 * @returns Deep clone with location fields replaced by placeholder
 */
export function sanitizeLocationPII(data: Record<string, unknown>): Record<string, unknown> {
  // Deep clone to avoid mutating original
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isLocationPIIKey(key)) {
      // Replace known location keys with placeholder
      result[key] = PRIVACY_PLACEHOLDER;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      result[key] = sanitizeLocationPII(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Handle arrays: sanitize each object element
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object'
          ? sanitizeLocationPII(item as Record<string, unknown>)
          : item
      );
    } else {
      // Copy primitive values as-is
      result[key] = value;
    }
  }

  return result;
}

// =============================================================================
// Detection Helpers
// =============================================================================

/**
 * Check if a coordinate value appears to be raw (unsanitized).
 *
 * Raw coordinates have more than 2 decimal places.
 * Used to detect potential privacy violations in logging/storage.
 *
 * @example
 * isRawCoordinate(48.8566) // true - 4 decimal places
 * isRawCoordinate(48.86)   // false - 2 decimal places (fuzzy)
 * isRawCoordinate(48)      // false - no decimal places
 *
 * @param value - Numeric coordinate value to check
 * @returns true if coordinate has more than 2 decimal places
 */
export function isRawCoordinate(value: number): boolean {
  // Convert to string and check decimal places
  const str = value.toString();
  const decimalIndex = str.indexOf('.');

  if (decimalIndex === -1) {
    // No decimal point - not a raw coordinate
    return false;
  }

  const decimalPlaces = str.length - decimalIndex - 1;
  return decimalPlaces > 2;
}
