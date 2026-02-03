/**
 * Energy Debt Detection Algorithm (Pure Functions)
 *
 * Single source of truth for energy debt detection.
 * Can be imported by both client components and server API routes.
 *
 * P1-Health: Extracted from API route for universal use
 */

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
  accumulatedDebt: number;
  targetReduction: number;
  suggestions: string[];
}

export interface TargetAdjustment {
  originalTarget: number;
  adjustedTarget: number;
  reductionPercentage: number;
  reason: string;
}

export interface EnergyDebtConfig {
  threshold: number;
  minConsecutiveWeeks: number;
  debtPointsPerWeek: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const ENERGY_DEBT_DEFAULT_CONFIG: EnergyDebtConfig = {
  threshold: 40,
  minConsecutiveWeeks: 3,
  debtPointsPerWeek: 30,
};

const SEVERITY_THRESHOLDS = {
  low: { weeks: 3, reduction: 0.5 },
  medium: { weeks: 4, reduction: 0.75 },
  high: { weeks: 5, reduction: 0.85 },
};

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

  if (weeks >= 4) {
    suggestions.push(`⚠️ ${weeks} semaines c'est long - ta santé passe en premier`);
  }

  return suggestions;
}

// ============================================
// CORE ALGORITHMS
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
    ...ENERGY_DEBT_DEFAULT_CONFIG,
    ...config,
  };

  if (history.length < minConsecutiveWeeks) {
    return createNoDebtResult();
  }

  // Count consecutive low weeks from most recent
  let consecutiveLow = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].level < threshold) {
      consecutiveLow++;
    } else {
      break;
    }
  }

  if (consecutiveLow < minConsecutiveWeeks) {
    return createNoDebtResult();
  }

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
 */
export function calculateRecoveryProgress(
  history: EnergyEntry[],
  recoveryThreshold: number = 60
): number {
  if (history.length < 2) return 0;

  let goodWeeks = 0;
  for (let i = history.length - 1; i >= 0 && goodWeeks < 3; i--) {
    if (history[i].level >= recoveryThreshold) {
      goodWeeks++;
    } else {
      break;
    }
  }

  return Math.min(100, Math.round((goodWeeks / 3) * 100));
}
