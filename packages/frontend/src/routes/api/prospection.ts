/**
 * Prospection API Endpoint
 *
 * Handles prospection actions:
 * - search: Search for jobs using Google Places + AI
 * - get_categories: Return available prospection categories
 *
 * This endpoint orchestrates the MCP tools and returns
 * structured prospection cards for the frontend.
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';
import { PROSPECTION_CATEGORIES } from '~/config/prospectionCategories';
import type { ProspectionCategory, ProspectionCard } from '~/lib/prospectionTypes';

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

      logger.info('Prospection search', { categoryId, city, latitude, longitude, radius });

      // Search for real places using Google Maps API
      const cards = await searchRealPlaces(category, latitude, longitude, city, radius);

      return new Response(JSON.stringify({ cards, category }), {
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

/**
 * Search for real places using Google Places API
 */
async function searchRealPlaces(
  category: ProspectionCategory,
  latitude?: number,
  longitude?: number,
  city?: string,
  radius: number = 5000
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

  // Search for each Google Place type in the category
  const allPlaces: ProspectionCard[] = [];

  for (const placeType of category.googlePlaceTypes) {
    try {
      const places = await maps.findNearbyPlaces(
        { lat: latitude, lng: longitude },
        placeType as import('@stride/mcp-server/services').PlaceType,
        {
          radius,
          keyword: category.queryTemplate,
          maxResults: 10,
          includePhotos: false, // Cost control
        }
      );

      // Convert Place to ProspectionCard
      for (const place of places) {
        const distance = maps.calculateDistance({ lat: latitude, lng: longitude }, place.location);
        const commuteMinutes = Math.round(distance / 80); // ~80m/min walking speed

        // Random hourly rate within category range
        const hourlyRate =
          category.avgHourlyRate.min +
          Math.random() * (category.avgHourlyRate.max - category.avgHourlyRate.min);

        allPlaces.push({
          id: `${category.id}_${place.placeId}`,
          type: 'place',
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
        });
      }
    } catch (error) {
      logger.error('Places search error', { placeType, error });
    }
  }

  return allPlaces;
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
