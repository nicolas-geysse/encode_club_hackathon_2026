/**
 * Prospection Types
 *
 * Type definitions for the job prospection feature.
 */

// =============================================================================
// Category Types
// =============================================================================

export interface ProspectionCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  examples: string[];
  queryTemplate: string;
  googlePlaceTypes: string[];
  platforms: string[];
  avgHourlyRate: {
    min: number;
    max: number;
  };
  effortLevel: number;
}

// =============================================================================
// Card Types
// =============================================================================

export interface ProspectionCard {
  /** Unique identifier */
  id: string;
  /** Type of source: place (Google Maps) or job (web search) */
  type: 'place' | 'job';
  /** Job title or position name */
  title: string;
  /** Company or business name */
  company?: string;
  /** Human-readable location */
  location?: string;
  /** Latitude for map display */
  lat?: number;
  /** Longitude for map display */
  lng?: number;
  /** Commute time in minutes */
  commuteMinutes?: number;
  /** Human-readable commute time (e.g., "15 min") */
  commuteText?: string;
  /** Salary display text (e.g., "12€/h" or "11-14€/h") */
  salaryText?: string;
  /** Average hourly rate for calculations */
  avgHourlyRate?: number;
  /** Effort level 1-5 */
  effortLevel?: number;
  /** Source platform (Indeed, Google Maps, etc.) */
  source: string;
  /** External URL to apply or view details */
  url?: string;
  /** Category ID for grouping */
  categoryId: string;
  /** Google rating (1-5) if from Places API */
  rating?: number;
  /** Whether currently open (if from Places API) */
  openNow?: boolean;
}

// =============================================================================
// Lead Types (Saved Cards)
// =============================================================================

export type LeadStatus = 'interested' | 'applied' | 'rejected' | 'archived';

export interface Lead {
  /** Unique identifier */
  id: string;
  /** Profile ID that owns this lead */
  profileId: string;
  /** Category ID */
  category: string;
  /** Job title */
  title: string;
  /** Company name */
  company?: string;
  /** Raw location string */
  locationRaw?: string;
  /** Latitude */
  lat?: number;
  /** Longitude */
  lng?: number;
  /** Commute time in minutes */
  commuteTimeMins?: number;
  /** Minimum salary (hourly) */
  salaryMin?: number;
  /** Maximum salary (hourly) */
  salaryMax?: number;
  /** Effort level 1-5 */
  effortLevel?: number;
  /** Source platform */
  source?: string;
  /** External URL */
  url?: string;
  /** Current status */
  status: LeadStatus;
  /** User notes */
  notes?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ProspectionSearchMeta {
  /** Source of results: 'google_places' or 'platforms' */
  source: 'google_places' | 'platforms';
  /** Whether a Places API search was actually performed */
  searchPerformed: boolean;
  /** Google Place types that were queried */
  placesTypesQueried: string[];
  /** Whether user coordinates were available */
  hasCoordinates: boolean;
  /** Debug: actual coordinates used for search (to verify location is correct) */
  searchLocation?: { lat: number; lng: number; city: string } | null;
  /** Radius strategy used */
  radiusUsed?: string | null;
}

export interface ProspectionSearchResponse {
  cards: ProspectionCard[];
  category: ProspectionCategory;
  meta: ProspectionSearchMeta;
}

export interface ProspectionSearchRequest {
  action: 'search';
  categoryId: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  radius?: number;
}

// =============================================================================
// Swipe Types
// =============================================================================

export type SwipeDirection = 'left' | 'right' | 'up';

export interface SwipeResult {
  cardId: string;
  direction: SwipeDirection;
  timestamp: number;
}

// =============================================================================
// Map Types
// =============================================================================

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type: 'user' | 'lead' | 'card';
  category?: string;
  title?: string;
  status?: LeadStatus;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// =============================================================================
// Tab Props Types
// =============================================================================

export interface ProspectionTabProps {
  profileId?: string;
  userLocation?: {
    lat: number;
    lng: number;
  };
  city?: string;
  currency?: 'USD' | 'EUR' | 'GBP';
  onLeadSaved?: (lead: Lead) => void;
  /** Phase 4: Callback when leads array changes (for Swipe integration) */
  onLeadsChange?: (leads: Lead[]) => void;
  // JOBS-04: Skills for matching algorithm
  userSkills?: string[];
  /** Phase 5: Certifications for job boost (BAFA, PSC1, etc.) */
  userCertifications?: string[];
  minHourlyRate?: number;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface CommuteInfo {
  minutes: number;
  text: string;
  mode: 'walking' | 'bicycling' | 'transit' | 'driving';
}

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
}

// =============================================================================
// Icon Mapping Type
// =============================================================================

export type CategoryIconName =
  | 'UtensilsCrossed'
  | 'ShoppingBag'
  | 'Sparkles'
  | 'Wrench'
  | 'Baby'
  | 'GraduationCap'
  | 'PartyPopper'
  | 'Clock'
  | 'Laptop'
  | 'Building';
