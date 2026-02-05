/**
 * Job Scoring Utility
 *
 * Scores job opportunities based on:
 * - Distance (25%): Closer is better
 * - Profile match (20%): Matches user skills and preferences + certifications
 * - Effort level (20%): Lower effort is better for sustainability
 * - Rate (15%): Higher pay is better
 * - Goal Fit (20%): How well salary helps reach savings goal
 *
 * Returns score 1-5 (star rating format)
 *
 * Phase 5: Added certification bonus support
 * P4: Added goal fit scoring (salary vs savings target)
 * P0-Health: Added swipe preference personalization
 *
 * Adapted from skill-arbitrage algorithm in mcp-server.
 */

import type { ProspectionCard } from './prospectionTypes';
import {
  calculateCertificationBonus,
  type CertificationDefinition,
} from './data/certificationMapping';

export interface JobScoreBreakdown {
  distance: number; // 0-1 normalized
  profile: number; // 0-1 normalized
  effort: number; // 0-1 normalized
  rate: number; // 0-1 normalized
  goalFit: number; // 0-1 normalized (P4: how well salary helps reach goal)
  /** Detailed profile breakdown for UI tooltip */
  profileDetails?: {
    skillMatch: number; // 0-1 skill relevance
    certificationBonus: number; // 0-0.3 certification bonus
    rateMatch: boolean; // meets minimum rate
  };
  /** P0-Health: Weights applied based on swipe preferences */
  appliedWeights?: {
    distance: number;
    profile: number;
    effort: number;
    rate: number;
    goalFit: number;
  };
  /** P0-Health: Version hash for Opik trace correlation */
  preferenceVersion?: string;
}

export interface ScoredJob extends ProspectionCard {
  score: number; // 1-5 star rating
  scoreBreakdown: JobScoreBreakdown;
  /** Certifications that boost this job (for badge display) */
  matchedCertifications?: CertificationDefinition[];
}

/**
 * P0-Health: Swipe preferences learned from user behavior
 * Values 0-1, where 0.5 is neutral (default for new users)
 */
export interface SwipePreferences {
  /** Preference for low-effort jobs (higher = avoids hard work) */
  effortSensitivity: number;
  /** Preference for high pay (higher = prioritizes salary) */
  hourlyRatePriority: number;
  /** Preference for flexible schedules */
  timeFlexibility: number;
  /** Preference for stable vs freelance income */
  incomeStability: number;
}

/** Default swipe preferences for cold start (new users with 0 swipes) */
export const DEFAULT_SWIPE_PREFERENCES: SwipePreferences = {
  effortSensitivity: 0.5,
  hourlyRatePriority: 0.5,
  timeFlexibility: 0.5,
  incomeStability: 0.5,
};

export interface UserProfile {
  skills?: string[];
  /** Phase 5: Professional certifications (BAFA, PSC1, etc.) */
  certifications?: string[];
  maxWorkHoursWeekly?: number;
  minHourlyRate?: number;
  /** P4: Monthly savings target (to calculate goal fit) */
  monthlySavingsTarget?: number;
  /** P4: Available work hours per week */
  availableHoursPerWeek?: number;
  /** P0-Health: Learned preferences from swipe behavior */
  swipePreferences?: SwipePreferences;
}

// Scoring weights interface
interface ScoringWeights {
  distance: number;
  profile: number;
  effort: number;
  rate: number;
  goalFit: number;
}

// Default scoring weights (for cold start / no swipe data)
// Must sum to 1.0
const DEFAULT_WEIGHTS: ScoringWeights = {
  distance: 0.1, // Reduced to MINIMUM to prioritize relevance (even at 30km)
  profile: 0.3, // Increased to MAXIMUM to ensure skills/certs drive the score
  effort: 0.2,
  rate: 0.2,
  goalFit: 0.2,
};

/**
 * P0-Health: Map swipe preferences to scoring weights
 * Adjusts weights based on learned user behavior
 *
 * @param prefs - User's swipe preferences (or undefined for cold start)
 * @returns Adjusted scoring weights that sum to 1.0
 */
export function mapSwipeToWeights(prefs?: SwipePreferences): ScoringWeights {
  // Cold start: use default weights
  if (!prefs) return { ...DEFAULT_WEIGHTS };

  // Calculate preference influence (how far from neutral 0.5)
  const effortInfluence = prefs.effortSensitivity - 0.5; // -0.5 to +0.5
  const rateInfluence = prefs.hourlyRatePriority - 0.5; // -0.5 to +0.5

  // Adjust weights based on preferences
  // Max adjustment is ±0.10 per factor (keeps weights balanced)
  const effortAdjust = effortInfluence * 0.2; // ±0.10
  const rateAdjust = rateInfluence * 0.2; // ±0.10

  // Redistribute from profile to effort/rate based on preferences
  const weights: ScoringWeights = {
    distance: 0.1, // Fixed low weight to favor relevance
    profile: Math.max(0.15, 0.3 - Math.abs(effortAdjust) - Math.abs(rateAdjust)), // Base 0.3
    effort: Math.max(0.1, Math.min(0.3, 0.2 + effortAdjust)),
    rate: Math.max(0.1, Math.min(0.3, 0.2 + rateAdjust)),
    goalFit: 0.2, // Fixed (goal alignment always matters)
  };

  // Normalize to ensure sum = 1.0
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    const factor = 1.0 / sum;
    weights.distance *= factor;
    weights.profile *= factor;
    weights.effort *= factor;
    weights.rate *= factor;
    weights.goalFit *= factor;
  }

  return weights;
}

/**
 * P0-Health: Generate preference version hash for Opik tracing
 * Allows correlating swipe behavior with scoring outcomes
 */
export function getPreferenceVersion(prefs?: SwipePreferences): string {
  if (!prefs) return 'default';
  // Simple hash: concatenate rounded values
  const e = Math.round(prefs.effortSensitivity * 100);
  const r = Math.round(prefs.hourlyRatePriority * 100);
  const t = Math.round(prefs.timeFlexibility * 100);
  const s = Math.round(prefs.incomeStability * 100);
  return `v${e}-${r}-${t}-${s}`;
}

// Normalization constants
const MAX_COMMUTE_MINUTES = 90; // Increased to 90min to allow wider search (100km) using highway speeds
const MAX_HOURLY_RATE = 25; // 25€/h = normalized to 1.0
const MAX_EFFORT = 5;

/**
 * Calculate job score based on multiple factors
 * Returns score 1-5 (star rating)
 *
 * P0-Health: Now uses dynamic weights based on swipe preferences
 */
export function scoreJob(job: ProspectionCard, profile?: UserProfile): ScoredJob {
  // P0-Health: Get personalized weights based on swipe behavior
  const weights = mapSwipeToWeights(profile?.swipePreferences);

  // Distance score: closer is better (invert: 45min = 0, 0min = 1)
  const commuteMinutes = job.commuteMinutes ?? 30;
  const distanceNorm = Math.max(0, 1 - commuteMinutes / MAX_COMMUTE_MINUTES);

  // Profile match score: check if job matches user skills/preferences + certifications
  const profileResult = calculateProfileMatch(job, profile);

  // Effort score: lower effort is better (invert)
  // P0-Health: If user has high effortSensitivity, this factor weighs more
  const effortLevel = job.effortLevel ?? 3;
  const effortNorm = 1 - (effortLevel - 1) / (MAX_EFFORT - 1);

  // Rate score: higher is better
  // P0-Health: If user has high hourlyRatePriority, this factor weighs more
  const hourlyRate = job.avgHourlyRate ?? 11;
  const rateNorm = Math.min(hourlyRate / MAX_HOURLY_RATE, 1);

  // P4: Goal fit score - how well does this job help reach savings target?
  const goalFitNorm = calculateGoalFit(job, profile);

  // Weighted sum with personalized weights
  const rawScore =
    weights.distance * distanceNorm +
    weights.profile * profileResult.score +
    weights.effort * effortNorm +
    weights.rate * rateNorm +
    weights.goalFit * goalFitNorm;

  // Convert to 1-5 star scale
  const score = Math.round((1 + rawScore * 4) * 10) / 10;

  return {
    ...job,
    score: Math.min(5, Math.max(1, score)),
    scoreBreakdown: {
      distance: distanceNorm,
      profile: profileResult.score,
      effort: effortNorm,
      rate: rateNorm,
      goalFit: goalFitNorm,
      profileDetails: profileResult.details,
      // P0-Health: Include applied weights for debugging/tracing
      appliedWeights: weights,
      preferenceVersion: getPreferenceVersion(profile?.swipePreferences),
    },
    matchedCertifications: profileResult.matchedCertifications,
  };
}

/**
 * P4: Calculate goal fit score
 * Measures how well this job's earnings help reach savings target
 * Returns 0-1 normalized score
 */
function calculateGoalFit(job: ProspectionCard, profile?: UserProfile): number {
  // Default: neutral score if no goal info available
  if (!profile?.monthlySavingsTarget || profile.monthlySavingsTarget <= 0) {
    return 0.5;
  }

  const hourlyRate = job.avgHourlyRate ?? 11;
  const hoursPerWeek = profile.availableHoursPerWeek ?? 15; // Default 15h/week for students
  const weeksPerMonth = 4.33;

  // Calculate potential monthly earnings from this job
  const potentialMonthlyEarnings = hourlyRate * hoursPerWeek * weeksPerMonth;

  // Calculate what percentage of savings goal this job covers
  const goalCoverage = potentialMonthlyEarnings / profile.monthlySavingsTarget;

  // Score: 100% coverage = 1.0, 50% = 0.5, 0% = 0
  // Cap at 1.0 (exceeding goal is great but doesn't need extra points)
  // Minimum 0.1 for any paying job
  return Math.min(1, Math.max(0.1, goalCoverage));
}

interface ProfileMatchResult {
  score: number;
  details: {
    skillMatch: number;
    certificationBonus: number;
    rateMatch: boolean;
  };
  matchedCertifications: CertificationDefinition[];
}

/**
 * Calculate profile match score
 * Returns 0-1 based on how well the job matches user profile
 * Phase 5: Now includes certification bonus
 */
function calculateProfileMatch(job: ProspectionCard, profile?: UserProfile): ProfileMatchResult {
  const defaultResult: ProfileMatchResult = {
    score: 0.5,
    details: { skillMatch: 0, certificationBonus: 0, rateMatch: false },
    matchedCertifications: [],
  };

  if (!profile) return defaultResult;

  let score = 0.4; // Base score (reduced to leave room for bonuses)
  let skillMatch = 0;
  let certificationBonus = 0;
  let rateMatch = false;
  let matchedCertifications: CertificationDefinition[] = [];

  // Skill match bonus
  if (profile.skills && profile.skills.length > 0) {
    const jobCategory = job.categoryId;
    skillMatch = matchSkillsToCategory(profile.skills, jobCategory);
    score += skillMatch * 0.25; // Up to +0.25 for skill match
  }

  // Phase 5: Certification bonus
  if (profile.certifications && profile.certifications.length > 0) {
    const certResult = calculateCertificationBonus(profile.certifications, job.categoryId);
    certificationBonus = certResult.bonus;
    matchedCertifications = certResult.matchedCertifications;
    score += certificationBonus; // Up to +0.3 for certification match
  }

  // Rate preference match
  if (profile.minHourlyRate && job.avgHourlyRate) {
    if (job.avgHourlyRate >= profile.minHourlyRate) {
      rateMatch = true;
      score += 0.15; // Meets minimum rate requirement
    }
  }

  return {
    score: Math.min(1, Math.max(0, score)),
    details: { skillMatch, certificationBonus, rateMatch },
    matchedCertifications,
  };
}

/**
 * Match user skills to job category
 * Returns 0-1 based on skill relevance
 * Exported for use in SwipeTab job_lead scenarios
 */
export function matchSkillsToCategory(skills: string[], categoryId: string): number {
  // Skill-to-category mapping
  const categorySkillMap: Record<string, string[]> = {
    service: ['communication', 'customer service', 'hospitality', 'food service', 'teamwork'],
    retail: ['sales', 'customer service', 'inventory', 'communication', 'cash handling'],
    cleaning: ['attention to detail', 'time management', 'physical fitness'],
    handyman: ['construction', 'repair', 'tools', 'physical fitness', 'problem solving'],
    childcare: ['childcare', 'patience', 'communication', 'first aid', 'creativity'],
    tutoring: ['teaching', 'math', 'science', 'languages', 'patience', 'communication'],
    events: ['communication', 'customer service', 'appearance', 'stamina'],
    interim: ['flexibility', 'adaptability', 'physical fitness', 'teamwork'],
    digital: ['computer', 'typing', 'social media', 'writing', 'design', 'programming'],
    campus: ['organization', 'computer', 'customer service', 'time management'],
  };

  const relevantSkills = categorySkillMap[categoryId] || [];
  if (relevantSkills.length === 0) return 0;

  const normalizedSkills = skills.map((s) => s.toLowerCase());
  const matches = relevantSkills.filter((rs) =>
    normalizedSkills.some((us) => us.includes(rs) || rs.includes(us))
  );

  return matches.length / relevantSkills.length;
}

/**
 * Score multiple jobs and sort by score
 */
export function scoreJobsForProfile(jobs: ProspectionCard[], profile?: UserProfile): ScoredJob[] {
  return jobs.map((job) => scoreJob(job, profile)).sort((a, b) => b.score - a.score);
}

/**
 * Get star rating display (e.g., "4.2")
 */
export function formatStarRating(score: number): string {
  return score.toFixed(1);
}

/**
 * Check if job qualifies as "Top Pick" (score >= 4.5)
 */
export function isTopPick(score: number): boolean {
  return score >= 4.5;
}

/**
 * Get color for map pin based on score
 * Phase 8: Visual color coding for job match quality
 */
export function getScoreColor(score: number): string {
  if (score >= 4.5) return '#22c55e'; // green-500 - Top pick
  if (score >= 4.0) return '#84cc16'; // lime-500 - Great match
  if (score >= 3.5) return '#eab308'; // yellow-500 - Good match
  if (score >= 3.0) return '#f97316'; // orange-500 - Fair match
  return '#ef4444'; // red-500 - Low match
}

/**
 * Get score tier label for UI display
 */
export function getScoreTier(score: number): 'top' | 'great' | 'good' | 'fair' | 'low' {
  if (score >= 4.5) return 'top';
  if (score >= 4.0) return 'great';
  if (score >= 3.5) return 'good';
  if (score >= 3.0) return 'fair';
  return 'low';
}
