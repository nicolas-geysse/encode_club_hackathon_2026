/**
 * Prospection API Endpoint
 *
 * Handles prospection actions:
 * - search: Search for jobs using Google Places + AI
 * - get_categories: Return available prospection categories
 *
 * This endpoint orchestrates the MCP tools and returns
 * structured prospection cards for the frontend.
 *
 * Phase 7: Added Opik tracing for job suggestions (P7.2)
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';
import { PROSPECTION_CATEGORIES } from '~/config/prospectionCategories';
import type { ProspectionCategory, ProspectionCard } from '~/lib/prospectionTypes';
import { trace, getTraceUrl, type TraceOptions } from '~/lib/opik';
import { getCurrencySymbol, type Currency } from '~/lib/dateUtils';

// Google Maps service (lazy loaded to avoid bundling issues)
// Uses promise singleton to prevent race conditions and ensure init errors are retried
let googleMapsService: typeof import('@stride/mcp-server/services') | null = null;
let googleMapsInitPromise: Promise<typeof import('@stride/mcp-server/services')> | null = null;

async function getGoogleMaps() {
  if (googleMapsService) return googleMapsService;
  if (!googleMapsInitPromise) {
    googleMapsInitPromise = (async () => {
      try {
        const svc = await import('@stride/mcp-server/services');
        await svc.initGoogleMaps();
        googleMapsService = svc;
        return svc;
      } catch (err) {
        // Reset so next call retries instead of returning broken service
        googleMapsInitPromise = null;
        throw err;
      }
    })();
  }
  return googleMapsInitPromise;
}

const logger = createLogger('prospection-api');

// Re-export for external consumers
export { PROSPECTION_CATEGORIES };

// =============================================================================
// Handlers
// =============================================================================

export async function GET(event: APIEvent): Promise<Response> {
  try {
    const url = new URL(event.request.url);
    const action = url.searchParams.get('action');

    if (action === 'get_categories' || !action) {
      return new Response(JSON.stringify(PROSPECTION_CATEGORIES), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(event: APIEvent): Promise<Response> {
  try {
    const body = await event.request.json();
    const { action, categoryId, latitude, longitude, city, radius = 5000, currency = 'EUR' } = body;
    const currencySymbol = getCurrencySymbol(currency as Currency);

    if (action === 'search') {
      if (!categoryId) {
        return new Response(JSON.stringify({ error: 'categoryId is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const category = PROSPECTION_CATEGORIES.find((c) => c.id === categoryId);
      if (!category) {
        return new Response(JSON.stringify({ error: 'Category not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Phase 7 (P7.2): Trace job search/suggestions
      const traceOptions: TraceOptions = {
        source: 'job_suggestions',
        tags: ['jobs', 'suggestion', 'search', `category:${categoryId}`],
        input: { categoryId, city, latitude, longitude, radius },
        metadata: {
          'suggestion.type': 'job',
          'request.type': 'job_search',
          'search.category': categoryId,
          'search.city': city || 'unknown',
        },
      };

      const result = await trace(
        'suggestion.job_search',
        async (ctx) => {
          logger.info('Prospection search', { categoryId, city, latitude, longitude, radius });

          // Search for real places using Google Maps API
          const hasCoordinates = !!(latitude && longitude);
          const isPlatformOnly = category.googlePlaceTypes.length === 0;

          const cards = await searchRealPlaces(
            category,
            latitude,
            longitude,
            city,
            radius,
            currencySymbol
          );

          // Diagnostic logging for Places API debugging
          logger.info('Places API result', {
            categoryId,
            placeTypesCount: category.googlePlaceTypes.length,
            resultsCount: cards.length,
            hasCoordinates,
            isPlatformOnly,
            apiKeyPrefix: process.env.GOOGLE_MAPS_API_KEY?.slice(0, 10) + '...',
          });

          // Build response with diagnostic metadata
          // v4.1: Show actual radius used (user-specified + fallbacks)
          const meta = {
            source: isPlatformOnly ? 'platforms' : 'google_places',
            searchPerformed: hasCoordinates && !isPlatformOnly,
            placesTypesQueried: category.googlePlaceTypes,
            hasCoordinates,
            searchLocation: hasCoordinates
              ? { lat: latitude, lng: longitude, city: city || 'unknown' }
              : null,
            radiusUsed:
              hasCoordinates && !isPlatformOnly
                ? `${radius / 1000}km (with fallback to ${(radius + 10000) / 1000}km)`
                : null,
          };

          // Set trace attributes for job suggestions
          ctx.setAttributes({
            'job.count': cards.length,
            'job.category': categoryId,
            'job.city': city || 'unknown',
            'job.has_coordinates': hasCoordinates,
            'job.source': isPlatformOnly ? 'platforms' : 'google_places',
            'job.avg_hourly_rate':
              cards.length > 0
                ? cards.reduce((sum, c) => sum + (c.avgHourlyRate || 0), 0) / cards.length
                : 0,
          });

          ctx.setOutput({
            jobCount: cards.length,
            category: categoryId,
            source: meta.source,
            topJobs: cards.slice(0, 3).map((c) => ({
              company: c.company,
              avgHourlyRate: c.avgHourlyRate,
              commuteMinutes: c.commuteMinutes,
            })),
            traceUrl: getTraceUrl(ctx.getTraceId() || undefined),
          });

          return { cards, category, meta };
        },
        traceOptions
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// =============================================================================
// Real Google Places API Search
// =============================================================================

// v4.1: Progressive radius fallback based on user-provided radius
// If user sets 5km, try 5km → 10km → 15km
// If user sets 10km, try 10km → 15km → 20km
function getRadiusFallbacks(userRadius: number): number[] {
  // Optimization: Strictly respect 10km limit requested by user to save quota
  const MAX_RADIUS = 10000;

  if (userRadius >= MAX_RADIUS) {
    return [MAX_RADIUS];
  }

  // If starting at 5km, allow one fallback to 10km
  return [userRadius, Math.min(userRadius + 5000, MAX_RADIUS)];
}

// Text Search queries by category
// NOTE: Disabled - was returning business LOCATIONS (restaurants, pizzerias)
// instead of JOB opportunities. The Nearby Search with proper placeTypes
// is more accurate. If it fails, we show platform suggestions instead.

const TEXT_SEARCH_QUERIES: Record<string, string[]> = {
  // Keeping for reference but not used anymore
  service: ['restaurant', 'café bar', 'boulangerie', 'pizzeria'],
  retail: ['supermarché', 'magasin vêtements', 'centre commercial', 'pharmacie'],
  cleaning: ['hôtel', 'salle de sport', 'cinéma'],
  childcare: ['école maternelle', 'école primaire', 'crèche'],
  tutoring: ['bibliothèque', 'université', 'lycée'],
  events: ['salle événements', 'centre congrès'],
  digital: ['espace coworking', 'café wifi'],
  campus: ['université', 'bibliothèque universitaire'],
  beauty: ['salon coiffure', 'institut beauté', 'spa'],
  auto: ['station service', 'lavage auto'],
};

import { promises as fs } from 'fs';
import path from 'path';

// ... (existing imports)

// =============================================================================
// Caching System (Flat File JSON)
// =============================================================================

const CACHE_FILE = path.resolve(process.cwd(), '.cache/prospection_cache.json');
const CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (reduced from 7 days — API is expensive but 7 days is stale)

interface CacheEntry {
  timestamp: number;
  data: ProspectionCard[];
}

interface CacheStore {
  [key: string]: CacheEntry;
}

/**
 * Generate a deterministic cache key
 * Rounds coordinates to ~100m precision (3 decimals) to optimize hit rate
 */
function getCacheKey(
  categoryId: string,
  city: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  radius: number
): string {
  const c = city || 'unknown';
  // If no coords, use city only
  if (!lat || !lng) {
    return `cat_${categoryId}_city_${c.toLowerCase().replace(/\s/g, '_')}`;
  }
  // Round to 3 decimals (~111m precision)
  const rLat = lat.toFixed(3);
  const rLng = lng.toFixed(3);
  return `cat_${categoryId}_loc_${rLat}_${rLng}_rad_${radius}`;
}

/**
 * Read from file cache
 */
async function getCache(key: string): Promise<ProspectionCard[] | null> {
  try {
    // Check if file exists
    try {
      await fs.access(CACHE_FILE);
    } catch {
      return null;
    }

    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const store: CacheStore = JSON.parse(content);
    const entry = store[key];

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      // Expired
      logger.info('Cache expired', { key });
      return null;
    }

    logger.info('Cache HIT', { key });
    return entry.data;
  } catch (error) {
    logger.warn('Cache read error', { error });
    return null;
  }
}

/**
 * Write to file cache
 */
async function setCache(key: string, data: ProspectionCard[]): Promise<void> {
  try {
    // Ensure dir exists
    const dir = path.dirname(CACHE_FILE);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }

    // Read existing store to avoid wiping other keys
    let store: CacheStore = {};
    try {
      const content = await fs.readFile(CACHE_FILE, 'utf-8');
      store = JSON.parse(content);
    } catch {
      // File doesn't exist or corrupt, start fresh
    }

    // Update entry
    store[key] = {
      timestamp: Date.now(),
      data,
    };

    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    logger.info('Cache saved', { key, items: data.length });
  } catch (error) {
    logger.error('Cache write error', { error });
  }
}

// =============================================================================
// Place-Type-Aware Job Title Generation
// =============================================================================

/**
 * Maps (categoryId:placeType) → appropriate job titles for students.
 * Category-specific keys override generic ones to disambiguate shared place types
 * (e.g., "school" means cleaning staff in cleaning category, but tutor in tutoring).
 */
const PLACE_TYPE_JOB_TITLES: Record<string, string[]> = {
  // --- Category-specific overrides (for ambiguous place types) ---
  // Cleaning
  'cleaning:school': ['Cleaning Staff', 'Janitor Assistant', 'Maintenance Helper'],
  'cleaning:university': ['Cleaning Staff', 'Campus Maintenance', 'Facility Helper'],
  'cleaning:hospital': ['Cleaning Staff', 'Ward Attendant', 'Sanitation Worker'],
  'cleaning:gym': ['Cleaning Staff', 'Facility Attendant'],
  'cleaning:spa': ['Cleaning Staff', 'Facility Attendant'],
  'cleaning:movie_theater': ['Cleaning Staff', 'Theater Attendant'],
  'cleaning:stadium': ['Cleaning Staff', 'Facility Attendant'],
  // Childcare
  'childcare:school': ['After-school Helper', 'Childcare Assistant'],
  'childcare:primary_school': ['After-school Helper', 'Childcare Assistant'],
  'childcare:secondary_school': ['After-school Helper', 'Study Supervisor'],
  'childcare:pet_store': ['Pet Sitter', 'Dog Walker', 'Pet Care Assistant'],
  // Tutoring
  'tutoring:school': ['Tutor', 'Study Helper', 'Homework Supervisor'],
  'tutoring:university': ['Tutor', 'Study Group Leader', 'Teaching Assistant'],
  'tutoring:primary_school': ['Tutor', 'Homework Helper'],
  'tutoring:secondary_school': ['Tutor', 'Exam Prep Coach', 'Study Helper'],
  'tutoring:library': ['Tutor', 'Study Helper', 'Reading Coach'],
  'tutoring:book_store': ['Tutor', 'Study Group Organizer'],
  // Campus
  'campus:university': ['Lab Monitor', 'IT Helpdesk', 'Administrative Helper'],
  'campus:school': ['Administrative Helper', 'Reception Assistant'],
  'campus:library': ['Library Assistant', 'Study Room Monitor'],
  // Events
  'events:shopping_mall': ['Promoter', 'Brand Ambassador', 'Event Staff'],
  'events:stadium': ['Event Staff', 'Usher', 'Ticket Collector'],
  'events:night_club': ['Event Staff', 'Promoter', 'Door Staff'],
  'events:movie_theater': ['Event Staff', 'Usher', 'Concession Worker'],
  // Digital (places are workspaces, not employers)
  'digital:cafe': ['Freelancer', 'Remote Worker', 'Digital Nomad'],
  'digital:library': ['Freelancer', 'Remote Worker', 'Digital Nomad'],
  // Beauty
  'beauty:gym': ['Reception Assistant', 'Front Desk Staff'],
  'beauty:spa': ['Spa Assistant', 'Reception Assistant'],
  // Retail (disambiguation for shared types)
  'retail:pet_store': ['Sales Associate', 'Stock Clerk', 'Cashier'],
  'retail:book_store': ['Sales Associate', 'Shelf Organizer', 'Cashier'],
  'retail:home_goods_store': ['Sales Associate', 'Stock Clerk', 'Cashier'],
  // Handyman
  'handyman:hardware_store': ['Sales Advisor', 'Stock Clerk', 'Customer Helper'],
  'handyman:furniture_store': ['Delivery Helper', 'Assembly Service', 'Stock Clerk'],
  'handyman:home_goods_store': ['Delivery Helper', 'Assembly Service'],

  // --- Generic place type mappings (fallback when no category-specific key) ---
  restaurant: ['Waiter/Waitress', 'Kitchen Helper', 'Dishwasher', 'Host/Hostess'],
  cafe: ['Barista', 'Counter Staff', 'Kitchen Assistant'],
  bar: ['Bartender', 'Bar Helper', 'Waiter/Waitress'],
  bakery: ['Sales Assistant', 'Baker Helper', 'Counter Staff'],
  night_club: ['Bartender', 'Bar Staff', 'Door Staff'],
  meal_takeaway: ['Order Prep', 'Counter Staff', 'Delivery Helper'],
  meal_delivery: ['Delivery Driver', 'Order Prep', 'Kitchen Helper'],
  store: ['Sales Associate', 'Cashier', 'Stock Clerk'],
  shopping_mall: ['Sales Associate', 'Information Desk', 'Stock Clerk'],
  supermarket: ['Cashier', 'Shelf Stocker', 'Cart Attendant'],
  clothing_store: ['Sales Associate', 'Fitting Room Attendant', 'Stock Clerk'],
  convenience_store: ['Cashier', 'Stock Clerk'],
  department_store: ['Sales Associate', 'Cashier', 'Stock Clerk'],
  electronics_store: ['Sales Associate', 'Tech Advisor', 'Cashier'],
  shoe_store: ['Sales Associate', 'Stock Clerk'],
  home_goods_store: ['Sales Associate', 'Stock Clerk', 'Cashier'],
  book_store: ['Sales Associate', 'Shelf Organizer', 'Cashier'],
  pet_store: ['Sales Associate', 'Animal Care Helper', 'Cashier'],
  drugstore: ['Cashier', 'Stock Clerk', 'Sales Associate'],
  florist: ['Sales Assistant', 'Flower Arranger Helper'],
  jewelry_store: ['Sales Associate', 'Display Assistant'],
  liquor_store: ['Sales Associate', 'Stock Clerk', 'Cashier'],
  lodging: ['Housekeeper', 'Room Attendant', 'Front Desk', 'Laundry Staff'],
  gym: ['Front Desk', 'Facility Attendant', 'Reception'],
  spa: ['Reception Assistant', 'Spa Attendant'],
  movie_theater: ['Ticket Seller', 'Concession Worker', 'Usher'],
  stadium: ['Event Staff', 'Concession Worker', 'Usher'],
  hospital: ['Receptionist', 'Administrative Helper'],
  school: ['Administrative Helper', 'School Assistant'],
  university: ['Administrative Helper', 'Lab Assistant'],
  primary_school: ['After-school Helper', 'Teaching Assistant'],
  secondary_school: ['Study Supervisor', 'Teaching Assistant'],
  library: ['Library Assistant', 'Shelving Staff', 'Front Desk'],
  hardware_store: ['Sales Associate', 'Stock Clerk', 'Customer Advisor'],
  furniture_store: ['Sales Associate', 'Delivery Helper', 'Assembly Service'],
  beauty_salon: ['Salon Assistant', 'Shampoo Helper', 'Reception'],
  hair_care: ['Salon Assistant', 'Shampoo Helper', 'Reception'],
  gas_station: ['Pump Attendant', 'Cashier', 'Service Assistant'],
  car_wash: ['Car Wash Attendant', 'Service Assistant'],
};

/**
 * Get an appropriate job title based on category + place type.
 * 1. Try category-specific key (e.g., "cleaning:school")
 * 2. Try generic place type key (e.g., "school")
 * 3. Fallback to category examples
 */
function getJobTitle(categoryId: string, placeType: string, categoryExamples: string[]): string {
  // 1. Category-specific
  const specificKey = `${categoryId}:${placeType}`;
  const specificTitles = PLACE_TYPE_JOB_TITLES[specificKey];
  if (specificTitles && specificTitles.length > 0) {
    return specificTitles[Math.floor(Math.random() * specificTitles.length)];
  }

  // 2. Generic place type
  const genericTitles = PLACE_TYPE_JOB_TITLES[placeType];
  if (genericTitles && genericTitles.length > 0) {
    return genericTitles[Math.floor(Math.random() * genericTitles.length)];
  }

  // 3. Fallback to category examples
  return categoryExamples[Math.floor(Math.random() * categoryExamples.length)];
}

/**
 * Search for real places using Google Places API
 * Strategy:
 * 1. Check Cache
 * 2. Nearby Search with progressive radius (starting from user-provided radius)
 * 3. If still empty, fallback to Text Search (more flexible queries)
 * 4. Save to Cache if results found
 *
 * v4.1: Now respects user-provided radius instead of always starting at 5km
 */
async function searchRealPlaces(
  category: ProspectionCategory,
  latitude?: number,
  longitude?: number,
  city?: string,
  initialRadius: number = 5000,
  currencySymbol: string = '€'
): Promise<ProspectionCard[]> {
  // If category has no googlePlaceTypes, return platform-based suggestions
  if (category.googlePlaceTypes.length === 0) {
    return generatePlatformCards(category, city, currencySymbol);
  }

  // If no coordinates, return empty (location required for Places API)
  if (!latitude || !longitude) {
    logger.warn('No coordinates provided for Places search', { city });
    return generatePlatformCards(category, city, currencySymbol);
  }

  // 1. Check Cache
  const cacheKey = getCacheKey(category.id, city, latitude, longitude, initialRadius);
  const cachedResults = await getCache(cacheKey);
  if (cachedResults) {
    // Add "cached" flag to source for debugging UI if needed (optional)
    return cachedResults;
  }

  const maps = await getGoogleMaps();
  const location = { lat: latitude, lng: longitude };

  // v4.1: Progressive radius starting from user-provided value
  const radiusFallbacks = getRadiusFallbacks(initialRadius);

  let finalResults: ProspectionCard[] = [];

  // Strategy 1: Try Nearby Search with progressive radius
  for (const radius of radiusFallbacks) {
    const allPlaces = await searchWithRadius(maps, category, location, radius, currencySymbol);

    if (allPlaces.length > 0) {
      logger.info('Places found via Nearby Search', {
        categoryId: category.id,
        radius,
        count: allPlaces.length,
        method: 'nearby_search',
      });
      finalResults = allPlaces;
      break; // Found results, stop expanding
    }

    logger.info('No results at radius, trying larger', {
      categoryId: category.id,
      radius,
      nextRadius: radiusFallbacks[radiusFallbacks.indexOf(radius) + 1] || 'text_search',
    });
  }

  // Strategy 2: Text Search fallback DISABLED
  // Was returning business LOCATIONS (restaurants, pizzerias) instead of job opportunities.
  // The Nearby Search with proper placeTypes is more accurate.
  // If no results, the UI will show platform suggestions (Indeed, LinkedIn, etc.)
  if (finalResults.length === 0) {
    logger.info('Nearby Search exhausted, no Text Search fallback (disabled)', {
      categoryId: category.id,
      city,
      reason: 'Text Search returns business locations, not job opportunities',
    });
    // Don't use Text Search - it pollutes cache with wrong data
  }

  // Handle results (Cache save or Return empty)
  if (finalResults.length > 0) {
    // Save to cache
    await setCache(cacheKey, finalResults);
    return finalResults;
  }

  // No results from any method
  logger.warn('No Places results from any search method', {
    categoryId: category.id,
    placeTypes: category.googlePlaceTypes,
    city,
  });

  return [];
}

/**
 * Fallback: Use Text Search API for more flexible natural language queries
 */
async function searchWithTextSearch(
  maps: Awaited<ReturnType<typeof getGoogleMaps>>,
  category: ProspectionCategory,
  location: { lat: number; lng: number },
  city?: string,
  currencySymbol: string = '€'
): Promise<ProspectionCard[]> {
  const queries = TEXT_SEARCH_QUERIES[category.id] || [category.label];
  const cityName = city || '';

  // Search with multiple queries in parallel
  const searchPromises = queries.slice(0, 3).map(async (baseQuery) => {
    try {
      const query = cityName ? `${baseQuery} ${cityName}` : baseQuery;

      const places = await maps.textSearchPlaces(query, {
        location,
        radius: 15000, // 15km for text search
        maxResults: 10,
        language: 'fr',
      });

      return places.map((place) => {
        const distance = maps.calculateDistance(location, place.location);
        const commuteMinutes = Math.round(distance / 80);

        const hourlyRate =
          category.avgHourlyRate.min +
          Math.random() * (category.avgHourlyRate.max - category.avgHourlyRate.min);

        // Text search doesn't have a specific placeType, use category examples
        const title = category.examples[Math.floor(Math.random() * category.examples.length)];

        return {
          id: `${category.id}_${place.placeId}`,
          type: 'place' as const,
          title,
          company: place.name,
          location: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
          commuteMinutes,
          commuteText: `${commuteMinutes} min`,
          salaryText: `${hourlyRate.toFixed(0)}${currencySymbol}/h`,
          avgHourlyRate: Math.round(hourlyRate * 100) / 100,
          effortLevel: category.effortLevel,
          source: 'Google Maps',
          url: `https://www.google.com/maps/place/?q=place_id:${place.placeId}`,
          categoryId: category.id,
          rating: place.rating,
          openNow: place.openNow,
        };
      });
    } catch (error) {
      logger.error('Text search error', { query: baseQuery, error });
      return [];
    }
  });

  const results = await Promise.all(searchPromises);

  // Flatten and deduplicate
  const allPlaces = results.flat();
  const seen = new Set<string>();
  return allPlaces.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

/**
 * Search all place types in parallel at a given radius
 */
async function searchWithRadius(
  maps: Awaited<ReturnType<typeof getGoogleMaps>>,
  category: ProspectionCategory,
  location: { lat: number; lng: number },
  radius: number,
  currencySymbol: string = '€'
): Promise<ProspectionCard[]> {
  // Search ALL place types in parallel for better performance
  const searchPromises = category.googlePlaceTypes.map(async (placeType) => {
    try {
      const places = await maps.findNearbyPlaces(
        location,
        placeType as import('@stride/mcp-server/services').PlaceType,
        {
          radius,
          // Don't use keyword - it's too restrictive and causes 0 results
          // Optimization: Reduce maxResults for wide searches to avoid overwhelming result sets
          maxResults: radius >= 20000 ? 10 : 15,
          includePhotos: false, // Cost control
        }
      );

      // Convert Place to ProspectionCard
      return places.map((place) => {
        const distance = maps.calculateDistance(location, place.location);
        const commuteMinutes = Math.round(distance / 80); // ~80m/min walking speed

        // Random hourly rate within category range
        const hourlyRate =
          category.avgHourlyRate.min +
          Math.random() * (category.avgHourlyRate.max - category.avgHourlyRate.min);

        // Place-type-aware title: "Cleaning Staff" at a school, not "Pet walker"
        const title = getJobTitle(category.id, placeType, category.examples);

        return {
          id: `${category.id}_${place.placeId}`,
          type: 'place' as const,
          title,
          company: place.name,
          location: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
          commuteMinutes,
          commuteText: `${commuteMinutes} min`,
          salaryText: `${hourlyRate.toFixed(0)}${currencySymbol}/h`,
          avgHourlyRate: Math.round(hourlyRate * 100) / 100,
          effortLevel: category.effortLevel,
          source: 'Google Maps',
          url: `https://www.google.com/maps/place/?q=place_id:${place.placeId}`,
          categoryId: category.id,
          rating: place.rating,
          openNow: place.openNow,
        };
      });
    } catch (error) {
      logger.error('Places search error', { placeType, error });
      return [];
    }
  });

  // Wait for all searches to complete in parallel
  const results = await Promise.all(searchPromises);

  // Flatten and deduplicate by placeId
  const allPlaces = results.flat();
  const seen = new Set<string>();
  const uniquePlaces = allPlaces.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });

  // Optimization: Sort by distance (nearest first) and CAP at 50 results
  // This ensures we respect the user's request to "not go beyond 50 places"
  // and prioritize the most relevant (closest) ones.
  return uniquePlaces
    .sort((a, b) => (a.commuteMinutes || 999) - (b.commuteMinutes || 999))
    .slice(0, 50);
}

/**
 * Generate platform-based cards for categories without Google Place types
 * (e.g., handyman, events, interim - these are platform-based, not location-based)
 */
function generatePlatformCards(
  category: ProspectionCategory,
  city?: string,
  currencySymbol: string = '€'
): ProspectionCard[] {
  const cityName = city || 'your city';
  return category.platforms.slice(0, 5).map((platform, i) => ({
    id: `${category.id}_platform_${i}_${Date.now()}`,
    type: 'job',
    title: category.examples[i % category.examples.length],
    company: platform,
    location: cityName,
    salaryText: `${category.avgHourlyRate.min}-${category.avgHourlyRate.max}${currencySymbol}/h`,
    avgHourlyRate: (category.avgHourlyRate.min + category.avgHourlyRate.max) / 2,
    effortLevel: category.effortLevel,
    source: platform,
    url: `https://${platform.toLowerCase().replace(/\s/g, '')}.com`,
    categoryId: category.id,
  }));
}
