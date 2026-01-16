/**
 * Energy Debt Algorithm
 *
 * Detects when a student has been running on low energy for too long.
 * ≥3 consecutive weeks with energy <40% triggers Energy Debt mode.
 *
 * When in debt:
 * - Targets are automatically reduced (50-85% depending on severity)
 * - Debt points accumulate (gamification)
 * - Self-care mode is suggested
 *
 * Energy Debt and Comeback Mode are mutually exclusive:
 * - Energy Debt: Still in a low energy period
 * - Comeback: Recovered from a low period, ready to catch up
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

export type DebtSeverity = 'low' | 'medium' | 'high';

export interface EnergyDebt {
  detected: boolean;
  consecutiveLowWeeks: number;
  severity: DebtSeverity;
  accumulatedDebt: number; // Gamification points
  targetReduction: number; // Percentage to reduce goals (0-1)
  suggestions: string[];
}

export interface EnergyDebtConfig {
  threshold: number; // Energy level below which counts as "low" (default: 40)
  minConsecutiveWeeks: number; // Weeks needed to trigger debt (default: 3)
  debtPointsPerWeek: number; // Points accumulated per low week (default: 30)
}

export interface TargetAdjustment {
  originalTarget: number;
  adjustedTarget: number;
  reductionPercentage: number;
  reason: string;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_CONFIG: EnergyDebtConfig = {
  threshold: 40,
  minConsecutiveWeeks: 3,
  debtPointsPerWeek: 30,
};

// Severity thresholds
const SEVERITY_THRESHOLDS = {
  low: { weeks: 3, reduction: 0.5 }, // 3 weeks = 50% reduction
  medium: { weeks: 4, reduction: 0.75 }, // 4 weeks = 75% reduction
  high: { weeks: 5, reduction: 0.85 }, // 5+ weeks = 85% reduction
};

// ============================================
// CORE ALGORITHM
// ============================================

/**
 * Detect energy debt from energy history
 *
 * Looks at the most recent entries and counts consecutive
 * weeks below the threshold (starting from the most recent).
 */
export function detectEnergyDebt(
  history: EnergyEntry[],
  config: Partial<EnergyDebtConfig> = {}
): EnergyDebt {
  const { threshold, minConsecutiveWeeks, debtPointsPerWeek } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Need at least minConsecutiveWeeks of data
  if (history.length < minConsecutiveWeeks) {
    return createNoDebtResult();
  }

  // Count consecutive low weeks from most recent
  let consecutiveLow = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].level < threshold) {
      consecutiveLow++;
    } else {
      break; // Chain broken
    }
  }

  // Not enough consecutive low weeks
  if (consecutiveLow < minConsecutiveWeeks) {
    return createNoDebtResult();
  }

  // Determine severity
  const severity = determineSeverity(consecutiveLow);
  const severityConfig = SEVERITY_THRESHOLDS[severity];

  return {
    detected: true,
    consecutiveLowWeeks: consecutiveLow,
    severity,
    accumulatedDebt: consecutiveLow * debtPointsPerWeek,
    targetReduction: severityConfig.reduction,
    suggestions: generateSuggestions(severity, consecutiveLow),
  };
}

/**
 * Detect energy debt with Opik tracing
 */
export async function detectEnergyDebtTraced(
  history: EnergyEntry[],
  userId: string,
  config: Partial<EnergyDebtConfig> = {}
): Promise<EnergyDebt> {
  return trace('energy_debt_detection', async (span) => {
    const result = detectEnergyDebt(history, config);

    span.setAttributes({
      'energy_debt.user_id': userId,
      'energy_debt.history_length': history.length,
      'energy_debt.detected': result.detected,
      'energy_debt.consecutive_weeks': result.consecutiveLowWeeks,
      'energy_debt.severity': result.severity,
      'energy_debt.accumulated_debt': result.accumulatedDebt,
    });

    return result;
  });
}

/**
 * Adjust a weekly target based on energy debt
 */
export function adjustTargetForDebt(weeklyTarget: number, debt: EnergyDebt): TargetAdjustment {
  if (!debt.detected) {
    return {
      originalTarget: weeklyTarget,
      adjustedTarget: weeklyTarget,
      reductionPercentage: 0,
      reason: 'Pas de dette énergétique détectée',
    };
  }

  const reduction = debt.targetReduction;
  const adjustedTarget = Math.round(weeklyTarget * (1 - reduction));

  const severityLabel = {
    low: 'légère',
    medium: 'modérée',
    high: 'critique',
  }[debt.severity];

  return {
    originalTarget: weeklyTarget,
    adjustedTarget,
    reductionPercentage: reduction * 100,
    reason:
      `Dette énergétique ${severityLabel} (${debt.consecutiveLowWeeks} semaines). ` +
      `Objectif réduit de ${Math.round(reduction * 100)}% pour préserver ta santé.`,
  };
}

/**
 * Calculate recovery progress
 * Returns percentage of debt "paid off" based on recent good weeks
 */
export function calculateRecoveryProgress(
  history: EnergyEntry[],
  recoveryThreshold: number = 60
): number {
  if (history.length < 2) return 0;

  // Count recent weeks above recovery threshold
  let goodWeeks = 0;
  for (let i = history.length - 1; i >= 0 && goodWeeks < 3; i--) {
    if (history[i].level >= recoveryThreshold) {
      goodWeeks++;
    } else {
      break;
    }
  }

  // 3 good weeks = 100% recovered
  return Math.min(100, Math.round((goodWeeks / 3) * 100));
}

// ============================================
// GAMIFICATION
// ============================================

export interface DebtAchievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  unlocked: boolean;
}

/**
 * Check for debt-related achievements
 */
export function checkDebtAchievements(
  currentDebt: EnergyDebt,
  recoveryProgress: number,
  previousDebt: EnergyDebt | null
): DebtAchievement[] {
  const achievements: DebtAchievement[] = [];

  // Survived debt
  if (previousDebt?.detected && !currentDebt.detected) {
    achievements.push({
      id: 'debt_survivor',
      name: 'Debt Survivor',
      description: 'Sorti de la dette énergétique',
      emoji: '🌟',
      unlocked: true,
    });
  }

  // Full recovery
  if (recoveryProgress >= 100) {
    achievements.push({
      id: 'fully_recharged',
      name: 'Fully Recharged',
      description: '3 semaines consécutives au-dessus de 60%',
      emoji: '🔋',
      unlocked: true,
    });
  }

  // Resilient (survived high debt)
  if (previousDebt?.severity === 'high' && !currentDebt.detected) {
    achievements.push({
      id: 'resilient',
      name: 'Resilient',
      description: "Récupéré d'une dette critique",
      emoji: '💪',
      unlocked: true,
    });
  }

  return achievements;
}

// ============================================
// HELPERS
// ============================================

function createNoDebtResult(): EnergyDebt {
  return {
    detected: false,
    consecutiveLowWeeks: 0,
    severity: 'low',
    accumulatedDebt: 0,
    targetReduction: 0,
    suggestions: [],
  };
}

function determineSeverity(consecutiveWeeks: number): DebtSeverity {
  if (consecutiveWeeks >= 5) return 'high';
  if (consecutiveWeeks >= 4) return 'medium';
  return 'low';
}

function generateSuggestions(severity: DebtSeverity, weeks: number): string[] {
  const suggestions: string[] = [];

  // Always suggest rest
  suggestions.push('🧘 Prends du temps pour te reposer');
  suggestions.push('😴 Assure-toi de dormir 7-8h par nuit');

  if (severity === 'medium' || severity === 'high') {
    suggestions.push('📱 Limite les écrans le soir');
    suggestions.push('🚶 Fais une pause marche de 15 min/jour');
  }

  if (severity === 'high') {
    suggestions.push('👨‍⚕️ Considère parler à un professionnel');
    suggestions.push('📅 Report les engagements non-essentiels');
  }

  // Weeks-specific
  if (weeks >= 4) {
    suggestions.push(`⚠️ ${weeks} semaines c'est long - ta santé passe en premier`);
  }

  return suggestions;
}

// ============================================
// EXPORTS
// ============================================

export default {
  detectEnergyDebt,
  detectEnergyDebtTraced,
  adjustTargetForDebt,
  calculateRecoveryProgress,
  checkDebtAchievements,
  DEFAULT_CONFIG,
};
