/**
 * ProspectionMap Component
 *
 * Displays saved leads on a map with user location.
 * Uses Leaflet.js with OpenStreetMap tiles.
 */

import { createSignal, onCleanup, Show, createEffect, on, For } from 'solid-js';
import { MapPin } from 'lucide-solid';
import type { Lead, ProspectionCard } from '~/lib/prospectionTypes';
import { getCategoryById } from '~/config/prospectionCategories';

// =============================================================================
// Types
// =============================================================================

interface ProspectionMapProps {
  /** User's location */
  userLocation?: { lat: number; lng: number };
  /** Saved leads to display */
  leads?: Lead[];
  /** Current cards (during swiping) */
  currentCards?: ProspectionCard[];
  /** Highlighted card/lead ID */
  highlightedId?: string;
  /** Map height */
  height?: string;
  /** Called when a marker is clicked */
  onMarkerClick?: (id: string) => void;
}

// =============================================================================
// Leaflet Loading
// =============================================================================

let leafletLoaded = false;
let leafletLoadPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      leafletLoaded = true;
      resolve();
      return;
    }

    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    cssLink.crossOrigin = '';
    document.head.appendChild(cssLink);

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
// Category Colors
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  service: '#f97316', // orange
  retail: '#3b82f6', // blue
  cleaning: '#8b5cf6', // purple
  handyman: '#f59e0b', // amber
  childcare: '#ec4899', // pink
  tutoring: '#10b981', // emerald
  events: '#f43f5e', // rose
  interim: '#6366f1', // indigo
  digital: '#06b6d4', // cyan
  campus: '#84cc16', // lime
};

function getCategoryColor(categoryId: string): string {
  return CATEGORY_COLORS[categoryId] || '#6b7280';
}

// =============================================================================
// Component
// =============================================================================

export function ProspectionMap(props: ProspectionMapProps) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [mapInitialized, setMapInitialized] = createSignal(false);

  let mapContainer: HTMLDivElement | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  let _userMarker: unknown = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadMarkers: Map<string, any> = new Map();

  const hasLocation = () => props.userLocation?.lat != null && props.userLocation?.lng != null;

  // Initialize map when we have coordinates
  createEffect(
    on(
      () => [props.userLocation?.lat, props.userLocation?.lng, hasLocation()],
      async () => {
        if (!hasLocation() || mapInitialized() || !mapContainer) {
          if (!hasLocation()) setIsLoading(false);
          return;
        }

        try {
          await loadLeaflet();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const L = (window as any).L;
          if (!L) {
            setError('Leaflet not available');
            setIsLoading(false);
            return;
          }

          // Create map
          map = L.map(mapContainer, {
            zoomControl: true,
            scrollWheelZoom: true,
          }).setView([props.userLocation!.lat, props.userLocation!.lng], 13);

          // Add tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(map);

          // Add user marker
          const userIcon = L.divIcon({
            html: `<div class="w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
              <div class="w-2 h-2 bg-white rounded-full"></div>
            </div>`,
            className: 'user-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          _userMarker = L.marker([props.userLocation!.lat, props.userLocation!.lng], {
            icon: userIcon,
          })
            .addTo(map)
            .bindPopup('<strong>Your Location</strong>');

          setMapInitialized(true);
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load map');
          setIsLoading(false);
        }
      }
    )
  );

  // Update markers when leads change
  createEffect(
    on(
      () => props.leads,
      (leads) => {
        if (!map || !leads) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        if (!L) return;

        // Clear old markers
        leadMarkers.forEach((marker) => marker.remove());
        leadMarkers.clear();

        // Add new markers
        leads.forEach((lead) => {
          if (lead.lat == null || lead.lng == null) return;

          const color = getCategoryColor(lead.category);
          const category = getCategoryById(lead.category);

          const icon = L.divIcon({
            html: `<div class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold" style="background-color: ${color}">
              ${category?.label?.charAt(0) || '?'}
            </div>`,
            className: 'lead-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          });

          const marker = L.marker([lead.lat, lead.lng], { icon }).addTo(map).bindPopup(`
              <div class="p-2">
                <strong>${lead.title}</strong><br/>
                <span class="text-gray-600">${lead.company || ''}</span><br/>
                ${lead.commuteTimeMins ? `<span class="text-sm">🚶 ${lead.commuteTimeMins} min</span>` : ''}
              </div>
            `);

          marker.on('click', () => {
            props.onMarkerClick?.(lead.id);
          });

          leadMarkers.set(lead.id, marker);
        });

        // Fit bounds if we have markers
        if (leads.length > 0 && props.userLocation) {
          const bounds = L.latLngBounds([
            [props.userLocation.lat, props.userLocation.lng],
            ...leads.filter((l) => l.lat != null && l.lng != null).map((l) => [l.lat!, l.lng!]),
          ]);
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    )
  );

  // Highlight selected marker
  createEffect(
    on(
      () => props.highlightedId,
      (id) => {
        if (!id || !map) return;
        const marker = leadMarkers.get(id);
        if (marker) {
          marker.openPopup();
          map.setView(marker.getLatLng(), 15);
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
      when={hasLocation()}
      fallback={
        <div
          class="flex flex-col items-center justify-center bg-muted rounded-lg border border-border"
          style={{ height: props.height || '300px' }}
        >
          <MapPin class="h-8 w-8 text-muted-foreground mb-2" />
          <p class="text-sm text-muted-foreground">Location not available</p>
          <p class="text-xs text-muted-foreground mt-1">
            Enable location in your profile to see the map
          </p>
        </div>
      }
    >
      <div class="space-y-2 relative z-0">
        {/* Map container */}
        <div
          ref={mapContainer}
          class="w-full rounded-lg border border-border overflow-hidden relative z-0"
          style={{ height: props.height || '300px' }}
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

        {/* Legend */}
        <Show when={props.leads && props.leads.length > 0}>
          <div class="flex flex-wrap gap-2 text-xs">
            <div class="flex items-center gap-1">
              <div class="w-3 h-3 bg-blue-500 rounded-full border border-white" />
              <span class="text-muted-foreground">You</span>
            </div>
            <For each={[...new Set(props.leads?.map((l) => l.category))]}>
              {(categoryId) => {
                const category = getCategoryById(categoryId);
                return (
                  <div class="flex items-center gap-1">
                    <div
                      class="w-3 h-3 rounded-full border border-white"
                      style={{ 'background-color': getCategoryColor(categoryId) }}
                    />
                    <span class="text-muted-foreground">{category?.label || categoryId}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
