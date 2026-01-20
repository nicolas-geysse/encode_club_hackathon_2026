/**
 * City/Currency Detection Utilities
 *
 * Detects city size and currency based on city name.
 * Supports UK, France, US, and major European cities.
 */

// City lists by region
export const CITY_LISTS = {
  uk: [
    'london',
    'manchester',
    'birmingham',
    'edinburgh',
    'glasgow',
    'liverpool',
    'bristol',
    'leeds',
    'sheffield',
    'cardiff',
    'belfast',
    'newcastle',
    'nottingham',
    'southampton',
    'portsmouth',
    'oxford',
    'cambridge',
    'brighton',
    'reading',
    'leicester',
    'coventry',
  ],
  france: [
    'paris',
    'lyon',
    'marseille',
    'toulouse',
    'nice',
    'nantes',
    'strasbourg',
    'montpellier',
    'bordeaux',
    'lille',
    'rennes',
    'reims',
    'tours',
    'grenoble',
    'dijon',
    'angers',
    'nimes',
    'aix-en-provence',
    'saint-etienne',
    'le havre',
    'clermont-ferrand',
    'toulon',
    'limoges',
    'amiens',
    'perpignan',
    'brest',
    'metz',
    'besancon',
    'orleans',
    'rouen',
    'mulhouse',
    'caen',
    'nancy',
  ],
  us: [
    'new york',
    'los angeles',
    'chicago',
    'houston',
    'phoenix',
    'philadelphia',
    'san antonio',
    'san diego',
    'dallas',
    'san jose',
    'austin',
    'san francisco',
    'seattle',
    'denver',
    'boston',
    'washington',
    'miami',
    'atlanta',
  ],
  europe: [
    'berlin',
    'madrid',
    'rome',
    'amsterdam',
    'brussels',
    'vienna',
    'prague',
    'warsaw',
    'budapest',
    'lisbon',
    'dublin',
    'copenhagen',
    'stockholm',
    'oslo',
    'helsinki',
    'athens',
    'barcelona',
    'milan',
    'munich',
    'zurich',
    'geneva',
    'rotterdam',
  ],
};

// Indicators for small cities/rural areas
export const SMALL_CITY_INDICATORS = [
  'village',
  'campagne',
  'rural',
  'town',
  'hamlet',
  'countryside',
];

// Types
export type CitySize = 'small' | 'medium' | 'large';
export type Currency = 'USD' | 'EUR' | 'GBP';

/**
 * Get all big cities combined (for quick lookup)
 */
function getAllBigCities(): string[] {
  return [...CITY_LISTS.uk, ...CITY_LISTS.france, ...CITY_LISTS.us, ...CITY_LISTS.europe];
}

/**
 * Detect city size based on city name
 *
 * @param city - City name to check
 * @returns 'large' for known big cities, 'small' for rural indicators, 'medium' otherwise
 */
export function detectCitySize(city: string): CitySize {
  const cityLower = city.toLowerCase();
  const allBigCities = getAllBigCities();

  // Check if it's a known big city
  if (allBigCities.some((c) => cityLower.includes(c))) {
    return 'large';
  }

  // Check for small city/rural indicators
  if (SMALL_CITY_INDICATORS.some((c) => cityLower.includes(c))) {
    return 'small';
  }

  // Default to medium
  return 'medium';
}

/**
 * Detect currency based on city/region
 *
 * @param city - City name to check
 * @returns Currency code (GBP, EUR, USD) or undefined if not detected
 */
export function detectCurrencyFromCity(city: string): Currency | undefined {
  const cityLower = city.toLowerCase();

  // UK cities -> GBP
  if (CITY_LISTS.uk.some((c) => cityLower.includes(c))) {
    return 'GBP';
  }

  // French cities -> EUR
  if (CITY_LISTS.france.some((c) => cityLower.includes(c))) {
    return 'EUR';
  }

  // Other European cities -> EUR
  if (CITY_LISTS.europe.some((c) => cityLower.includes(c))) {
    return 'EUR';
  }

  // US cities -> USD
  if (CITY_LISTS.us.some((c) => cityLower.includes(c))) {
    return 'USD';
  }

  // Unknown
  return undefined;
}

/**
 * Detect both city size and currency from city name
 *
 * @param city - City name to check
 * @returns Object with size and optional currency
 */
export function detectCityMetadata(city: string): {
  size: CitySize;
  currency?: Currency;
} {
  return {
    size: detectCitySize(city),
    currency: detectCurrencyFromCity(city),
  };
}

/**
 * Get currency symbol for a currency code
 *
 * @param currency - Currency code
 * @returns Currency symbol
 */
export function getCurrencySymbol(currency: Currency): string {
  switch (currency) {
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    case 'USD':
      return '$';
    default:
      return '€'; // Default to EUR
  }
}

/**
 * Format amount with currency
 *
 * @param amount - Amount to format
 * @param currency - Currency code (defaults to EUR)
 * @returns Formatted amount string
 */
export function formatCurrency(amount: number, currency: Currency = 'EUR'): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // Symbol before for USD/GBP, after for EUR
  if (currency === 'EUR') {
    return `${formatted}${symbol}`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Get region name from city
 *
 * @param city - City name
 * @returns Region identifier (uk, france, us, europe) or undefined
 */
export function detectRegion(city: string): 'uk' | 'france' | 'us' | 'europe' | undefined {
  const cityLower = city.toLowerCase();

  if (CITY_LISTS.uk.some((c) => cityLower.includes(c))) return 'uk';
  if (CITY_LISTS.france.some((c) => cityLower.includes(c))) return 'france';
  if (CITY_LISTS.us.some((c) => cityLower.includes(c))) return 'us';
  if (CITY_LISTS.europe.some((c) => cityLower.includes(c))) return 'europe';

  return undefined;
}
