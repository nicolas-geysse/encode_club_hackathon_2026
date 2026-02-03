/**
 * Job Scoring Utility
 *
 * Scores job opportunities based on:
 * - Distance (30%): Closer is better
 * - Profile match (25%): Matches user skills and preferences + certifications
 * - Effort level (25%): Lower effort is better for sustainability
 * - Rate (20%): Higher pay is better
 *
 * Returns score 1-5 (star rating format)
 *
 * Phase 5: Added certification bonus support
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
  /** Detailed profile breakdown for UI tooltip */
  profileDetails?: {
    skillMatch: number; // 0-1 skill relevance
    certificationBonus: number; // 0-0.3 certification bonus
    rateMatch: boolean; // meets minimum rate
  };
}

export interface ScoredJob extends ProspectionCard {
  score: number; // 1-5 star rating
  scoreBreakdown: JobScoreBreakdown;
  /** Certifications that boost this job (for badge display) */
  matchedCertifications?: CertificationDefinition[];
}

export interface UserProfile {
  skills?: string[];
  /** Phase 5: Professional certifications (BAFA, PSC1, etc.) */
  certifications?: string[];
  maxWorkHoursWeekly?: number;
  minHourlyRate?: number;
}

// Scoring weights (must sum to 1.0)
const WEIGHTS = {
  distance: 0.3,
  profile: 0.25,
  effort: 0.25,
  rate: 0.2,
};

// Normalization constants
const MAX_COMMUTE_MINUTES = 45; // 45+ min = score 0
const MAX_HOURLY_RATE = 25; // 25€/h = normalized to 1.0
const MAX_EFFORT = 5;

/**
 * Calculate job score based on multiple factors
 * Returns score 1-5 (star rating)
 */
export function scoreJob(job: ProspectionCard, profile?: UserProfile): ScoredJob {
  // Distance score: closer is better (invert: 45min = 0, 0min = 1)
  const commuteMinutes = job.commuteMinutes ?? 30;
  const distanceNorm = Math.max(0, 1 - commuteMinutes / MAX_COMMUTE_MINUTES);

  // Profile match score: check if job matches user skills/preferences + certifications
  const profileResult = calculateProfileMatch(job, profile);

  // Effort score: lower effort is better (invert)
  const effortLevel = job.effortLevel ?? 3;
  const effortNorm = 1 - (effortLevel - 1) / (MAX_EFFORT - 1);

  // Rate score: higher is better
  const hourlyRate = job.avgHourlyRate ?? 11;
  const rateNorm = Math.min(hourlyRate / MAX_HOURLY_RATE, 1);

  // Weighted sum
  const rawScore =
    WEIGHTS.distance * distanceNorm +
    WEIGHTS.profile * profileResult.score +
    WEIGHTS.effort * effortNorm +
    WEIGHTS.rate * rateNorm;

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
      profileDetails: profileResult.details,
    },
    matchedCertifications: profileResult.matchedCertifications,
  };
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
 */
function matchSkillsToCategory(skills: string[], categoryId: string): number {
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
