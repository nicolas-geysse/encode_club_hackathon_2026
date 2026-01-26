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

      // Generate mock cards (in production, this would call MCP tools)
      // For now, generate realistic cards based on category
      const cards: ProspectionCard[] = generateMockCards(category, city, latitude, longitude);

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
// Mock Data Generator (replaced by real MCP calls in production)
// =============================================================================

function generateMockCards(
  category: ProspectionCategory,
  city?: string,
  lat?: number,
  lng?: number
): ProspectionCard[] {
  const cityName = city || 'Paris';

  // Generate company names based on category
  const companyNames: Record<string, string[]> = {
    service: [
      'Le Petit Bistrot',
      'Café de Flore',
      'Brasserie Lipp',
      'Starbucks',
      "McDonald's",
      'Quick',
      'Pizza Hut',
      'Subway',
    ],
    retail: ['Carrefour', 'Monoprix', 'Fnac', 'Zara', 'H&M', 'Uniqlo', 'Decathlon', 'Sephora'],
    cleaning: ['O2', 'Shiva', 'Ibis Hotel', 'Novotel', 'Fitness Park', 'Basic Fit'],
    handyman: ['TaskRabbit Pro', 'Frizbiz', 'YoupiJob', 'Helpling'],
    childcare: ['Yoopies', 'Babysits', 'Family in need', 'DogBuddy Paris'],
    tutoring: ['Acadomia', 'Superprof User', 'Complétude', 'Private Student'],
    events: ['Hotesse.com', 'EventStaff', 'Promo Agency', 'Brand Experience'],
    interim: ['Adecco', 'Manpower', 'Randstad', 'Synergie'],
    digital: ['Startup Client', 'Agency XYZ', 'E-commerce Co', 'SaaS Startup'],
    campus: ['University Library', 'IT Services', 'Student Union', 'Research Lab'],
  };

  const companies = companyNames[category.id] || ['Local Business'];
  const cards: ProspectionCard[] = [];

  // Generate 6-10 cards
  const count = 6 + Math.floor(Math.random() * 5);

  for (let i = 0; i < count; i++) {
    const company = companies[i % companies.length];
    const example = category.examples[i % category.examples.length];
    const hourlyRate =
      category.avgHourlyRate.min +
      Math.random() * (category.avgHourlyRate.max - category.avgHourlyRate.min);

    // Random offset for coordinates (within ~2km)
    const latOffset = (Math.random() - 0.5) * 0.02;
    const lngOffset = (Math.random() - 0.5) * 0.02;

    // Random commute time (5-40 min)
    const commuteMinutes = 5 + Math.floor(Math.random() * 35);

    cards.push({
      id: `${category.id}_${i}_${Date.now()}`,
      type: category.googlePlaceTypes.length > 0 ? 'place' : 'job',
      title: example,
      company,
      location: `${cityName}, ${['Centre', 'Nord', 'Sud', 'Est', 'Ouest'][i % 5]}`,
      lat: lat ? lat + latOffset : undefined,
      lng: lng ? lng + lngOffset : undefined,
      commuteMinutes,
      commuteText: `${commuteMinutes} min`,
      salaryText: `${hourlyRate.toFixed(2)}€/h`,
      avgHourlyRate: Math.round(hourlyRate * 100) / 100,
      effortLevel: category.effortLevel,
      source: category.platforms[i % category.platforms.length],
      url: `https://${category.platforms[i % category.platforms.length].toLowerCase().replace(/\s/g, '')}.com`,
      categoryId: category.id,
      rating: 3.5 + Math.random() * 1.5,
      openNow: Math.random() > 0.3,
    });
  }

  return cards;
}
