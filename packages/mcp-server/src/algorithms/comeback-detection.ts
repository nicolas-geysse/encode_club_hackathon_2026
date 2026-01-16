/**
 * Comeback Detection Algorithm
 *
 * Detects when a student has recovered from a low energy period
 * and is ready to catch up on missed progress.
 *
 * Comeback Window triggers when:
 * - Had ≥2 low weeks (energy < 40%)
 * - Current energy > 80%
 * - Previous energy < 50% (showing recovery)
 *
 * The algorithm generates a capacity-aware catch-up plan that
 * distributes the deficit across available high-capacity weeks.
 *
 * Energy Debt and Comeback Mode are mutually exclusive:
 * - Energy Debt: Still in low energy period
 * - Comeback: Recovered and ready to accelerate
 */

import { trace } from '../services/opik.js';

// ============================================
// TYPES
// ============================================

export interface EnergyEntry {
  week: number;
  level: number; // 0-100
  date: string;
}

export interface ComebackWindow {
  detected: boolean;
  recoveryWeek: number;
  deficitWeeks: number;
  suggestedCatchUpWeeks: number;
  deficit: number; // Amount to catch up (€)
  confidenceScore: number; // 0-1, how confident we are in the comeback
}

export interface CatchUpPlan {
  week: number;
  target: number; // € target for this week
  capacity: number; // Available hours/capacity
  effortLevel: 'light' | 'moderate' | 'intense';
}

export interface ComebackResult {
  window: ComebackWindow | null;
  plan: CatchUpPlan[];
  totalCatchUp: number;
  weeklyAverage: number;
  achievement: ComebackAchievement | null;
}

export interface ComebackAchievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'bronze' | 'silver' | 'gold';
}

export interface ComebackConfig {
  lowThreshold: number; // Energy below this = low (default: 40)
  recoveryThreshold: number; // Energy above this = recovered (default: 80)
  previousThreshold: number; // Previous week must be below this (default: 50)
  minLowWeeks: number; // Minimum low weeks to trigger (default: 2)
  maxCatchUpWeeks: number; // Cap on catch-up duration (default: 3)
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_CONFIG: ComebackConfig = {
  lowThreshold: 40,
  recoveryThreshold: 80,
  previousThreshold: 50,
  minLowWeeks: 2,
  maxCatchUpWeeks: 3,
};

// Default capacities for catch-up weeks (hours available)
export const DEFAULT_CAPACITIES = [90, 80, 70]; // Decreasing to avoid burnout

// ============================================
// CORE ALGORITHM
// ============================================

/**
 * Detect a comeback window from energy history
 *
 * A comeback is detected when:
 * 1. There are at least 3 weeks of history
 * 2. At least minLowWeeks had energy < lowThreshold
 * 3. Current (latest) energy > recoveryThreshold
 * 4. Previous energy < previousThreshold
 */
export function detectComebackWindow(
  energyHistory: number[],
  deficit: number,
  config: Partial<ComebackConfig> = {}
): ComebackWindow | null {
  const { lowThreshold, recoveryThreshold, previousThreshold, minLowWeeks, maxCatchUpWeeks } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Need at least 3 data points
  if (energyHistory.length < 3) {
    return null;
  }

  // Count low weeks
  const lowWeeks = energyHistory.filter((e) => e < lowThreshold);

  // Get current and previous energy
  const currentEnergy = energyHistory[energyHistory.length - 1];
  const previousEnergy = energyHistory[energyHistory.length - 2] || 50;

  // Check comeback conditions
  const hasEnoughLowWeeks = lowWeeks.length >= minLowWeeks;
  const isRecovered = currentEnergy > recoveryThreshold;
  const wasLow = previousEnergy < previousThreshold;

  if (!hasEnoughLowWeeks || !isRecovered || !wasLow) {
    return null;
  }

  // Calculate confidence based on recovery strength
  const recoveryDelta = currentEnergy - previousEnergy;
  const confidenceScore = Math.min(1, recoveryDelta / 50); // 50+ point jump = max confidence

  return {
    detected: true,
    recoveryWeek: energyHistory.length,
    deficitWeeks: lowWeeks.length,
    suggestedCatchUpWeeks: Math.min(maxCatchUpWeeks, Math.ceil(lowWeeks.length * 1.5)),
    deficit,
    confidenceScore,
  };
}

/**
 * Detect comeback window with Opik tracing
 */
export async function detectComebackWindowTraced(
  energyHistory: number[],
  deficit: number,
  userId: string,
  config: Partial<ComebackConfig> = {}
): Promise<ComebackWindow | null> {
  return trace('comeback_window_detection', async (span) => {
    const result = detectComebackWindow(energyHistory, deficit, config);

    span.setAttributes({
      'comeback.user_id': userId,
      'comeback.history_length': energyHistory.length,
      'comeback.detected': result?.detected || false,
      'comeback.deficit_weeks': result?.deficitWeeks || 0,
      'comeback.confidence': result?.confidenceScore || 0,
    });

    return result;
  });
}

/**
 * Generate a catch-up plan for a comeback window
 *
 * Distributes the deficit proportionally to available capacity,
 * with higher targets in earlier weeks (front-loading).
 */
export function generateCatchUpPlan(
  deficit: number,
  capacities: number[] = DEFAULT_CAPACITIES
): CatchUpPlan[] {
  if (deficit <= 0 || capacities.length === 0) {
    return [];
  }

  const totalCapacity = capacities.reduce((a, b) => a + b, 0);

  return capacities.map((cap, index) => {
    const proportionalTarget = Math.round((cap / totalCapacity) * deficit);

    // Determine effort level based on proportion of capacity used
    const effortRatio = proportionalTarget / (cap * 0.5); // Assuming 50% conversion rate
    let effortLevel: 'light' | 'moderate' | 'intense';
    if (effortRatio < 0.7) {
      effortLevel = 'light';
    } else if (effortRatio < 1.2) {
      effortLevel = 'moderate';
    } else {
      effortLevel = 'intense';
    }

    return {
      week: index + 1,
      target: proportionalTarget,
      capacity: cap,
      effortLevel,
    };
  });
}

/**
 * Full comeback analysis with plan generation
 */
export async function analyzeComeback(
  energyHistory: number[],
  deficit: number,
  userId: string,
  capacities: number[] = DEFAULT_CAPACITIES,
  config: Partial<ComebackConfig> = {}
): Promise<ComebackResult> {
  return trace('comeback_analysis', async (span) => {
    const window = detectComebackWindow(energyHistory, deficit, config);

    if (!window) {
      return {
        window: null,
        plan: [],
        totalCatchUp: 0,
        weeklyAverage: 0,
        achievement: null,
      };
    }

    // Generate plan using suggested weeks
    const planCapacities = capacities.slice(0, window.suggestedCatchUpWeeks);
    const plan = generateCatchUpPlan(deficit, planCapacities);

    const totalCatchUp = plan.reduce((sum, week) => sum + week.target, 0);
    const weeklyAverage = plan.length > 0 ? Math.round(totalCatchUp / plan.length) : 0;

    // Check for achievement
    const achievement = determineAchievement(window, plan);

    span.setAttributes({
      'comeback.total_catch_up': totalCatchUp,
      'comeback.weekly_average': weeklyAverage,
      'comeback.plan_weeks': plan.length,
      'comeback.achievement': achievement?.id || 'none',
    });

    return {
      window,
      plan,
      totalCatchUp,
      weeklyAverage,
      achievement,
    };
  });
}

// ============================================
// GAMIFICATION
// ============================================

function determineAchievement(
  window: ComebackWindow,
  plan: CatchUpPlan[]
): ComebackAchievement | null {
  // No achievement if plan is empty or deficit was small
  if (plan.length === 0 || window.deficit < 50) {
    return null;
  }

  // Tier based on recovery strength
  let tier: 'bronze' | 'silver' | 'gold';
  let name: string;
  let description: string;
  let emoji: string;

  if (window.deficitWeeks >= 4 && window.confidenceScore >= 0.8) {
    tier = 'gold';
    name = 'Comeback King';
    description = 'Récupération exceptionnelle après une longue période difficile';
    emoji = '👑';
  } else if (window.deficitWeeks >= 3 || window.confidenceScore >= 0.6) {
    tier = 'silver';
    name = 'Phoenix Rising';
    description = 'Forte récupération après un passage difficile';
    emoji = '🔥';
  } else {
    tier = 'bronze';
    name = 'Back on Track';
    description = 'De retour après une pause méritée';
    emoji = '🚀';
  }

  return {
    id: `comeback_${tier}`,
    name,
    description,
    emoji,
    tier,
  };
}

/**
 * Check if user completed their comeback plan
 */
export function checkComebackCompletion(
  plan: CatchUpPlan[],
  actualEarnings: number[]
): {
  completed: boolean;
  completionRate: number;
  achievement: ComebackAchievement | null;
} {
  if (plan.length === 0) {
    return { completed: false, completionRate: 0, achievement: null };
  }

  const totalTarget = plan.reduce((sum, w) => sum + w.target, 0);
  const totalActual = actualEarnings.reduce((sum, e) => sum + e, 0);
  const completionRate = Math.min(1, totalActual / totalTarget);

  const completed = completionRate >= 0.8; // 80% = success

  let achievement: ComebackAchievement | null = null;
  if (completed) {
    if (completionRate >= 1.1) {
      achievement = {
        id: 'comeback_overachiever',
        name: 'Overachiever',
        description: 'Dépassé les objectifs de rattrapage de 10%+',
        emoji: '🌟',
        tier: 'gold',
      };
    } else if (completionRate >= 1.0) {
      achievement = {
        id: 'comeback_complete',
        name: 'Mission Accomplie',
        description: 'Plan de rattrapage complété à 100%',
        emoji: '✅',
        tier: 'silver',
      };
    } else {
      achievement = {
        id: 'comeback_success',
        name: 'Good Enough',
        description: 'Plan de rattrapage complété à 80%+',
        emoji: '👍',
        tier: 'bronze',
      };
    }
  }

  return { completed, completionRate, achievement };
}

// ============================================
// EXPORTS
// ============================================

export default {
  detectComebackWindow,
  detectComebackWindowTraced,
  generateCatchUpPlan,
  analyzeComeback,
  checkComebackCompletion,
  DEFAULT_CONFIG,
  DEFAULT_CAPACITIES,
};
