/**
 * Local Discovery Service
 *
 * Provides location-aware job and opportunity discovery.
 * Supports profile-based context matching to find relevant local opportunities.
 *
 * Features:
 * - Google Maps/Places type mapping based on profile
 * - Regional suggestions and tips
 * - Fallback suggestions when external APIs unavailable
 * - Cost-of-living adjustments by city size
 */

import { trace, createSpan } from './opik.js';

// ============================================================================
// Types
// ============================================================================

export interface Location {
  city: string;
  coordinates?: { lat: number; lng: number };
  currency: 'USD' | 'EUR' | 'GBP';
  region?: 'france' | 'uk' | 'us' | 'europe';
  citySize?: 'small' | 'medium' | 'large';
  country?: string;
}

export interface LocalJob {
  title: string;
  company: string;
  platform: string;
  distance?: string;
  hourlyRate?: number;
  url?: string;
}

export interface LocalPlace {
  name: string;
  type: string;
  address?: string;
  distance?: string;
  relevance: 'high' | 'medium' | 'low';
  actionTip?: string;
}

export interface LocalDiscoveryResult {
  jobs: LocalJob[];
  places: LocalPlace[];
  regionalTips: string[];
  costOfLivingAdjustment: number; // multiplier (1.0 = baseline)
  suggestedActions: string[];
}

export interface DiscoveryContext {
  skills?: string[];
  instruments?: string[];
  sellableItems?: string[];
  services?: string[]; // e.g., 'babysitting', 'tutoring', 'dog_walking'
  isStudent?: boolean;
  energyLevel?: number;
}

// ============================================================================
// Profile to Places Mapping
// ============================================================================

/**
 * Maps user profile attributes to Google Maps place types
 * for contextual local discovery
 */
export const PROFILE_TO_PLACES: Record<string, string[]> = {
  // Instruments
  guitar: ['music_school', 'performing_arts_theater', 'cafe'],
  piano: ['music_school', 'church', 'concert_hall'],
  violin: ['music_school', 'orchestra', 'concert_hall'],
  drums: ['music_school', 'recording_studio', 'bar'],
  singing: ['music_school', 'karaoke', 'church'],

  // Services
  babysitting: ['school', 'day_care', 'preschool', 'community_center'],
  dog_walking: ['pet_store', 'veterinary_care', 'park', 'dog_park'],
  tutoring: ['school', 'library', 'university', 'tutoring_center'],
  cleaning: ['real_estate_agency', 'apartment_complex'],
  moving: ['moving_company', 'storage_facility'],

  // Selling
  selling: ['second_hand_store', 'pawn_shop', 'consignment_store'],
  electronics: ['electronics_store', 'phone_repair', 'pawn_shop'],
  clothing: ['consignment_store', 'thrift_store', 'clothing_store'],
  books: ['bookstore', 'library', 'university'],

  // Tech skills
  coding: ['coworking_space', 'cafe', 'library', 'startup_incubator'],
  design: ['print_shop', 'coworking_space', 'art_gallery', 'marketing_agency'],
  video: ['recording_studio', 'event_venue', 'marketing_agency'],
  writing: ['publishing_house', 'newspaper', 'coworking_space'],

  // Student default
  student: ['library', 'cafe', 'coworking_space', 'university'],
};

// ============================================================================
// Regional Data
// ============================================================================

/**
 * Regional tips and resources by country/region
 */
export const REGIONAL_RESOURCES: Record<
  string,
  {
    tips: string[];
    platforms: { name: string; url: string; category: string }[];
    studentAid: string[];
  }
> = {
  france: {
    tips: [
      'Check CAF eligibility for housing assistance (APL)',
      'CROUS student jobs available on campus',
      'Student health insurance (CPAM) is free',
      'SNCF youth card (Carte Jeune) for 30% off trains',
      'Check CVEC reimbursement for low-income students',
    ],
    platforms: [
      { name: 'StudentJob.fr', url: 'https://www.studentjob.fr', category: 'jobs' },
      { name: 'LeBonCoin', url: 'https://www.leboncoin.fr', category: 'selling' },
      { name: 'Vinted', url: 'https://www.vinted.fr', category: 'selling' },
      { name: 'Yoopies', url: 'https://yoopies.fr', category: 'babysitting' },
      { name: 'Superprof', url: 'https://www.superprof.fr', category: 'tutoring' },
    ],
    studentAid: ['CAF (APL)', 'Bourse CROUS', 'Aide au mérite', 'CVEC exemption'],
  },
  uk: {
    tips: [
      'Student Ambassador programs at your university',
      'NHS volunteering opportunities',
      'Railcard for 1/3 off train fares',
      'Check council tax exemption status',
      'NUS Extra card for student discounts',
    ],
    platforms: [
      { name: 'StudentJob.co.uk', url: 'https://www.studentjob.co.uk', category: 'jobs' },
      { name: 'eBay UK', url: 'https://www.ebay.co.uk', category: 'selling' },
      { name: 'Depop', url: 'https://www.depop.com', category: 'selling' },
      { name: 'Childcare.co.uk', url: 'https://www.childcare.co.uk', category: 'babysitting' },
      { name: 'Tutorful', url: 'https://tutorful.co.uk', category: 'tutoring' },
    ],
    studentAid: ['Student Finance England', 'University hardship funds', 'NHS bursary'],
  },
  us: {
    tips: [
      'Work-study programs on campus',
      'Federal student employment opportunities',
      'FAFSA grants and aid applications',
      'Campus dining jobs often include free meals',
      'RA positions provide free housing',
    ],
    platforms: [
      { name: 'Indeed', url: 'https://www.indeed.com', category: 'jobs' },
      { name: 'eBay', url: 'https://www.ebay.com', category: 'selling' },
      { name: 'Care.com', url: 'https://www.care.com', category: 'babysitting' },
      { name: 'Wyzant', url: 'https://www.wyzant.com', category: 'tutoring' },
      { name: 'Rover', url: 'https://www.rover.com', category: 'pet_care' },
    ],
    studentAid: ['FAFSA', 'Pell Grant', 'Work-Study', 'State grants'],
  },
  europe: {
    tips: [
      'Erasmus+ grants for study abroad',
      'European Youth Card discounts',
      'Check local student associations',
      'Interrail pass for train travel',
    ],
    platforms: [
      { name: 'Indeed', url: 'https://www.indeed.com', category: 'jobs' },
      { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs', category: 'jobs' },
    ],
    studentAid: ['Erasmus+', 'Local university grants'],
  },
};

/**
 * Cost of living adjustments by city size
 */
export const COST_OF_LIVING_MULTIPLIERS: Record<string, number> = {
  // Large cities (expensive)
  paris: 1.3,
  london: 1.4,
  new_york: 1.5,
  san_francisco: 1.6,
  zurich: 1.5,
  // Medium cities
  lyon: 1.1,
  manchester: 1.1,
  chicago: 1.2,
  berlin: 1.0,
  // Small cities (baseline)
  default_large: 1.3,
  default_medium: 1.1,
  default_small: 0.9,
};

// ============================================================================
// Fallback Suggestions
// ============================================================================

/**
 * Fallback suggestions when scraping/APIs are unavailable
 */
export const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  music: [
    'Post flyers at local music schools advertising lessons',
    'Check community center bulletin boards for music opportunities',
    'Contact local churches about choir or instrument needs',
    "Join Facebook groups like 'Music Teachers [Your City]'",
  ],
  selling: [
    'Use LeBonCoin/eBay/Craigslist for online sales',
    'Visit local dépôts-ventes (CashConverters, EasyCash)',
    'Check for weekend flea markets in your area',
    'Post in local Facebook buy/sell groups',
  ],
  services: [
    'Register on Yoopies/Care.com for childcare jobs',
    'Use Rover/Wamiz for pet-sitting opportunities',
    'Post tutoring ads on Superprof/Wyzant',
    'Check university job boards for campus positions',
  ],
  tech: [
    'Create profiles on Upwork/Fiverr for freelance work',
    'Check local coworking spaces for networking events',
    'Join tech meetups to find opportunities',
    'Contact local small businesses about web/tech needs',
  ],
  student: [
    'Visit your university career center',
    'Check campus job boards regularly',
    'Apply for work-study positions',
    'Join student organizations for networking',
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the region from location data
 */
function determineRegion(location: Location): string {
  if (location.region) return location.region;

  const city = location.city.toLowerCase();

  // France
  if (
    ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'bordeaux', 'lille'].some((c) =>
      city.includes(c)
    )
  ) {
    return 'france';
  }

  // UK
  if (
    ['london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh'].some((c) =>
      city.includes(c)
    )
  ) {
    return 'uk';
  }

  // US
  if (
    [
      'new york',
      'los angeles',
      'chicago',
      'houston',
      'phoenix',
      'philadelphia',
      'san francisco',
    ].some((c) => city.includes(c))
  ) {
    return 'us';
  }

  return 'europe';
}

/**
 * Get cost of living multiplier for a city
 */
function getCostOfLivingMultiplier(location: Location): number {
  const city = location.city.toLowerCase().replace(/\s+/g, '_');

  if (COST_OF_LIVING_MULTIPLIERS[city]) {
    return COST_OF_LIVING_MULTIPLIERS[city];
  }

  switch (location.citySize) {
    case 'large':
      return COST_OF_LIVING_MULTIPLIERS['default_large'];
    case 'medium':
      return COST_OF_LIVING_MULTIPLIERS['default_medium'];
    case 'small':
      return COST_OF_LIVING_MULTIPLIERS['default_small'];
    default:
      return 1.0;
  }
}

/**
 * Get relevant place types based on user context
 */
function getRelevantPlaceTypes(context: DiscoveryContext): string[] {
  const placeTypes = new Set<string>();

  // Add instrument-based places
  if (context.instruments) {
    for (const instrument of context.instruments) {
      const places = PROFILE_TO_PLACES[instrument.toLowerCase()];
      if (places) {
        places.forEach((p) => placeTypes.add(p));
      }
    }
  }

  // Add service-based places
  if (context.services) {
    for (const service of context.services) {
      const places = PROFILE_TO_PLACES[service.toLowerCase()];
      if (places) {
        places.forEach((p) => placeTypes.add(p));
      }
    }
  }

  // Add skill-based places
  if (context.skills) {
    for (const skill of context.skills) {
      const skillLower = skill.toLowerCase();
      // Map skills to categories
      if (
        ['python', 'javascript', 'typescript', 'react', 'web'].some((s) => skillLower.includes(s))
      ) {
        PROFILE_TO_PLACES['coding']?.forEach((p) => placeTypes.add(p));
      }
      if (['photoshop', 'figma', 'ui', 'ux', 'graphic'].some((s) => skillLower.includes(s))) {
        PROFILE_TO_PLACES['design']?.forEach((p) => placeTypes.add(p));
      }
    }
  }

  // Add selling places if user has sellable items
  if (context.sellableItems && context.sellableItems.length > 0) {
    PROFILE_TO_PLACES['selling']?.forEach((p) => placeTypes.add(p));
  }

  // Default student places
  if (context.isStudent || placeTypes.size === 0) {
    PROFILE_TO_PLACES['student']?.forEach((p) => placeTypes.add(p));
  }

  return Array.from(placeTypes);
}

/**
 * Get fallback suggestions based on context
 */
function getFallbackSuggestions(context: DiscoveryContext): string[] {
  const suggestions: string[] = [];

  if (context.instruments && context.instruments.length > 0) {
    suggestions.push(...(FALLBACK_SUGGESTIONS['music'] || []));
  }

  if (context.sellableItems && context.sellableItems.length > 0) {
    suggestions.push(...(FALLBACK_SUGGESTIONS['selling'] || []));
  }

  if (context.services && context.services.length > 0) {
    suggestions.push(...(FALLBACK_SUGGESTIONS['services'] || []));
  }

  if (
    context.skills &&
    context.skills.some((s) =>
      ['python', 'javascript', 'coding', 'web', 'design'].some((t) => s.toLowerCase().includes(t))
    )
  ) {
    suggestions.push(...(FALLBACK_SUGGESTIONS['tech'] || []));
  }

  // Always add student suggestions
  if (context.isStudent !== false) {
    suggestions.push(...(FALLBACK_SUGGESTIONS['student'] || []));
  }

  // Deduplicate and limit
  return [...new Set(suggestions)].slice(0, 5);
}

// ============================================================================
// Main Discovery Function
// ============================================================================

/**
 * Discover local opportunities based on location and user context
 *
 * This function provides fallback suggestions when external APIs are unavailable.
 * In a production environment, you would integrate:
 * - Google Places API for nearby places
 * - Indeed/LinkedIn APIs for jobs
 * - Web scraping via agent-browser for additional sources
 */
export async function discoverLocalOpportunities(
  location: Location,
  context: DiscoveryContext = {}
): Promise<LocalDiscoveryResult> {
  return trace(
    'local_discovery',
    async (span) => {
      span.setInput({
        city: location.city,
        hasCoordinates: !!location.coordinates,
        skillsCount: context.skills?.length || 0,
        hasInstruments: !!context.instruments?.length,
        hasSellableItems: !!context.sellableItems?.length,
      });

      const region = determineRegion(location);
      const costMultiplier = getCostOfLivingMultiplier(location);
      const regionalData = REGIONAL_RESOURCES[region] || REGIONAL_RESOURCES['europe'];

      // Get relevant place types for this user
      const placeTypes = getRelevantPlaceTypes(context);

      // Build results
      const result: LocalDiscoveryResult = {
        jobs: [],
        places: [],
        regionalTips: regionalData.tips.slice(0, 3),
        costOfLivingAdjustment: costMultiplier,
        suggestedActions: [],
      };

      // Generate mock local places based on context
      // In production, this would call Google Places API
      await createSpan(
        'local_discovery.places',
        async (placesSpan) => {
          placesSpan.setInput({ placeTypes });

          // Generate contextual place suggestions
          const places: LocalPlace[] = [];

          if (context.instruments?.length) {
            places.push({
              name: `Music schools near ${location.city}`,
              type: 'music_school',
              relevance: 'high',
              actionTip: `Post lesson ads or ask about teaching opportunities`,
            });
          }

          if (context.services?.includes('babysitting')) {
            places.push({
              name: `Daycares and schools in ${location.city}`,
              type: 'day_care',
              relevance: 'high',
              actionTip: `Ask about part-time helper positions`,
            });
          }

          if (context.services?.includes('tutoring')) {
            places.push({
              name: `Libraries and study centers`,
              type: 'library',
              relevance: 'high',
              actionTip: `Post tutoring flyers or check job boards`,
            });
          }

          if (context.sellableItems?.length) {
            places.push({
              name: `Dépôts-ventes and secondhand shops`,
              type: 'second_hand_store',
              relevance: 'medium',
              actionTip: `Bring items for consignment or direct sale`,
            });
          }

          // Always suggest coworking/cafes for students
          places.push({
            name: `Coworking spaces and cafes`,
            type: 'coworking_space',
            relevance: 'medium',
            actionTip: `Good spots for freelance work with WiFi`,
          });

          result.places = places;
          placesSpan.setOutput({ placesFound: places.length });
        },
        { tags: ['places', 'local'] }
      );

      // Generate job suggestions based on regional platforms
      await createSpan(
        'local_discovery.jobs',
        async (jobsSpan) => {
          // Filter platforms relevant to user context
          const relevantPlatforms = regionalData.platforms.filter((p) => {
            if (context.services?.includes('babysitting') && p.category === 'babysitting')
              return true;
            if (context.services?.includes('tutoring') && p.category === 'tutoring') return true;
            if (context.sellableItems?.length && p.category === 'selling') return true;
            if (p.category === 'jobs') return true;
            return false;
          });

          result.jobs = relevantPlatforms.slice(0, 4).map((p) => ({
            title: `Find opportunities on ${p.name}`,
            company: p.name,
            platform: p.url,
          }));

          jobsSpan.setOutput({ jobsFound: result.jobs.length });
        },
        { tags: ['jobs', 'local'] }
      );

      // Get fallback suggestions
      result.suggestedActions = getFallbackSuggestions(context);

      // Add cost of living tip if in expensive city
      if (costMultiplier > 1.2) {
        result.regionalTips.push(
          `Living costs in ${location.city} are ${Math.round((costMultiplier - 1) * 100)}% above average. Budget accordingly.`
        );
      } else if (costMultiplier < 0.95) {
        result.regionalTips.push(
          `${location.city} has below-average living costs - great for saving!`
        );
      }

      span.setOutput({
        jobsFound: result.jobs.length,
        placesFound: result.places.length,
        tipsCount: result.regionalTips.length,
        costMultiplier,
      });

      return result;
    },
    {
      tags: ['local-discovery', 'tips'],
      metadata: { city: location.city },
    }
  );
}

/**
 * Get regional resources for a location
 */
export function getRegionalResources(location: Location): {
  tips: string[];
  platforms: { name: string; url: string; category: string }[];
  studentAid: string[];
} {
  const region = determineRegion(location);
  return REGIONAL_RESOURCES[region] || REGIONAL_RESOURCES['europe'];
}

/**
 * Calculate savings goal adjustment based on cost of living
 */
export function adjustSavingsGoal(
  baseGoal: number,
  location: Location
): { adjustedGoal: number; multiplier: number; explanation: string } {
  const multiplier = getCostOfLivingMultiplier(location);
  const adjustedGoal = Math.round(baseGoal * multiplier);

  let explanation: string;
  if (multiplier > 1.15) {
    explanation = `Adjusted +${Math.round((multiplier - 1) * 100)}% for ${location.city}'s higher cost of living`;
  } else if (multiplier < 0.9) {
    explanation = `Adjusted -${Math.round((1 - multiplier) * 100)}% for ${location.city}'s lower cost of living`;
  } else {
    explanation = `No adjustment needed for ${location.city}`;
  }

  return { adjustedGoal, multiplier, explanation };
}

// Export service
export const localDiscovery = {
  discoverLocalOpportunities,
  getRegionalResources,
  adjustSavingsGoal,
  PROFILE_TO_PLACES,
  REGIONAL_RESOURCES,
  FALLBACK_SUGGESTIONS,
};

export default localDiscovery;
