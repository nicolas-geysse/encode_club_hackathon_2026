/**
 * ProfileMap Component
 *
 * Displays a map with the user's location in the ProfileTab.
 * Supports read-only mode (display only) and edit mode (draggable marker).
 * Uses Leaflet.js with OpenStreetMap tiles and Nominatim for reverse geocoding.
 */

import { createSignal, onCleanup, Show, createEffect, on } from 'solid-js';
import { MapPin } from 'lucide-solid';

// =============================================================================
// Types
// =============================================================================

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationChangeData {
  latitude: number;
  longitude: number;
  city: string;
  address?: string;
}

interface ProfileMapProps {
  /** Current latitude */
  latitude?: number;
  /** Current longitude */
  longitude?: number;
  /** City name to display */
  cityName?: string;
  /** Whether the map is editable (marker can be dragged) */
  editable?: boolean;
  /** Called when location changes in edit mode */
  onLocationChange?: (location: LocationChangeData) => void;
  /** Map height */
  height?: string;
  /** Search query for forward geocoding (city/address to search) */
  searchQuery?: string;
  /** Called when search is in progress */
  onSearching?: (searching: boolean) => void;
}

// =============================================================================
// Leaflet Loading (shared with MapPicker)
// =============================================================================

let leafletLoaded = false;
let leafletLoadPromise: Promise<void> | null = null;

/**
 * Dynamically load Leaflet CSS and JS from CDN
 * Required for SSR compatibility (no window during server render)
 */
function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      leafletLoaded = true;
      resolve();
      return;
    }

    // Load CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    cssLink.crossOrigin = '';
    document.head.appendChild(cssLink);

    // Load JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      leafletLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

// =============================================================================
// Reverse Geocoding
// =============================================================================

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
  };
  display_name?: string;
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Reverse geocode coordinates to city and address using OpenStreetMap Nominatim
 */
async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ city: string; address?: string } | null> {
  try {
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
      return null;
    }

    const data: NominatimResponse = await response.json();

    if (!data.address) {
      return null;
    }

    // Extract city name
    const city =
      data.address.city ||
      data.address.town ||
      data.address.village ||
      data.address.municipality ||
      data.address.state ||
      'Unknown';

    // Build address string
    const addressParts: string[] = [];
    if (data.address.house_number) addressParts.push(data.address.house_number);
    if (data.address.road) addressParts.push(data.address.road);
    if (data.address.postcode) addressParts.push(data.address.postcode);

    const address = addressParts.length > 0 ? addressParts.join(' ') : undefined;

    return { city, address };
  } catch {
    return null;
  }
}

/**
 * Forward geocode a city/address name to coordinates using OpenStreetMap Nominatim
 */
async function forwardGeocode(
  query: string
): Promise<{ latitude: number; longitude: number; city: string; address?: string } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'Stride-Financial-Coach/1.0 (educational project)',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data: NominatimSearchResult[] = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Extract city name from address
    const city =
      result.address?.city ||
      result.address?.town ||
      result.address?.village ||
      result.address?.municipality ||
      query;

    return {
      latitude: lat,
      longitude: lon,
      city,
      address: result.display_name,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Component
// =============================================================================

export default function ProfileMap(props: ProfileMapProps) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [mapInitialized, setMapInitialized] = createSignal(false);

  let mapContainer: HTMLDivElement | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let marker: any = null;

  // Check if we have valid coordinates
  const hasCoordinates = () =>
    props.latitude != null &&
    props.longitude != null &&
    !isNaN(props.latitude) &&
    !isNaN(props.longitude);

  // Handle marker drag end
  const handleMarkerDragEnd = async (lat: number, lng: number) => {
    if (!props.onLocationChange) return;

    // Reverse geocode to get city and address
    const result = await reverseGeocode(lat, lng);

    props.onLocationChange({
      latitude: lat,
      longitude: lng,
      city: result?.city || props.cityName || 'Unknown',
      address: result?.address,
    });
  };

  // Reactive map initialization - runs when coordinates become available
  // This replaces onMount to handle the case where coordinates arrive after initial render
  createEffect(
    on(
      () => [props.latitude, props.longitude, hasCoordinates()],
      async () => {
        // Only initialize once, when we have coordinates and haven't initialized yet
        if (!hasCoordinates() || mapInitialized() || !mapContainer) {
          if (!hasCoordinates()) {
            setIsLoading(false);
          }
          return;
        }

        try {
          await loadLeaflet();

          // Access Leaflet from window (loaded via CDN)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const L = (window as any).L;
          if (!L) {
            setError('Leaflet not available');
            setIsLoading(false);
            return;
          }

          // Create map
          map = L.map(mapContainer, {
            zoomControl: props.editable,
            dragging: props.editable,
            scrollWheelZoom: props.editable,
            doubleClickZoom: props.editable,
            touchZoom: props.editable,
          }).setView([props.latitude!, props.longitude!], 13);

          // Add OpenStreetMap tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(map);

          // Add marker
          marker = L.marker([props.latitude!, props.longitude!], {
            draggable: props.editable || false,
          }).addTo(map);

          // Handle marker drag in edit mode
          if (props.editable) {
            // eslint-disable-next-line solid/reactivity
            marker.on('dragend', () => {
              const pos = marker.getLatLng();
              handleMarkerDragEnd(pos.lat, pos.lng);
            });

            // Also allow clicking on map to move marker
            // eslint-disable-next-line solid/reactivity
            map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
              marker.setLatLng(e.latlng);
              handleMarkerDragEnd(e.latlng.lat, e.latlng.lng);
            });
          }

          setMapInitialized(true);
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load map');
          setIsLoading(false);
        }
      }
    )
  );

  // Update marker position when props change
  createEffect(
    on(
      () => [props.latitude, props.longitude],
      () => {
        if (marker && props.latitude != null && props.longitude != null) {
          marker.setLatLng([props.latitude, props.longitude]);
          if (map) {
            map.setView([props.latitude, props.longitude], map.getZoom());
          }
        }
      }
    )
  );

  // Forward geocoding: search by city/address name
  createEffect(
    on(
      () => props.searchQuery,
      async (query) => {
        if (!query || query.trim().length < 2) return;
        if (!props.onLocationChange) return;

        props.onSearching?.(true);

        const result = await forwardGeocode(query.trim());

        props.onSearching?.(false);

        if (result) {
          // Update marker and map if they exist
          if (marker && map) {
            marker.setLatLng([result.latitude, result.longitude]);
            map.setView([result.latitude, result.longitude], 13);
          }

          // Notify parent of new location
          props.onLocationChange({
            latitude: result.latitude,
            longitude: result.longitude,
            city: result.city,
            address: result.address,
          });
        }
      }
    )
  );

  onCleanup(() => {
    if (map) {
      map.remove();
    }
  });

  return (
    <Show
      when={hasCoordinates()}
      fallback={
        <div
          class="flex flex-col items-center justify-center bg-muted rounded-lg border border-border"
          style={{ height: props.height || '180px' }}
        >
          <MapPin class="h-8 w-8 text-muted-foreground mb-2" />
          <p class="text-sm text-muted-foreground">Location not set</p>
          <Show when={props.editable}>
            <p class="text-xs text-muted-foreground mt-1">
              Use geolocation during onboarding to set your location
            </p>
          </Show>
        </div>
      }
    >
      <div class="space-y-1 relative z-0">
        {/* Map container - z-0 creates stacking context to keep Leaflet's high z-indexes contained */}
        <div
          ref={mapContainer}
          class="w-full rounded-lg border border-border overflow-hidden relative z-0"
          style={{ height: props.height || '180px' }}
        >
          <Show when={isLoading()}>
            <div class="h-full flex items-center justify-center bg-muted">
              <div class="flex items-center gap-2 text-muted-foreground text-sm">
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading map...
              </div>
            </div>
          </Show>
          <Show when={error()}>
            <div class="h-full flex items-center justify-center bg-muted">
              <p class="text-sm text-destructive">{error()}</p>
            </div>
          </Show>
        </div>

        {/* Help text in edit mode */}
        <Show when={props.editable}>
          <p class="text-xs text-muted-foreground">
            Drag the marker or click on the map to adjust your location.
          </p>
        </Show>
      </div>
    </Show>
  );
}
