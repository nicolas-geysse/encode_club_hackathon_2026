/**
 * Tests for Prospection Tools
 *
 * Tests MCP prospection tools:
 * - handleSearchNearbyJobs: Find local businesses for potential jobs
 * - handleCalculateCommute: Calculate commute time from user location
 * - handleSearchJobOffers: Search online job listings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSearchNearbyJobs,
  handleCalculateCommute,
  handleSearchJobOffers,
  handleProspectionTool,
  PROSPECTION_TOOLS,
} from '../prospection.js';

// Helper type for tool results
interface ToolResult {
  type: string;
  params?: {
    content?: string;
    rows?: unknown[];
    title?: string;
  };
  components?: unknown[];
  metadata?: {
    traceId?: string;
    places?: unknown[];
    category?: string;
    error?: string | boolean;
    results?: unknown[];
    mode?: string;
    query?: string;
    city?: string;
  };
}

// Mock the opik trace function
vi.mock('../../services/opik.js', () => ({
  trace: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
    const mockSpan = {
      setInput: vi.fn(),
      setOutput: vi.fn(),
      setAttributes: vi.fn(),
    };
    return fn(mockSpan);
  }),
  getCurrentTraceId: vi.fn(() => 'test-trace-id'),
}));

// Mock Google Maps service
vi.mock('../../services/google-maps.js', () => ({
  findNearbyPlaces: vi.fn(),
  getDistanceMatrix: vi.fn(),
  isGoogleMapsAvailable: vi.fn(),
}));

// Mock Groq service
vi.mock('../../services/groq.js', () => ({
  chat: vi.fn(),
}));

import {
  findNearbyPlaces,
  getDistanceMatrix,
  isGoogleMapsAvailable,
} from '../../services/google-maps.js';
import { chat } from '../../services/groq.js';

// ============================================
// HELPERS
// ============================================

function createMockPlace(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    placeId: id,
    name,
    address: `${name} address`,
    location: { lat: 48.85 + Math.random() * 0.1, lng: 2.35 + Math.random() * 0.1 },
    rating: 4.2,
    priceLevel: 2,
    openNow: true,
    types: ['restaurant'],
    ...overrides,
  };
}

// ============================================
// TOOL DEFINITIONS TESTS
// ============================================

describe('PROSPECTION_TOOLS definitions', () => {
  it('has search_nearby_jobs tool', () => {
    expect(PROSPECTION_TOOLS.search_nearby_jobs).toBeDefined();
    expect(PROSPECTION_TOOLS.search_nearby_jobs.inputSchema.required).toContain('latitude');
    expect(PROSPECTION_TOOLS.search_nearby_jobs.inputSchema.required).toContain('longitude');
    expect(PROSPECTION_TOOLS.search_nearby_jobs.inputSchema.required).toContain('category');
  });

  it('has calculate_commute tool', () => {
    expect(PROSPECTION_TOOLS.calculate_commute).toBeDefined();
    expect(PROSPECTION_TOOLS.calculate_commute.inputSchema.required).toContain('origin_lat');
    expect(PROSPECTION_TOOLS.calculate_commute.inputSchema.required).toContain('origin_lng');
    expect(PROSPECTION_TOOLS.calculate_commute.inputSchema.required).toContain('destinations');
  });

  it('has search_job_offers tool', () => {
    expect(PROSPECTION_TOOLS.search_job_offers).toBeDefined();
    expect(PROSPECTION_TOOLS.search_job_offers.inputSchema.required).toContain('query');
    expect(PROSPECTION_TOOLS.search_job_offers.inputSchema.required).toContain('city');
  });
});

// ============================================
// handleSearchNearbyJobs TESTS
// ============================================

describe('handleSearchNearbyJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when Google Maps API is not available', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(false);

    const result = (await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'service',
    })) as ToolResult;

    expect(result.type).toBe('text');
    expect(result.params?.content).toContain('Google Maps API not configured');
    expect(result.metadata?.error).toBe('api_not_configured');
  });

  it('returns message when category has no place types', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);

    const result = (await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'handyman', // No Google Places types
    })) as ToolResult;

    expect(result.type).toBe('text');
    expect(result.params?.content).toContain("doesn't have direct Google Places types");
  });

  it('searches nearby places for valid category', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);
    vi.mocked(findNearbyPlaces).mockResolvedValue([
      createMockPlace('place1', 'Restaurant A'),
      createMockPlace('place2', 'Café B'),
    ]);

    const result = (await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'service',
      radius: 3000,
    })) as ToolResult;

    expect(findNearbyPlaces).toHaveBeenCalled();
    expect(result.type).toBe('composite');
    expect(result.metadata?.places).toHaveLength(2);
    expect(result.metadata?.category).toBe('service');
  });

  it('deduplicates places with same placeId', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);

    // Simulate same place returned from different type searches
    const duplicatePlace = createMockPlace('same-id', 'Duplicate Place');
    vi.mocked(findNearbyPlaces)
      .mockResolvedValueOnce([duplicatePlace, createMockPlace('place1', 'Place 1')])
      .mockResolvedValueOnce([duplicatePlace, createMockPlace('place2', 'Place 2')]);

    const result = (await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'service',
    })) as ToolResult;

    // Should have 3 unique places, not 4
    expect((result.metadata?.places as unknown[])?.length).toBeLessThanOrEqual(3);
  });

  it('uses default radius when not provided', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);
    vi.mocked(findNearbyPlaces).mockResolvedValue([]);

    await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'service',
    });

    // Check that findNearbyPlaces was called with radius: 5000 (default)
    expect(findNearbyPlaces).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({ radius: 5000 })
    );
  });
});

// ============================================
// handleCalculateCommute TESTS
// ============================================

describe('handleCalculateCommute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when Google Maps API is not available', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(false);

    const result = await handleCalculateCommute({
      origin_lat: 48.8566,
      origin_lng: 2.3522,
      destinations: [{ lat: 48.87, lng: 2.36 }],
    });

    expect(result.type).toBe('text');
    expect(result.params.content).toContain('Google Maps API not configured');
    expect(result.metadata.error).toBe('api_not_configured');
  });

  it('calculates distance for single destination', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);
    vi.mocked(getDistanceMatrix).mockResolvedValue([
      {
        destination: { lat: 48.87, lng: 2.36 },
        distanceMeters: 2500,
        distanceText: '2.5 km',
        durationSeconds: 900,
        durationText: '15 min',
      },
    ]);

    const result = await handleCalculateCommute({
      origin_lat: 48.8566,
      origin_lng: 2.3522,
      destinations: [{ lat: 48.87, lng: 2.36 }],
      mode: 'walking',
    });

    expect(result.type).toBe('table');
    expect(result.params.rows).toHaveLength(1);
    expect(result.metadata.mode).toBe('walking');
  });

  it('calculates distance for multiple destinations', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);
    vi.mocked(getDistanceMatrix).mockResolvedValue([
      {
        destination: { lat: 48.87, lng: 2.36 },
        distanceMeters: 2500,
        distanceText: '2.5 km',
        durationSeconds: 900,
        durationText: '15 min',
      },
      {
        destination: { lat: 48.88, lng: 2.37 },
        distanceMeters: 4000,
        distanceText: '4 km',
        durationSeconds: 1800,
        durationText: '30 min',
      },
    ]);

    const result = await handleCalculateCommute({
      origin_lat: 48.8566,
      origin_lng: 2.3522,
      destinations: [
        { lat: 48.87, lng: 2.36 },
        { lat: 48.88, lng: 2.37 },
      ],
    });

    expect(result.params.rows).toHaveLength(2);
    expect(result.metadata.results).toHaveLength(2);
  });

  it('uses transit mode by default', async () => {
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(true);
    vi.mocked(getDistanceMatrix).mockResolvedValue([]);

    await handleCalculateCommute({
      origin_lat: 48.8566,
      origin_lng: 2.3522,
      destinations: [{ lat: 48.87, lng: 2.36 }],
    });

    expect(getDistanceMatrix).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      'transit'
    );
  });
});

// ============================================
// handleSearchJobOffers TESTS
// ============================================

describe('handleSearchJobOffers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns job offers from Groq response', async () => {
    vi.mocked(chat).mockResolvedValue(
      JSON.stringify({
        results: [
          {
            title: 'Serveur étudiant',
            company: 'Le Petit Bistrot',
            location: 'Paris 5e',
            salary: '11.65€/h',
            schedule: 'Weekends',
            url: 'https://example.com/job1',
            source: 'Indeed',
            snippet: 'Restaurant recherche serveur...',
          },
          {
            title: 'Barista',
            company: 'Starbucks',
            location: 'Paris 6e',
            salary: '12€/h',
            schedule: 'Temps partiel',
            url: 'https://example.com/job2',
            source: 'StudentJob',
            snippet: 'Nous recherchons un barista...',
          },
        ],
      })
    );

    const result = (await handleSearchJobOffers({
      query: 'serveur étudiant',
      city: 'Paris',
      max_results: 5,
    })) as ToolResult;

    expect(result.type).toBe('composite');
    expect(result.metadata?.results).toHaveLength(2);
    expect(result.metadata?.query).toBe('serveur étudiant');
    expect(result.metadata?.city).toBe('Paris');
  });

  it('handles empty results gracefully', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ results: [] }));

    const result = (await handleSearchJobOffers({
      query: 'impossible job',
      city: 'Nowhere',
    })) as ToolResult;

    expect(result.type).toBe('text');
    expect(result.params?.content).toContain('No job offers found');
  });

  it('handles malformed JSON response', async () => {
    vi.mocked(chat).mockResolvedValue('This is not JSON');

    const result = (await handleSearchJobOffers({
      query: 'test',
      city: 'Paris',
    })) as ToolResult;

    // Should handle gracefully and return no results message
    expect(result.type).toBe('text');
  });

  it('handles API errors', async () => {
    vi.mocked(chat).mockRejectedValue(new Error('API rate limit exceeded'));

    const result = (await handleSearchJobOffers({
      query: 'test',
      city: 'Paris',
    })) as ToolResult;

    expect(result.type).toBe('text');
    expect(result.params?.content).toContain('Error searching for jobs');
    expect(result.metadata?.error).toBe(true);
  });

  it('uses default max_results when not provided', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ results: [] }));

    await handleSearchJobOffers({
      query: 'test',
      city: 'Paris',
    });

    expect(chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining('5 offres') }),
      ]),
      expect.any(Object)
    );
  });
});

// ============================================
// handleProspectionTool DISPATCHER TESTS
// ============================================

describe('handleProspectionTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGoogleMapsAvailable).mockReturnValue(false);
  });

  it('dispatches to handleSearchNearbyJobs', async () => {
    const result = await handleProspectionTool('search_nearby_jobs', {
      latitude: 48.85,
      longitude: 2.35,
      category: 'service',
    });

    expect(result).toHaveProperty('type');
  });

  it('dispatches to handleCalculateCommute', async () => {
    const result = await handleProspectionTool('calculate_commute', {
      origin_lat: 48.85,
      origin_lng: 2.35,
      destinations: [],
    });

    expect(result).toHaveProperty('type');
  });

  it('dispatches to handleSearchJobOffers', async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ results: [] }));

    const result = await handleProspectionTool('search_job_offers', {
      query: 'test',
      city: 'Paris',
    });

    expect(result).toHaveProperty('type');
  });

  it('throws error for unknown tool', async () => {
    await expect(handleProspectionTool('unknown_tool', {})).rejects.toThrow(
      'Unknown prospection tool: unknown_tool'
    );
  });
});
