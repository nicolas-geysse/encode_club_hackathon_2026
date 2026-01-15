/**
 * Retroplanning Algorithm
 *
 * Capacity-aware goal planning that adapts weekly targets based on:
 * - Academic calendar (exams reduce capacity)
 * - Recurring commitments (classes, sports consume time)
 * - Energy/mood patterns (historical data for prediction)
 *
 * Core principle: Work backward from deadline, distribute goal
 * proportionally to available capacity, front-load when possible.
 */

import { trace } from '../services/opik.js';
import type {
  AcademicEvent,
  Commitment,
  EnergyLog,
  WeekCapacity,
  DynamicMilestone,
  Retroplan,
  RetroplanConfig,
  RetroplanInput,
  CapacityCategory,
  MilestoneDifficulty,
  DEFAULT_RETROPLAN_CONFIG,
  CalendarViewData,
  CalendarWeek,
  CalendarDay,
} from '../types/retroplanning.js';
import { randomUUID } from 'crypto';

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Generate a capacity-aware retroplan for a financial goal
 */
export async function generateRetroplan(input: RetroplanInput): Promise<Retroplan> {
  return trace('generate_retroplan', async (span) => {
    const startTime = Date.now();

    // Step 1: Build configuration
    const config = buildConfig(input);

    // Step 2: Calculate week capacities
    const weekCapacities = calculateAllWeekCapacities(
      input.userId,
      new Date(),
      input.deadline,
      input.academicEvents || [],
      input.commitments || [],
      input.energyHistory || [],
      config
    );

    // Step 3: Generate milestones with retroplanning
    const milestones = generateDynamicMilestones(input.goalAmount, weekCapacities, config);

    // Step 4: Apply front-loading optimization
    optimizeFrontLoading(milestones);

    // Step 5: Calculate feasibility
    const feasibility = assessFeasibility(milestones, weekCapacities, input.goalAmount);

    // Step 6: Build retroplan
    const retroplan = buildRetroplan(input, milestones, weekCapacities, feasibility, config);

    span.setAttributes({
      'retroplan.goal_amount': input.goalAmount,
      'retroplan.total_weeks': retroplan.totalWeeks,
      'retroplan.feasibility_score': retroplan.feasibilityScore,
      'retroplan.front_loaded_pct': retroplan.frontLoadedPercentage,
      'retroplan.protected_weeks': retroplan.protectedWeeks,
      'retroplan.generation_time_ms': Date.now() - startTime,
    });

    return retroplan;
  });
}

// ============================================
// CONFIGURATION
// ============================================

function buildConfig(input: RetroplanInput): RetroplanConfig {
  const defaults = {
    goalAmount: input.goalAmount,
    deadline: input.deadline,
    minimumBudgetProtection: 0,
    defaultHourlyRate: input.userProfile.defaultHourlyRate || 15,
    maxHoursPerWeek: Math.min(input.userProfile.availableHours, 25),
    minHoursPerWeek: 3,
    bufferWeeks: 1,
    bufferPercentage: 0.1,
    examCapacityMultiplier: 0.2,
    preExamWeeksProtected: 1,
    catchUpMultiplier: 1.5,
    catchUpSpreadWeeks: 3,
  };

  return { ...defaults, ...input.configOverrides };
}

// ============================================
// WEEK CAPACITY CALCULATION
// ============================================

function calculateAllWeekCapacities(
  userId: string,
  startDate: Date,
  deadline: Date,
  academicEvents: AcademicEvent[],
  commitments: Commitment[],
  energyHistory: EnergyLog[],
  config: RetroplanConfig
): WeekCapacity[] {
  const capacities: WeekCapacity[] = [];
  const weeks = getWeeksBetween(startDate, deadline);

  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(startDate, i * 7);
    const weekEnd = addDays(weekStart, 6);

    const capacity = calculateWeekCapacity(
      i + 1,
      weekStart,
      weekEnd,
      academicEvents,
      commitments,
      energyHistory,
      config
    );

    capacities.push(capacity);
  }

  return capacities;
}

function calculateWeekCapacity(
  weekNumber: number,
  weekStart: Date,
  weekEnd: Date,
  academicEvents: AcademicEvent[],
  commitments: Commitment[],
  energyHistory: EnergyLog[],
  config: RetroplanConfig
): WeekCapacity {
  // Base time calculation
  const totalAvailableHours = 168; // Hours in a week
  const sleepHours = 56; // 8h/day

  // Calculate class and commitment hours
  const classHours = calculateClassHours(weekStart, commitments);
  const commitmentHours = calculateOtherCommitmentHours(weekStart, commitments);

  // Personal buffer (meals, travel, self-care)
  const personalBufferHours = 21; // ~3h/day

  // Base workable hours
  const baseWorkableHours = Math.max(
    0,
    totalAvailableHours - sleepHours - classHours - commitmentHours - personalBufferHours
  );

  // Find academic events affecting this week
  const weekEvents = academicEvents.filter((e) =>
    isDateRangeOverlapping(weekStart, weekEnd, new Date(e.startDate), new Date(e.endDate))
  );

  // Calculate academic impact multiplier
  const academicMultiplier = calculateAcademicMultiplier(weekEvents, config);
  const isExamPeriod = weekEvents.some((e) => e.type === 'exam_period');
  const isProtected = weekEvents.some((e) => e.priority === 'critical') || isExamPeriod;

  // Predict energy multiplier
  const energyMultiplier = predictEnergyMultiplier(weekStart, energyHistory, isExamPeriod);

  // Calculate final workable hours
  let maxWorkableHours = Math.round(baseWorkableHours * academicMultiplier * energyMultiplier);

  // Apply bounds
  maxWorkableHours = Math.max(config.minHoursPerWeek, maxWorkableHours);
  maxWorkableHours = Math.min(config.maxHoursPerWeek, maxWorkableHours);

  // Calculate capacity score (0-100)
  const capacityScore = calculateCapacityScore(
    maxWorkableHours,
    config.maxHoursPerWeek,
    academicMultiplier,
    energyMultiplier
  );

  // Categorize capacity
  const capacityCategory = categorizeCapacity(capacityScore, isProtected);

  // Calculate earning potential
  const maxEarningPotential = maxWorkableHours * config.defaultHourlyRate;
  const recommendedTarget = Math.round(maxEarningPotential * 0.7); // 70% is sustainable
  const minimumTarget = Math.round(maxEarningPotential * 0.3); // Floor

  return {
    weekNumber,
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    totalAvailableHours,
    sleepHours,
    classHours,
    commitmentHours,
    personalBufferHours,
    maxWorkableHours,
    capacityScore,
    capacityCategory,
    academicEvents: weekEvents,
    isExamPeriod,
    isProtectedWeek: isProtected,
    predictedEnergyMultiplier: energyMultiplier,
    maxEarningPotential,
    recommendedTarget,
    minimumTarget,
  };
}

function calculateClassHours(weekStart: Date, commitments: Commitment[]): number {
  return commitments
    .filter((c) => c.type === 'class')
    .filter((c) => isCommitmentActiveForWeek(c, weekStart))
    .reduce((sum, c) => sum + c.hoursPerWeek, 0);
}

function calculateOtherCommitmentHours(weekStart: Date, commitments: Commitment[]): number {
  return commitments
    .filter((c) => c.type !== 'class')
    .filter((c) => isCommitmentActiveForWeek(c, weekStart))
    .reduce((sum, c) => sum + c.hoursPerWeek, 0);
}

function isCommitmentActiveForWeek(commitment: Commitment, weekStart: Date): boolean {
  if (!commitment.startDate && !commitment.endDate) return true;

  const start = commitment.startDate ? new Date(commitment.startDate) : new Date(0);
  const end = commitment.endDate ? new Date(commitment.endDate) : new Date('2100-01-01');

  return weekStart >= start && weekStart <= end;
}

function calculateAcademicMultiplier(events: AcademicEvent[], config: RetroplanConfig): number {
  if (events.length === 0) return 1.0;

  // Use the lowest multiplier among overlapping events
  let lowestMultiplier = 1.0;

  for (const event of events) {
    let eventMultiplier = 1.0;

    switch (event.type) {
      case 'exam_period':
        eventMultiplier = config.examCapacityMultiplier;
        break;
      case 'class_intensive':
        eventMultiplier = 0.5;
        break;
      case 'project_deadline':
        eventMultiplier = 0.6;
        break;
      case 'internship':
        eventMultiplier = 0.3;
        break;
      case 'vacation':
        eventMultiplier = 1.5; // Can do MORE during vacation
        break;
    }

    // Use event's specific capacity impact if defined
    if (event.capacityImpact !== undefined) {
      eventMultiplier = event.capacityImpact;
    }

    lowestMultiplier = Math.min(lowestMultiplier, eventMultiplier);
  }

  return lowestMultiplier;
}

function predictEnergyMultiplier(
  weekStart: Date,
  energyHistory: EnergyLog[],
  isExamPeriod: boolean
): number {
  let multiplier = 1.0;

  // Exam periods typically have lower energy
  if (isExamPeriod) {
    multiplier *= 0.8;
  }

  // Use historical average if available
  if (energyHistory.length >= 4) {
    const recentLogs = energyHistory.slice(-8); // Last 8 entries

    const avgEnergy = recentLogs.reduce((sum, e) => sum + e.energyLevel, 0) / recentLogs.length;
    const avgStress = recentLogs.reduce((sum, e) => sum + e.stressLevel, 0) / recentLogs.length;

    // Normalize: 3 = neutral
    const energyFactor = avgEnergy / 3;
    const stressFactor = (6 - avgStress) / 3; // Inverse for stress

    multiplier *= (energyFactor + stressFactor) / 2;
  }

  // Clamp to reasonable range
  return Math.max(0.5, Math.min(1.5, multiplier));
}

function calculateCapacityScore(
  workableHours: number,
  maxHours: number,
  academicMultiplier: number,
  energyMultiplier: number
): number {
  const baseScore = (workableHours / maxHours) * 100;
  const adjustedScore = baseScore * academicMultiplier * energyMultiplier;
  return Math.round(Math.max(0, Math.min(100, adjustedScore)));
}

function categorizeCapacity(score: number, isProtected: boolean): CapacityCategory {
  if (isProtected) return 'protected';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ============================================
// MILESTONE GENERATION
// ============================================

function generateDynamicMilestones(
  goalAmount: number,
  capacities: WeekCapacity[],
  config: RetroplanConfig
): DynamicMilestone[] {
  // Calculate total capacity
  const totalCapacityScore = capacities.reduce((sum, c) => sum + c.capacityScore, 0);

  // Add buffer to goal
  const bufferedGoal = goalAmount * (1 + config.bufferPercentage);

  // Target per capacity point
  const targetPerCapacityPoint = bufferedGoal / totalCapacityScore;

  // Distribute across weeks
  let cumulativeTarget = 0;
  const milestones: DynamicMilestone[] = [];

  for (const capacity of capacities) {
    // Base target proportional to capacity
    let adjustedTarget = Math.round(capacity.capacityScore * targetPerCapacityPoint);

    // Apply constraints for protected weeks
    if (capacity.isProtectedWeek) {
      adjustedTarget = Math.min(adjustedTarget, capacity.minimumTarget);
    } else if (capacity.isExamPeriod) {
      adjustedTarget = Math.min(adjustedTarget, Math.round(capacity.minimumTarget * 1.5));
    }

    // Ensure within bounds
    adjustedTarget = Math.min(adjustedTarget, capacity.recommendedTarget);
    adjustedTarget = Math.max(adjustedTarget, capacity.minimumTarget);

    cumulativeTarget += adjustedTarget;

    // Determine difficulty
    const difficulty = determineDifficulty(adjustedTarget, capacity);

    milestones.push({
      weekNumber: capacity.weekNumber,
      weekStartDate: capacity.weekStartDate,
      baseTarget: Math.round(goalAmount / capacities.length),
      adjustedTarget,
      cumulativeTarget,
      capacity,
      recommendedStrategies: [],
      difficulty,
      visualColor: getDifficultyColor(difficulty),
      isCatchUpWeek: false,
      catchUpAmount: 0,
      status: 'future',
    });
  }

  // Normalize to exactly meet goal
  normalizeToGoal(milestones, goalAmount);

  return milestones;
}

function determineDifficulty(target: number, capacity: WeekCapacity): MilestoneDifficulty {
  if (capacity.isProtectedWeek) return 'protected';

  const ratio = target / capacity.recommendedTarget;
  if (ratio < 0.5) return 'easy';
  if (ratio < 0.8) return 'moderate';
  return 'challenging';
}

function getDifficultyColor(difficulty: MilestoneDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return '#4CAF50'; // Green
    case 'moderate':
      return '#FFC107'; // Amber
    case 'challenging':
      return '#FF5722'; // Deep Orange
    case 'protected':
      return '#9E9E9E'; // Gray
  }
}

function normalizeToGoal(milestones: DynamicMilestone[], goalAmount: number): void {
  const totalDistributed = milestones.reduce((sum, m) => sum + m.adjustedTarget, 0);
  const normalizationFactor = goalAmount / totalDistributed;

  let cumulative = 0;
  for (const milestone of milestones) {
    milestone.adjustedTarget = Math.round(milestone.adjustedTarget * normalizationFactor);
    cumulative += milestone.adjustedTarget;
    milestone.cumulativeTarget = cumulative;
  }

  // Fix rounding errors on last milestone
  const lastMilestone = milestones[milestones.length - 1];
  const diff = goalAmount - lastMilestone.cumulativeTarget;
  if (diff !== 0) {
    lastMilestone.adjustedTarget += diff;
    lastMilestone.cumulativeTarget = goalAmount;
  }
}

// ============================================
// FRONT-LOADING OPTIMIZATION
// ============================================

function optimizeFrontLoading(milestones: DynamicMilestone[]): void {
  const halfwayPoint = Math.floor(milestones.length / 2);
  const firstHalf = milestones.slice(0, halfwayPoint);
  const secondHalf = milestones.slice(halfwayPoint);

  // Try to move targets from later weeks to earlier high-capacity weeks
  for (const laterWeek of [...secondHalf].reverse()) {
    if (laterWeek.capacity.isProtectedWeek) continue;

    const reductionRoom = laterWeek.adjustedTarget - laterWeek.capacity.minimumTarget;
    if (reductionRoom <= 0) continue;

    for (const earlyWeek of firstHalf) {
      if (earlyWeek.capacity.isProtectedWeek) continue;
      if (earlyWeek.capacity.capacityCategory !== 'high') continue;

      const absorptionRoom = earlyWeek.capacity.recommendedTarget - earlyWeek.adjustedTarget;
      if (absorptionRoom <= 0) continue;

      // Transfer
      const transfer = Math.min(reductionRoom, absorptionRoom, 50); // Max 50€ transfer
      earlyWeek.adjustedTarget += transfer;
      laterWeek.adjustedTarget -= transfer;

      break;
    }
  }

  // Recalculate cumulative targets
  let cumulative = 0;
  for (const milestone of milestones) {
    cumulative += milestone.adjustedTarget;
    milestone.cumulativeTarget = cumulative;
  }
}

// ============================================
// CATCH-UP MECHANISM
// ============================================

export function calculateCatchUp(
  milestones: DynamicMilestone[],
  currentWeek: number,
  actualProgress: number,
  config: RetroplanConfig
): DynamicMilestone[] {
  const currentMilestone = milestones.find((m) => m.weekNumber === currentWeek);
  if (!currentMilestone) return milestones;

  const deficit = currentMilestone.cumulativeTarget - actualProgress;
  if (deficit <= 0) return milestones; // No catch-up needed

  // Find future weeks that can absorb catch-up
  const futureWeeks = milestones.filter((m) => m.weekNumber > currentWeek);
  const catchUpWeeks = futureWeeks
    .filter((m) => !m.capacity.isProtectedWeek && m.capacity.capacityCategory !== 'low')
    .slice(0, config.catchUpSpreadWeeks);

  if (catchUpWeeks.length === 0) return milestones;

  // Distribute catch-up
  const catchUpPerWeek = Math.ceil(deficit / catchUpWeeks.length);

  for (const week of catchUpWeeks) {
    const maxAdditional = Math.round(week.adjustedTarget * (config.catchUpMultiplier - 1));
    const actualCatchUp = Math.min(catchUpPerWeek, maxAdditional);

    week.isCatchUpWeek = true;
    week.catchUpAmount = actualCatchUp;
    week.adjustedTarget += actualCatchUp;

    // Update difficulty if needed
    const newRatio = week.adjustedTarget / week.capacity.recommendedTarget;
    if (newRatio > 0.9) {
      week.difficulty = 'challenging';
      week.visualColor = getDifficultyColor('challenging');
    }
  }

  // Recalculate cumulative from current week
  let cumulative = actualProgress;
  for (const milestone of futureWeeks) {
    cumulative += milestone.adjustedTarget;
    milestone.cumulativeTarget = cumulative;
  }

  return milestones;
}

// ============================================
// FEASIBILITY ASSESSMENT
// ============================================

interface FeasibilityResult {
  score: number;
  confidenceInterval: { low: number; high: number };
  riskFactors: string[];
}

function assessFeasibility(
  milestones: DynamicMilestone[],
  capacities: WeekCapacity[],
  goalAmount: number
): FeasibilityResult {
  const riskFactors: string[] = [];
  let score = 1.0;

  // Check for too many protected weeks
  const protectedWeeks = capacities.filter((c) => c.isProtectedWeek).length;
  const protectedRatio = protectedWeeks / capacities.length;
  if (protectedRatio > 0.3) {
    score -= 0.2;
    riskFactors.push(`${protectedWeeks} semaines protegees (examens)`);
  }

  // Check for challenging weeks
  const challengingWeeks = milestones.filter((m) => m.difficulty === 'challenging').length;
  if (challengingWeeks > capacities.length * 0.4) {
    score -= 0.15;
    riskFactors.push(`${challengingWeeks} semaines difficiles`);
  }

  // Check average weekly target vs capacity
  const avgTarget = goalAmount / capacities.length;
  const avgCapacity = capacities.reduce((sum, c) => sum + c.recommendedTarget, 0) / capacities.length;
  if (avgTarget > avgCapacity) {
    score -= 0.2;
    riskFactors.push('Objectif hebdo > capacite moyenne');
  }

  // Check for very short timeline
  if (capacities.length < 4) {
    score -= 0.15;
    riskFactors.push('Delai tres court (< 4 semaines)');
  }

  // Confidence interval based on variance
  const variance = calculateVariance(milestones.map((m) => m.adjustedTarget));
  const stdDev = Math.sqrt(variance);

  score = Math.max(0.1, Math.min(1.0, score));

  return {
    score,
    confidenceInterval: {
      low: Math.round(goalAmount * (score - stdDev / 100)),
      high: Math.round(goalAmount * Math.min(1.2, score + stdDev / 100)),
    },
    riskFactors,
  };
}

function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

// ============================================
// BUILD RETROPLAN
// ============================================

function buildRetroplan(
  input: RetroplanInput,
  milestones: DynamicMilestone[],
  capacities: WeekCapacity[],
  feasibility: FeasibilityResult,
  config: RetroplanConfig
): Retroplan {
  const halfwayPoint = Math.floor(milestones.length / 2);
  const firstHalfTotal = milestones.slice(0, halfwayPoint).reduce((sum, m) => sum + m.adjustedTarget, 0);
  const frontLoadedPercentage = Math.round((firstHalfTotal / input.goalAmount) * 100);

  const equalTarget = input.goalAmount / milestones.length;
  const deviations = milestones.map((m) => Math.abs(m.adjustedTarget - equalTarget));
  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;

  return {
    id: randomUUID(),
    goalId: input.goalId,
    userId: input.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    config,
    milestones,
    totalWeeks: capacities.length,
    highCapacityWeeks: capacities.filter((c) => c.capacityCategory === 'high').length,
    mediumCapacityWeeks: capacities.filter((c) => c.capacityCategory === 'medium').length,
    lowCapacityWeeks: capacities.filter((c) => c.capacityCategory === 'low').length,
    protectedWeeks: capacities.filter((c) => c.isProtectedWeek).length,
    feasibilityScore: feasibility.score,
    confidenceInterval: feasibility.confidenceInterval,
    riskFactors: feasibility.riskFactors,
    frontLoadedPercentage,
    evenDistributionDeviation: Math.round(avgDeviation),
    totalBuffer: Math.round(input.goalAmount * config.bufferPercentage),
    bufferUtilization: `${Math.round(config.bufferPercentage * 100)}% buffer reparti`,
    isActive: true,
  };
}

// ============================================
// CALENDAR VIEW GENERATION
// ============================================

export function generateCalendarView(retroplan: Retroplan): CalendarViewData[] {
  const monthsMap = new Map<string, DynamicMilestone[]>();

  // Group milestones by month
  for (const milestone of retroplan.milestones) {
    const date = new Date(milestone.weekStartDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthsMap.has(key)) {
      monthsMap.set(key, []);
    }
    monthsMap.get(key)!.push(milestone);
  }

  // Build calendar data
  const calendars: CalendarViewData[] = [];

  for (const [key, milestones] of monthsMap) {
    const [year, month] = key.split('-').map(Number);
    const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long' });

    const weeks: CalendarWeek[] = milestones.map((m) => ({
      weekNumber: m.weekNumber,
      startDate: m.weekStartDate.toISOString().split('T')[0],
      days: generateWeekDays(m),
      summary: {
        targetAmount: m.adjustedTarget,
        capacityCategory: m.capacity.capacityCategory,
        isExamPeriod: m.capacity.isExamPeriod,
        events: m.capacity.academicEvents.map((e) => e.name),
        difficulty: m.difficulty,
        color: m.visualColor,
      },
    }));

    calendars.push({
      month: monthName,
      year,
      weeks,
    });
  }

  return calendars;
}

function generateWeekDays(milestone: DynamicMilestone): CalendarDay[] {
  const days: CalendarDay[] = [];
  const dayNames: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = [
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
    'sun',
  ];

  for (let i = 0; i < 7; i++) {
    const date = addDays(milestone.weekStartDate, i);
    const dayOfWeek = dayNames[i];
    const isWeekend = i >= 5;

    // Check for events on this day
    const dayEvents = milestone.capacity.academicEvents.filter((e) => {
      const eventStart = new Date(e.startDate);
      const eventEnd = new Date(e.endDate);
      return date >= eventStart && date <= eventEnd;
    });

    let capacityIndicator: 'full' | 'partial' | 'blocked' = 'full';
    if (dayEvents.some((e) => e.type === 'exam_period')) {
      capacityIndicator = 'blocked';
    } else if (dayEvents.length > 0) {
      capacityIndicator = 'partial';
    }

    days.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek,
      dayNumber: date.getDate(),
      isWeekend,
      events: dayEvents,
      commitments: [],
      capacityIndicator,
    });
  }

  return days;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getWeeksBetween(start: Date, end: Date): number {
  const diffTime = end.getTime() - start.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.ceil(diffDays / 7);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isDateRangeOverlapping(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 <= end2 && end1 >= start2;
}

// ============================================
// EXPORTS
// ============================================

export {
  calculateAllWeekCapacities,
  calculateWeekCapacity,
  generateDynamicMilestones,
  optimizeFrontLoading,
  assessFeasibility,
  buildRetroplan,
};
