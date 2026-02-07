/**
 * Skill Suggestion Engine
 *
 * Smart skill recommendations based on:
 * - Field of study match (primary, strong connection, medium, generic)
 * - Education level (diploma)
 * - Accessibility score (how easy to start monetizing)
 * - Market demand
 *
 * Returns skills sorted by relevance with star ratings and "Bruno's pick" tags.
 */

import { SKILL_REGISTRY, type SkillDefinition } from './skillRegistry';
import { FIELD_CONNECTIONS, SKILLS_BY_FIELD } from './skillsByField';

// =============================================================================
// Types
// =============================================================================

export interface SkillSuggestion {
  /** Skill name for display */
  name: string;
  /** Relevance rating 1-5 stars */
  stars: 1 | 2 | 3 | 4 | 5;
  /** Whether this is a top recommendation from Bruno */
  isBrunoPick: boolean;
  /** How the skill matches the user's field */
  fieldMatch: 'primary' | 'strong' | 'medium' | 'general';
  /** Accessibility score (1-5, higher = easier to start) */
  accessibility: number;
  /** Expected hourly rate */
  hourlyRate: number;
  /** Category for grouping */
  category: string;
}

export type DiplomaLevel = 'high_school' | 'vocational' | 'bachelor' | 'master' | 'phd';

// =============================================================================
// Accessibility Scores
// =============================================================================

/**
 * Skills that are HARD to monetize quickly (need audience, portfolio, certifications).
 * These get a penalty in accessibility scoring.
 */
/** @internal Exported for data integrity tests */
export const HARD_TO_START_SKILLS: Record<string, number> = {
  // Content creation - needs audience building (months)
  'TikTok/YouTube eco content creation': 1,
  'Popular science content creation': 2,
  'Online course creation': 2,

  // Need portfolio/experience
  'Freelance web development': 3,
  'Mobile app development': 2,
  'Freelance graphic design': 3,
  'Motion design animation': 2,
  'Junior cybersecurity': 2,

  // Need equipment/certification
  'Event photography': 3,
  'Nature / wildlife photography': 2,
  '3D modeling / CAD': 3,
  'IoT / Arduino projects development': 2,

  // Consulting requires credibility
  'Micro-business consulting': 2,
  'Amateur nutrition coaching': 3,
  'Student / productivity coaching': 3,
};

/**
 * Skills that are EASY to start immediately.
 * These get a bonus in accessibility scoring.
 */
/** @internal Exported for data integrity tests */
export const EASY_TO_START_SKILLS: Record<string, number> = {
  // Can start today
  'Online tutoring': 5,
  'Online science / math tutoring': 5,
  'Online language lessons': 5,
  'Babysitting / childcare': 5,
  'Pet-sitting / dog-walking': 5,
  'Food delivery / courier': 5,
  'Data entry': 5,

  // Low barrier
  'Virtual assistant': 4,
  'Audio transcription': 4,
  'Video subtitling': 4,
  'Academic proofreading / editing': 4,
  'Content moderation': 4,
  'Paid user testing': 5,
  'Online micro-tasks': 5,
  'Data labeling / AI annotation': 4,
  'Customer service / support': 4,
  'Technical support / IT helpdesk': 4,

  // Writing (if you can write)
  'Copywriting / commercial writing': 4,
  'Freelance translation / localization': 4,
};

/**
 * Get accessibility score for a skill (1-5, higher = easier).
 * Based on: how quickly can a student start earning?
 */
function getAccessibilityScore(skillName: string, def?: SkillDefinition): number {
  // Check hard-coded scores first
  if (EASY_TO_START_SKILLS[skillName]) {
    return EASY_TO_START_SKILLS[skillName];
  }
  if (HARD_TO_START_SKILLS[skillName]) {
    return HARD_TO_START_SKILLS[skillName];
  }

  // Compute from skill definition if available
  if (def) {
    // Lower cognitive effort = easier to start
    // Higher market demand = easier to find work
    const effortScore = 6 - def.cognitiveEffort; // Invert: 1→5, 5→1
    const demandScore = def.marketDemand;
    return Math.round((effortScore + demandScore) / 2);
  }

  return 3; // Default middle score
}

// =============================================================================
// Diploma Level Scoring
// =============================================================================

/**
 * Minimum diploma level for complex skills.
 * Skills not listed are accessible to all levels.
 */
const DIPLOMA_REQUIREMENTS: Record<string, DiplomaLevel> = {
  // Requires advanced degree
  'Junior cybersecurity': 'bachelor',
  'Micro-business consulting': 'bachelor',
  'Medical transcription': 'bachelor',
  'Scientific proofreading': 'bachelor',
  'UX research / user testing': 'bachelor',

  // Master-level
  'Freelance translation / localization': 'master', // For professional translation
};

const DIPLOMA_RANKS: Record<DiplomaLevel, number> = {
  high_school: 1,
  vocational: 2,
  bachelor: 3,
  master: 4,
  phd: 5,
};

/**
 * Check if user's diploma meets skill requirements.
 * Returns 1 (meets) or a penalty multiplier (doesn't meet).
 */
function diplomaMatchScore(skillName: string, diploma?: DiplomaLevel): number {
  const required = DIPLOMA_REQUIREMENTS[skillName];
  if (!required) return 1; // No requirement

  if (!diploma) return 0.7; // Unknown diploma, slight penalty

  const userRank = DIPLOMA_RANKS[diploma];
  const requiredRank = DIPLOMA_RANKS[required];

  if (userRank >= requiredRank) return 1; // Meets requirement
  if (userRank === requiredRank - 1) return 0.8; // Close
  return 0.6; // Far below
}

// =============================================================================
// Field Match Scoring
// =============================================================================

/**
 * Determine how a skill matches the user's field of study.
 */
function getFieldMatch(
  skillName: string,
  field: string | undefined
): {
  match: 'primary' | 'strong' | 'medium' | 'general';
  score: number;
} {
  if (!field || field === 'other') {
    return { match: 'general', score: 2 };
  }

  // Check if skill is in primary field
  const primarySkills = SKILLS_BY_FIELD[field] || [];
  if (primarySkills.includes(skillName)) {
    return { match: 'primary', score: 5 };
  }

  // Check if skill is from registry and has this field
  const def = SKILL_REGISTRY.find((s) => s.name === skillName);
  if (def?.fields.includes(field)) {
    return { match: 'primary', score: 5 };
  }

  // Check connected fields
  const connections = FIELD_CONNECTIONS[field];
  if (connections) {
    // Check strong connections
    for (const connectedField of connections.strong) {
      const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
      if (connectedSkills.includes(skillName)) {
        return { match: 'strong', score: 4 };
      }
      if (def?.fields.includes(connectedField)) {
        return { match: 'strong', score: 4 };
      }
    }

    // Check medium connections
    for (const connectedField of connections.medium) {
      const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
      if (connectedSkills.includes(skillName)) {
        return { match: 'medium', score: 3 };
      }
      if (def?.fields.includes(connectedField)) {
        return { match: 'medium', score: 3 };
      }
    }
  }

  return { match: 'general', score: 2 };
}

// =============================================================================
// Main Engine
// =============================================================================

/**
 * Get enhanced skill suggestions with ratings.
 *
 * @param field - User's field of study
 * @param diploma - User's education level
 * @returns Sorted array of skill suggestions with stars and Bruno's picks
 */
export function getEnhancedSkillSuggestions(
  field: string | undefined,
  diploma?: DiplomaLevel
): SkillSuggestion[] {
  const suggestions: SkillSuggestion[] = [];
  const seenSkills = new Set<string>();

  // Helper to add a skill
  const addSkill = (skillName: string) => {
    if (seenSkills.has(skillName)) return;
    seenSkills.add(skillName);

    const def = SKILL_REGISTRY.find((s) => s.name === skillName);
    const accessibility = getAccessibilityScore(skillName, def);
    const diplomaMultiplier = diplomaMatchScore(skillName, diploma);
    const { match: fieldMatch, score: fieldScore } = getFieldMatch(skillName, field);

    // Calculate final star rating
    // Weight: field match (40%), accessibility (40%), diploma fit (20%)
    const rawScore =
      fieldScore * 0.4 + accessibility * 0.4 + (diplomaMultiplier > 0.9 ? 5 : 3) * 0.2;

    // Apply diploma penalty
    const adjustedScore = rawScore * diplomaMultiplier;

    // Convert to 1-5 stars
    const stars = Math.max(1, Math.min(5, Math.round(adjustedScore))) as 1 | 2 | 3 | 4 | 5;

    // Bruno's pick criteria:
    // - 5 stars
    // - Primary or strong field match
    // - High accessibility (easy to start)
    // - Good market demand
    const isBrunoPick =
      stars >= 4 &&
      (fieldMatch === 'primary' || fieldMatch === 'strong') &&
      accessibility >= 4 &&
      (def?.marketDemand || 3) >= 4;

    suggestions.push({
      name: skillName,
      stars,
      isBrunoPick,
      fieldMatch,
      accessibility,
      hourlyRate: def?.defaultHourlyRate || 15,
      category: def?.category || 'other',
    });
  };

  // 1. Add primary field skills
  if (field && field !== 'other') {
    const primarySkills = SKILLS_BY_FIELD[field] || [];
    primarySkills.forEach(addSkill);

    // 2. Add skills from connected fields
    const connections = FIELD_CONNECTIONS[field];
    if (connections) {
      // Strong connections - top 3 each
      for (const connectedField of connections.strong) {
        const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
        connectedSkills.slice(0, 3).forEach(addSkill);
      }

      // Medium connections - top 2 each
      for (const connectedField of connections.medium) {
        const connectedSkills = SKILLS_BY_FIELD[connectedField] || [];
        connectedSkills.slice(0, 2).forEach(addSkill);
      }
    }
  }

  // 3. Add some universal high-accessibility skills
  const universalSkills = [
    'Online tutoring',
    'Virtual assistant',
    'Data entry',
    'Babysitting / childcare',
    'Food delivery / courier',
    'Pet-sitting / dog-walking',
  ];
  universalSkills.forEach(addSkill);

  // 4. Sort: Bruno's picks first, then by stars (desc), then by accessibility (desc)
  suggestions.sort((a, b) => {
    // Bruno's picks first
    if (a.isBrunoPick !== b.isBrunoPick) {
      return a.isBrunoPick ? -1 : 1;
    }
    // Then by stars
    if (b.stars !== a.stars) {
      return b.stars - a.stars;
    }
    // Then by accessibility
    return b.accessibility - a.accessibility;
  });

  return suggestions;
}

/**
 * Get just the skill names (for backwards compatibility).
 */
export function getEnhancedSkillNames(field: string | undefined, diploma?: DiplomaLevel): string[] {
  return getEnhancedSkillSuggestions(field, diploma).map((s) => s.name);
}

/**
 * Get Bruno's top picks for quick display.
 */
export function getBrunosPicks(
  field: string | undefined,
  diploma?: DiplomaLevel,
  limit = 3
): SkillSuggestion[] {
  return getEnhancedSkillSuggestions(field, diploma)
    .filter((s) => s.isBrunoPick)
    .slice(0, limit);
}
