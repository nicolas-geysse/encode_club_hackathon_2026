/**
 * Google Maps Service
 *
 * Provides location-based services for job prospection:
 * - Places API: Find nearby businesses (restaurants, stores, etc.)
 * - Distance Matrix API: Calculate commute times from user location
 *
 * Pattern follows services/groq.ts with lazy initialization.
 */

import { trace, createSpan, getCurrentTraceHandle, type SpanOptions } from './opik.js';

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// =============================================================================
// Types
// =============================================================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  placeId: string;
  name: string;
  address: string;
  location: Coordinates;
  rating?: number;
  priceLevel?: number;
  openNow?: boolean;
  types: string[];
  photoUrl?: string;
}

export interface DistanceResult {
  destination: Coordinates;
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
}

export type PlaceType =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'store'
  | 'supermarket'
  | 'library'
  | 'university'
  | 'gym'
  | 'lodging'
  | 'shopping_mall'
  | 'clothing_store'
  | 'school'
  | 'meal_takeaway';

export type TravelMode = 'walking' | 'bicycling' | 'transit' | 'driving';

// =============================================================================
// Initialization
// =============================================================================

let initialized = false;

/**
 * Initialize Google Maps service
 */
export async function initGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('Warning: GOOGLE_MAPS_API_KEY not set, location features disabled');
    return;
  }

  initialized = true;
  console.error('Google Maps service initialized');
}

/**
 * Check if Google Maps is available
 */
export function isGoogleMapsAvailable(): boolean {
  return initialized && !!GOOGLE_MAPS_API_KEY;
}

// =============================================================================
// Places API
// =============================================================================

interface PlacesApiResponse {
  results: Array<{
    place_id: string;
    name: string;
    vicinity: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    rating?: number;
    price_level?: number;
    opening_hours?: {
      open_now?: boolean;
    };
    types: string[];
    photos?: Array<{
      photo_reference: string;
    }>;
  }>;
  status: string;
  error_message?: string;
}

/**
 * Find places near a location using Google Places API
 */
export async function findNearbyPlaces(
  location: Coordinates,
  type: PlaceType,
  options?: {
    radius?: number;
    keyword?: string;
    maxResults?: number;
  }
): Promise<Place[]> {
  const radius = options?.radius ?? 5000;
  const maxResults = options?.maxResults ?? 20;

  // Core logic
  const executePlacesSearch = async (span: import('./opik.js').Span): Promise<Place[]> => {
    span.setInput({ location, type, radius, keyword: options?.keyword });
    span.setAttributes({
      'places.type': type,
      'places.radius': radius,
      'places.keyword': options?.keyword || null,
    });

    if (!GOOGLE_MAPS_API_KEY) {
      span.setAttributes({ error: 'API key not configured' });
      return [];
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${location.lat},${location.lng}`);
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('type', type);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    if (options?.keyword) {
      url.searchParams.set('keyword', options.keyword);
    }

    const response = await fetch(url.toString());
    const data = (await response.json()) as PlacesApiResponse;

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      span.setAttributes({
        error: true,
        error_status: data.status,
        error_message: data.error_message,
      });
      console.error(`Google Places API error: ${data.status} - ${data.error_message}`);
      return [];
    }

    const places: Place[] = data.results.slice(0, maxResults).map((p) => ({
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity,
      location: {
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
      },
      rating: p.rating,
      priceLevel: p.price_level,
      openNow: p.opening_hours?.open_now,
      types: p.types,
      photoUrl: p.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
        : undefined,
    }));

    span.setOutput({ places_count: places.length });
    span.setAttributes({
      'places.results_count': places.length,
    });

    return places;
  };

  // Use createSpan if inside existing trace, otherwise create new trace
  const hasParentTrace = !!getCurrentTraceHandle();
  const spanOptions: SpanOptions = {
    tags: ['google-maps', 'places'],
    input: { location, type, radius },
    type: 'tool',
  };

  if (hasParentTrace) {
    return createSpan('google_places_nearby', executePlacesSearch, spanOptions);
  } else {
    return trace('google_places_nearby', executePlacesSearch, {
      tags: ['google-maps', 'places'],
      metadata: { location, type, radius },
      input: { location, type, radius },
    });
  }
}

// =============================================================================
// Distance Matrix API
// =============================================================================

interface DistanceMatrixApiResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      distance?: {
        value: number;
        text: string;
      };
      duration?: {
        value: number;
        text: string;
      };
    }>;
  }>;
  status: string;
  error_message?: string;
}

/**
 * Calculate travel time and distance between locations using Distance Matrix API
 */
export async function getDistanceMatrix(
  origin: Coordinates,
  destinations: Coordinates[],
  mode: TravelMode = 'transit'
): Promise<DistanceResult[]> {
  // Core logic
  const executeDistanceCalculation = async (
    span: import('./opik.js').Span
  ): Promise<DistanceResult[]> => {
    span.setInput({ origin, destinations_count: destinations.length, mode });
    span.setAttributes({
      'distance.mode': mode,
      'distance.destinations_count': destinations.length,
    });

    if (!GOOGLE_MAPS_API_KEY) {
      span.setAttributes({ error: 'API key not configured' });
      return [];
    }

    // Distance Matrix API supports max 25 destinations per request
    const limitedDestinations = destinations.slice(0, 25);
    const destString = limitedDestinations.map((d) => `${d.lat},${d.lng}`).join('|');

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', destString);
    url.searchParams.set('mode', mode);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const response = await fetch(url.toString());
    const data = (await response.json()) as DistanceMatrixApiResponse;

    if (data.status !== 'OK') {
      span.setAttributes({
        error: true,
        error_status: data.status,
        error_message: data.error_message,
      });
      console.error(`Distance Matrix API error: ${data.status} - ${data.error_message}`);
      return [];
    }

    const results: DistanceResult[] = data.rows[0].elements.map((el, i) => ({
      destination: limitedDestinations[i],
      distanceMeters: el.distance?.value || 0,
      distanceText: el.distance?.text || 'N/A',
      durationSeconds: el.duration?.value || 0,
      durationText: el.duration?.text || 'N/A',
    }));

    span.setOutput({ results_count: results.length });
    span.setAttributes({
      'distance.results_count': results.length,
    });

    return results;
  };

  // Use createSpan if inside existing trace, otherwise create new trace
  const hasParentTrace = !!getCurrentTraceHandle();
  const spanOptions: SpanOptions = {
    tags: ['google-maps', 'distance'],
    input: { origin, destinations_count: destinations.length, mode },
    type: 'tool',
  };

  if (hasParentTrace) {
    return createSpan('google_distance_matrix', executeDistanceCalculation, spanOptions);
  } else {
    return trace('google_distance_matrix', executeDistanceCalculation, {
      tags: ['google-maps', 'distance'],
      metadata: { origin, destinations_count: destinations.length, mode },
      input: { origin, destinations_count: destinations.length, mode },
    });
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

// =============================================================================
// Export
// =============================================================================

export const googleMaps = {
  init: initGoogleMaps,
  isAvailable: isGoogleMapsAvailable,
  findNearbyPlaces,
  getDistanceMatrix,
  calculateDistance,
  formatDistance,
  formatDuration,
};

export default googleMaps;
