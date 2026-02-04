/**
 * Retroplan API Route
 *
 * Handles capacity-aware retroplanning operations.
 * Allows users to:
 * - Add academic events (exams, vacations)
 * - Add commitments (classes, sports, family)
 * - Log energy/mood levels
 * - Generate capacity-aware retroplans
 * - Get week capacity breakdowns
 *
 * Sprint 13.7 Fix: Now uses DuckDB for persistence instead of in-memory stores.
 * This fixes the "always 100% achievable" bug where data was lost on restart.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, execute, escapeSQL } from './_db';
import { ensureSchema, SCHEMAS } from '../../lib/api/schemaManager';
import { createLogger } from '~/lib/logger';
import { toISODate, todayISO } from '~/lib/dateUtils';

const logger = createLogger('Retroplan');

// Types for retroplanning
interface AcademicEvent {
  id: string;
  userId: string;
  type:
    | 'exam_period'
    | 'class_intensive'
    | 'vacation'
    | 'vacation_rest'
    | 'vacation_available'
    | 'internship'
    | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
  capacityImpact: number;
  priority: 'critical' | 'high' | 'normal';
}

interface Commitment {
  id: string;
  userId: string;
  type: 'class' | 'sport' | 'club' | 'internship' | 'family' | 'health' | 'volunteer' | 'other';
  name: string;
  hoursPerWeek: number;
  flexibleHours: boolean;
  priority: 'essential' | 'important' | 'nice_to_have';
}

interface EnergyLog {
  id: string;
  userId: string;
  date: string;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  moodScore: 1 | 2 | 3 | 4 | 5;
  stressLevel: 1 | 2 | 3 | 4 | 5;
  hoursSlept?: number;
  notes?: string;
}

interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected' | 'boosted';
  effectiveHours: number;
  academicMultiplier: number;
  energyMultiplier: number;
  events: AcademicEvent[];
  maxEarningPotential: number;
}

interface DynamicMilestone {
  weekNumber: number;
  baseTarget: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: WeekCapacity;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'protected';
  isCatchUpWeek: boolean;
  catchUpAmount: number;
}

interface Retroplan {
  id: string;
  goalId: string;
  milestones: DynamicMilestone[];
  totalWeeks: number;
  boostedWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  frontLoadedPercentage: number;
  riskFactors: string[];
}

// Sprint 13.7: Removed in-memory stores - now using DuckDB for persistence
// This fixes the "always 100% achievable" bug where data was lost on restart.

// Retroplan cache (regenerated per request, doesn't need DB persistence)
const retroplansStore: Map<string, Retroplan> = new Map();

// Ensure schemas are initialized
async function ensureRetroplanSchemas(): Promise<void> {
  await ensureSchema('academic_events', SCHEMAS.academic_events);
  await ensureSchema('commitments', SCHEMAS.commitments);
  await ensureSchema('energy_logs', SCHEMAS.energy_logs);
}

// Database row types
// Sprint 13.19: DuckDB may return DATE columns as Date objects, not strings
interface AcademicEventRow {
  id: string;
  profile_id: string;
  name: string;
  type: string;
  start_date: unknown; // DuckDB DATE type - may be Date object, string, or BigInt
  end_date: unknown; // DuckDB DATE type - may be Date object, string, or BigInt
  capacity_impact: number;
  priority: string;
}

interface CommitmentRow {
  id: string;
  profile_id: string;
  name: string;
  type: string;
  hours_per_week: number;
  flexible_hours: boolean;
  priority: string;
}

interface EnergyLogRow {
  id: string;
  profile_id: string;
  log_date: unknown; // DuckDB DATE type - may be Date object, string, or BigInt
  energy_level: number;
  mood_score: number;
  stress_level: number;
  hours_slept: number | null;
  notes: string | null;
}

// Sprint 13.19: Normalize date from DuckDB to YYYY-MM-DD string
// DuckDB may return Date objects, BigInt timestamps, or strings depending on driver version
function normalizeDate(d: unknown): string {
  if (d === null || d === undefined) {
    return '';
  }
  if (d instanceof Date) {
    // Date object - convert to YYYY-MM-DD in local timezone
    return toISODate(d);
  }
  if (typeof d === 'string') {
    // Already a string - extract date part (handles "2025-02-15" and "2025-02-15T00:00:00Z")
    return d.split('T')[0];
  }
  if (typeof d === 'bigint' || typeof d === 'number') {
    // Timestamp (milliseconds or seconds) - convert to Date then to string
    const ms = typeof d === 'bigint' ? Number(d) : d;
    // If value is small, it's likely seconds not milliseconds
    const date = new Date(ms < 1e12 ? ms * 1000 : ms);
    return toISODate(date);
  }
  // Fallback: convert to string
  logger.warn('Unexpected date type', { type: typeof d, value: d });
  return String(d);
}

// Helper to convert DB row to API type
function rowToAcademicEvent(row: AcademicEventRow): AcademicEvent {
  // Sprint 13.19: Normalize dates to ensure consistent YYYY-MM-DD format
  const startDate = normalizeDate(row.start_date);
  let endDate = normalizeDate(row.end_date);

  // Fallback: If end date is missing (empty string after normalization), use start date (1-day event)
  if (!endDate) {
    endDate = startDate;
  }

  return {
    id: row.id,
    userId: row.profile_id,
    type: row.type as AcademicEvent['type'],
    name: row.name,
    startDate,
    endDate,
    capacityImpact: row.capacity_impact,
    priority: row.priority as AcademicEvent['priority'],
  };
}

function rowToCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    userId: row.profile_id,
    type: row.type as Commitment['type'],
    name: row.name,
    hoursPerWeek: row.hours_per_week,
    flexibleHours: row.flexible_hours,
    priority: row.priority as Commitment['priority'],
  };
}

function rowToEnergyLog(row: EnergyLogRow): EnergyLog {
  return {
    id: row.id,
    userId: row.profile_id,
    date: normalizeDate(row.log_date), // Sprint 13.19: Normalize date
    energyLevel: row.energy_level as EnergyLog['energyLevel'],
    moodScore: row.mood_score as EnergyLog['moodScore'],
    stressLevel: row.stress_level as EnergyLog['stressLevel'],
    hoursSlept: row.hours_slept ?? undefined,
    notes: row.notes ?? undefined,
  };
}

// Helper to generate UUID
function generateId(prefix: string = 'id'): string {
  return prefix + '_' + Math.random().toString(36).substring(2, 15);
}

// Get default capacity impact by event type
function getDefaultCapacityImpact(eventType: AcademicEvent['type'] | string): number {
  switch (eventType) {
    case 'exam':
    case 'exam_period':
      return 0.2; // 80% reduction - protected
    case 'class_intensive':
      return 0.5; // 50% reduction - low capacity
    case 'vacation':
    case 'vacation_available':
      return 1.5; // 50% boost - more free time to work
    case 'vacation_rest':
      return 0.2; // 80% reduction - complete rest, not available
    case 'internship':
      return 0.3; // 70% reduction - very busy
    case 'project_deadline':
      return 0.4; // 60% reduction - crunch time
    default:
      return 1.0;
  }
}

// Default hourly rate for earning potential calculation (can be overridden)
const DEFAULT_HOURLY_RATE = 15; // €15/hour

// Sprint 13.7: Calculate week capacity using DuckDB-persisted data
// This is now async because it queries the database
async function calculateWeekCapacity(
  weekStart: Date,
  userId: string,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
  // Optional: pass pre-fetched data to avoid repeated DB queries in loops
  prefetchedEvents?: AcademicEvent[],
  prefetchedCommitments?: Commitment[],
  prefetchedEnergyLogs?: EnergyLog[],
  // User's configured max work hours per week (undefined = use default calculation)
  availableHoursPerWeek?: number
): Promise<WeekCapacity> {
  // Sprint 13.18 Fix: Use date-only comparison to avoid timezone issues
  // When comparing dates, we only care about the calendar day, not the time.
  // new Date("2025-02-15") parses as UTC midnight, but setHours() applies in local time,
  // causing asymmetric comparisons that break overlap detection.
  const getDateOnly = (d: Date | string): string => {
    if (typeof d === 'string') {
      // Already a string like "2025-02-15" or "2025-02-15T00:00:00Z" - extract date part
      return d.split('T')[0];
    }
    // Convert Date object to YYYY-MM-DD in local timezone
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Calculate week boundaries as date strings
  const weekStartStr = getDateOnly(weekStart);
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndStr = getDateOnly(weekEndDate);

  // Get events for this week (from prefetched or DB)
  let allUserEvents: AcademicEvent[];
  if (prefetchedEvents) {
    allUserEvents = prefetchedEvents;
  } else {
    await ensureRetroplanSchemas();
    const eventRows = await query<AcademicEventRow>(
      `SELECT * FROM academic_events WHERE profile_id = ${escapeSQL(userId)}`
    );
    allUserEvents = eventRows.map(rowToAcademicEvent);
  }

  // Sprint 13.18 Fix: Filter events using date-only string comparison
  // An event overlaps a week if: eventStart <= weekEnd AND eventEnd >= weekStart
  // String comparison "2025-02-10" <= "2025-02-15" works correctly for YYYY-MM-DD format
  const events = allUserEvents.filter((e) => {
    const eventStartStr = getDateOnly(e.startDate);
    const eventEndStr = getDateOnly(e.endDate);
    return eventStartStr <= weekEndStr && eventEndStr >= weekStartStr;
  });

  // Get commitments (from prefetched or DB)
  let commitments: Commitment[];
  if (prefetchedCommitments) {
    commitments = prefetchedCommitments;
  } else {
    const commitmentRows = await query<CommitmentRow>(
      `SELECT * FROM commitments WHERE profile_id = ${escapeSQL(userId)}`
    );
    commitments = commitmentRows.map(rowToCommitment);
  }

  // Get recent energy logs (from prefetched or DB)
  let energyLogs: EnergyLog[];
  if (prefetchedEnergyLogs) {
    energyLogs = prefetchedEnergyLogs;
  } else {
    const energyRows = await query<EnergyLogRow>(
      `SELECT * FROM energy_logs
       WHERE profile_id = ${escapeSQL(userId)}
       ORDER BY log_date DESC
       LIMIT 7`
    );
    energyLogs = energyRows.map(rowToEnergyLog);
  }

  // Calculate multipliers
  // Separate restrictive events (< 1.0) from boost events (> 1.0)
  const restrictiveEvents = events.filter((e) => e.capacityImpact < 1.0);
  const boostEvents = events.filter((e) => e.capacityImpact > 1.0);

  let academicMultiplier = 1.0;
  if (restrictiveEvents.length > 0) {
    // If there are restrictive events, use the most restrictive (lowest impact)
    // Restrictive events take priority over boosts (can't work much during exams even on vacation)
    academicMultiplier = Math.min(...restrictiveEvents.map((e) => e.capacityImpact));
  } else if (boostEvents.length > 0) {
    // If only boost events, use the highest boost
    academicMultiplier = Math.max(...boostEvents.map((e) => e.capacityImpact));
  }

  const avgEnergy =
    energyLogs.length > 0
      ? energyLogs.reduce((sum, e) => sum + e.energyLevel, 0) / energyLogs.length
      : 3;
  const avgMood =
    energyLogs.length > 0
      ? energyLogs.reduce((sum, e) => sum + e.moodScore, 0) / energyLogs.length
      : 3;
  const avgStress =
    energyLogs.length > 0
      ? energyLogs.reduce((sum, e) => sum + e.stressLevel, 0) / energyLogs.length
      : 3;

  const energyMultiplier = 0.6 + ((avgEnergy + avgMood + (6 - avgStress)) / 15) * 0.8;

  // Calculate hours
  // Two modes:
  // 1. User explicitly set availableHoursPerWeek → use directly (no 0.3 conversion)
  // 2. Default calculation from free time → apply 0.3 conversion factor
  const totalCommitmentHours = commitments.reduce((sum, c) => sum + c.hoursPerWeek, 0);

  let effectiveHours: number;
  if (availableHoursPerWeek !== undefined && availableHoursPerWeek > 0) {
    // User explicitly specified "hours I can work per week"
    // Only apply academicMultiplier (exams reduce available time)
    // DON'T apply energyMultiplier - user's stated hours are their actual availability
    // Energy affects productivity, not time availability
    effectiveHours = Math.round(availableHoursPerWeek * academicMultiplier);
  } else {
    // Default: calculate from theoretical free time
    const defaultMaxFreeHours = 168 - 56 - 21; // ~91h of theoretically available time
    const baseHours = Math.max(0, defaultMaxFreeHours - totalCommitmentHours);
    // Apply 0.3 conversion: only ~30% of "free time" is realistic work time
    effectiveHours = Math.round(baseHours * academicMultiplier * energyMultiplier * 0.3);
    logger.debug('Default capacity calculation', {
      defaultMaxFreeHours,
      totalCommitmentHours,
      baseHours,
      effectiveHours,
    });
  }

  // Calculate earning potential (hours × hourly rate)
  const maxEarningPotential = effectiveHours * hourlyRate;

  const capacityScore = Math.round(academicMultiplier * energyMultiplier * 100);
  const capacityCategory: WeekCapacity['capacityCategory'] =
    capacityScore < 30
      ? 'protected'
      : capacityScore < 60
        ? 'low'
        : capacityScore < 85
          ? 'medium'
          : capacityScore > 110
            ? 'boosted'
            : 'high';

  return {
    weekNumber: 0, // Will be set by caller
    weekStartDate: toISODate(weekStart),
    capacityScore,
    capacityCategory,
    effectiveHours,
    academicMultiplier,
    energyMultiplier,
    events,
    maxEarningPotential,
  };
}

// Generate retroplan - Sprint 13.7: Now async for DuckDB queries
async function generateRetroplanForGoal(
  goalId: string,
  goalAmount: number,
  deadline: string,
  userId: string,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
  simulatedDate?: Date, // Sprint 13.8 Fix: Accept simulated date for testing
  goalStartDate?: Date, // Bug 2 Fix: Accept goal start date for historical weeks
  monthlyMargin?: number, // Sprint 13.7: Add margin-based capacity factor
  // Phase 1 Consolidation: Distinguish projected vs actual savings
  // - projectedSavingsBasis: Theoretical savings based on CURRENT margin (for target calculation)
  // - actualTotalSavings: Historical savings with user adjustments (for tracking/display)
  projectedSavingsBasis?: number, // Projected savings based on current margin
  actualTotalSavings?: number, // ACTUAL total savings after adjustments (for future use)
  totalEarned: number = 0, // Sprint 13.21: Progress already made toward goal
  availableHoursPerWeek?: number // User's configured max work hours per week
): Promise<Retroplan> {
  const deadlineDate = new Date(deadline);
  // Sprint 13.8 Fix: Use simulated date if provided, otherwise use real time
  const now = simulatedDate || new Date();

  // Bug 2 Fix: Use goalStartDate if provided to generate weeks from original start
  // This ensures past weeks remain visible when simulating forward
  const startDate = goalStartDate || now;
  const totalWeeks = Math.max(
    1,
    Math.ceil((deadlineDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
  );

  // Sprint 13.7: Pre-fetch all data from DuckDB to avoid N+1 queries
  await ensureRetroplanSchemas();

  const [eventRows, commitmentRows, energyRows] = await Promise.all([
    query<AcademicEventRow>(
      `SELECT * FROM academic_events WHERE profile_id = ${escapeSQL(userId)}`
    ),
    query<CommitmentRow>(`SELECT * FROM commitments WHERE profile_id = ${escapeSQL(userId)}`),
    query<EnergyLogRow>(
      `SELECT * FROM energy_logs WHERE profile_id = ${escapeSQL(userId)} ORDER BY log_date DESC LIMIT 7`
    ),
  ]);

  const prefetchedEvents = eventRows.map(rowToAcademicEvent);
  const prefetchedCommitments = commitmentRows.map(rowToCommitment);
  const prefetchedEnergyLogs = energyRows.map(rowToEnergyLog);

  // Calculate capacity for each week
  const weekCapacities: WeekCapacity[] = [];
  // Bug 2 Fix: Start from goalStartDate to include past weeks
  const currentWeekStart = new Date(startDate);
  // Sprint 13.15 Fix: Do NOT align to Monday. Start week exactly on goal start date.
  // This ensures "Day 1" is actually the first day of the goal, not "Day 3" (if starting Wed)
  // currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7)); // Monday

  for (let week = 1; week <= totalWeeks; week++) {
    const capacity = await calculateWeekCapacity(
      currentWeekStart,
      userId,
      hourlyRate,
      prefetchedEvents,
      prefetchedCommitments,
      prefetchedEnergyLogs,
      availableHoursPerWeek
    );
    capacity.weekNumber = week;
    weekCapacities.push(capacity);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  // Calculate total earning potential
  const maxTotalEarnings = weekCapacities.reduce((sum, w) => sum + w.maxEarningPotential, 0);

  // Calculate how much needs to be earned through WORK (accounting for savings)
  // Phase 1 Consolidation: Priority order for savings contribution:
  // 1. projectedSavingsBasis - Theoretical savings based on CURRENT margin (reactive to budget changes)
  // 2. actualTotalSavings - Historical with adjustments (for backward compatibility)
  // 3. Calculate from monthlyMargin (original fallback)
  const monthsInPeriod = Math.max(1, Math.ceil(totalWeeks / 4.33));

  let savingsContribution: number;
  if (projectedSavingsBasis !== undefined) {
    // Preferred: Use projected savings based on current margin
    // This ensures targets update reactively when budget changes
    savingsContribution = projectedSavingsBasis;
  } else if (actualTotalSavings !== undefined) {
    // Fallback: Use actual savings with user adjustments (backward compatibility)
    savingsContribution = actualTotalSavings;
  } else if (monthlyMargin && monthlyMargin > 0) {
    // Fallback: calculate from base margin
    savingsContribution = monthlyMargin * monthsInPeriod;
  } else if (monthlyMargin && monthlyMargin < 0) {
    // Negative margin (deficit) - this ADDS to work needed
    savingsContribution = monthlyMargin * monthsInPeriod; // Will be negative
  } else {
    savingsContribution = 0;
  }

  // effectiveGoalForWork = what we need to earn through work
  // Positive savings: reduces work (1000 - 800 = 200 needed)
  // Negative savings (deficit): increases work (1000 - (-400) = 1400 needed)
  const effectiveGoalForWork = Math.max(0, goalAmount - savingsContribution);

  // Calculate total capacity for distribution
  const totalCapacity = weekCapacities.reduce((sum, w) => sum + w.capacityScore, 0);
  const targetPerCapacityPoint =
    totalCapacity > 0 ? effectiveGoalForWork / totalCapacity : effectiveGoalForWork / totalWeeks;

  // DEBUG: Log target calculation
  logger.debug('Target calculation', {
    goalAmount,
    monthlyMargin,
    projectedSavingsBasis,
    actualTotalSavings,
    monthsInPeriod,
    savingsContribution,
    effectiveGoalForWork,
    totalWeeks,
    totalCapacity,
    targetPerCapacityPoint,
    avgWeeklyTarget: Math.round(effectiveGoalForWork / totalWeeks),
  });

  // Generate milestones
  let cumulative = 0;
  const milestones: DynamicMilestone[] = weekCapacities.map((capacity) => {
    const adjustedTarget = Math.round(capacity.capacityScore * targetPerCapacityPoint);
    cumulative += adjustedTarget;

    const difficulty: DynamicMilestone['difficulty'] =
      capacity.capacityCategory === 'protected'
        ? 'protected'
        : capacity.capacityCategory === 'low'
          ? 'challenging'
          : capacity.capacityCategory === 'medium'
            ? 'moderate'
            : 'easy';

    return {
      weekNumber: capacity.weekNumber,
      baseTarget: Math.round(effectiveGoalForWork / totalWeeks),
      adjustedTarget,
      cumulativeTarget: cumulative,
      capacity,
      difficulty,
      isCatchUpWeek: false,
      catchUpAmount: 0,
    };
  });

  // Count week categories
  const boostedWeeks = weekCapacities.filter((w) => w.capacityCategory === 'boosted').length;
  const highCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'high').length;
  const mediumCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'medium').length;
  const lowCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'low').length;
  const protectedWeeks = weekCapacities.filter((w) => w.capacityCategory === 'protected').length;

  // ============================================
  // Sprint 13.17: Improved feasibility with urgency and intensity factors
  // Bug fix: Use REMAINING weeks from now to deadline, not total weeks from goal start
  // ============================================
  const riskFactors: string[] = [];

  // Calculate weeks REMAINING from current time (simulated or real) to deadline
  // This is crucial for feasibility - as time passes, fewer weeks remain to earn the goal
  const weeksRemaining = Math.max(
    1,
    Math.ceil((deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000))
  );

  // Calculate remaining capacity (only from future weeks)
  // Past weeks (before 'now') shouldn't count toward earning potential
  const futureWeekCapacities = weekCapacities.filter((w) => {
    const weekStartDate = new Date(w.weekStartDate);
    return weekStartDate >= now;
  });
  const remainingMaxEarnings = futureWeekCapacities.reduce(
    (sum, w) => sum + w.maxEarningPotential,
    0
  );

  // Include monthly margin (savings) in capacity calculation - only for remaining months
  const remainingMonths = Math.max(1, Math.ceil(weeksRemaining / 4.33)); // ~4.33 weeks per month
  const marginBasedCapacity = (monthlyMargin ?? 0) * remainingMonths;
  const effectiveMaxEarnings = remainingMaxEarnings + marginBasedCapacity;

  if (monthlyMargin && monthlyMargin > 0) {
    riskFactors.push(
      `Monthly savings: +${Math.round(monthlyMargin)}€/month (${Math.round(marginBasedCapacity)}€ total)`
    );
  } else if (monthlyMargin && monthlyMargin < 0) {
    // Sprint: Add warning for negative margin
    riskFactors.push(
      `⚠️ Monthly deficit: ${Math.round(monthlyMargin)}€/month (${Math.round(marginBasedCapacity)}€ total loss)`
    );
  }

  // Calculate REMAINING goal for feasibility (what's left to accumulate)
  // IMPORTANT: Use goalAmount - totalEarned (NOT effectiveGoalForWork)
  // because totalEarned already includes past savings, and effectiveMaxEarnings
  // already includes future savings via marginBasedCapacity
  const remainingGoal = Math.max(0, goalAmount - totalEarned);

  // Debug log for feasibility calculation
  logger.debug('Feasibility calculation', {
    goalAmount,
    totalEarned,
    remainingGoal,
    effectiveMaxEarnings,
    remainingMaxEarnings,
    marginBasedCapacity,
  });

  // SHORT-CIRCUIT: If goal is already achieved (remaining <= 0), feasibility is 100%
  // No need to apply urgency/intensity/performance penalties
  if (remainingGoal <= 0) {
    logger.debug('Goal already achieved! Returning 100%');
    // Still generate the retroplan with milestones, but feasibility is perfect
    const retroplan: Retroplan = {
      id: generateId('rp'),
      goalId,
      milestones,
      totalWeeks,
      boostedWeeks,
      highCapacityWeeks,
      mediumCapacityWeeks,
      lowCapacityWeeks,
      protectedWeeks,
      feasibilityScore: 1.0, // 100% - goal achieved!
      frontLoadedPercentage:
        effectiveGoalForWork > 0
          ? (milestones
              .slice(0, Math.ceil(totalWeeks / 2))
              .reduce((sum, m) => sum + m.adjustedTarget, 0) /
              effectiveGoalForWork) *
            100
          : 50,
      riskFactors: [`✅ Goal achieved! ${totalEarned}€ earned (target: ${goalAmount}€)`],
    };
    retroplansStore.set(retroplan.id, retroplan);
    return retroplan;
  }

  // Sprint 13.21: Calculate ACTUAL earning rate vs REQUIRED rate
  // This penalizes when user is not keeping up with the pace, regardless of theoretical capacity
  const elapsedWeeks = Math.max(1, totalWeeks - weeksRemaining);
  const actualWeeklyRate = totalEarned / elapsedWeeks;
  const requiredWeeklyRate = remainingGoal / Math.max(1, weeksRemaining);

  // How far through the goal period are we? (0.0 = start, 1.0 = deadline)
  const progressThroughGoal = elapsedWeeks / totalWeeks;

  // Performance ratio: how well is the user keeping up?
  // 1.0 = on pace, 0.5 = earning at half the needed rate, etc.
  let performancePenalty = 1.0;

  // Apply performance penalty progressively - homothetic scaling
  // - Start at 20% of goal period (warm-up phase)
  // - Full effect at 80% of goal period
  // - Scales linearly between these points
  const PENALTY_START = 0.2; // Start applying penalty after 20% of period
  const PENALTY_FULL = 0.8; // Full penalty effect at 80% of period

  if (progressThroughGoal >= PENALTY_START && requiredWeeklyRate > 0) {
    const performanceRatio = actualWeeklyRate / requiredWeeklyRate;

    // Scale factor: 0 at PENALTY_START, 1 at PENALTY_FULL
    const scaleFactor = Math.min(
      1.0,
      (progressThroughGoal - PENALTY_START) / (PENALTY_FULL - PENALTY_START)
    );

    // Calculate penalty based on how far behind we are
    // performanceRatio 1.0 = on pace (no penalty)
    // performanceRatio 0.5 = 50% of needed pace
    // performanceRatio 0.0 = no earnings at all
    if (performanceRatio < 1.0) {
      // Max penalty at 0% performance = 0.5 (50% reduction)
      // No penalty at 100% performance
      // Linear interpolation between
      const maxPenaltyReduction = 0.5; // Maximum 50% reduction at worst case
      const penaltyReduction = maxPenaltyReduction * (1.0 - performanceRatio) * scaleFactor;
      performancePenalty = 1.0 - penaltyReduction;

      // Add risk factor message based on severity
      if (performanceRatio < 0.3) {
        riskFactors.push(
          `⚠️ Critical pace: ${Math.round(actualWeeklyRate)}€/week vs ${Math.round(requiredWeeklyRate)}€/week needed`
        );
      } else if (performanceRatio < 0.6) {
        riskFactors.push(
          `⚠️ Behind pace: ${Math.round(actualWeeklyRate)}€/week vs ${Math.round(requiredWeeklyRate)}€/week needed`
        );
      } else if (performanceRatio < 0.9) {
        riskFactors.push(
          `Pace warning: ${Math.round(actualWeeklyRate)}€/week vs ${Math.round(requiredWeeklyRate)}€/week needed`
        );
      }
    }

    logger.debug('Feasibility progress', {
      progressPercent: Math.round(progressThroughGoal * 100),
      performancePercent: Math.round(performanceRatio * 100),
      scaleFactor: scaleFactor.toFixed(2),
      penalty: performancePenalty.toFixed(2),
    });
  }

  // Add progress context to risk factors
  if (totalEarned > 0) {
    const progressPercent = Math.round((totalEarned / goalAmount) * 100);
    riskFactors.push(
      `Progress: ${totalEarned}€ earned (${progressPercent}%), ${remainingGoal}€ remaining`
    );
  }

  // 1. Urgency Factor - penalize as deadline approaches
  // Use weeksRemaining (not totalWeeks) - this decreases as time passes
  // 1.0 at 8+ weeks, scales down to 0.5 at 1 week
  const urgencyFactor = Math.min(1.0, 0.5 + 0.5 * Math.min(1, weeksRemaining / 8));
  if (weeksRemaining < 4) {
    riskFactors.push(`Short timeline: only ${weeksRemaining} week(s) remaining`);
  }

  // 2. Intensity Penalty - penalize when weekly load is high
  // Use REMAINING goal for accurate intensity calculation
  const avgWeeklyRequired = remainingGoal / weeksRemaining;
  const avgWeeklyCapacity = remainingMaxEarnings / weeksRemaining;
  const intensityRatio = avgWeeklyCapacity > 0 ? avgWeeklyRequired / avgWeeklyCapacity : 1;

  let intensityPenalty = 1.0;
  if (intensityRatio > 0.7) {
    // Penalty increases from 1.0 to 0.8 as intensity goes from 70% to 100%
    intensityPenalty = Math.max(0.8, 1.0 - 0.2 * ((intensityRatio - 0.7) / 0.3));
    riskFactors.push(
      `High weekly intensity: ${Math.round(intensityRatio * 100)}% of weekly capacity needed`
    );
  }
  if (intensityRatio > 1.0) {
    // Exceeds capacity - severe penalty
    intensityPenalty = 0.6;
    riskFactors.push(
      `⚠️ Weekly target exceeds capacity by ${Math.round((intensityRatio - 1) * 100)}%`
    );
  }

  // 3. Progressive base score based on REMAINING goal vs remaining capacity
  const capacityRatio = effectiveMaxEarnings > 0 ? remainingGoal / effectiveMaxEarnings : 1;

  let baseScore: number;
  if (capacityRatio <= 0.5) {
    // Very comfortable - remaining goal is less than half of max capacity
    baseScore = 1.0;
  } else if (capacityRatio <= 0.7) {
    // Comfortable to moderate: 0.95 → 0.85
    baseScore = 0.95 - 0.1 * ((capacityRatio - 0.5) / 0.2);
  } else if (capacityRatio <= 1.0) {
    // Challenging: 0.85 → 0.50
    baseScore = 0.85 - 0.35 * ((capacityRatio - 0.7) / 0.3);
    if (capacityRatio > 0.85) {
      riskFactors.push(
        `Requires max effort: remaining ${remainingGoal}€ vs comfortable ${Math.round(effectiveMaxEarnings * 0.7)}€`
      );
    }
  } else {
    // Exceeds capacity
    baseScore = effectiveMaxEarnings / remainingGoal;
    const shortage = remainingGoal - effectiveMaxEarnings;
    riskFactors.push(`⚠️ Remaining goal exceeds max capacity by ${Math.round(shortage)}€`);
  }

  // Apply all factors including performance penalty
  // Performance penalty is crucial - it reflects ACTUAL progress vs THEORETICAL capacity
  let feasibilityScore = baseScore * urgencyFactor * intensityPenalty * performancePenalty;

  // Secondary factors
  if (protectedWeeks > totalWeeks * 0.3) {
    feasibilityScore *= 0.9;
    riskFactors.push(`${protectedWeeks} protected week(s) (exams)`);
  }
  if (lowCapacityWeeks > totalWeeks * 0.4) {
    feasibilityScore *= 0.95;
    riskFactors.push(`${lowCapacityWeeks} low capacity weeks`);
  }

  // Clamp between 1% and 100%
  feasibilityScore = Math.max(0.01, Math.min(1, feasibilityScore));

  // Calculate front-loading percentage
  const halfWay = Math.ceil(totalWeeks / 2);
  const firstHalfTarget = milestones
    .slice(0, halfWay)
    .reduce((sum, m) => sum + m.adjustedTarget, 0);
  const frontLoadedPercentage =
    effectiveGoalForWork > 0 ? (firstHalfTarget / effectiveGoalForWork) * 100 : 50;

  const retroplan: Retroplan = {
    id: generateId('rp'),
    goalId,
    milestones,
    totalWeeks,
    boostedWeeks,
    highCapacityWeeks,
    mediumCapacityWeeks,
    lowCapacityWeeks,
    protectedWeeks,
    feasibilityScore,
    frontLoadedPercentage,
    riskFactors,
  };

  retroplansStore.set(retroplan.id, retroplan);

  return retroplan;
}

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { action, userId = 'default' } = body;

    // Sprint 13.19: Warn when using 'default' userId - this often indicates a bug
    if (userId === 'default') {
      logger.warn(
        `Action "${action}" using userId="default". This may cause events to not appear for the actual profile.`
      );
    }

    switch (action) {
      // Sprint 13.19: Cleanup action to remove zombie events
      case 'cleanup_events': {
        const { targetUserId } = body;
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: true, message: 'targetUserId is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        await ensureRetroplanSchemas();

        // Count before delete (convert BigInt to Number)
        const countRows = await query<{ count: bigint }>(
          `SELECT COUNT(*) as count FROM academic_events WHERE profile_id = ${escapeSQL(targetUserId)}`
        );
        const countBefore = Number(countRows[0]?.count || 0);

        // Delete all events for this userId
        await execute(`DELETE FROM academic_events WHERE profile_id = ${escapeSQL(targetUserId)}`);

        logger.info(`Cleaned up ${countBefore} zombie events`, { profileId: targetUserId });

        return new Response(JSON.stringify({ success: true, deletedCount: countBefore }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Academic Events - Sprint 13.7: Now persisted in DuckDB
      case 'add_academic_event': {
        const { type, name, startDate, endDate, capacityImpact, priority = 'normal' } = body;
        await ensureRetroplanSchemas();

        const eventId = generateId('ae');
        const impact = capacityImpact ?? getDefaultCapacityImpact(type);

        await execute(`
          INSERT INTO academic_events (id, profile_id, name, type, start_date, end_date, capacity_impact, priority)
          VALUES (${escapeSQL(eventId)}, ${escapeSQL(userId)}, ${escapeSQL(name)}, ${escapeSQL(type)},
                  ${escapeSQL(startDate)}, ${escapeSQL(endDate)}, ${impact}, ${escapeSQL(priority)})
        `);

        const event: AcademicEvent = {
          id: eventId,
          userId,
          type,
          name,
          startDate,
          endDate,
          capacityImpact: impact,
          priority,
        };

        return new Response(JSON.stringify({ success: true, event }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list_academic_events': {
        await ensureRetroplanSchemas();
        const rows = await query<AcademicEventRow>(
          `SELECT * FROM academic_events WHERE profile_id = ${escapeSQL(userId)} ORDER BY start_date`
        );
        const events = rows.map(rowToAcademicEvent);

        return new Response(JSON.stringify({ events }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'delete_academic_event': {
        const { eventId } = body;
        await ensureRetroplanSchemas();
        await execute(`DELETE FROM academic_events WHERE id = ${escapeSQL(eventId)}`);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Commitments - Sprint 13.7: Now persisted in DuckDB
      case 'add_commitment': {
        const { type, name, hoursPerWeek, flexibleHours = true, priority = 'important' } = body;
        await ensureRetroplanSchemas();

        const commitmentId = generateId('cm');

        await execute(`
          INSERT INTO commitments (id, profile_id, name, type, hours_per_week, flexible_hours, priority)
          VALUES (${escapeSQL(commitmentId)}, ${escapeSQL(userId)}, ${escapeSQL(name)}, ${escapeSQL(type)},
                  ${hoursPerWeek}, ${flexibleHours}, ${escapeSQL(priority)})
        `);

        const commitment: Commitment = {
          id: commitmentId,
          userId,
          type,
          name,
          hoursPerWeek,
          flexibleHours,
          priority,
        };

        return new Response(JSON.stringify({ success: true, commitment }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list_commitments': {
        await ensureRetroplanSchemas();
        const rows = await query<CommitmentRow>(
          `SELECT * FROM commitments WHERE profile_id = ${escapeSQL(userId)}`
        );
        const commitments = rows.map(rowToCommitment);
        const totalHours = commitments.reduce((sum, c) => sum + c.hoursPerWeek, 0);

        return new Response(JSON.stringify({ commitments, totalHours }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'delete_commitment': {
        const { commitmentId } = body;
        await ensureRetroplanSchemas();
        await execute(`DELETE FROM commitments WHERE id = ${escapeSQL(commitmentId)}`);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Energy Logs - Sprint 13.7: Now persisted in DuckDB
      case 'log_energy': {
        const { date, energyLevel, moodScore, stressLevel, hoursSlept, notes } = body;
        const logDate = date || todayISO();
        await ensureRetroplanSchemas();

        // Check for existing log on this date
        const existingRows = await query<{ id: string }>(
          `SELECT id FROM energy_logs WHERE profile_id = ${escapeSQL(userId)} AND log_date = ${escapeSQL(logDate)}`
        );
        const existingId = existingRows.length > 0 ? existingRows[0].id : null;
        const logId = existingId || generateId('el');

        if (existingId) {
          // Update existing log
          await execute(`
            UPDATE energy_logs
            SET energy_level = ${energyLevel}, mood_score = ${moodScore}, stress_level = ${stressLevel},
                hours_slept = ${hoursSlept ?? 'NULL'}, notes = ${escapeSQL(notes ?? '')}
            WHERE id = ${escapeSQL(existingId)}
          `);
        } else {
          // Insert new log
          await execute(`
            INSERT INTO energy_logs (id, profile_id, log_date, energy_level, mood_score, stress_level, hours_slept, notes)
            VALUES (${escapeSQL(logId)}, ${escapeSQL(userId)}, ${escapeSQL(logDate)},
                    ${energyLevel}, ${moodScore}, ${stressLevel}, ${hoursSlept ?? 'NULL'}, ${escapeSQL(notes ?? '')})
          `);
        }

        const log: EnergyLog = {
          id: logId,
          userId,
          date: logDate,
          energyLevel,
          moodScore,
          stressLevel,
          hoursSlept,
          notes,
        };

        // Calculate composite score
        const compositeScore = Math.round(
          ((energyLevel + moodScore + (6 - stressLevel)) / 15) * 100
        );

        return new Response(JSON.stringify({ success: true, log, compositeScore }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list_energy_logs': {
        const { limit = 30 } = body;
        await ensureRetroplanSchemas();
        const rows = await query<EnergyLogRow>(
          `SELECT * FROM energy_logs
           WHERE profile_id = ${escapeSQL(userId)}
           ORDER BY log_date DESC
           LIMIT ${limit}`
        );
        const logs = rows.map(rowToEnergyLog);

        return new Response(JSON.stringify({ logs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Week Capacity - Sprint 13.7: Now async for DuckDB queries
      case 'get_week_capacity': {
        const { weekDate } = body;
        const targetDate = weekDate ? new Date(weekDate) : new Date();

        // Get week start (Monday)
        const weekStart = new Date(targetDate);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

        const capacity = await calculateWeekCapacity(weekStart, userId);

        // Calculate week number relative to goal start or current year
        const yearStart = new Date(targetDate.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(
          ((targetDate.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7
        );
        capacity.weekNumber = weekNumber;

        return new Response(JSON.stringify({ capacity }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Retroplan - Sprint 13.7: Now async with DuckDB persistence
      case 'generate_retroplan': {
        const {
          goalId,
          goalAmount,
          deadline,
          academicEvents,
          hourlyRate,
          availableHoursPerWeek, // User's configured max work hours per week
          simulatedDate,
          goalStartDate,
          monthlyMargin,
          // Phase 1 Consolidation: Separate projected vs actual savings
          projectedSavingsBasis, // Projected savings based on current margin (for targets)
          actualTotalSavings, // ACTUAL total savings with adjustments (for tracking)
          totalEarned = 0, // Progress already made toward goal
        } = body;

        // DEBUG: Log received parameters
        logger.debug('Received generate_retroplan params', {
          goalId,
          goalAmount,
          deadline,
          hourlyRate,
          availableHoursPerWeek,
          monthlyMargin,
          projectedSavingsBasis,
          actualTotalSavings,
          totalEarned,
        });

        if (!goalId || !goalAmount || !deadline) {
          return new Response(
            JSON.stringify({
              error: true,
              message: 'Missing required fields: goalId, goalAmount, deadline',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        await ensureRetroplanSchemas();

        // Sprint 13.7: If academic events are provided, save them to DuckDB
        if (academicEvents && Array.isArray(academicEvents)) {
          for (const event of academicEvents) {
            if (event.id && event.type && event.startDate && event.endDate) {
              const impact = getDefaultCapacityImpact(event.type);
              const priority = event.type === 'exam_period' ? 'critical' : 'normal';
              const name = event.name || event.type;

              // Upsert: try insert, on conflict update
              try {
                await execute(`
                  INSERT INTO academic_events (id, profile_id, name, type, start_date, end_date, capacity_impact, priority)
                  VALUES (${escapeSQL(event.id)}, ${escapeSQL(userId)}, ${escapeSQL(name)}, ${escapeSQL(event.type)},
                          ${escapeSQL(event.startDate)}, ${escapeSQL(event.endDate)}, ${impact}, ${escapeSQL(priority)})
                  ON CONFLICT (id) DO UPDATE SET
                    name = ${escapeSQL(name)},
                    type = ${escapeSQL(event.type)},
                    start_date = ${escapeSQL(event.startDate)},
                    end_date = ${escapeSQL(event.endDate)},
                    capacity_impact = ${impact},
                    priority = ${escapeSQL(priority)}
                `);
              } catch {
                // Event might already exist, ignore
              }
            }
          }
        }

        // Use provided hourly rate or default
        const effectiveHourlyRate = hourlyRate && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;
        // Sprint 13.8 Fix: Parse simulated date if provided
        const effectiveSimulatedDate = simulatedDate ? new Date(simulatedDate) : undefined;
        // Bug 2 Fix: Parse goal start date if provided
        const effectiveGoalStartDate = goalStartDate ? new Date(goalStartDate) : undefined;
        // User's configured available hours (undefined = use default calculation)
        const effectiveAvailableHours =
          availableHoursPerWeek && availableHoursPerWeek > 0 ? availableHoursPerWeek : undefined;
        // Sprint 13.7: Pass monthlyMargin for margin-based feasibility
        // Sprint 13.21: Pass totalEarned for accurate remaining-goal feasibility
        const retroplan = await generateRetroplanForGoal(
          goalId,
          goalAmount,
          deadline,
          userId,
          effectiveHourlyRate,
          effectiveSimulatedDate,
          effectiveGoalStartDate,
          monthlyMargin,
          projectedSavingsBasis, // Projected savings for target calculation
          actualTotalSavings, // Actual savings for tracking (future use)
          totalEarned,
          effectiveAvailableHours
        );

        return new Response(JSON.stringify({ success: true, retroplan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'get_retroplan': {
        const { goalId } = body;
        const retroplan = Array.from(retroplansStore.values()).find((rp) => rp.goalId === goalId);

        if (!retroplan) {
          return new Response(JSON.stringify({ error: true, message: 'Retroplan not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ retroplan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Predictive Alerts - Get upcoming difficult weeks
      case 'get_predictions': {
        const { goalId, lookahead = 4 } = body;

        // Get or generate retroplan
        const retroplan = Array.from(retroplansStore.values()).find((rp) => rp.goalId === goalId);

        if (!retroplan) {
          // Return empty alerts if no retroplan exists yet
          return new Response(JSON.stringify({ alerts: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get current week number
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const currentWeek = Math.ceil(
          ((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7
        );

        // Find difficult weeks within lookahead period
        const alerts = retroplan.milestones
          .filter((m) => {
            const weekDiff = m.weekNumber - currentWeek;
            return (
              weekDiff > 0 &&
              weekDiff <= lookahead &&
              (m.capacity.capacityCategory === 'low' || m.capacity.capacityCategory === 'protected')
            );
          })
          .map((m) => {
            // Build reason string based on events
            let reason = '';
            if (m.capacity.events.length > 0) {
              const eventTypes = m.capacity.events.map((e) => e.name).join(', ');
              reason = `${eventTypes} scheduled this week.`;
            } else if (m.capacity.capacityCategory === 'protected') {
              reason = 'Exam period or critical deadline.';
            } else {
              reason = 'Low energy trend detected.';
            }

            // Suggest action based on situation
            let suggestedAction: 'front-load' | 'add-protection' | 'reduce-target' = 'front-load';
            if (m.capacity.capacityCategory === 'protected') {
              suggestedAction = 'add-protection';
            } else if (m.capacity.effectiveHours < 10) {
              suggestedAction = 'reduce-target';
            }

            return {
              weekNumber: m.weekNumber,
              weekStartDate: m.capacity.weekStartDate,
              capacityCategory: m.capacity.capacityCategory,
              effectiveHours: m.capacity.effectiveHours,
              reason,
              suggestedAction,
            };
          });

        return new Response(JSON.stringify({ alerts }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: true, message: `Invalid action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    logger.error('API error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(_event: APIEvent) {
  // Simple health check
  return new Response(JSON.stringify({ status: 'ok', service: 'retroplan' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
