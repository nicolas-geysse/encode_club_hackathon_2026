/**
 * Comeback Detection Algorithm (Pure Functions)
 *
 * Single source of truth for comeback window detection.
 * Can be imported by both client components and server API routes.
 *
 * P1-Health: Extracted from API route for universal use
 */

// ============================================
// TYPES
// ============================================

export interface ComebackWindow {
  detected: boolean;
  recoveryWeek: number;
  deficitWeeks: number;
  suggestedCatchUpWeeks: number;
  deficit: number;
  confidenceScore: number;
}

export interface CatchUpPlan {
  week: number;
  target: number;
  capacity: number;
  effortLevel: 'light' | 'moderate' | 'intense';
}

export interface ComebackResult {
  window: ComebackWindow | null;
  plan: CatchUpPlan[];
  totalCatchUp: number;
  weeklyAverage: number;
}

export interface ComebackConfig {
  lowThreshold: number;
  recoveryThreshold: number;
  previousThreshold: number;
  minLowWeeks: number;
  maxCatchUpWeeks: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const COMEBACK_DEFAULT_CONFIG: ComebackConfig = {
  lowThreshold: 40,
  recoveryThreshold: 80,
  previousThreshold: 50,
  minLowWeeks: 2,
  maxCatchUpWeeks: 3,
};

export const DEFAULT_CAPACITIES = [90, 80, 70];

// ============================================
// CORE ALGORITHMS
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
    ...COMEBACK_DEFAULT_CONFIG,
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
  const confidenceScore = Math.min(1, recoveryDelta / 50);

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
 * Generate a catch-up plan for a comeback window
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

    const effortRatio = proportionalTarget / (cap * 0.5);
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
export function analyzeComeback(
  energyHistory: number[],
  deficit: number,
  capacities: number[] = DEFAULT_CAPACITIES,
  config: Partial<ComebackConfig> = {}
): ComebackResult {
  const window = detectComebackWindow(energyHistory, deficit, config);

  if (!window) {
    return {
      window: null,
      plan: [],
      totalCatchUp: 0,
      weeklyAverage: 0,
    };
  }

  const planCapacities = capacities.slice(0, window.suggestedCatchUpWeeks);
  const plan = generateCatchUpPlan(deficit, planCapacities);

  const totalCatchUp = plan.reduce((sum, week) => sum + week.target, 0);
  const weeklyAverage = plan.length > 0 ? Math.round(totalCatchUp / plan.length) : 0;

  return {
    window,
    plan,
    totalCatchUp,
    weeklyAverage,
  };
}
