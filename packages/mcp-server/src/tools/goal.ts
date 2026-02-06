/**
 * Goal-Driven Mode Tools
 *
 * MCP tools for creating, tracking, and managing financial goals.
 * Enables gamified goal achievement with milestones and achievements.
 * Now includes capacity-aware retroplanning with life/study balance.
 */

import { trace, getCurrentTraceId } from '../services/opik.js';
import { query, execute, getSimulationState } from '../services/duckdb.js';
import { randomUUID } from 'crypto';
import { toISODate, todayISO } from '../utils/dateUtils.js';
import type {
  AcademicEventType,
  EventPriority,
  CommitmentType,
  CommitmentPriority,
  DayOfWeek,
  RetroplanInput,
} from '../types/retroplanning.js';
import { generateRetroplan } from '../algorithms/retroplanning.js';

// Use crypto.randomUUID() for generating unique IDs
const uuidv4 = () => randomUUID();

// ============================================
// TYPES
// ============================================

export interface GoalInput {
  goalAmount: number;
  goalDeadline: string; // ISO date string
  goalName: string;
  minimumBudget?: number;
  userId?: string;
  userProfile?: {
    monthlyIncome: number;
    monthlyExpenses: number;
    skills: string[];
    availableHours: number;
  };
}

export interface GoalPlan {
  id: string;
  goal: {
    amount: number;
    deadline: Date;
    name: string;
  };
  analysis: {
    weeksAvailable: number;
    weeklyTarget: number;
    feasibilityScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
  };
  milestones: Milestone[];
  recommendedStrategies: Strategy[];
  gamification: {
    totalMilestones: number;
    possibleAchievements: string[];
  };
}

export interface Milestone {
  weekNumber: number;
  targetAmount: number;
  cumulativeTarget: number;
  status: 'pending' | 'current' | 'achieved' | 'missed';
  reward?: string;
}

export interface Strategy {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  name: string;
  weeklyContribution: number;
  effort: 'low' | 'medium' | 'high';
  timeToGoal: number; // weeks
}

export interface ProgressUpdate {
  goalId: string;
  weekNumber: number;
  earnedAmount: number;
  paceRatio: number;
  riskAlert: 'on_track' | 'slight_delay' | 'at_risk' | 'critical';
  achievementsUnlocked: string[];
  message: string;
}

// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'first_100', name: 'First Blood', icon: '💰', description: 'Gagner 100€', threshold: 100 },
  { id: 'first_500', name: 'Halfway Hero', icon: '🌟', description: 'Earn 500€', threshold: 500 },
  {
    id: 'streak_2',
    name: 'Consistent',
    icon: '📈',
    description: '2 consecutive weeks',
    type: 'streak',
    threshold: 2,
  },
  {
    id: 'streak_4',
    name: 'On Fire',
    icon: '🔥',
    description: '4 consecutive weeks',
    type: 'streak',
    threshold: 4,
  },
  {
    id: 'ahead_schedule',
    name: 'Speed Racer',
    icon: '⚡',
    description: 'Ahead of schedule',
    type: 'pace',
  },
  {
    id: 'diversified',
    name: 'Diversified',
    icon: '📊',
    description: '3+ income sources',
    type: 'sources',
    threshold: 3,
  },
  {
    id: 'goal_50pct',
    name: 'Halfway',
    icon: '🎯',
    description: 'Reach 50% of the goal',
    type: 'progress',
    threshold: 0.5,
  },
  {
    id: 'goal_complete',
    name: 'Goal Achieved!',
    icon: '🏆',
    description: 'Reach 100% of the goal',
    type: 'progress',
    threshold: 1.0,
  },
];

// ============================================
// TOOL DEFINITIONS
// ============================================

export const GOAL_TOOLS = {
  create_goal_plan: {
    description:
      'Create a personalized goal plan with weekly milestones and recommended strategies.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_amount: {
          type: 'number',
          description: 'Target amount in euros',
        },
        goal_deadline: {
          type: 'string',
          description:
            'Deadline - last day to reach the goal (ISO format or natural language like "2 months")',
        },
        goal_name: {
          type: 'string',
          description: 'Name/description of the goal (e.g., "Vacances", "Nouvel ordi")',
        },
        minimum_budget: {
          type: 'number',
          description: 'Minimum monthly budget needed for essentials',
        },
        user_id: {
          type: 'string',
          description: 'User ID for tracking',
        },
      },
      required: ['goal_amount', 'goal_name'],
    },
  },

  update_goal_progress: {
    description: 'Update progress for a goal and check for achievements.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Goal ID to update',
        },
        week_number: {
          type: 'number',
          description: 'Week number (1-based)',
        },
        amount_earned: {
          type: 'number',
          description: 'Amount earned this week',
        },
        actions_completed: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of actions completed',
        },
        notes: {
          type: 'string',
          description: 'Optional notes',
        },
      },
      required: ['goal_id', 'week_number', 'amount_earned'],
    },
  },

  get_goal_status: {
    description: 'Get current status of a goal with progress visualization.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Goal ID to check',
        },
      },
      required: ['goal_id'],
    },
  },

  goal_risk_assessment: {
    description: 'Analyze risk of missing goal deadline and suggest corrective actions.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Goal ID to assess',
        },
      },
      required: ['goal_id'],
    },
  },

  list_user_goals: {
    description: 'List all goals for a user.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned', 'all'],
          description: 'Filter by status',
          default: 'active',
        },
      },
    },
  },

  // ============================================
  // RETROPLANNING / CAPACITY TOOLS
  // ============================================

  add_academic_event: {
    description:
      'Add an academic event (exams, vacations, internship) that affects capacity for earning money.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        event_type: {
          type: 'string',
          enum: ['exam_period', 'class_intensive', 'vacation', 'internship', 'project_deadline'],
          description: 'Type of academic event',
        },
        event_name: {
          type: 'string',
          description: 'Name of the event (e.g., "Partiels S1", "Vacances Noël")',
        },
        start_date: {
          type: 'string',
          description: 'Start date (ISO format)',
        },
        end_date: {
          type: 'string',
          description: 'End date (ISO format)',
        },
        capacity_impact: {
          type: 'number',
          description:
            'Capacity multiplier: 0.2 = 80% reduction (exams), 1.5 = 50% boost (vacations). Default varies by type.',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'normal'],
          description: 'Priority level. Critical events strongly protect capacity.',
          default: 'normal',
        },
      },
      required: ['event_type', 'event_name', 'start_date', 'end_date'],
    },
  },

  add_commitment: {
    description:
      'Add a recurring time commitment (classes, sports, family) that reduces available hours.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        commitment_type: {
          type: 'string',
          enum: ['class', 'sport', 'club', 'internship', 'family', 'health', 'volunteer', 'other'],
          description: 'Type of commitment',
        },
        commitment_name: {
          type: 'string',
          description: 'Name of the commitment (e.g., "Cours de maths", "Basket")',
        },
        hours_per_week: {
          type: 'number',
          description: 'Hours per week this commitment takes',
        },
        flexible_hours: {
          type: 'boolean',
          description: 'Whether hours can be adjusted if needed',
          default: true,
        },
        day_preferences: {
          type: 'array',
          items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
          description: 'Preferred days for this commitment',
        },
        priority: {
          type: 'string',
          enum: ['essential', 'important', 'nice_to_have'],
          description: 'How essential is this commitment',
          default: 'important',
        },
      },
      required: ['commitment_type', 'commitment_name', 'hours_per_week'],
    },
  },

  log_energy: {
    description: 'Log daily energy, mood, and stress levels for capacity prediction.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        date: {
          type: 'string',
          description: 'Date (ISO format). Defaults to today.',
        },
        energy_level: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Energy level 1-5 (1=exhausted, 5=energized)',
        },
        mood_score: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Mood 1-5 (1=very negative, 5=very positive)',
        },
        stress_level: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Stress 1-5 (1=no stress, 5=very stressed)',
        },
        hours_slept: {
          type: 'number',
          description: 'Hours slept last night',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about how you feel',
        },
      },
      required: ['energy_level', 'mood_score', 'stress_level'],
    },
  },

  generate_retroplan: {
    description:
      'Generate a capacity-aware retroplan for a goal, considering exams, commitments, and energy patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Existing goal ID to create retroplan for',
        },
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        prefer_front_loading: {
          type: 'boolean',
          description: 'Shift more work to early high-capacity weeks (recommended)',
          default: true,
        },
        protect_weekends: {
          type: 'boolean',
          description: 'Reduce weekend work expectations',
          default: false,
        },
      },
      required: ['goal_id'],
    },
  },

  get_week_capacity: {
    description: 'Get the capacity breakdown for a specific week or current week.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        week_date: {
          type: 'string',
          description: 'Any date within the week (ISO format). Defaults to current week.',
        },
      },
    },
  },

  list_academic_events: {
    description: 'List academic events for a user within a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
        start_date: {
          type: 'string',
          description: 'Start of date range (ISO format)',
        },
        end_date: {
          type: 'string',
          description: 'End of date range (ISO format)',
        },
      },
    },
  },

  list_commitments: {
    description: 'List recurring commitments for a user.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID',
        },
      },
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseDeadline(deadline: string): Date {
  // Try ISO date first
  const isoDate = new Date(deadline);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Parse natural language like "2 months", "8 weeks", "30 days"
  const now = new Date();
  const match = deadline.match(/(\d+)\s*(month|week|day|semaine|mois|jour)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit.includes('month') || unit.includes('mois')) {
      now.setMonth(now.getMonth() + value);
    } else if (unit.includes('week') || unit.includes('semaine')) {
      now.setDate(now.getDate() + value * 7);
    } else if (unit.includes('day') || unit.includes('jour')) {
      now.setDate(now.getDate() + value);
    }
    return now;
  }

  // Default to 8 weeks
  now.setDate(now.getDate() + 56);
  return now;
}

function calculateWeeks(deadline: Date): number {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks);
}

function assessFeasibility(
  weeklyTarget: number,
  weeksAvailable: number
): {
  score: number;
  level: 'low' | 'medium' | 'high';
  factors: string[];
} {
  const factors: string[] = [];
  let score = 0.8; // Start optimistic

  // Weekly target assessment
  if (weeklyTarget > 200) {
    score -= 0.3;
    factors.push('High weekly target (>200€)');
  } else if (weeklyTarget > 100) {
    score -= 0.1;
    factors.push('Moderate weekly target (>100€)');
  }

  // Time pressure
  if (weeksAvailable < 4) {
    score -= 0.2;
    factors.push('Short deadline (<4 weeks)');
  } else if (weeksAvailable < 8) {
    score -= 0.1;
    factors.push('Tight deadline (<8 weeks)');
  }

  // Normalize score
  score = Math.max(0.1, Math.min(1, score));

  let level: 'low' | 'medium' | 'high';
  if (score >= 0.7) {
    level = 'low';
  } else if (score >= 0.4) {
    level = 'medium';
  } else {
    level = 'high';
    factors.push('Requires immediate action');
  }

  return { score, level, factors };
}

function generateMilestones(totalAmount: number, weeks: number): Milestone[] {
  const weeklyTarget = totalAmount / weeks;
  const milestones: Milestone[] = [];

  for (let week = 1; week <= weeks; week++) {
    const milestone: Milestone = {
      weekNumber: week,
      targetAmount: Math.round(weeklyTarget),
      cumulativeTarget: Math.round(weeklyTarget * week),
      status: week === 1 ? 'current' : 'pending',
    };

    // Add rewards at key milestones
    if (week === Math.ceil(weeks / 2)) {
      milestone.reward = '🎯 Halfway there!';
    } else if (week === weeks) {
      milestone.reward = '🏆 Goal reached!';
    } else if (week % 4 === 0) {
      milestone.reward = '⭐ Month completed!';
    }

    milestones.push(milestone);
  }

  return milestones;
}

function generateDefaultStrategies(weeklyTarget: number): Strategy[] {
  const strategies: Strategy[] = [];

  // Job strategy
  if (weeklyTarget >= 50) {
    strategies.push({
      id: 'job-freelance',
      type: 'job',
      name: 'Freelance / Missions',
      weeklyContribution: Math.min(150, weeklyTarget * 0.6),
      effort: 'medium',
      timeToGoal: Math.ceil(weeklyTarget / 150),
    });
  }

  // Side hustle strategy
  strategies.push({
    id: 'hustle-tutoring',
    type: 'hustle',
    name: 'Cours particuliers',
    weeklyContribution: Math.min(80, weeklyTarget * 0.3),
    effort: 'medium',
    timeToGoal: Math.ceil(weeklyTarget / 80),
  });

  // Selling strategy
  strategies.push({
    id: 'selling-items',
    type: 'selling',
    name: "Vente d'objets",
    weeklyContribution: Math.min(100, weeklyTarget * 0.4),
    effort: 'low',
    timeToGoal: 1, // One-time
  });

  // Optimization strategy
  strategies.push({
    id: 'optim-budget',
    type: 'optimization',
    name: 'Optimisations budget',
    weeklyContribution: Math.min(50, weeklyTarget * 0.2),
    effort: 'low',
    timeToGoal: 1,
  });

  return strategies;
}

function checkAchievements(
  totalEarned: number,
  goalAmount: number,
  consecutiveWeeks: number,
  paceRatio: number,
  sourcesUsed: number,
  unlockedIds: string[]
): string[] {
  const newAchievements: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.includes(achievement.id)) continue;

    let unlocked = false;

    if (achievement.type === 'streak' && consecutiveWeeks >= (achievement.threshold || 0)) {
      unlocked = true;
    } else if (achievement.type === 'pace' && paceRatio > 1.1) {
      unlocked = true;
    } else if (achievement.type === 'sources' && sourcesUsed >= (achievement.threshold || 0)) {
      unlocked = true;
    } else if (achievement.type === 'progress') {
      const progress = totalEarned / goalAmount;
      if (progress >= (achievement.threshold || 0)) {
        unlocked = true;
      }
    } else if (achievement.threshold && totalEarned >= achievement.threshold) {
      unlocked = true;
    }

    if (unlocked) {
      newAchievements.push(achievement.id);
    }
  }

  return newAchievements;
}

// ============================================
// TOOL HANDLERS
// ============================================

export async function handleCreateGoalPlan(args: Record<string, unknown>) {
  return trace('tool_create_goal_plan', async (span) => {
    const goalAmount = args.goal_amount as number;
    const goalDeadlineStr = (args.goal_deadline as string) || '8 weeks';
    const goalName = args.goal_name as string;
    const minimumBudget = args.minimum_budget as number | undefined;
    const userId = (args.user_id as string) || 'default';
    const profileId = args.profile_id as string | undefined;

    // Get simulation state for Opik tracing
    const simState = await getSimulationState();

    const goalDeadline = parseDeadline(goalDeadlineStr);
    const weeksAvailable = calculateWeeks(goalDeadline);
    const weeklyTarget = Math.ceil(goalAmount / weeksAvailable);

    // Set Opik attributes including simulation state
    span.setAttributes({
      'goal.amount': goalAmount,
      'goal.name': goalName,
      'goal.weeks': weeksAvailable,
      'goal.weekly_target': weeklyTarget,
      'profile.id': profileId || userId,
      'simulation.is_simulating': simState.isSimulating,
      'simulation.offset_days': simState.offsetDays,
      'simulation.simulated_date': toISODate(simState.simulatedDate),
    });

    // Assess feasibility
    const feasibility = assessFeasibility(weeklyTarget, weeksAvailable);

    // Generate milestones
    const milestones = generateMilestones(goalAmount, weeksAvailable);

    // Generate strategies
    const strategies = generateDefaultStrategies(weeklyTarget);

    // Create goal in database
    const goalId = uuidv4();
    await execute(`
      INSERT INTO goals (id, profile_id, goal_name, goal_amount, goal_deadline, minimum_budget,
                         feasibility_score, risk_level, weekly_target, status)
      VALUES ('${goalId}', '${userId}', '${goalName.replace(/'/g, "''")}', ${goalAmount},
              '${toISODate(goalDeadline)}', ${minimumBudget || 'NULL'},
              ${feasibility.score}, '${feasibility.level}', ${weeklyTarget}, 'active')
    `);

    // Create milestone records
    for (const milestone of milestones) {
      const milestoneId = uuidv4();
      await execute(`
        INSERT INTO goal_progress (id, goal_id, week_number, target_amount, status)
        VALUES ('${milestoneId}', '${goalId}', ${milestone.weekNumber}, ${milestone.targetAmount}, 'pending')
      `);
    }

    span.setAttributes({
      'goal.id': goalId,
      'goal.feasibility': feasibility.score,
      'goal.risk_level': feasibility.level,
    });

    // Build response
    const plan: GoalPlan = {
      id: goalId,
      goal: {
        amount: goalAmount,
        deadline: goalDeadline,
        name: goalName,
      },
      analysis: {
        weeksAvailable,
        weeklyTarget,
        feasibilityScore: feasibility.score,
        riskLevel: feasibility.level,
        riskFactors: feasibility.factors,
      },
      milestones,
      recommendedStrategies: strategies,
      gamification: {
        totalMilestones: milestones.length,
        possibleAchievements: ACHIEVEMENTS.map((a) => `${a.icon} ${a.name}`),
      },
    };

    // Generate progress visualization
    const progressBar = milestones.map((m, i) => (i === 0 ? '▶️' : '⬜')).join('');

    return {
      type: 'composite',
      components: [
        // Goal summary
        {
          id: 'goal-header',
          type: 'text',
          params: {
            content: `# 🎯 Goal: ${goalName}\n\n**${goalAmount}€** in **${weeksAvailable} weeks** (${weeklyTarget}€/week)`,
            markdown: true,
          },
        },
        // Feasibility metrics
        {
          id: 'feasibility',
          type: 'grid',
          params: {
            columns: 3,
            gap: '1rem',
            children: [
              {
                id: 'feasibility-score',
                type: 'metric',
                params: {
                  title: 'Feasibility',
                  value: `${Math.round(feasibility.score * 100)}%`,
                  trend: { direction: feasibility.score >= 0.6 ? 'up' : 'down' },
                },
              },
              {
                id: 'weekly-target',
                type: 'metric',
                params: {
                  title: 'Weekly target',
                  value: weeklyTarget,
                  unit: '€',
                },
              },
              {
                id: 'risk-level',
                type: 'metric',
                params: {
                  title: 'Risk level',
                  value:
                    feasibility.level === 'low'
                      ? '✅ Low'
                      : feasibility.level === 'medium'
                        ? '⚠️ Medium'
                        : '🚨 High',
                },
              },
            ],
          },
        },
        // Progress visualization
        {
          id: 'progress',
          type: 'text',
          params: {
            content: `## Progress\n\n${progressBar}\n\nWeek 1/${weeksAvailable} | 0€/${goalAmount}€`,
            markdown: true,
          },
        },
        // Risk factors
        {
          id: 'risk-factors',
          type: 'text',
          params: {
            content:
              feasibility.factors.length > 0
                ? `## ⚠️ Points of attention\n\n${feasibility.factors.map((f) => `- ${f}`).join('\n')}`
                : '## ✅ No major risk identified',
            markdown: true,
          },
        },
        // Strategies table
        {
          id: 'strategies',
          type: 'table',
          params: {
            title: 'Recommended strategies',
            columns: [
              { key: 'name', label: 'Strategy' },
              { key: 'type', label: 'Type' },
              { key: 'weeklyContribution', label: '€/week' },
              { key: 'effort', label: 'Effort' },
            ],
            rows: strategies.map((s) => ({
              name: s.name,
              type:
                s.type === 'job'
                  ? '💼'
                  : s.type === 'hustle'
                    ? '🏃'
                    : s.type === 'selling'
                      ? '📦'
                      : '💰',
              weeklyContribution: `${s.weeklyContribution}€`,
              effort: s.effort === 'low' ? '🟢' : s.effort === 'medium' ? '🟡' : '🔴',
            })),
          },
        },
        // Achievements preview
        {
          id: 'achievements-preview',
          type: 'text',
          params: {
            content: `## 🏆 Achievements à débloquer\n\n${ACHIEVEMENTS.slice(0, 4)
              .map((a) => `${a.icon} **${a.name}** - ${a.description}`)
              .join('\n\n')}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        goalId,
        plan,
      },
    };
  });
}

export async function handleUpdateGoalProgress(args: Record<string, unknown>) {
  return trace('tool_update_goal_progress', async (span) => {
    const goalId = args.goal_id as string;
    const weekNumber = args.week_number as number;
    const amountEarned = args.amount_earned as number;
    const actionsCompleted = args.actions_completed as string[] | undefined;
    const notes = args.notes as string | undefined;

    span.setAttributes({
      'goal.id': goalId,
      'goal.week': weekNumber,
      'goal.amount_earned': amountEarned,
    });

    // Get goal info
    const goals = await query<{
      goal_amount: number;
      weekly_target: number;
      goal_name: string;
    }>(`SELECT goal_amount, weekly_target, goal_name FROM goals WHERE id = '${goalId}'`);

    if (goals.length === 0) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const goal = goals[0];

    // Get previous progress
    const previousProgress = await query<{
      earned_amount: number;
      week_number: number;
    }>(
      `SELECT earned_amount, week_number FROM goal_progress WHERE goal_id = '${goalId}' AND week_number < ${weekNumber} ORDER BY week_number`
    );

    const totalPreviousEarned = previousProgress.reduce(
      (sum, p) => sum + (p.earned_amount || 0),
      0
    );
    const totalEarned = totalPreviousEarned + amountEarned;
    const expectedTotal = goal.weekly_target * weekNumber;
    const paceRatio = totalEarned / expectedTotal;

    // Determine risk alert
    let riskAlert: 'on_track' | 'slight_delay' | 'at_risk' | 'critical';
    if (paceRatio >= 0.95) {
      riskAlert = 'on_track';
    } else if (paceRatio >= 0.8) {
      riskAlert = 'slight_delay';
    } else if (paceRatio >= 0.6) {
      riskAlert = 'at_risk';
    } else {
      riskAlert = 'critical';
    }

    // Count consecutive successful weeks
    let consecutiveWeeks = 0;
    for (let i = previousProgress.length - 1; i >= 0; i--) {
      if ((previousProgress[i].earned_amount || 0) >= goal.weekly_target * 0.8) {
        consecutiveWeeks++;
      } else {
        break;
      }
    }
    if (amountEarned >= goal.weekly_target * 0.8) {
      consecutiveWeeks++;
    }

    // Get already unlocked achievements
    const unlockedAchievements = await query<{ achievement_id: string }>(
      `SELECT achievement_id FROM goal_achievements WHERE goal_id = '${goalId}'`
    );
    const unlockedIds = unlockedAchievements.map((a) => a.achievement_id);

    // Check for new achievements
    const newAchievements = checkAchievements(
      totalEarned,
      goal.goal_amount,
      consecutiveWeeks,
      paceRatio,
      (actionsCompleted?.length || 0) + 1, // Simplified sources count
      unlockedIds
    );

    // Update progress in database
    const progressId = uuidv4();
    await execute(`
      INSERT INTO goal_progress (id, goal_id, week_number, target_amount, earned_amount, pace_ratio, risk_alert, actions_completed, notes)
      VALUES ('${progressId}', '${goalId}', ${weekNumber}, ${goal.weekly_target}, ${amountEarned}, ${paceRatio}, '${riskAlert}',
              '${JSON.stringify(actionsCompleted || [])}', ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'})
      ON CONFLICT (goal_id, week_number) DO UPDATE SET
        earned_amount = ${amountEarned},
        pace_ratio = ${paceRatio},
        risk_alert = '${riskAlert}',
        actions_completed = '${JSON.stringify(actionsCompleted || [])}',
        notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}
    `);

    // Save new achievements
    for (const achievementId of newAchievements) {
      const achId = uuidv4();
      await execute(`
        INSERT INTO goal_achievements (id, profile_id, achievement_id, goal_id)
        VALUES ('${achId}', 'default', '${achievementId}', '${goalId}')
        ON CONFLICT DO NOTHING
      `);
    }

    span.setAttributes({
      'goal.total_earned': totalEarned,
      'goal.pace_ratio': paceRatio,
      'goal.risk_alert': riskAlert,
      'goal.new_achievements': newAchievements.length,
    });

    // Build response
    const progressPct = Math.round((totalEarned / goal.goal_amount) * 100);
    const progressBarFilled = Math.round(progressPct / 10);
    const progressBar = '█'.repeat(progressBarFilled) + '░'.repeat(10 - progressBarFilled);

    // Get achievement details for new ones
    const newAchievementDetails = ACHIEVEMENTS.filter((a) => newAchievements.includes(a.id));

    const components: unknown[] = [
      // Progress update header
      {
        id: 'update-header',
        type: 'text',
        params: {
          content: `# 📊 Week ${weekNumber} - ${goal.goal_name}\n\n**+${amountEarned}€** this week`,
          markdown: true,
        },
      },
      // Progress metrics
      {
        id: 'progress-metrics',
        type: 'grid',
        params: {
          columns: 3,
          gap: '1rem',
          children: [
            {
              id: 'total-earned',
              type: 'metric',
              params: {
                title: 'Total earned',
                value: totalEarned,
                unit: '€',
              },
            },
            {
              id: 'progress-pct',
              type: 'metric',
              params: {
                title: 'Progress',
                value: `${progressPct}%`,
                trend: { direction: paceRatio >= 1 ? 'up' : 'down' },
              },
            },
            {
              id: 'pace',
              type: 'metric',
              params: {
                title: 'Pace',
                value: `${Math.round(paceRatio * 100)}%`,
                subtitle:
                  riskAlert === 'on_track'
                    ? '✅ Ahead'
                    : riskAlert === 'slight_delay'
                      ? '⚠️ Slight delay'
                      : riskAlert === 'at_risk'
                        ? '🚨 At risk'
                        : '❌ Critical',
              },
            },
          ],
        },
      },
      // Visual progress bar
      {
        id: 'progress-bar',
        type: 'text',
        params: {
          content: `\n[${progressBar}] ${progressPct}%\n\n**${totalEarned}€** / ${goal.goal_amount}€`,
          markdown: true,
        },
      },
    ];

    // Add achievements if any
    if (newAchievementDetails.length > 0) {
      components.push({
        id: 'new-achievements',
        type: 'text',
        params: {
          content: `## 🏆 Achievements unlocked!\n\n${newAchievementDetails.map((a) => `### ${a.icon} ${a.name}\n${a.description}`).join('\n\n')}`,
          markdown: true,
        },
      });
    }

    // Add risk alert if not on track
    if (riskAlert !== 'on_track') {
      const deficit = expectedTotal - totalEarned;
      components.push({
        id: 'risk-alert',
        type: 'text',
        params: {
          content: `## ${riskAlert === 'slight_delay' ? '⚠️' : '🚨'} Alert\n\n**${deficit}€** behind on goal.\n\n**Suggested actions:**\n- Increase effort next week\n- Explore a new income source\n- Sell an item to catch up`,
          markdown: true,
        },
      });
    }

    return {
      type: 'composite',
      components,
      metadata: {
        traceId: getCurrentTraceId(),
        goalId,
        weekNumber,
        totalEarned,
        paceRatio,
        riskAlert,
        newAchievements,
      },
    };
  });
}

export async function handleGetGoalStatus(args: Record<string, unknown>) {
  return trace('tool_get_goal_status', async (span) => {
    const goalId = args.goal_id as string;

    span.setAttributes({ 'goal.id': goalId });

    // Get goal
    const goals = await query<{
      goal_name: string;
      goal_amount: number;
      goal_deadline: string;
      weekly_target: number;
      feasibility_score: number;
      risk_level: string;
      status: string;
    }>(`SELECT * FROM goals WHERE id = '${goalId}'`);

    if (goals.length === 0) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const goal = goals[0];

    // Get all progress
    const progress = await query<{
      week_number: number;
      earned_amount: number;
      target_amount: number;
      risk_alert: string;
    }>(`SELECT * FROM goal_progress WHERE goal_id = '${goalId}' ORDER BY week_number`);

    // Get achievements
    const achievements = await query<{ achievement_id: string }>(
      `SELECT achievement_id FROM goal_achievements WHERE goal_id = '${goalId}'`
    );

    const totalEarned = progress.reduce((sum, p) => sum + (p.earned_amount || 0), 0);
    const progressPct = Math.round((totalEarned / goal.goal_amount) * 100);
    const currentWeek = progress.length;

    // Build progress visualization
    const totalWeeks = Math.ceil(goal.goal_amount / goal.weekly_target);
    const weeklyViz = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const weekProgress = progress.find((p) => p.week_number === w);
      if (weekProgress) {
        const pct = (weekProgress.earned_amount || 0) / (weekProgress.target_amount || 1);
        weeklyViz.push(pct >= 1 ? '✅' : pct >= 0.8 ? '🟡' : '🔴');
      } else if (w === currentWeek + 1) {
        weeklyViz.push('▶️');
      } else {
        weeklyViz.push('⬜');
      }
    }

    span.setAttributes({
      'goal.total_earned': totalEarned,
      'goal.progress_pct': progressPct,
      'goal.achievements_count': achievements.length,
    });

    // Get achievement details
    const unlockedAchievements = ACHIEVEMENTS.filter((a) =>
      achievements.some((ua) => ua.achievement_id === a.id)
    );

    return {
      type: 'composite',
      components: [
        // Header
        {
          id: 'status-header',
          type: 'text',
          params: {
            content: `# 📊 ${goal.goal_name}\n\n**Statut:** ${goal.status === 'active' ? '🟢 Actif' : goal.status === 'completed' ? '✅ Terminé' : '⏸️ En pause'}`,
            markdown: true,
          },
        },
        // Main metrics
        {
          id: 'main-metrics',
          type: 'grid',
          params: {
            columns: 2,
            gap: '1rem',
            children: [
              {
                id: 'earned',
                type: 'metric',
                params: {
                  title: 'Gagné',
                  value: totalEarned,
                  unit: `€ / ${goal.goal_amount}€`,
                },
              },
              {
                id: 'progress',
                type: 'metric',
                params: {
                  title: 'Progression',
                  value: `${progressPct}%`,
                  trend: { direction: progressPct >= 50 ? 'up' : 'neutral' },
                },
              },
            ],
          },
        },
        // Weekly visualization
        {
          id: 'weekly-progress',
          type: 'text',
          params: {
            content: `## Semaines\n\n${weeklyViz.join(' ')}\n\nSemaine ${currentWeek + 1}/${totalWeeks}`,
            markdown: true,
          },
        },
        // Achievements
        {
          id: 'achievements',
          type: 'text',
          params: {
            content: `## 🏆 Achievements (${achievements.length}/${ACHIEVEMENTS.length})\n\n${unlockedAchievements.length > 0 ? unlockedAchievements.map((a) => `${a.icon} ${a.name}`).join(' | ') : '*Aucun achievement débloqué*'}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        goalId,
        totalEarned,
        progressPct,
        currentWeek,
        status: goal.status,
      },
    };
  });
}

export async function handleGoalRiskAssessment(args: Record<string, unknown>) {
  return trace('tool_goal_risk_assessment', async (span) => {
    const goalId = args.goal_id as string;

    // Get goal and progress
    const goals = await query<{
      goal_amount: number;
      goal_deadline: string;
      weekly_target: number;
      goal_name: string;
    }>(`SELECT * FROM goals WHERE id = '${goalId}'`);

    if (goals.length === 0) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const goal = goals[0];

    const progress = await query<{
      earned_amount: number;
      week_number: number;
    }>(`SELECT earned_amount, week_number FROM goal_progress WHERE goal_id = '${goalId}'`);

    const totalEarned = progress.reduce((sum, p) => sum + (p.earned_amount || 0), 0);
    const currentWeek = progress.length;
    const expectedTotal = goal.weekly_target * currentWeek;
    const deficit = expectedTotal - totalEarned;

    // Calculate remaining
    const deadline = new Date(goal.goal_deadline);
    const weeksRemaining = calculateWeeks(deadline);
    const amountRemaining = goal.goal_amount - totalEarned;
    const requiredWeeklyRate = amountRemaining / weeksRemaining;

    // Risk assessment
    const riskRatio = requiredWeeklyRate / goal.weekly_target;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let message: string;
    const actions: string[] = [];

    if (riskRatio <= 1) {
      riskLevel = 'low';
      message = 'You are on track to reach your goal!';
    } else if (riskRatio <= 1.3) {
      riskLevel = 'medium';
      message = 'Slight delay, but recoverable with a bit more effort.';
      actions.push('Increase work hours by 20%');
      actions.push('Explore an additional income source');
    } else if (riskRatio <= 1.8) {
      riskLevel = 'high';
      message = 'Significant delay. Corrective actions needed.';
      actions.push('Add a new paid activity');
      actions.push('Sell items for quick cash');
      actions.push('Reduce non-essential expenses');
    } else {
      riskLevel = 'critical';
      message = 'Goal very difficult to reach within the deadline.';
      actions.push('Consider extending the deadline');
      actions.push('Consider lowering the goal');
      actions.push('Aggressively combine multiple strategies');
    }

    span.setAttributes({
      'goal.id': goalId,
      'goal.risk_level': riskLevel,
      'goal.risk_ratio': riskRatio,
      'goal.weeks_remaining': weeksRemaining,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'risk-header',
          type: 'text',
          params: {
            content: `# ⚠️ Analyse de risque - ${goal.goal_name}`,
            markdown: true,
          },
        },
        {
          id: 'risk-metrics',
          type: 'grid',
          params: {
            columns: 2,
            gap: '1rem',
            children: [
              {
                id: 'risk-level-metric',
                type: 'metric',
                params: {
                  title: 'Niveau de risque',
                  value:
                    riskLevel === 'low'
                      ? '✅ Faible'
                      : riskLevel === 'medium'
                        ? '⚠️ Moyen'
                        : riskLevel === 'high'
                          ? '🚨 Élevé'
                          : '❌ Critique',
                },
              },
              {
                id: 'required-rate',
                type: 'metric',
                params: {
                  title: 'Required/week',
                  value: Math.round(requiredWeeklyRate),
                  unit: '€',
                  subtitle: `vs ${goal.weekly_target}€ planned`,
                },
              },
            ],
          },
        },
        {
          id: 'situation',
          type: 'text',
          params: {
            content: `## Situation\n\n${message}\n\n- **Remaining to earn:** ${amountRemaining}€\n- **Weeks remaining:** ${weeksRemaining}\n- **Current deficit:** ${deficit > 0 ? `${deficit}€` : 'None'}`,
            markdown: true,
          },
        },
        {
          id: 'actions',
          type: 'text',
          params: {
            content:
              actions.length > 0
                ? `## 💡 Recommended actions\n\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
                : '## ✅ Keep it up!',
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        goalId,
        riskLevel,
        riskRatio,
        weeksRemaining,
        requiredWeeklyRate,
      },
    };
  });
}

export async function handleListUserGoals(args: Record<string, unknown>) {
  return trace('tool_list_user_goals', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const status = (args.status as string) || 'active';

    span.setAttributes({
      'user.id': userId,
      'filter.status': status,
    });

    let whereClause = `profile_id = '${userId}'`;
    if (status !== 'all') {
      whereClause += ` AND status = '${status}'`;
    }

    const goals = await query<{
      id: string;
      goal_name: string;
      goal_amount: number;
      goal_deadline: string;
      status: string;
      feasibility_score: number;
    }>(
      `SELECT id, goal_name, goal_amount, goal_deadline, status, feasibility_score FROM goals WHERE ${whereClause} ORDER BY created_at DESC`
    );

    // Get progress for each goal
    const goalsWithProgress = await Promise.all(
      goals.map(async (g) => {
        const progress = await query<{ earned_amount: number }>(
          `SELECT earned_amount FROM goal_progress WHERE goal_id = '${g.id}'`
        );
        const earned = progress.reduce((sum, p) => sum + (p.earned_amount || 0), 0);
        return {
          ...g,
          earned,
          progressPct: Math.round((earned / g.goal_amount) * 100),
        };
      })
    );

    span.setAttributes({
      'goals.count': goals.length,
    });

    if (goalsWithProgress.length === 0) {
      return {
        type: 'text',
        params: {
          content: `## No ${status === 'active' ? 'active ' : ''}goals\n\nCreate your first goal with \`create_goal_plan\`!`,
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    return {
      type: 'table',
      params: {
        title: `My goals ${status === 'all' ? '' : `(${status})`}`,
        columns: [
          { key: 'goal_name', label: 'Goal' },
          { key: 'goal_amount', label: 'Amount' },
          { key: 'progress', label: 'Progress' },
          { key: 'deadline', label: 'Deadline' },
          { key: 'status', label: 'Status' },
        ],
        rows: goalsWithProgress.map((g) => ({
          goal_name: g.goal_name,
          goal_amount: `${g.goal_amount}€`,
          progress: `${g.progressPct}% (${g.earned}€)`,
          deadline: new Date(g.goal_deadline).toLocaleDateString('en-US'),
          status: g.status === 'active' ? '🟢' : g.status === 'completed' ? '✅' : '⏸️',
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
        goals: goalsWithProgress,
      },
    };
  });
}

// ============================================
// RETROPLANNING HANDLERS
// ============================================

export async function handleAddAcademicEvent(args: Record<string, unknown>) {
  return trace('tool_add_academic_event', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const eventType = args.event_type as AcademicEventType;
    const eventName = args.event_name as string;
    const startDate = args.start_date as string;
    const endDate = args.end_date as string;
    const priority = (args.priority as EventPriority) || 'normal';

    // Default capacity impact by event type
    let capacityImpact = args.capacity_impact as number | undefined;
    if (capacityImpact === undefined) {
      switch (eventType) {
        case 'exam_period':
          capacityImpact = 0.2; // 80% reduction
          break;
        case 'class_intensive':
          capacityImpact = 0.5; // 50% reduction
          break;
        case 'vacation':
          capacityImpact = 1.5; // 50% boost
          break;
        case 'internship':
          capacityImpact = 0.3; // 70% reduction
          break;
        case 'project_deadline':
          capacityImpact = 0.4; // 60% reduction
          break;
        default:
          capacityImpact = 1.0;
      }
    }

    span.setAttributes({
      'event.type': eventType,
      'event.name': eventName,
      'event.capacity_impact': capacityImpact,
      'event.priority': priority,
    });

    const eventId = uuidv4();
    await execute(`
      INSERT INTO academic_events (id, profile_id, event_type, event_name, start_date, end_date, capacity_impact, priority)
      VALUES ('${eventId}', '${userId}', '${eventType}', '${eventName.replace(/'/g, "''")}',
              '${startDate}', '${endDate}', ${capacityImpact}, '${priority}')
    `);

    const impactLabel =
      capacityImpact < 0.5
        ? '🔴 Protégé'
        : capacityImpact < 0.8
          ? '🟡 Réduit'
          : capacityImpact > 1.2
            ? '🟢 Boost'
            : '⚪ Normal';

    return {
      type: 'composite',
      components: [
        {
          id: 'event-added',
          type: 'text',
          params: {
            content: `# 📅 Événement ajouté\n\n**${eventName}** (${eventType.replace('_', ' ')})\n\n- Du ${new Date(startDate).toLocaleDateString('fr-FR')} au ${new Date(endDate).toLocaleDateString('fr-FR')}\n- Impact capacité: ${impactLabel} (×${capacityImpact})\n- Priorité: ${priority}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        eventId,
        eventType,
        capacityImpact,
      },
    };
  });
}

export async function handleAddCommitment(args: Record<string, unknown>) {
  return trace('tool_add_commitment', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const commitmentType = args.commitment_type as CommitmentType;
    const commitmentName = args.commitment_name as string;
    const hoursPerWeek = args.hours_per_week as number;
    const flexibleHours = (args.flexible_hours as boolean) ?? true;
    const dayPreferences = args.day_preferences as DayOfWeek[] | undefined;
    const priority = (args.priority as CommitmentPriority) || 'important';

    span.setAttributes({
      'commitment.type': commitmentType,
      'commitment.name': commitmentName,
      'commitment.hours': hoursPerWeek,
      'commitment.flexible': flexibleHours,
    });

    const commitmentId = uuidv4();
    await execute(`
      INSERT INTO commitments (id, profile_id, commitment_type, commitment_name, hours_per_week, flexible_hours, day_preferences, priority)
      VALUES ('${commitmentId}', '${userId}', '${commitmentType}', '${commitmentName.replace(/'/g, "''")}',
              ${hoursPerWeek}, ${flexibleHours}, ${dayPreferences ? `ARRAY[${dayPreferences.map((d) => `'${d}'`).join(',')}]` : 'NULL'}, '${priority}')
    `);

    const typeIcons: Record<CommitmentType, string> = {
      class: '📚',
      sport: '⚽',
      club: '🎭',
      internship: '💼',
      family: '👨‍👩‍👧',
      health: '🏥',
      volunteer: '🤝',
      other: '📌',
    };

    return {
      type: 'composite',
      components: [
        {
          id: 'commitment-added',
          type: 'text',
          params: {
            content: `# ${typeIcons[commitmentType]} Commitment added\n\n**${commitmentName}**\n\n- Type: ${commitmentType}\n- Hours/week: ${hoursPerWeek}h\n- Flexible: ${flexibleHours ? 'Yes' : 'No'}\n- Priority: ${priority}${dayPreferences ? `\n- Days: ${dayPreferences.join(', ')}` : ''}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        commitmentId,
        hoursPerWeek,
      },
    };
  });
}

export async function handleLogEnergy(args: Record<string, unknown>) {
  return trace('tool_log_energy', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const date = (args.date as string) || todayISO();
    const energyLevel = args.energy_level as 1 | 2 | 3 | 4 | 5;
    const moodScore = args.mood_score as 1 | 2 | 3 | 4 | 5;
    const stressLevel = args.stress_level as 1 | 2 | 3 | 4 | 5;
    const hoursSlept = args.hours_slept as number | undefined;
    const notes = args.notes as string | undefined;

    span.setAttributes({
      'energy.level': energyLevel,
      'energy.mood': moodScore,
      'energy.stress': stressLevel,
    });

    const logId = uuidv4();
    await execute(`
      INSERT INTO energy_logs (id, profile_id, log_date, energy_level, mood_score, stress_level, hours_slept, notes)
      VALUES ('${logId}', '${userId}', '${date}', ${energyLevel}, ${moodScore}, ${stressLevel},
              ${hoursSlept || 'NULL'}, ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'})
      ON CONFLICT (profile_id, log_date) DO UPDATE SET
        energy_level = ${energyLevel},
        mood_score = ${moodScore},
        stress_level = ${stressLevel},
        hours_slept = ${hoursSlept || 'NULL'},
        notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}
    `);

    // Energy emoji scale
    const energyEmoji = ['😴', '😫', '😐', '🙂', '😀'][energyLevel - 1];
    const moodEmoji = ['😢', '😕', '😐', '🙂', '😊'][moodScore - 1];
    const stressEmoji = ['😌', '🙂', '😐', '😰', '🤯'][stressLevel - 1];

    // Calculate composite score for capacity prediction
    const compositeScore = Math.round(((energyLevel + moodScore + (6 - stressLevel)) / 15) * 100);

    return {
      type: 'composite',
      components: [
        {
          id: 'energy-logged',
          type: 'text',
          params: {
            content: `# 📊 Check-in du ${new Date(date).toLocaleDateString('fr-FR')}\n\n| Métrique | Score | |\n|----------|-------|---|\n| Énergie | ${energyLevel}/5 | ${energyEmoji} |\n| Humeur | ${moodScore}/5 | ${moodEmoji} |\n| Stress | ${stressLevel}/5 | ${stressEmoji} |${hoursSlept ? `\n| Sommeil | ${hoursSlept}h | 😴 |` : ''}\n\n**Score capacité:** ${compositeScore}%`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        logId,
        compositeScore,
      },
    };
  });
}

export async function handleGenerateRetroplan(args: Record<string, unknown>) {
  return trace('tool_generate_retroplan', async (span) => {
    const goalId = args.goal_id as string;
    const userId = (args.user_id as string) || 'default';
    const preferFrontLoading = (args.prefer_front_loading as boolean) ?? true;
    const protectWeekends = (args.protect_weekends as boolean) ?? false;

    span.setAttributes({
      'goal.id': goalId,
      'retroplan.front_loading': preferFrontLoading,
    });

    // Get goal details
    const goals = await query<{
      goal_name: string;
      goal_amount: number;
      goal_deadline: string;
      weekly_target: number;
      minimum_budget: number;
      profile_id: string;
    }>(`SELECT * FROM goals WHERE id = '${goalId}'`);

    if (goals.length === 0) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const goal = goals[0];

    // Get user profile
    const profiles = await query<{
      monthly_income: number;
      monthly_expenses: number;
      skills: string[];
      max_work_hours_weekly: number;
      min_hourly_rate: number;
    }>(`SELECT * FROM profiles WHERE id = '${goal.profile_id || userId}' LIMIT 1`);

    const profile = profiles[0] || {
      monthly_income: 500,
      monthly_expenses: 400,
      skills: [],
      max_work_hours_weekly: 20,
      min_hourly_rate: 12,
    };

    // Get academic events
    const academicEvents = await query<{
      id: string;
      profile_id: string;
      event_type: AcademicEventType;
      event_name: string;
      start_date: string;
      end_date: string;
      capacity_impact: number;
      priority: EventPriority;
      is_recurring: boolean;
      recurrence_pattern: string;
    }>(`SELECT * FROM academic_events WHERE profile_id = '${goal.profile_id || userId}'
        AND end_date >= CURRENT_DATE`);

    // Get commitments
    const commitments = await query<{
      id: string;
      profile_id: string;
      commitment_type: CommitmentType;
      commitment_name: string;
      hours_per_week: number;
      flexible_hours: boolean;
      day_preferences: DayOfWeek[];
      priority: CommitmentPriority;
    }>(`SELECT * FROM commitments WHERE profile_id = '${goal.profile_id || userId}'`);

    // Get energy logs (last 30 days)
    const energyLogs = await query<{
      id: string;
      profile_id: string;
      log_date: string;
      energy_level: 1 | 2 | 3 | 4 | 5;
      mood_score: 1 | 2 | 3 | 4 | 5;
      stress_level: 1 | 2 | 3 | 4 | 5;
      hours_slept: number;
      notes: string;
    }>(`SELECT * FROM energy_logs WHERE profile_id = '${goal.profile_id || userId}'
        AND log_date >= CURRENT_DATE - INTERVAL 30 DAY
        ORDER BY log_date DESC`);

    // Convert to RetroplanInput
    const input: RetroplanInput = {
      goalId,
      userId: goal.profile_id || userId,
      goalAmount: goal.goal_amount,
      deadline: new Date(goal.goal_deadline),
      goalName: goal.goal_name,
      userProfile: {
        skills: profile.skills || [],
        monthlyIncome: profile.monthly_income || 500,
        monthlyExpenses: profile.monthly_expenses || 400,
        availableHours: profile.max_work_hours_weekly || 20,
        defaultHourlyRate: profile.min_hourly_rate || 12,
      },
      academicEvents: academicEvents.map((e) => ({
        id: e.id,
        userId: e.profile_id,
        type: e.event_type,
        name: e.event_name,
        startDate: new Date(e.start_date),
        endDate: new Date(e.end_date),
        capacityImpact: e.capacity_impact,
        priority: e.priority,
        isRecurring: e.is_recurring,
        recurrencePattern: e.recurrence_pattern as 'weekly' | 'monthly' | 'semester',
      })),
      commitments: commitments.map((c) => ({
        id: c.id,
        userId: c.profile_id,
        type: c.commitment_type,
        name: c.commitment_name,
        hoursPerWeek: c.hours_per_week,
        flexibleHours: c.flexible_hours,
        dayPreferences: c.day_preferences,
        priority: c.priority,
      })),
      energyHistory: energyLogs.map((e) => ({
        id: e.id,
        userId: e.profile_id,
        date: new Date(e.log_date),
        energyLevel: e.energy_level,
        moodScore: e.mood_score,
        stressLevel: e.stress_level,
        hoursSlept: e.hours_slept,
        notes: e.notes,
      })),
      preferences: {
        preferFrontLoading,
        protectWeekends,
        energyTrackingEnabled: energyLogs.length > 0,
      },
    };

    // Generate retroplan
    const retroplan = await generateRetroplan(input);

    // Save retroplan to database
    await execute(`
      INSERT INTO retroplans (id, goal_id, profile_id, config, milestones, total_weeks,
                              high_capacity_weeks, medium_capacity_weeks, low_capacity_weeks,
                              protected_weeks, feasibility_score, confidence_low, confidence_high,
                              risk_factors, front_loaded_percentage, is_active)
      VALUES ('${retroplan.id}', '${goalId}', '${userId}',
              '${JSON.stringify(retroplan.config)}',
              '${JSON.stringify(retroplan.milestones)}',
              ${retroplan.totalWeeks}, ${retroplan.highCapacityWeeks},
              ${retroplan.mediumCapacityWeeks}, ${retroplan.lowCapacityWeeks},
              ${retroplan.protectedWeeks}, ${retroplan.feasibilityScore},
              ${retroplan.confidenceInterval.low}, ${retroplan.confidenceInterval.high},
              '${JSON.stringify(retroplan.riskFactors)}',
              ${retroplan.frontLoadedPercentage}, TRUE)
      ON CONFLICT DO NOTHING
    `);

    span.setAttributes({
      'retroplan.id': retroplan.id,
      'retroplan.feasibility': retroplan.feasibilityScore,
      'retroplan.total_weeks': retroplan.totalWeeks,
      'retroplan.protected_weeks': retroplan.protectedWeeks,
    });

    // Build visual calendar
    const weeklyViz = retroplan.milestones
      .map((m) => {
        if (m.capacity.isProtectedWeek) return '🔴';
        if (m.capacity.capacityCategory === 'low') return '🟠';
        if (m.capacity.capacityCategory === 'medium') return '🟡';
        return '🟢';
      })
      .join(' ');

    // Build capacity summary
    const capacitySummary = [
      `🟢 High capacity: ${retroplan.highCapacityWeeks} weeks`,
      `🟡 Medium: ${retroplan.mediumCapacityWeeks} weeks`,
      `🟠 Low: ${retroplan.lowCapacityWeeks} weeks`,
      `🔴 Protected: ${retroplan.protectedWeeks} weeks`,
    ].join('\n');

    // Build milestone table
    const milestoneRows = retroplan.milestones.slice(0, 8).map((m) => ({
      week: `S${m.weekNumber}`,
      target: `${Math.round(m.adjustedTarget)}€`,
      cumul: `${Math.round(m.cumulativeTarget)}€`,
      capacity: m.capacity.isProtectedWeek
        ? '🔴'
        : m.capacity.capacityCategory === 'low'
          ? '🟠'
          : m.capacity.capacityCategory === 'medium'
            ? '🟡'
            : '🟢',
      events: m.capacity.academicEvents.map((e) => e.name).join(', ') || '-',
    }));

    return {
      type: 'composite',
      components: [
        {
          id: 'retroplan-header',
          type: 'text',
          params: {
            content: `# 📅 Retroplan: ${goal.goal_name}\n\n**${goal.goal_amount}€** d'ici le **${new Date(goal.goal_deadline).toLocaleDateString('fr-FR')}**`,
            markdown: true,
          },
        },
        {
          id: 'feasibility-metrics',
          type: 'grid',
          params: {
            columns: 3,
            gap: '1rem',
            children: [
              {
                id: 'feasibility',
                type: 'metric',
                params: {
                  title: 'Faisabilité',
                  value: `${Math.round(retroplan.feasibilityScore * 100)}%`,
                  trend: { direction: retroplan.feasibilityScore >= 0.6 ? 'up' : 'down' },
                },
              },
              {
                id: 'front-load',
                type: 'metric',
                params: {
                  title: 'Front-loading',
                  value: `${Math.round(retroplan.frontLoadedPercentage)}%`,
                  subtitle: 'dans 1ère moitié',
                },
              },
              {
                id: 'protected',
                type: 'metric',
                params: {
                  title: 'Semaines protégées',
                  value: retroplan.protectedWeeks,
                  subtitle: `sur ${retroplan.totalWeeks}`,
                },
              },
            ],
          },
        },
        {
          id: 'calendar-viz',
          type: 'text',
          params: {
            content: `## Vue calendrier\n\n${weeklyViz}\n\n${capacitySummary}`,
            markdown: true,
          },
        },
        {
          id: 'milestones-table',
          type: 'table',
          params: {
            title: 'Upcoming weeks',
            columns: [
              { key: 'week', label: 'Week' },
              { key: 'target', label: 'Target' },
              { key: 'cumul', label: 'Cumulative' },
              { key: 'capacity', label: 'Cap.' },
              { key: 'events', label: 'Events' },
            ],
            rows: milestoneRows,
          },
        },
        {
          id: 'risk-factors',
          type: 'text',
          params: {
            content:
              retroplan.riskFactors.length > 0
                ? `## ⚠️ Risk factors\n\n${retroplan.riskFactors.map((r) => `- ${r}`).join('\n')}`
                : '## ✅ No major risk identified',
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        retroplanId: retroplan.id,
        retroplan,
      },
    };
  });
}

export async function handleGetWeekCapacity(args: Record<string, unknown>) {
  return trace('tool_get_week_capacity', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const weekDate = args.week_date as string | undefined;

    const targetDate = weekDate ? new Date(weekDate) : new Date();

    // Get week start (Monday)
    const weekStart = new Date(targetDate);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    // Get week end (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    span.setAttributes({
      'week.start': weekStart.toISOString(),
    });

    // Get academic events for this week
    const events = await query<{
      event_name: string;
      event_type: string;
      capacity_impact: number;
    }>(`SELECT event_name, event_type, capacity_impact FROM academic_events
        WHERE profile_id = '${userId}'
        AND start_date <= '${toISODate(weekEnd)}'
        AND end_date >= '${toISODate(weekStart)}'`);

    // Get commitments
    const commitments = await query<{
      commitment_name: string;
      hours_per_week: number;
    }>(`SELECT commitment_name, hours_per_week FROM commitments WHERE profile_id = '${userId}'`);

    // Get recent energy logs
    const recentEnergy = await query<{
      energy_level: number;
      mood_score: number;
      stress_level: number;
    }>(`SELECT energy_level, mood_score, stress_level FROM energy_logs
        WHERE profile_id = '${userId}'
        ORDER BY log_date DESC LIMIT 7`);

    // Calculate capacity
    const totalCommitmentHours = commitments.reduce((sum, c) => sum + c.hours_per_week, 0);
    const academicMultiplier = events.reduce((mult, e) => Math.min(mult, e.capacity_impact), 1.0);

    const avgEnergy =
      recentEnergy.length > 0
        ? recentEnergy.reduce((sum, e) => sum + e.energy_level, 0) / recentEnergy.length
        : 3;
    const avgMood =
      recentEnergy.length > 0
        ? recentEnergy.reduce((sum, e) => sum + e.mood_score, 0) / recentEnergy.length
        : 3;
    const avgStress =
      recentEnergy.length > 0
        ? recentEnergy.reduce((sum, e) => sum + e.stress_level, 0) / recentEnergy.length
        : 3;

    const energyMultiplier = 0.6 + ((avgEnergy + avgMood + (6 - avgStress)) / 15) * 0.8;

    // Base hours: 168h - 56h sleep - commitments - 21h buffer
    const baseHours = Math.max(0, 168 - 56 - totalCommitmentHours - 21);
    const effectiveHours = Math.round(baseHours * academicMultiplier * energyMultiplier * 0.3); // 30% for earning

    const capacityScore = Math.round(academicMultiplier * energyMultiplier * 100);
    const capacityCategory =
      capacityScore < 30
        ? 'protected'
        : capacityScore < 60
          ? 'low'
          : capacityScore < 85
            ? 'medium'
            : 'high';

    return {
      type: 'composite',
      components: [
        {
          id: 'capacity-header',
          type: 'text',
          params: {
            content: `# 📊 Capacité - Semaine du ${weekStart.toLocaleDateString('fr-FR')}`,
            markdown: true,
          },
        },
        {
          id: 'capacity-metrics',
          type: 'grid',
          params: {
            columns: 2,
            gap: '1rem',
            children: [
              {
                id: 'capacity-score',
                type: 'metric',
                params: {
                  title: 'Score capacité',
                  value: `${capacityScore}%`,
                  subtitle:
                    capacityCategory === 'high'
                      ? '🟢 Haute'
                      : capacityCategory === 'medium'
                        ? '🟡 Moyenne'
                        : capacityCategory === 'low'
                          ? '🟠 Basse'
                          : '🔴 Protégée',
                },
              },
              {
                id: 'effective-hours',
                type: 'metric',
                params: {
                  title: 'Heures dispo',
                  value: effectiveHours,
                  unit: 'h',
                  subtitle: 'pour gagner €',
                },
              },
            ],
          },
        },
        {
          id: 'breakdown',
          type: 'text',
          params: {
            content: `## Details\n\n| Factor | Impact |\n|---------|--------|\n| Academic events | ×${academicMultiplier.toFixed(2)} |\n| Average energy | ×${energyMultiplier.toFixed(2)} |\n| Commitments | -${totalCommitmentHours}h/week |${events.length > 0 ? `\n\n**Events this week:**\n${events.map((e) => `- ${e.event_name} (${e.event_type})`).join('\n')}` : ''}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        capacityScore,
        effectiveHours,
        academicMultiplier,
        energyMultiplier,
      },
    };
  });
}

export async function handleListAcademicEvents(args: Record<string, unknown>) {
  return trace('tool_list_academic_events', async (span) => {
    const userId = (args.user_id as string) || 'default';
    const startDate = args.start_date as string | undefined;
    const endDate = args.end_date as string | undefined;

    let whereClause = `profile_id = '${userId}'`;
    if (startDate) {
      whereClause += ` AND end_date >= '${startDate}'`;
    }
    if (endDate) {
      whereClause += ` AND start_date <= '${endDate}'`;
    }

    const events = await query<{
      id: string;
      event_name: string;
      event_type: string;
      start_date: string;
      end_date: string;
      capacity_impact: number;
      priority: string;
    }>(`SELECT * FROM academic_events WHERE ${whereClause} ORDER BY start_date`);

    span.setAttributes({
      'events.count': events.length,
    });

    if (events.length === 0) {
      return {
        type: 'text',
        params: {
          content:
            '## Aucun événement académique\n\nAjoutez vos examens et vacances avec `add_academic_event`!',
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const typeIcons: Record<string, string> = {
      exam_period: '📝',
      class_intensive: '📚',
      vacation: '🏖️',
      internship: '💼',
      project_deadline: '⏰',
    };

    return {
      type: 'table',
      params: {
        title: 'Événements académiques',
        columns: [
          { key: 'icon', label: '' },
          { key: 'name', label: 'Événement' },
          { key: 'dates', label: 'Dates' },
          { key: 'impact', label: 'Impact' },
          { key: 'priority', label: 'Priorité' },
        ],
        rows: events.map((e) => ({
          icon: typeIcons[e.event_type] || '📅',
          name: e.event_name,
          dates: `${new Date(e.start_date).toLocaleDateString('fr-FR')} - ${new Date(e.end_date).toLocaleDateString('fr-FR')}`,
          impact:
            e.capacity_impact < 0.5
              ? '🔴'
              : e.capacity_impact < 0.8
                ? '🟡'
                : e.capacity_impact > 1.2
                  ? '🟢'
                  : '⚪',
          priority: e.priority,
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
        events,
      },
    };
  });
}

export async function handleListCommitments(args: Record<string, unknown>) {
  return trace('tool_list_commitments', async (span) => {
    const userId = (args.user_id as string) || 'default';

    const commitments = await query<{
      id: string;
      commitment_name: string;
      commitment_type: string;
      hours_per_week: number;
      flexible_hours: boolean;
      priority: string;
    }>(
      `SELECT * FROM commitments WHERE profile_id = '${userId}' ORDER BY priority, hours_per_week DESC`
    );

    span.setAttributes({
      'commitments.count': commitments.length,
    });

    if (commitments.length === 0) {
      return {
        type: 'text',
        params: {
          content: '## Aucun engagement\n\nAjoutez vos cours, sports, etc. avec `add_commitment`!',
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const typeIcons: Record<string, string> = {
      class: '📚',
      sport: '⚽',
      club: '🎭',
      internship: '💼',
      family: '👨‍👩‍👧',
      health: '🏥',
      volunteer: '🤝',
      other: '📌',
    };

    const totalHours = commitments.reduce((sum, c) => sum + c.hours_per_week, 0);

    return {
      type: 'composite',
      components: [
        {
          id: 'commitments-summary',
          type: 'text',
          params: {
            content: `## Recurring commitments\n\n**Total:** ${totalHours}h/week`,
            markdown: true,
          },
        },
        {
          id: 'commitments-table',
          type: 'table',
          params: {
            columns: [
              { key: 'icon', label: '' },
              { key: 'name', label: 'Commitment' },
              { key: 'hours', label: 'Hours/week' },
              { key: 'flexible', label: 'Flexible' },
              { key: 'priority', label: 'Priority' },
            ],
            rows: commitments.map((c) => ({
              icon: typeIcons[c.commitment_type] || '📌',
              name: c.commitment_name,
              hours: `${c.hours_per_week}h`,
              flexible: c.flexible_hours ? '✅' : '❌',
              priority: c.priority,
            })),
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        totalHours,
        commitments,
      },
    };
  });
}

/**
 * Handle goal tool by name
 */
export async function handleGoalTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'create_goal_plan':
      return handleCreateGoalPlan(args);
    case 'update_goal_progress':
      return handleUpdateGoalProgress(args);
    case 'get_goal_status':
      return handleGetGoalStatus(args);
    case 'goal_risk_assessment':
      return handleGoalRiskAssessment(args);
    case 'list_user_goals':
      return handleListUserGoals(args);
    // Retroplanning tools
    case 'add_academic_event':
      return handleAddAcademicEvent(args);
    case 'add_commitment':
      return handleAddCommitment(args);
    case 'log_energy':
      return handleLogEnergy(args);
    case 'generate_retroplan':
      return handleGenerateRetroplan(args);
    case 'get_week_capacity':
      return handleGetWeekCapacity(args);
    case 'list_academic_events':
      return handleListAcademicEvents(args);
    case 'list_commitments':
      return handleListCommitments(args);
    default:
      throw new Error(`Unknown goal tool: ${name}`);
  }
}
