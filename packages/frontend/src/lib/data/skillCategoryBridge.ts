/**
 * Skill Category Bridge
 *
 * Maps skill registry categories to prospection (job) category IDs.
 * Used by jobScoring.ts to determine how well a user's skills match
 * a given job category.
 *
 * Registry categories: tech, creative, teaching, writing, services, physical, business, health, other
 * Prospection categories: service, retail, cleaning, handyman, childcare, tutoring, events, interim, digital, campus, beauty, auto
 */

import { SKILL_REGISTRY, type SkillCategory } from './skillRegistry';

/**
 * Which prospection categories each skill registry category maps to.
 * A skill in category X is relevant for prospection categories listed here.
 */
const CATEGORY_BRIDGE: Record<SkillCategory, string[]> = {
  tech: ['digital', 'campus'],
  creative: ['digital', 'events'],
  teaching: ['tutoring', 'campus'],
  writing: ['digital'],
  services: ['service', 'events', 'campus'],
  physical: ['childcare', 'cleaning', 'handyman'],
  business: ['digital', 'events', 'interim'],
  health: ['cleaning', 'childcare', 'beauty'],
  other: ['interim', 'campus'],
};

/**
 * Individual skill overrides for cases where the category-level mapping
 * is too broad or misses a specific connection.
 */
const SKILL_OVERRIDES: Record<string, string[]> = {
  // Tutoring skills that are in 'tech' category but match tutoring
  'SQL Coaching': ['tutoring', 'digital', 'campus'],
  'Online tutoring': ['tutoring', 'campus'],
  'Online science / math tutoring': ['tutoring', 'campus'],
  'Online language lessons': ['tutoring'],
  // Physical skills with specific mappings
  'Babysitting / childcare': ['childcare'],
  'Pet-sitting / dog-walking': ['childcare', 'service'],
  'Food delivery / courier': ['service', 'interim'],
  Cleaning: ['cleaning'],
  // Tech skills that also map to campus
  'Technical support / IT helpdesk': ['digital', 'campus'],
  'Debugging / QA testing': ['digital', 'campus'],
  // Creative skills for beauty sector
  'Freelance graphic design': ['digital', 'beauty'],
  // Services
  'Virtual event organization': ['events'],
  'Mystery shopping / service quality evaluations': ['retail', 'service'],
  'Airbnb management / short-term concierge': ['service'],
  'Customer service / support': ['retail', 'service', 'campus'],
  // Health-specific
  'Online fitness/yoga classes': ['beauty', 'tutoring'],
  'Amateur nutrition coaching': ['beauty', 'tutoring'],
};

// Build a lookup: skill name → set of matching prospection category IDs
let _skillToCategories: Map<string, Set<string>> | null = null;

function getSkillToCategoriesMap(): Map<string, Set<string>> {
  if (_skillToCategories) return _skillToCategories;

  _skillToCategories = new Map();

  for (const skill of SKILL_REGISTRY) {
    // Check for individual override first
    const override = SKILL_OVERRIDES[skill.name];
    if (override) {
      _skillToCategories.set(skill.name, new Set(override));
      continue;
    }

    // Otherwise, use category-level bridge
    const prospectionCategories = CATEGORY_BRIDGE[skill.category] || [];
    _skillToCategories.set(skill.name, new Set(prospectionCategories));
  }

  return _skillToCategories;
}

/**
 * Match user skills against a prospection category.
 * Returns 0-1 score based on how many of the user's skills are relevant.
 */
export function matchSkillsToProspectionCategory(
  userSkills: string[],
  prospectionCategoryId: string
): number {
  if (!userSkills || userSkills.length === 0) return 0;

  const map = getSkillToCategoriesMap();
  let matchCount = 0;

  for (const skillName of userSkills) {
    const categories = map.get(skillName);
    if (categories && categories.has(prospectionCategoryId)) {
      matchCount++;
    }
  }

  // Normalize: 1 match = 0.4, 2 matches = 0.7, 3+ matches = 1.0
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 0.4;
  if (matchCount === 2) return 0.7;
  return 1.0;
}

/**
 * Get all prospection category IDs that match at least one user skill.
 * Useful for highlighting "Recommended for you" categories in the UI.
 */
export function getMatchingProspectionCategories(userSkills: string[]): string[] {
  if (!userSkills || userSkills.length === 0) return [];

  const map = getSkillToCategoriesMap();
  const matchedCategories = new Set<string>();

  for (const skillName of userSkills) {
    const categories = map.get(skillName);
    if (categories) {
      for (const cat of categories) {
        matchedCategories.add(cat);
      }
    }
  }

  return [...matchedCategories];
}
