/**
 * MapPicker Component
 *
 * Displays an interactive map for refining location after geolocation detection.
 * Uses Leaflet.js with OpenStreetMap tiles (free, no API key required).
 */

import { createSignal, onMount, onCleanup, Show } from 'solid-js';

// =============================================================================
// Types
// =============================================================================

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

interface MapPickerProps {
  /** Initial coordinates (usually from geolocation) */
  initialCoordinates: MapCoordinates;
  /** City name to display */
  cityName: string;
  /** Called when marker position changes */
  onCoordinatesChange?: (coords: MapCoordinates) => void;
  /** Called when user confirms the location */
  onConfirm?: (coords: MapCoordinates) => void;
  /** Map height */
  height?: string;
}

// =============================================================================
// Leaflet Loading
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
// Component
// =============================================================================

export default function MapPicker(props: MapPickerProps) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [currentCoords, setCurrentCoords] = createSignal<MapCoordinates>(props.initialCoordinates);

  let mapContainer: HTMLDivElement | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let marker: any = null;

  onMount(async () => {
    try {
      await loadLeaflet();

      if (!mapContainer) return;

      // Access Leaflet from window (loaded via CDN)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (!L) {
        setError('Leaflet not available');
        return;
      }

      // Create map
      map = L.map(mapContainer).setView(
        [props.initialCoordinates.latitude, props.initialCoordinates.longitude],
        13
      );

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add draggable marker
      marker = L.marker([props.initialCoordinates.latitude, props.initialCoordinates.longitude], {
        draggable: true,
      }).addTo(map);

      // Update coordinates when marker is dragged
      // eslint-disable-next-line solid/reactivity
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const newCoords = { latitude: pos.lat, longitude: pos.lng };
        setCurrentCoords(newCoords);
        props.onCoordinatesChange?.(newCoords);
      });

      // Also allow clicking on map to move marker
      // eslint-disable-next-line solid/reactivity
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        const newCoords = { latitude: e.latlng.lat, longitude: e.latlng.lng };
        setCurrentCoords(newCoords);
        props.onCoordinatesChange?.(newCoords);
      });

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map');
      setIsLoading(false);
    }
  });

  onCleanup(() => {
    if (map) {
      map.remove();
    }
  });

  const handleConfirm = () => {
    props.onConfirm?.(currentCoords());
  };

  return (
    <div class="space-y-2">
      {/* Map container */}
      <div
        ref={mapContainer}
        class="w-full rounded-lg border border-border overflow-hidden"
        style={{ height: props.height || '200px' }}
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

      {/* Location info and confirm */}
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span class="font-medium text-foreground">{props.cityName}</span>
          <span class="ml-2">
            ({currentCoords().latitude.toFixed(4)}, {currentCoords().longitude.toFixed(4)})
          </span>
        </div>
        <Show when={props.onConfirm}>
          <button
            type="button"
            onClick={handleConfirm}
            class="px-3 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
          >
            Confirm location
          </button>
        </Show>
      </div>

      {/* Help text */}
      <p class="text-xs text-muted-foreground">
        Drag the marker or click on the map to adjust your location.
      </p>
    </div>
  );
}
