/**
 * Geolocation Utility
 *
 * Provides browser geolocation and reverse geocoding via OpenStreetMap Nominatim.
 * Used for auto-detecting user's city during onboarding.
 *
 * Rate limiting: Nominatim has a 1 req/sec limit for non-commercial use.
 * @see https://nominatim.org/release-docs/develop/api/Reverse/
 */

// =============================================================================
// Types
// =============================================================================

export interface GeolocationResult {
  city: string;
  country: string;
  countryCode: string;
  /** Full address from reverse geocoding */
  address?: string;
  /** Auto-detected currency based on location */
  currency?: 'USD' | 'EUR' | 'GBP';
  /** Raw coordinates */
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface GeolocationError {
  code:
    | 'PERMISSION_DENIED'
    | 'POSITION_UNAVAILABLE'
    | 'TIMEOUT'
    | 'NOMINATIM_ERROR'
    | 'NOT_SUPPORTED';
  message: string;
}

export type GeolocationCallback = (
  result: GeolocationResult | null,
  error: GeolocationError | null
) => void;

// =============================================================================
// Constants
// =============================================================================

/**
 * Country codes that use EUR
 */
const EUR_COUNTRIES = [
  'FR',
  'DE',
  'IT',
  'ES',
  'PT',
  'NL',
  'BE',
  'AT',
  'IE',
  'FI',
  'GR',
  'SK',
  'SI',
  'EE',
  'LV',
  'LT',
  'MT',
  'CY',
  'LU',
];

/**
 * Country codes that use GBP
 */
const GBP_COUNTRIES = ['GB', 'UK'];

/**
 * Country codes that use USD (or where USD is commonly used)
 */
const USD_COUNTRIES = ['US', 'CA', 'AU', 'NZ', 'SG', 'HK'];

/**
 * Detect currency from country code
 */
function detectCurrencyFromCountry(countryCode: string): 'USD' | 'EUR' | 'GBP' | undefined {
  const code = countryCode.toUpperCase();
  if (EUR_COUNTRIES.includes(code)) return 'EUR';
  if (GBP_COUNTRIES.includes(code)) return 'GBP';
  if (USD_COUNTRIES.includes(code)) return 'USD';
  return undefined;
}

// =============================================================================
// Nominatim Reverse Geocoding
// =============================================================================

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    country_code?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
  };
  display_name?: string;
}

/**
 * Reverse geocode coordinates to city name using OpenStreetMap Nominatim
 * @param lat Latitude
 * @param lon Longitude
 */
async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{
  city: string;
  country: string;
  countryCode: string;
  address?: string;
} | null> {
  try {
    // Use zoom=18 for more precise address details
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'Stride-Financial-Coach/1.0 (educational project)',
        },
      }
    );

    if (!response.ok) {
      console.warn('[Geolocation] Nominatim request failed:', response.status);
      return null;
    }

    const data: NominatimResponse = await response.json();

    if (!data.address) {
      console.warn('[Geolocation] No address in Nominatim response');
      return null;
    }

    // Extract city name - try different fields
    const city =
      data.address.city ||
      data.address.town ||
      data.address.village ||
      data.address.municipality ||
      data.address.state ||
      'Unknown';

    // Build address string from components
    const addressParts: string[] = [];
    if (data.address.house_number) addressParts.push(data.address.house_number);
    if (data.address.road) addressParts.push(data.address.road);
    if (data.address.postcode) addressParts.push(data.address.postcode);
    if (city !== 'Unknown') addressParts.push(city);

    const address = addressParts.length > 0 ? addressParts.join(', ') : data.display_name;

    return {
      city,
      country: data.address.country || 'Unknown',
      countryCode: (data.address.country_code || '').toUpperCase(),
      address,
    };
  } catch (error) {
    console.warn('[Geolocation] Reverse geocoding failed:', error);
    return null;
  }
}

// =============================================================================
// Browser Geolocation API
// =============================================================================

/**
 * Check if geolocation is supported in the current browser
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Get current position using browser Geolocation API
 * Returns a promise that resolves with GeolocationResult or rejects with GeolocationError
 */
export function getCurrentLocation(): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({
        code: 'NOT_SUPPORTED',
        message: 'Geolocation is not supported by your browser',
      } as GeolocationError);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // Reverse geocode to get city name
        const location = await reverseGeocode(latitude, longitude);

        if (!location) {
          reject({
            code: 'NOMINATIM_ERROR',
            message: 'Could not determine your city from coordinates',
          } as GeolocationError);
          return;
        }

        const currency = detectCurrencyFromCountry(location.countryCode);

        resolve({
          city: location.city,
          country: location.country,
          countryCode: location.countryCode,
          address: location.address,
          currency,
          coordinates: { latitude, longitude },
        });
      },
      (error) => {
        let errorCode: GeolocationError['code'];
        let message: string;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorCode = 'PERMISSION_DENIED';
            message = 'Location access was denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorCode = 'POSITION_UNAVAILABLE';
            message = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorCode = 'TIMEOUT';
            message = 'Location request timed out.';
            break;
          default:
            errorCode = 'POSITION_UNAVAILABLE';
            message = 'An unknown error occurred.';
        }

        reject({ code: errorCode, message } as GeolocationError);
      },
      {
        enableHighAccuracy: false, // False = faster, less battery
        timeout: 10000, // 10 seconds
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  });
}

/**
 * Get current location with callback (non-Promise API)
 * Useful for SolidJS reactive patterns
 */
export function getCurrentLocationWithCallback(callback: GeolocationCallback): void {
  getCurrentLocation()
    .then((result) => callback(result, null))
    .catch((error) => callback(null, error));
}
