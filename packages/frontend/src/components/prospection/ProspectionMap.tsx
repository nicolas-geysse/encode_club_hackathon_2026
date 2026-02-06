/**
 * ProspectionMap Component
 *
 * Displays saved leads on a map with user location.
 * Uses Leaflet.js with OpenStreetMap tiles.
 */

import { createSignal, onCleanup, Show, createEffect, on, For } from 'solid-js';
import { MapPin } from 'lucide-solid';
import type { Lead, ProspectionCard } from '~/lib/prospectionTypes';
import type { ScoredJob } from '~/lib/jobScoring';
import { getScoreColor, isTopPick } from '~/lib/jobScoring';
import { getCategoryById } from '~/config/prospectionCategories';

// =============================================================================
// Types
// =============================================================================

interface ProspectionMapProps {
  /** User's location */
  userLocation?: { lat: number; lng: number };
  /** Saved leads to display */
  leads?: Lead[];
  /** Current cards (during swiping) - Phase 8: Now typed as ScoredJob for score-based coloring */
  currentCards?: ScoredJob[];
  /** Highlighted card/lead ID */
  highlightedId?: string;
  /** Map height */
  height?: string;
  /** Called when a marker is clicked */
  onMarkerClick?: (id: string) => void;
  /** Called when save button is clicked on a card */
  onSaveCard?: (card: ScoredJob) => void;
  /** Set of already saved card IDs */
  savedCardIds?: Set<string>;
  /** Called when exclude (thumb down) button is clicked on a card */
  onExcludeCard?: (card: ScoredJob) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/** Escape HTML to prevent XSS in popup content */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// Leaflet Loading
// =============================================================================

let leafletLoaded = false;
let leafletLoadPromise: Promise<void> | null = null;
let pulseStylesInjected = false;

/**
 * Inject CSS animations for map markers (Phase 8)
 */
function injectPulseStyles(): void {
  if (pulseStylesInjected) return;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes ping {
      75%, 100% {
        transform: scale(2);
        opacity: 0;
      }
    }
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.8;
      }
    }
    .card-marker.top-pick {
      z-index: 1000 !important;
    }
    .leaflet-marker-icon.card-marker {
      background: transparent !important;
      border: none !important;
    }
  `;
  document.head.appendChild(style);
  pulseStylesInjected = true;
}

function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      leafletLoaded = true;
      injectPulseStyles(); // Phase 8: Inject pulse animation styles
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
      injectPulseStyles(); // Phase 8: Inject pulse animation styles
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardMarkers: Map<string, any> = new Map();

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

        // Guard: Ensure mapContainer is mounted in the DOM before initializing Leaflet
        if (!mapContainer.isConnected) {
          // Container not yet in DOM — schedule a retry after paint
          requestAnimationFrame(() => {
            if (mapContainer?.isConnected && !mapInitialized()) {
              // Re-trigger effect by reading tracked signals
              void [props.userLocation?.lat, props.userLocation?.lng];
            }
          });
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

          // Create map — catch Leaflet init errors (e.g., container already initialized)
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
  // Also re-run when map becomes initialized
  createEffect(
    on(
      () => [props.leads, mapInitialized()] as const,
      ([leads, initialized]) => {
        if (!map || !leads || !initialized) return;

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

  // Update markers when currentCards change (search results)
  // Also re-run when map becomes initialized
  createEffect(
    on(
      () => [props.currentCards, mapInitialized()] as const,
      ([cards, initialized]) => {
        if (!map || !cards || !initialized) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        if (!L) return;

        // Clear old card markers
        cardMarkers.forEach((marker) => marker.remove());
        cardMarkers.clear();

        // Store cards for popup button handlers
        const cardDataMap = new Map<string, ScoredJob>();

        // Add new markers for search results
        // Phase 8: Color by SCORE (not category) + pulse animation for top picks
        cards.forEach((card) => {
          if (card.lat == null || card.lng == null) return;

          // Phase 8: Use score-based color instead of category color
          const scoreColor = getScoreColor(card.score);
          const category = getCategoryById(card.categoryId);
          const isSaved = props.savedCardIds?.has(card.id) ?? false;
          const isTop = isTopPick(card.score);

          // Store card data for popup handlers
          cardDataMap.set(card.id, card);

          // Phase 8: Markers colored by score with pulse animation for top picks
          const pulseAnimation = isTop
            ? 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;'
            : '';
          const pulseRing = isTop
            ? `<div class="absolute inset-0 rounded-full" style="background-color: ${scoreColor}; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : '';

          const icon = L.divIcon({
            html: `<div class="relative w-8 h-8 flex items-center justify-center">
              ${pulseRing}
              <div class="w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-bold relative z-10" style="background-color: ${scoreColor}; ${pulseAnimation}">
                ${card.score.toFixed(1)}
              </div>
            </div>`,
            className: `card-marker ${isTop ? 'top-pick' : ''}`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          });

          // Phase 8: Enhanced popup with score badge and match info
          const scoreBadgeColor =
            card.score >= 4.5
              ? 'bg-green-500'
              : card.score >= 4.0
                ? 'bg-lime-500'
                : card.score >= 3.5
                  ? 'bg-yellow-500'
                  : card.score >= 3.0
                    ? 'bg-orange-500'
                    : 'bg-red-500';
          const certBadge =
            card.matchedCertifications && card.matchedCertifications.length > 0
              ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">🎓 ${card.matchedCertifications[0].name}</span>`
              : '';

          const popupContent = `
            <div class="p-2 min-w-[200px]">
              <div class="flex items-start justify-between gap-2 mb-1">
                <strong class="text-sm block">${escapeHtml(card.company || card.title)}</strong>
                <span class="shrink-0 px-1.5 py-0.5 ${scoreBadgeColor} text-white text-xs font-bold rounded">
                  ${card.score.toFixed(1)}⭐
                </span>
              </div>
              <span class="text-xs text-gray-600 block mb-2">${escapeHtml(card.title)}</span>
              <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-3">
                ${card.commuteText ? `<span>🚶 ${card.commuteText}</span>` : ''}
                ${certBadge}
              </div>
              <div class="flex gap-2">
                <button
                  data-action="save"
                  data-card-id="${card.id}"
                  class="flex-1 px-3 py-1.5 text-xs font-medium rounded ${
                    isSaved
                      ? 'bg-green-100 text-green-600 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }"
                  ${isSaved ? 'disabled' : ''}
                >
                  ${isSaved ? '✓ Saved' : '👍 Interested'}
                </button>
                <button
                  data-action="exclude"
                  data-card-id="${card.id}"
                  class="px-3 py-1.5 text-xs font-medium rounded bg-red-50 text-red-600 hover:bg-red-100"
                  title="Not interested"
                >
                  👎
                </button>
                ${
                  card.url
                    ? `
                  <a
                    href="${card.url}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 text-center"
                  >
                    🔗 View
                  </a>
                `
                    : ''
                }
              </div>
            </div>
          `;

          const marker = L.marker([card.lat, card.lng], { icon })
            .addTo(map)
            .bindPopup(popupContent);

          // Handle popup button clicks
          marker.on('popupopen', () => {
            const popup = marker.getPopup();
            if (!popup) return;
            const container = popup.getElement();
            if (!container) return;

            // Attach save button handler
            const saveBtn = container.querySelector('[data-action="save"]') as HTMLButtonElement;
            if (saveBtn && !saveBtn.disabled) {
              saveBtn.onclick = () => {
                const cardId = saveBtn.dataset.cardId;
                const cardData = cardId ? cardDataMap.get(cardId) : null;
                if (cardData && props.onSaveCard) {
                  props.onSaveCard(cardData);
                  saveBtn.disabled = true;
                  saveBtn.textContent = '✓ Saved';
                  saveBtn.className =
                    'flex-1 px-3 py-1.5 text-xs font-medium rounded bg-gray-200 text-gray-500 cursor-not-allowed';
                }
              };
            }

            // Attach exclude button handler
            const excludeBtn = container.querySelector(
              '[data-action="exclude"]'
            ) as HTMLButtonElement;
            if (excludeBtn) {
              excludeBtn.onclick = () => {
                const cardId = excludeBtn.dataset.cardId;
                const cardData = cardId ? cardDataMap.get(cardId) : null;
                if (cardData && props.onExcludeCard) {
                  props.onExcludeCard(cardData);
                  marker.closePopup();
                  // Remove this marker from the map
                  marker.remove();
                  cardMarkers.delete(cardData.id);
                }
              };
            }
          });

          marker.on('click', () => {
            props.onMarkerClick?.(card.id);
          });

          cardMarkers.set(card.id, marker);
        });

        // Fit bounds to show all cards
        const validCards = cards.filter((c) => c.lat != null && c.lng != null);
        if (validCards.length > 0 && props.userLocation) {
          const bounds = L.latLngBounds([
            [props.userLocation.lat, props.userLocation.lng],
            ...validCards.map((c) => [c.lat!, c.lng!]),
          ]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
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
        // Check both lead and card markers
        const marker = leadMarkers.get(id) || cardMarkers.get(id);
        if (marker) {
          marker.openPopup();
          map.setView(marker.getLatLng(), 15);
        }
      }
    )
  );

  onCleanup(() => {
    cardMarkers.forEach((marker) => marker.remove());
    cardMarkers.clear();
    leadMarkers.forEach((marker) => marker.remove());
    leadMarkers.clear();
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

        {/* Legend - Phase 8: Show score-based colors for search results */}
        <Show
          when={
            (props.leads && props.leads.length > 0) ||
            (props.currentCards && props.currentCards.length > 0)
          }
        >
          <div class="flex flex-wrap gap-3 text-xs p-2 bg-background/80 rounded-lg">
            <div class="flex items-center gap-1">
              <div class="w-3 h-3 bg-blue-500 rounded-full border border-white shadow-sm" />
              <span class="text-muted-foreground">You</span>
            </div>
            {/* Phase 8: Score-based legend for search results */}
            <Show when={props.currentCards && props.currentCards.length > 0}>
              <div class="flex items-center gap-1">
                <div class="w-3 h-3 bg-green-500 rounded-full border border-white shadow-sm" />
                <span class="text-muted-foreground">Top pick</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="w-3 h-3 bg-yellow-500 rounded-full border border-white shadow-sm" />
                <span class="text-muted-foreground">Good</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="w-3 h-3 bg-orange-500 rounded-full border border-white shadow-sm" />
                <span class="text-muted-foreground">Fair</span>
              </div>
            </Show>
            {/* Category legend for saved leads */}
            <For each={[...new Set(props.leads?.map((l) => l.category))]}>
              {(categoryId) => {
                const category = getCategoryById(categoryId);
                return (
                  <div class="flex items-center gap-1">
                    <div
                      class="w-3 h-3 rounded-full border border-white shadow-sm"
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
