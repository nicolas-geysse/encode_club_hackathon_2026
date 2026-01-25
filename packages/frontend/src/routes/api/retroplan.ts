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
 */

import type { APIEvent } from '@solidjs/start/server';

// Types for retroplanning
interface AcademicEvent {
  id: string;
  userId: string;
  type: 'exam_period' | 'class_intensive' | 'vacation' | 'internship' | 'project_deadline';
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
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
  academicMultiplier: number;
  energyMultiplier: number;
  events: AcademicEvent[];
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
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  frontLoadedPercentage: number;
  riskFactors: string[];
}

// In-memory storage (would be DuckDB in production)
const academicEventsStore: Map<string, AcademicEvent> = new Map();
const commitmentsStore: Map<string, Commitment> = new Map();
const energyLogsStore: Map<string, EnergyLog> = new Map();
const retroplansStore: Map<string, Retroplan> = new Map();

// Helper to generate UUID
function generateId(prefix: string = 'id'): string {
  return prefix + '_' + Math.random().toString(36).substring(2, 15);
}

// Get default capacity impact by event type
function getDefaultCapacityImpact(eventType: AcademicEvent['type']): number {
  switch (eventType) {
    case 'exam_period':
      return 0.2; // 80% reduction
    case 'class_intensive':
      return 0.5; // 50% reduction
    case 'vacation':
      return 1.5; // 50% boost
    case 'internship':
      return 0.3; // 70% reduction
    case 'project_deadline':
      return 0.4; // 60% reduction
    default:
      return 1.0;
  }
}

// Calculate week capacity
function calculateWeekCapacity(weekStart: Date, userId: string): WeekCapacity {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Get events for this week
  const events = Array.from(academicEventsStore.values()).filter(
    (e) =>
      e.userId === userId && new Date(e.startDate) <= weekEnd && new Date(e.endDate) >= weekStart
  );

  // Get commitments
  const commitments = Array.from(commitmentsStore.values()).filter((c) => c.userId === userId);

  // Get recent energy logs
  const energyLogs = Array.from(energyLogsStore.values())
    .filter((e) => e.userId === userId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);

  // Calculate multipliers
  const academicMultiplier = events.reduce((mult, e) => Math.min(mult, e.capacityImpact), 1.0);

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
  const totalCommitmentHours = commitments.reduce((sum, c) => sum + c.hoursPerWeek, 0);
  const baseHours = Math.max(0, 168 - 56 - totalCommitmentHours - 21);
  const effectiveHours = Math.round(baseHours * academicMultiplier * energyMultiplier * 0.3);

  const capacityScore = Math.round(academicMultiplier * energyMultiplier * 100);
  const capacityCategory: WeekCapacity['capacityCategory'] =
    capacityScore < 30
      ? 'protected'
      : capacityScore < 60
        ? 'low'
        : capacityScore < 85
          ? 'medium'
          : 'high';

  return {
    weekNumber: 0, // Will be set by caller
    weekStartDate: weekStart.toISOString().split('T')[0],
    capacityScore,
    capacityCategory,
    effectiveHours,
    academicMultiplier,
    energyMultiplier,
    events,
  };
}

// Generate retroplan
function generateRetroplanForGoal(
  goalId: string,
  goalAmount: number,
  deadline: string,
  userId: string
): Retroplan {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const totalWeeks = Math.max(
    1,
    Math.ceil((deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000))
  );

  // Calculate capacity for each week
  const weekCapacities: WeekCapacity[] = [];
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7)); // Monday

  for (let week = 1; week <= totalWeeks; week++) {
    const capacity = calculateWeekCapacity(currentWeekStart, userId);
    capacity.weekNumber = week;
    weekCapacities.push(capacity);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  // Calculate total capacity
  const totalCapacity = weekCapacities.reduce((sum, w) => sum + w.capacityScore, 0);
  const targetPerCapacityPoint =
    totalCapacity > 0 ? goalAmount / totalCapacity : goalAmount / totalWeeks;

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
      baseTarget: Math.round(goalAmount / totalWeeks),
      adjustedTarget,
      cumulativeTarget: cumulative,
      capacity,
      difficulty,
      isCatchUpWeek: false,
      catchUpAmount: 0,
    };
  });

  // Count week categories
  const highCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'high').length;
  const mediumCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'medium').length;
  const lowCapacityWeeks = weekCapacities.filter((w) => w.capacityCategory === 'low').length;
  const protectedWeeks = weekCapacities.filter((w) => w.capacityCategory === 'protected').length;

  // Calculate feasibility
  let feasibilityScore = 0.8;
  if (protectedWeeks > totalWeeks * 0.3) feasibilityScore -= 0.2;
  if (lowCapacityWeeks > totalWeeks * 0.4) feasibilityScore -= 0.15;
  feasibilityScore = Math.max(0.2, Math.min(1, feasibilityScore));

  // Calculate front-loading percentage
  const halfWay = Math.ceil(totalWeeks / 2);
  const firstHalfTarget = milestones
    .slice(0, halfWay)
    .reduce((sum, m) => sum + m.adjustedTarget, 0);
  const frontLoadedPercentage = (firstHalfTarget / goalAmount) * 100;

  // Identify risk factors
  const riskFactors: string[] = [];
  if (protectedWeeks > 0) {
    riskFactors.push(`${protectedWeeks} protected week(s) (exams)`);
  }
  if (feasibilityScore < 0.5) {
    riskFactors.push('Ambitious goal given constraints');
  }

  const retroplan: Retroplan = {
    id: generateId('rp'),
    goalId,
    milestones,
    totalWeeks,
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

    switch (action) {
      // Academic Events
      case 'add_academic_event': {
        const { type, name, startDate, endDate, capacityImpact, priority = 'normal' } = body;

        const event: AcademicEvent = {
          id: generateId('ae'),
          userId,
          type,
          name,
          startDate,
          endDate,
          capacityImpact: capacityImpact ?? getDefaultCapacityImpact(type),
          priority,
        };

        academicEventsStore.set(event.id, event);

        return new Response(JSON.stringify({ success: true, event }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list_academic_events': {
        const events = Array.from(academicEventsStore.values()).filter((e) => e.userId === userId);

        return new Response(JSON.stringify({ events }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'delete_academic_event': {
        const { eventId } = body;
        academicEventsStore.delete(eventId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Commitments
      case 'add_commitment': {
        const { type, name, hoursPerWeek, flexibleHours = true, priority = 'important' } = body;

        const commitment: Commitment = {
          id: generateId('cm'),
          userId,
          type,
          name,
          hoursPerWeek,
          flexibleHours,
          priority,
        };

        commitmentsStore.set(commitment.id, commitment);

        return new Response(JSON.stringify({ success: true, commitment }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list_commitments': {
        const commitments = Array.from(commitmentsStore.values()).filter(
          (c) => c.userId === userId
        );
        const totalHours = commitments.reduce((sum, c) => sum + c.hoursPerWeek, 0);

        return new Response(JSON.stringify({ commitments, totalHours }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'delete_commitment': {
        const { commitmentId } = body;
        commitmentsStore.delete(commitmentId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Energy Logs
      case 'log_energy': {
        const { date, energyLevel, moodScore, stressLevel, hoursSlept, notes } = body;
        const logDate = date || new Date().toISOString().split('T')[0];

        // Check for existing log on this date
        const existingLog = Array.from(energyLogsStore.values()).find(
          (l) => l.userId === userId && l.date === logDate
        );

        const log: EnergyLog = {
          id: existingLog?.id || generateId('el'),
          userId,
          date: logDate,
          energyLevel,
          moodScore,
          stressLevel,
          hoursSlept,
          notes,
        };

        energyLogsStore.set(log.id, log);

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
        const logs = Array.from(energyLogsStore.values())
          .filter((l) => l.userId === userId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, limit);

        return new Response(JSON.stringify({ logs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Week Capacity
      case 'get_week_capacity': {
        const { weekDate } = body;
        const targetDate = weekDate ? new Date(weekDate) : new Date();

        // Get week start (Monday)
        const weekStart = new Date(targetDate);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

        const capacity = calculateWeekCapacity(weekStart, userId);

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

      // Retroplan
      case 'generate_retroplan': {
        const { goalId, goalAmount, deadline } = body;

        if (!goalId || !goalAmount || !deadline) {
          return new Response(
            JSON.stringify({
              error: true,
              message: 'Missing required fields: goalId, goalAmount, deadline',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const retroplan = generateRetroplanForGoal(goalId, goalAmount, deadline, userId);

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

      default:
        return new Response(JSON.stringify({ error: true, message: `Invalid action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Retroplan API error:', error);
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
