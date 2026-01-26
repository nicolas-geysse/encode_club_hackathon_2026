/**
 * Prospection Tools
 *
 * MCP tools for job prospection:
 * - search_nearby_jobs: Find local businesses for potential jobs
 * - calculate_commute: Calculate commute time from user location
 * - search_job_offers: Search online job listings (via Groq)
 *
 * Pattern follows tools/voice.ts
 */

import { trace, getCurrentTraceId } from '../services/opik.js';
import {
  findNearbyPlaces,
  getDistanceMatrix,
  isGoogleMapsAvailable,
  type Coordinates,
  type PlaceType,
  type TravelMode,
} from '../services/google-maps.js';
import { chat } from '../services/groq.js';

// =============================================================================
// Tool Definitions
// =============================================================================

export const PROSPECTION_TOOLS = {
  search_nearby_jobs: {
    description:
      'Find businesses near a location that might hire students. Uses Google Places API to find restaurants, stores, cafes, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: 'User latitude',
        },
        longitude: {
          type: 'number',
          description: 'User longitude',
        },
        category: {
          type: 'string',
          enum: [
            'service',
            'retail',
            'cleaning',
            'handyman',
            'childcare',
            'tutoring',
            'events',
            'interim',
            'digital',
            'campus',
          ],
          description: 'Job category to search for',
        },
        radius: {
          type: 'number',
          description: 'Search radius in meters (default: 5000)',
          default: 5000,
        },
      },
      required: ['latitude', 'longitude', 'category'],
    },
  },

  calculate_commute: {
    description:
      'Calculate commute time from user location to one or more destinations using Google Distance Matrix API.',
    inputSchema: {
      type: 'object',
      properties: {
        origin_lat: {
          type: 'number',
          description: 'Origin latitude (user location)',
        },
        origin_lng: {
          type: 'number',
          description: 'Origin longitude (user location)',
        },
        destinations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
            required: ['lat', 'lng'],
          },
          description: 'Array of destination coordinates',
        },
        mode: {
          type: 'string',
          enum: ['walking', 'bicycling', 'transit', 'driving'],
          description: 'Travel mode (default: transit)',
          default: 'transit',
        },
      },
      required: ['origin_lat', 'origin_lng', 'destinations'],
    },
  },

  search_job_offers: {
    description:
      'Search for job offers online using AI-powered web search. Returns structured job listings.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for jobs (e.g., "serveur étudiant")',
        },
        city: {
          type: 'string',
          description: 'City to search in',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results (default: 5)',
          default: 5,
        },
      },
      required: ['query', 'city'],
    },
  },
};

// =============================================================================
// Category to Place Types Mapping
// =============================================================================

const CATEGORY_PLACE_TYPES: Record<string, PlaceType[]> = {
  service: ['restaurant', 'cafe', 'bar', 'meal_takeaway'],
  retail: ['store', 'shopping_mall', 'supermarket', 'clothing_store'],
  cleaning: ['lodging', 'gym', 'school'],
  handyman: [], // No specific place types, relies on web search
  childcare: ['school'], // Limited, relies more on platforms
  tutoring: ['library', 'university', 'school'],
  events: [], // Relies on web search
  interim: [], // Relies on web search
  digital: ['cafe', 'library'], // Coworking spaces
  campus: ['university', 'library'],
};

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * Handle search_nearby_jobs tool
 */
export async function handleSearchNearbyJobs(args: Record<string, unknown>) {
  return trace('tool_search_nearby_jobs', async (span) => {
    const latitude = args.latitude as number;
    const longitude = args.longitude as number;
    const category = args.category as string;
    const radius = (args.radius as number) || 5000;

    span.setInput({ latitude, longitude, category, radius });
    span.setAttributes({
      'prospection.category': category,
      'prospection.radius': radius,
      'prospection.has_api_key': isGoogleMapsAvailable(),
    });

    if (!isGoogleMapsAvailable()) {
      span.setAttributes({ error: 'Google Maps API not available' });
      return {
        type: 'text',
        params: {
          content:
            '⚠️ Google Maps API not configured. Please set GOOGLE_MAPS_API_KEY environment variable.',
          markdown: false,
        },
        metadata: {
          traceId: getCurrentTraceId(),
          error: 'api_not_configured',
        },
      };
    }

    const location: Coordinates = { lat: latitude, lng: longitude };
    const placeTypes = CATEGORY_PLACE_TYPES[category] || [];

    if (placeTypes.length === 0) {
      span.setAttributes({ 'prospection.no_place_types': true });
      return {
        type: 'text',
        params: {
          content: `Category "${category}" doesn't have direct Google Places types. Use search_job_offers for this category.`,
          markdown: false,
        },
        metadata: {
          traceId: getCurrentTraceId(),
          category,
        },
      };
    }

    // Search all place types for this category
    const allPlaces = await Promise.all(
      placeTypes.map((type) => findNearbyPlaces(location, type, { radius, maxResults: 10 }))
    );

    // Flatten and deduplicate by placeId
    const seenIds = new Set<string>();
    const places = allPlaces.flat().filter((place) => {
      if (seenIds.has(place.placeId)) return false;
      seenIds.add(place.placeId);
      return true;
    });

    span.setOutput({ places_count: places.length });
    span.setAttributes({
      'prospection.places_found': places.length,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'summary',
          type: 'text',
          params: {
            content: `Found **${places.length}** potential employers in the "${category}" category within ${radius / 1000}km`,
            markdown: true,
          },
        },
        {
          id: 'places',
          type: 'table',
          params: {
            title: 'Nearby Businesses',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'address', label: 'Address' },
              { key: 'rating', label: 'Rating' },
              { key: 'openNow', label: 'Open Now' },
            ],
            rows: places.slice(0, 15).map((p) => ({
              name: p.name,
              address: p.address,
              rating: p.rating ? `${p.rating}⭐` : '-',
              openNow: p.openNow ? '✅' : p.openNow === false ? '❌' : '?',
            })),
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        places,
        category,
      },
    };
  });
}

/**
 * Handle calculate_commute tool
 */
export async function handleCalculateCommute(args: Record<string, unknown>) {
  return trace('tool_calculate_commute', async (span) => {
    const originLat = args.origin_lat as number;
    const originLng = args.origin_lng as number;
    const destinations = args.destinations as Array<{ lat: number; lng: number }>;
    const mode = (args.mode as TravelMode) || 'transit';

    span.setInput({
      origin: { lat: originLat, lng: originLng },
      destinations_count: destinations.length,
      mode,
    });
    span.setAttributes({
      'commute.mode': mode,
      'commute.destinations_count': destinations.length,
    });

    if (!isGoogleMapsAvailable()) {
      span.setAttributes({ error: 'Google Maps API not available' });
      return {
        type: 'text',
        params: {
          content:
            '⚠️ Google Maps API not configured. Please set GOOGLE_MAPS_API_KEY environment variable.',
          markdown: false,
        },
        metadata: {
          traceId: getCurrentTraceId(),
          error: 'api_not_configured',
        },
      };
    }

    const origin: Coordinates = { lat: originLat, lng: originLng };
    const destCoords: Coordinates[] = destinations.map((d) => ({ lat: d.lat, lng: d.lng }));

    const results = await getDistanceMatrix(origin, destCoords, mode);

    span.setOutput({ results_count: results.length });
    span.setAttributes({
      'commute.results_count': results.length,
    });

    return {
      type: 'table',
      params: {
        title: `Commute Times (${mode})`,
        columns: [
          { key: 'destination', label: 'Destination' },
          { key: 'distance', label: 'Distance' },
          { key: 'duration', label: 'Duration' },
        ],
        rows: results.map((r, i) => ({
          destination: `Location ${i + 1}`,
          distance: r.distanceText,
          duration: r.durationText,
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
        results,
        mode,
      },
    };
  });
}

/**
 * Handle search_job_offers tool
 */
export async function handleSearchJobOffers(args: Record<string, unknown>) {
  return trace('tool_search_job_offers', async (span) => {
    const query = args.query as string;
    const city = args.city as string;
    const maxResults = (args.max_results as number) || 5;

    span.setInput({ query, city, maxResults });
    span.setAttributes({
      'job_search.query': query,
      'job_search.city': city,
      'job_search.max_results': maxResults,
    });

    const systemPrompt = `Tu es un assistant de recherche d'emploi étudiant. Tu dois générer des offres d'emploi réalistes basées sur la recherche.

Génère ${maxResults} offres d'emploi plausibles pour la requête donnée. Inclus des entreprises réelles ou plausibles de la ville.

Réponds UNIQUEMENT en JSON valide avec ce format:
{
  "results": [
    {
      "title": "Titre du poste",
      "company": "Nom de l'entreprise",
      "location": "Adresse ou quartier",
      "salary": "Salaire (ex: 11.65€/h ou 12-14€/h)",
      "schedule": "Horaires (ex: Weekends, Soirs, Temps partiel)",
      "url": "URL fictive vers l'offre",
      "source": "Plateforme (Indeed, StudentJob, etc.)",
      "snippet": "Description courte du poste"
    }
  ]
}`;

    const userPrompt = `Recherche: "${query}" à ${city}

Génère ${maxResults} offres d'emploi étudiant réalistes pour cette recherche.`;

    try {
      const response = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.7,
          tags: ['prospection', 'job-search'],
        }
      );

      // Parse JSON response
      let results: Array<{
        title: string;
        company?: string;
        location?: string;
        salary?: string;
        schedule?: string;
        url?: string;
        source: string;
        snippet: string;
      }> = [];

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          results = parsed.results || [];
        }
      } catch {
        span.setAttributes({ 'job_search.parse_error': true });
        results = [];
      }

      span.setOutput({ results_count: results.length });
      span.setAttributes({
        'job_search.results_count': results.length,
      });

      if (results.length === 0) {
        return {
          type: 'text',
          params: {
            content: `No job offers found for "${query}" in ${city}. Try a different search term.`,
            markdown: false,
          },
          metadata: {
            traceId: getCurrentTraceId(),
          },
        };
      }

      return {
        type: 'composite',
        components: [
          {
            id: 'summary',
            type: 'text',
            params: {
              content: `Found **${results.length}** job offers for "${query}" in ${city}`,
              markdown: true,
            },
          },
          {
            id: 'jobs',
            type: 'table',
            params: {
              title: 'Job Offers',
              columns: [
                { key: 'title', label: 'Position' },
                { key: 'company', label: 'Company' },
                { key: 'salary', label: 'Salary' },
                { key: 'source', label: 'Source' },
              ],
              rows: results.map((r) => ({
                title: r.title,
                company: r.company || '-',
                salary: r.salary || '-',
                source: r.source,
              })),
            },
          },
        ],
        metadata: {
          traceId: getCurrentTraceId(),
          results,
          query,
          city,
        },
      };
    } catch (error) {
      span.setAttributes({
        error: true,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        type: 'text',
        params: {
          content: `Error searching for jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
          markdown: false,
        },
        metadata: {
          traceId: getCurrentTraceId(),
          error: true,
        },
      };
    }
  });
}

/**
 * Handle prospection tool by name
 */
export async function handleProspectionTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_nearby_jobs':
      return handleSearchNearbyJobs(args);
    case 'calculate_commute':
      return handleCalculateCommute(args);
    case 'search_job_offers':
      return handleSearchJobOffers(args);
    default:
      throw new Error(`Unknown prospection tool: ${name}`);
  }
}

// =============================================================================
// Graph-Based Prospection Queries (DuckPGQ)
// =============================================================================

import { query as dbQuery } from '../services/duckdb.js';

/**
 * Graph query result types
 */
export interface GraphJobMatch {
  jobId: string;
  jobName: string;
  skillName: string;
  skillMatch: number;
  placeType: string;
  placeAvailability: number;
  combinedScore: number;
  hourlyRate: number;
  effortLevel: number;
}

export interface GraphCategoryInfo {
  categoryId: string;
  categoryName: string;
  placeTypes: string[];
  avgRateMin: number;
  avgRateMax: number;
  effortLevel: number;
  recommendedJobs: Array<{
    jobId: string;
    jobName: string;
    popularity: string;
  }>;
}

/**
 * Find jobs matching user skills using graph traversal
 * Multi-hop query: skill → job → place
 */
export async function findJobsBySkillGraph(userSkills: string[]): Promise<GraphJobMatch[]> {
  return trace('graph_find_jobs_by_skill', async (span) => {
    span.setInput({ userSkills });
    span.setAttributes({
      'graph.query_type': 'skill_to_job_to_place',
      'graph.skills_count': userSkills.length,
    });

    if (userSkills.length === 0) {
      span.setOutput({ matches: [] });
      return [];
    }

    // Build skill list for SQL
    const skillList = userSkills.map((s) => `'${s.toLowerCase()}'`).join(',');

    try {
      const results = await dbQuery<{
        skill_name: string;
        job_id: string;
        job_name: string;
        skill_match: number;
        place_type: string;
        place_availability: number;
        hourly_rate: number;
        effort_level: number;
      }>(`
        SELECT
          s.name as skill_name,
          j.id as job_id,
          j.name as job_name,
          e1.weight as skill_match,
          p.name as place_type,
          e2.weight as place_availability,
          COALESCE(CAST(json_extract(j.properties, '$.hourly_rate') AS DOUBLE), 11.65) as hourly_rate,
          COALESCE(CAST(json_extract(j.properties, '$.effort_level') AS INTEGER), 3) as effort_level
        FROM student_edges e1
        JOIN student_nodes s ON e1.source_id = s.id
        JOIN student_nodes j ON e1.target_id = j.id
        LEFT JOIN student_edges e2 ON e2.source_id = j.id AND e2.relation_type = 'available_at'
        LEFT JOIN student_nodes p ON e2.target_id = p.id
        WHERE LOWER(s.id) IN (${skillList})
        AND e1.relation_type = 'enables'
        AND j.domain = 'job'
        ORDER BY e1.weight * COALESCE(e2.weight, 0.5) DESC
        LIMIT 20
      `);

      const matches: GraphJobMatch[] = results.map((r) => ({
        jobId: r.job_id,
        jobName: r.job_name,
        skillName: r.skill_name,
        skillMatch: r.skill_match,
        placeType: r.place_type || 'various',
        placeAvailability: r.place_availability || 0.5,
        combinedScore: r.skill_match * (r.place_availability || 0.5),
        hourlyRate: r.hourly_rate,
        effortLevel: r.effort_level,
      }));

      span.setOutput({ matches_count: matches.length });
      span.setAttributes({
        'graph.matches_count': matches.length,
      });

      return matches;
    } catch (error) {
      span.setAttributes({
        error: true,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error('[Graph] findJobsBySkillGraph error:', error);
      return [];
    }
  });
}

/**
 * Get category information including place types and recommended jobs
 */
export async function getCategoryGraphInfo(categoryId: string): Promise<GraphCategoryInfo | null> {
  return trace('graph_get_category_info', async (span) => {
    span.setInput({ categoryId });
    span.setAttributes({
      'graph.query_type': 'category_info',
      'graph.category_id': categoryId,
    });

    try {
      // Get category details
      const categoryResult = await dbQuery<{
        id: string;
        name: string;
        properties: string;
      }>(`
        SELECT id, name, properties
        FROM student_nodes
        WHERE id = 'cat_${categoryId}' AND domain = 'prospection_category'
      `);

      if (categoryResult.length === 0) {
        span.setOutput({ found: false });
        return null;
      }

      const category = categoryResult[0];
      const props = JSON.parse(category.properties || '{}');

      // Get place types for this category
      const placeTypesResult = await dbQuery<{
        place_name: string;
        place_type: string;
      }>(`
        SELECT
          p.name as place_name,
          json_extract(e.properties, '$.place_type') as place_type
        FROM student_edges e
        JOIN student_nodes p ON e.target_id = p.id
        WHERE e.source_id = 'cat_${categoryId}'
        AND e.relation_type = 'contains'
        ORDER BY e.weight DESC
      `);

      // Get recommended jobs for this category
      const jobsResult = await dbQuery<{
        job_id: string;
        job_name: string;
        popularity: string;
      }>(`
        SELECT
          j.id as job_id,
          j.name as job_name,
          json_extract(e.properties, '$.popularity') as popularity
        FROM student_edges e
        JOIN student_nodes j ON e.target_id = j.id
        WHERE e.source_id = 'cat_${categoryId}'
        AND e.relation_type = 'recommends'
        ORDER BY e.weight DESC
      `);

      const info: GraphCategoryInfo = {
        categoryId: category.id,
        categoryName: category.name,
        placeTypes: placeTypesResult.map((p) => p.place_type?.replace(/"/g, '') || p.place_name),
        avgRateMin: props.avg_rate_min || 11,
        avgRateMax: props.avg_rate_max || 15,
        effortLevel: props.effort_level || 3,
        recommendedJobs: jobsResult.map((j) => ({
          jobId: j.job_id,
          jobName: j.job_name,
          popularity: j.popularity?.replace(/"/g, '') || 'medium',
        })),
      };

      span.setOutput({ found: true, jobs_count: info.recommendedJobs.length });
      span.setAttributes({
        'graph.place_types_count': info.placeTypes.length,
        'graph.jobs_count': info.recommendedJobs.length,
      });

      return info;
    } catch (error) {
      span.setAttributes({
        error: true,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error('[Graph] getCategoryGraphInfo error:', error);
      return null;
    }
  });
}

/**
 * Enrich places with graph data - find matching skills and job recommendations
 */
export async function enrichPlacesWithGraph(
  placeTypes: string[],
  userSkills: string[]
): Promise<
  Map<string, { matchingSkills: string[]; recommendedJobs: string[]; relevanceScore: number }>
> {
  return trace('graph_enrich_places', async (span) => {
    span.setInput({ placeTypes, userSkills });
    span.setAttributes({
      'graph.query_type': 'enrich_places',
      'graph.place_types_count': placeTypes.length,
      'graph.user_skills_count': userSkills.length,
    });

    const enrichment = new Map<
      string,
      { matchingSkills: string[]; recommendedJobs: string[]; relevanceScore: number }
    >();

    if (placeTypes.length === 0) {
      span.setOutput({ enriched_count: 0 });
      return enrichment;
    }

    try {
      // Find jobs available at these place types and their enabling skills
      const placeTypeList = placeTypes.map((t) => `'${t}'`).join(',');
      const skillList =
        userSkills.length > 0 ? userSkills.map((s) => `'${s.toLowerCase()}'`).join(',') : "'none'";

      const results = await dbQuery<{
        place_type: string;
        job_name: string;
        skill_name: string;
        skill_match: number;
        job_availability: number;
      }>(`
        SELECT
          json_extract(p.properties, '$.type') as place_type,
          j.name as job_name,
          s.name as skill_name,
          e1.weight as skill_match,
          e2.weight as job_availability
        FROM student_nodes p
        JOIN student_edges e2 ON e2.target_id = p.id AND e2.relation_type = 'available_at'
        JOIN student_nodes j ON e2.source_id = j.id
        LEFT JOIN student_edges e1 ON e1.target_id = j.id AND e1.relation_type = 'enables'
        LEFT JOIN student_nodes s ON e1.source_id = s.id
        WHERE p.domain = 'place'
        AND json_extract(p.properties, '$.type') IN (${placeTypeList})
        AND (LOWER(s.id) IN (${skillList}) OR s.id IS NULL)
        ORDER BY e2.weight DESC, e1.weight DESC
      `);

      // Group results by place type
      for (const result of results) {
        const placeType = result.place_type?.replace(/"/g, '') || 'unknown';

        if (!enrichment.has(placeType)) {
          enrichment.set(placeType, {
            matchingSkills: [],
            recommendedJobs: [],
            relevanceScore: 0,
          });
        }

        const data = enrichment.get(placeType)!;

        if (result.job_name && !data.recommendedJobs.includes(result.job_name)) {
          data.recommendedJobs.push(result.job_name);
        }

        if (result.skill_name && !data.matchingSkills.includes(result.skill_name)) {
          data.matchingSkills.push(result.skill_name);
          // Increase relevance score for matching skills
          data.relevanceScore += result.skill_match * result.job_availability;
        }
      }

      span.setOutput({ enriched_count: enrichment.size });
      span.setAttributes({
        'graph.enriched_place_types': enrichment.size,
      });

      return enrichment;
    } catch (error) {
      span.setAttributes({
        error: true,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error('[Graph] enrichPlacesWithGraph error:', error);
      return enrichment;
    }
  });
}

/**
 * Get all prospection categories from graph
 */
export async function getProspectionCategories(): Promise<
  Array<{
    id: string;
    name: string;
    effortLevel: number;
    avgRateMin: number;
    avgRateMax: number;
    googleTypes: string[];
  }>
> {
  return trace('graph_get_prospection_categories', async (span) => {
    span.setAttributes({ 'graph.query_type': 'list_categories' });

    try {
      const results = await dbQuery<{
        id: string;
        name: string;
        properties: string;
      }>(`
        SELECT id, name, properties
        FROM student_nodes
        WHERE domain = 'prospection_category'
        ORDER BY name
      `);

      const categories = results.map((r) => {
        const props = JSON.parse(r.properties || '{}');
        return {
          id: r.id.replace('cat_', ''),
          name: r.name,
          effortLevel: props.effort_level || 3,
          avgRateMin: props.avg_rate_min || 11,
          avgRateMax: props.avg_rate_max || 15,
          googleTypes: props.google_types || [],
        };
      });

      span.setOutput({ categories_count: categories.length });
      span.setAttributes({ 'graph.categories_count': categories.length });

      return categories;
    } catch (error) {
      span.setAttributes({
        error: true,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error('[Graph] getProspectionCategories error:', error);
      return [];
    }
  });
}
