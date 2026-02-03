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

// Google Maps service (lazy loaded to avoid bundling issues)
let googleMapsService: typeof import('@stride/mcp-server/services') | null = null;

async function getGoogleMaps() {
  if (!googleMapsService) {
    googleMapsService = await import('@stride/mcp-server/services');
    await googleMapsService.initGoogleMaps();
  }
  return googleMapsService;
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
    const { action, categoryId, latitude, longitude, city, radius = 5000 } = body;

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

          const cards = await searchRealPlaces(category, latitude, longitude, city, radius);

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
          const meta = {
            source: isPlatformOnly ? 'platforms' : 'google_places',
            searchPerformed: hasCoordinates && !isPlatformOnly,
            placesTypesQueried: category.googlePlaceTypes,
            hasCoordinates,
            searchLocation: hasCoordinates
              ? { lat: latitude, lng: longitude, city: city || 'unknown' }
              : null,
            radiusUsed: hasCoordinates && !isPlatformOnly ? 'progressive (5-15km)' : null,
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

// Progressive radius fallback: try larger areas if initial search is empty
const RADIUS_FALLBACK = [5000, 10000, 15000]; // 5km → 10km → 15km

// Text Search queries by category (more natural language, better results)
const TEXT_SEARCH_QUERIES: Record<string, string[]> = {
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

/**
 * Search for real places using Google Places API
 * Strategy:
 * 1. Nearby Search with progressive radius (5km → 10km → 15km)
 * 2. If still empty, fallback to Text Search (more flexible queries)
 */
async function searchRealPlaces(
  category: ProspectionCategory,
  latitude?: number,
  longitude?: number,
  city?: string,
  _initialRadius: number = 5000
): Promise<ProspectionCard[]> {
  // If category has no googlePlaceTypes, return platform-based suggestions
  if (category.googlePlaceTypes.length === 0) {
    return generatePlatformCards(category, city);
  }

  // If no coordinates, return empty (location required for Places API)
  if (!latitude || !longitude) {
    logger.warn('No coordinates provided for Places search', { city });
    return generatePlatformCards(category, city);
  }

  const maps = await getGoogleMaps();
  const location = { lat: latitude, lng: longitude };

  // Strategy 1: Try Nearby Search with progressive radius
  for (const radius of RADIUS_FALLBACK) {
    const allPlaces = await searchWithRadius(maps, category, location, radius);

    if (allPlaces.length > 0) {
      logger.info('Places found via Nearby Search', {
        categoryId: category.id,
        radius,
        count: allPlaces.length,
        method: 'nearby_search',
      });
      return allPlaces;
    }

    logger.info('No results at radius, trying larger', {
      categoryId: category.id,
      radius,
      nextRadius: RADIUS_FALLBACK[RADIUS_FALLBACK.indexOf(radius) + 1] || 'text_search',
    });
  }

  // Strategy 2: Fallback to Text Search (more flexible)
  logger.info('Nearby Search exhausted, trying Text Search', { categoryId: category.id, city });

  const textSearchResults = await searchWithTextSearch(maps, category, location, city);
  if (textSearchResults.length > 0) {
    logger.info('Places found via Text Search', {
      categoryId: category.id,
      count: textSearchResults.length,
      method: 'text_search',
    });
    return textSearchResults;
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
  city?: string
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

        return {
          id: `${category.id}_${place.placeId}`,
          type: 'place' as const,
          title: category.examples[Math.floor(Math.random() * category.examples.length)],
          company: place.name,
          location: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
          commuteMinutes,
          commuteText: `${commuteMinutes} min`,
          salaryText: `${hourlyRate.toFixed(2)}€/h`,
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
  radius: number
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
          maxResults: 15,
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

        return {
          id: `${category.id}_${place.placeId}`,
          type: 'place' as const,
          title: category.examples[Math.floor(Math.random() * category.examples.length)],
          company: place.name,
          location: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
          commuteMinutes,
          commuteText: `${commuteMinutes} min`,
          salaryText: `${hourlyRate.toFixed(2)}€/h`,
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
  return allPlaces.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

/**
 * Generate platform-based cards for categories without Google Place types
 * (e.g., handyman, events, interim - these are platform-based, not location-based)
 */
function generatePlatformCards(category: ProspectionCategory, city?: string): ProspectionCard[] {
  const cityName = city || 'your city';
  return category.platforms.slice(0, 5).map((platform, i) => ({
    id: `${category.id}_platform_${i}_${Date.now()}`,
    type: 'job',
    title: category.examples[i % category.examples.length],
    company: platform,
    location: cityName,
    salaryText: `${category.avgHourlyRate.min}-${category.avgHourlyRate.max}€/h`,
    avgHourlyRate: (category.avgHourlyRate.min + category.avgHourlyRate.max) / 2,
    effortLevel: category.effortLevel,
    source: platform,
    url: `https://${platform.toLowerCase().replace(/\s/g, '')}.com`,
    categoryId: category.id,
  }));
}
