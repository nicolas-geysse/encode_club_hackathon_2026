/**
 * Goal Planning Workflow
 *
 * Multi-agent workflow for creating and managing financial goals.
 * Combines Budget Coach, Job Matcher, Money Maker, and Strategy Comparator
 * to create comprehensive goal plans with milestones and gamification.
 *
 * Now includes capacity-aware retroplanning that considers:
 * - Academic calendar (exams, vacations)
 * - Recurring commitments (classes, sports, family)
 * - Energy/mood patterns
 */

import { trace, getCurrentTraceId } from '../services/opik.js';
import { query, execute } from '../services/duckdb.js';
import { chat } from '../services/llm.js';
import { randomUUID } from 'crypto';
import { toISODate } from '../utils/dateUtils.js';
import type {
  Retroplan,
  RetroplanInput,
  AcademicEvent,
  Commitment,
  EnergyLog,
  AcademicEventType,
  EventPriority,
  CommitmentType,
  CommitmentPriority,
  DayOfWeek,
} from '../types/retroplanning.js';
import { generateRetroplan } from '../algorithms/retroplanning.js';

// ============================================
// TYPES
// ============================================

export interface GoalPlanningInput {
  goalAmount: number;
  goalDeadline: Date;
  goalName: string;
  userId?: string;
  userProfile: {
    skills: string[];
    monthlyIncome: number;
    monthlyExpenses: number;
    availableHours: number;
    yearsRemaining: number;
    hasLoan?: boolean;
  };
  constraints?: {
    preferLowEffort?: boolean;
    avoidSelling?: boolean;
    minFlexibility?: number;
  };
}

export interface GoalPlanResult {
  goalId: string;
  analysis: {
    weeksAvailable: number;
    weeklyTarget: number;
    currentMargin: number;
    additionalNeeded: number;
    feasibilityScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
  };
  strategies: Strategy[];
  milestones: Milestone[];
  actionPlan: ActionPlan;
  gamification: Gamification;
  synthesis: string;
  traceId?: string;
}

export interface Strategy {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  name: string;
  weeklyContribution: number;
  monthlyContribution: number;
  effort: 'low' | 'medium' | 'high';
  flexibility: number;
  coBenefit?: string;
  timeToGoal: number;
  score: number;
}

export interface Milestone {
  weekNumber: number;
  targetAmount: number;
  cumulativeTarget: number;
  suggestedActions: string[];
  reward?: string;
}

export interface ActionPlan {
  immediateActions: Action[];
  weeklyActions: Action[];
  bufferActions: Action[];
}

export interface Action {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  title: string;
  description: string;
  estimatedValue: number;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  startWeek: number;
}

export interface Gamification {
  possibleAchievements: Achievement[];
  totalMilestones: number;
  estimatedXP: number;
}

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  threshold?: number;
}

// ============================================
// DATA
// ============================================

const JOB_DATABASE = [
  {
    id: 'freelance_dev',
    name: 'Dev Freelance',
    hourlyRate: 25,
    skills: ['python', 'javascript', 'sql', 'web'],
    flexibility: 0.9,
    effort: 'medium' as const,
    coBenefit: 'CV++ et portfolio',
  },
  {
    id: 'tutoring',
    name: 'Cours particuliers',
    hourlyRate: 20,
    skills: ['python', 'math', 'anglais'],
    flexibility: 0.8,
    effort: 'medium' as const,
    coBenefit: 'Renforce apprentissage',
  },
  {
    id: 'data_entry',
    name: 'Saisie de données',
    hourlyRate: 12,
    skills: ['excel', 'sql'],
    flexibility: 0.7,
    effort: 'low' as const,
    coBenefit: null,
  },
  {
    id: 'community_manager',
    name: 'Community Manager',
    hourlyRate: 15,
    skills: ['social_media', 'redaction'],
    flexibility: 0.8,
    effort: 'medium' as const,
    coBenefit: 'Réseau digital',
  },
];

const SIDE_HUSTLES = [
  {
    id: 'reselling',
    name: 'Revente (Vinted/Leboncoin)',
    monthlyPotential: 150,
    effort: 'low' as const,
    flexibility: 0.95,
    coBenefit: 'Zéro compétence requise',
    startupCost: 0,
  },
  {
    id: 'pet_sitting',
    name: 'Pet sitting',
    monthlyPotential: 200,
    effort: 'low' as const,
    flexibility: 0.9,
    coBenefit: 'Détente + animaux',
    startupCost: 0,
  },
  {
    id: 'delivery',
    name: 'Livraison vélo',
    monthlyPotential: 300,
    effort: 'high' as const,
    flexibility: 0.7,
    coBenefit: 'Sport gratuit',
    startupCost: 0,
  },
  {
    id: 'transcription',
    name: 'Transcription audio',
    monthlyPotential: 100,
    effort: 'medium' as const,
    flexibility: 0.95,
    coBenefit: 'Télétravail 100%',
    startupCost: 0,
  },
];

const SELLING_ITEMS = [
  {
    category: 'electronics',
    name: 'Électronique',
    avgPrice: 150,
    examples: 'Vieux téléphone, tablette, console',
  },
  {
    category: 'clothing',
    name: 'Vêtements',
    avgPrice: 50,
    examples: 'Vêtements non portés, chaussures',
  },
  { category: 'books', name: 'Livres', avgPrice: 30, examples: 'Manuels scolaires, romans' },
  {
    category: 'furniture',
    name: 'Mobilier',
    avgPrice: 100,
    examples: 'Petit meuble, lampe, chaise',
  },
];

const OPTIMIZATIONS = [
  {
    id: 'coloc',
    name: 'Colocation',
    category: 'loyer',
    savingsPct: 0.3,
    effort: 'medium' as const,
  },
  {
    id: 'crous',
    name: 'Resto U CROUS',
    category: 'alimentation',
    savingsPct: 0.5,
    effort: 'low' as const,
  },
  {
    id: 'velo',
    name: 'Vélo/Marche',
    category: 'transport',
    savingsPct: 0.8,
    effort: 'medium' as const,
  },
  {
    id: 'batch_cooking',
    name: 'Batch cooking',
    category: 'alimentation',
    savingsPct: 0.3,
    effort: 'medium' as const,
  },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_100', name: 'First Blood', icon: '💰', description: 'Earn 100€', threshold: 100 },
  { id: 'first_500', name: 'Halfway Hero', icon: '🌟', description: 'Earn 500€', threshold: 500 },
  { id: 'streak_2', name: 'Consistent', icon: '📈', description: '2 consecutive weeks' },
  { id: 'streak_4', name: 'On Fire', icon: '🔥', description: '4 consecutive weeks' },
  { id: 'goal_50pct', name: 'Halfway There', icon: '🎯', description: 'Reach 50% of the goal' },
  { id: 'goal_complete', name: 'Champion', icon: '🏆', description: 'Reach the goal' },
];

// ============================================
// WORKFLOW STEPS
// ============================================

/**
 * Analyze goal feasibility
 */
async function analyzeGoalFeasibility(
  goalAmount: number,
  goalDeadline: Date,
  currentMargin: number
) {
  return trace('goal_feasibility_analysis', async (span) => {
    const now = new Date();
    const weeksAvailable = Math.max(
      1,
      Math.ceil((goalDeadline.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000))
    );
    const weeklyTarget = Math.ceil(goalAmount / weeksAvailable);
    const additionalNeeded = Math.max(0, weeklyTarget - currentMargin / 4);

    // Calculate feasibility score
    let feasibilityScore = 0.8;
    const riskFactors: string[] = [];

    if (weeklyTarget > 200) {
      feasibilityScore -= 0.3;
      riskFactors.push('High weekly target (>200€)');
    } else if (weeklyTarget > 100) {
      feasibilityScore -= 0.15;
      riskFactors.push('Moderate weekly target (>100€)');
    }

    if (weeksAvailable < 4) {
      feasibilityScore -= 0.2;
      riskFactors.push('Very short deadline (<4 weeks)');
    } else if (weeksAvailable < 8) {
      feasibilityScore -= 0.1;
      riskFactors.push('Tight deadline (<8 weeks)');
    }

    if (additionalNeeded > 0) {
      const ratio = additionalNeeded / weeklyTarget;
      if (ratio > 0.8) {
        feasibilityScore -= 0.2;
        riskFactors.push('Requires significant additional income');
      } else if (ratio > 0.5) {
        feasibilityScore -= 0.1;
        riskFactors.push('Requires moderate additional income');
      }
    }

    feasibilityScore = Math.max(0.1, Math.min(1, feasibilityScore));

    const riskLevel: 'low' | 'medium' | 'high' =
      feasibilityScore >= 0.7 ? 'low' : feasibilityScore >= 0.4 ? 'medium' : 'high';

    span.setAttributes({
      'goal.weeks_available': weeksAvailable,
      'goal.weekly_target': weeklyTarget,
      'goal.feasibility_score': feasibilityScore,
      'goal.risk_level': riskLevel,
    });

    return {
      weeksAvailable,
      weeklyTarget,
      currentMargin,
      additionalNeeded,
      feasibilityScore,
      riskLevel,
      riskFactors,
    };
  });
}

/**
 * Find matching jobs based on skills
 */
async function findMatchingJobs(skills: string[], availableHours: number): Promise<Strategy[]> {
  return trace('goal_job_matching', async (span) => {
    const skillsLower = skills.map((s) => s.toLowerCase());

    const matchedJobs = JOB_DATABASE.map((job) => {
      const matchingSkills = job.skills.filter((s) => skillsLower.includes(s.toLowerCase()));
      const skillScore = job.skills.length > 0 ? matchingSkills.length / job.skills.length : 0;

      if (skillScore === 0) return null;

      const weeklyContribution = Math.min(availableHours, 15) * job.hourlyRate;
      const score = skillScore * 0.4 + job.flexibility * 0.3 + (job.hourlyRate / 30) * 0.3;

      if (score <= 0.2) return null;

      const strategy: Strategy = {
        id: job.id,
        type: 'job',
        name: job.name,
        weeklyContribution,
        monthlyContribution: weeklyContribution * 4,
        effort: job.effort as 'low' | 'medium' | 'high',
        flexibility: job.flexibility,
        coBenefit: job.coBenefit || undefined,
        score,
        timeToGoal: 0, // Will be calculated later
      };
      return strategy;
    }).filter((j): j is Strategy => j !== null);

    const matches = matchedJobs.sort((a, b) => b.score - a.score);

    span.setAttributes({
      'jobs.found': matches.length,
      'jobs.skills_input': skills.join(', '),
    });

    return matches;
  });
}

/**
 * Find side hustles
 */
async function findSideHustles(constraints?: { preferLowEffort?: boolean }) {
  return trace('goal_side_hustles', async (span) => {
    let hustles = SIDE_HUSTLES.map((h) => ({
      id: h.id,
      type: 'hustle' as const,
      name: h.name,
      weeklyContribution: Math.round(h.monthlyPotential / 4),
      monthlyContribution: h.monthlyPotential,
      effort: h.effort,
      flexibility: h.flexibility,
      coBenefit: h.coBenefit,
      score:
        h.flexibility * 0.4 +
        (h.effort === 'low' ? 0.3 : h.effort === 'medium' ? 0.2 : 0.1) +
        (h.monthlyPotential / 400) * 0.3,
      timeToGoal: 0,
    }));

    if (constraints?.preferLowEffort) {
      hustles = hustles.filter((h) => h.effort !== 'high');
    }

    hustles.sort((a, b) => b.score - a.score);

    span.setAttributes({
      'hustles.found': hustles.length,
    });

    return hustles;
  });
}

/**
 * Find sellable items
 */
async function findSellingOptions(constraints?: { avoidSelling?: boolean }) {
  return trace('goal_selling_options', async (span) => {
    if (constraints?.avoidSelling) {
      return [];
    }

    const selling = SELLING_ITEMS.map((item) => ({
      id: `sell_${item.category}`,
      type: 'selling' as const,
      name: `Vente ${item.name}`,
      weeklyContribution: item.avgPrice, // One-time, but shows as potential
      monthlyContribution: item.avgPrice,
      effort: 'low' as const,
      flexibility: 1,
      coBenefit: `Désencombrement + ${item.examples}`,
      score: 0.7, // High score because it's immediate
      timeToGoal: 1,
    }));

    span.setAttributes({
      'selling.options': selling.length,
    });

    return selling;
  });
}

/**
 * Find budget optimizations
 */
async function findOptimizationsForGoal(expenses: { category: string; amount: number }[]) {
  return trace('goal_optimizations', async (span) => {
    const results: Strategy[] = [];

    for (const expense of expenses) {
      const categoryLower = expense.category.toLowerCase();
      const matchingOpts = OPTIMIZATIONS.filter(
        (o) => categoryLower.includes(o.category) || o.category.includes(categoryLower)
      );

      for (const opt of matchingOpts) {
        const savings = Math.round(expense.amount * opt.savingsPct);
        results.push({
          id: opt.id,
          type: 'optimization',
          name: opt.name,
          weeklyContribution: Math.round(savings / 4),
          monthlyContribution: savings,
          effort: opt.effort,
          flexibility: 1,
          coBenefit: `Savings on ${expense.category}`,
          score: (savings / 200) * 0.5 + (opt.effort === 'low' ? 0.3 : 0.15) + 0.2,
          timeToGoal: 1,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    span.setAttributes({
      'optimizations.found': results.length,
    });

    return results;
  });
}

/**
 * Rank and combine strategies
 */
async function rankStrategies(
  jobs: Strategy[],
  hustles: Strategy[],
  selling: Strategy[],
  optimizations: Strategy[],
  weeklyTarget: number,
  urgency: 'high' | 'medium' | 'low'
) {
  return trace('goal_strategy_ranking', async (span) => {
    // Combine all strategies
    let allStrategies = [...jobs, ...hustles, ...selling, ...optimizations];

    // Calculate time to goal for each
    allStrategies = allStrategies.map((s) => ({
      ...s,
      timeToGoal: s.weeklyContribution > 0 ? Math.ceil(weeklyTarget / s.weeklyContribution) : 999,
    }));

    // Adjust scores based on urgency
    if (urgency === 'high') {
      // Prioritize quick wins and selling
      allStrategies = allStrategies.map((s) => ({
        ...s,
        score: s.score + (s.type === 'selling' ? 0.2 : 0) + (s.timeToGoal <= 2 ? 0.15 : 0),
      }));
    } else if (urgency === 'low') {
      // Prioritize sustainable options
      allStrategies = allStrategies.map((s) => ({
        ...s,
        score: s.score + (s.type === 'job' ? 0.15 : 0) + s.flexibility * 0.1,
      }));
    }

    // Sort by score
    allStrategies.sort((a, b) => b.score - a.score);

    span.setAttributes({
      'strategies.total': allStrategies.length,
      'strategies.top_type': allStrategies[0]?.type || 'none',
    });

    return allStrategies.slice(0, 8);
  });
}

/**
 * Generate milestones
 */
async function generateMilestones(
  goalAmount: number,
  weeksAvailable: number,
  strategies: Strategy[]
) {
  return trace('goal_milestone_generation', async (span) => {
    const weeklyTarget = Math.ceil(goalAmount / weeksAvailable);
    const milestones: Milestone[] = [];

    for (let week = 1; week <= weeksAvailable; week++) {
      const milestone: Milestone = {
        weekNumber: week,
        targetAmount: weeklyTarget,
        cumulativeTarget: weeklyTarget * week,
        suggestedActions: [],
        reward: undefined,
      };

      // Suggest actions based on week
      if (week === 1) {
        // First week: quick wins
        const quickWins = strategies.filter(
          (s) => s.type === 'selling' || s.type === 'optimization'
        );
        milestone.suggestedActions = quickWins.slice(0, 2).map((s) => s.name);
      } else if (week <= weeksAvailable / 2) {
        // Early weeks: establish income
        const incomeStrats = strategies.filter((s) => s.type === 'job' || s.type === 'hustle');
        milestone.suggestedActions = incomeStrats.slice(0, 2).map((s) => s.name);
      } else {
        // Later weeks: maintain momentum
        milestone.suggestedActions = ['Continuer le rythme', 'Vérifier les achievements'];
      }

      // Add rewards
      if (week === Math.ceil(weeksAvailable / 2)) {
        milestone.reward = '🎯 Mi-chemin atteint!';
      } else if (week === weeksAvailable) {
        milestone.reward = '🏆 OBJECTIF ATTEINT!';
      } else if (week % 4 === 0) {
        milestone.reward = '⭐ Mois complété!';
      }

      milestones.push(milestone);
    }

    span.setAttributes({
      'milestones.count': milestones.length,
    });

    return milestones;
  });
}

/**
 * Generate action plan
 */
async function generateActionPlan(
  strategies: Strategy[],
  weeksAvailable: number
): Promise<ActionPlan> {
  return trace('goal_action_plan', async (span) => {
    const immediateActions: Action[] = [];
    const weeklyActions: Action[] = [];
    const bufferActions: Action[] = [];

    let actionId = 1;

    // Immediate actions (week 1)
    const sellingStrats = strategies.filter((s) => s.type === 'selling');
    const optimStrats = strategies.filter((s) => s.type === 'optimization');

    for (const s of sellingStrats.slice(0, 2)) {
      immediateActions.push({
        id: `action_${actionId++}`,
        type: s.type,
        title: s.name,
        description: s.coBenefit || 'Gain immédiat',
        estimatedValue: s.weeklyContribution,
        priority: 'immediate',
        startWeek: 1,
      });
    }

    for (const s of optimStrats.slice(0, 2)) {
      immediateActions.push({
        id: `action_${actionId++}`,
        type: s.type,
        title: s.name,
        description: s.coBenefit || 'Recurring savings',
        estimatedValue: s.weeklyContribution,
        priority: 'high',
        startWeek: 1,
      });
    }

    // Weekly actions (ongoing)
    const incomeStrats = strategies.filter((s) => s.type === 'job' || s.type === 'hustle');
    for (const s of incomeStrats.slice(0, 3)) {
      weeklyActions.push({
        id: `action_${actionId++}`,
        type: s.type,
        title: s.name,
        description: s.coBenefit || 'Recurring income',
        estimatedValue: s.weeklyContribution,
        priority: s.score > 0.6 ? 'high' : 'medium',
        startWeek: 2,
      });
    }

    // Buffer actions (if behind schedule)
    const unusedStrats = strategies.filter(
      (s) =>
        !immediateActions.some((a) => a.title === s.name) &&
        !weeklyActions.some((a) => a.title === s.name)
    );

    for (const s of unusedStrats.slice(0, 2)) {
      bufferActions.push({
        id: `action_${actionId++}`,
        type: s.type,
        title: s.name,
        description: 'Activate if behind schedule',
        estimatedValue: s.weeklyContribution,
        priority: 'low',
        startWeek: Math.ceil(weeksAvailable / 2),
      });
    }

    span.setAttributes({
      'actions.immediate': immediateActions.length,
      'actions.weekly': weeklyActions.length,
      'actions.buffer': bufferActions.length,
    });

    return { immediateActions, weeklyActions, bufferActions };
  });
}

/**
 * Generate synthesis using LLM
 */
async function generateGoalSynthesis(
  goalName: string,
  analysis: GoalPlanResult['analysis'],
  strategies: Strategy[],
  actionPlan: ActionPlan
): Promise<string> {
  return trace('goal_synthesis_generation', async (span) => {
    const prompt = `Generate a motivating summary for a student who wants to achieve this financial goal:

Goal: ${goalName}
- Amount: ${analysis.weeklyTarget * analysis.weeksAvailable}€
- Deadline: ${analysis.weeksAvailable} weeks
- Weekly target: ${analysis.weeklyTarget}€
- Feasibility: ${Math.round(analysis.feasibilityScore * 100)}%
- Risk: ${analysis.riskLevel}

Top strategies:
${strategies
  .slice(0, 3)
  .map((s) => `- ${s.name} (+${s.weeklyContribution}€/week)`)
  .join('\n')}

Immediate actions:
${actionPlan.immediateActions.map((a) => `- ${a.title}`).join('\n')}

Write a short message (max 150 words), motivating, that:
1. Summarizes the plan
2. Highlights quick wins
3. Encourages starting now
4. Uses a friendly, supportive tone

Don't mention precise success figures, stay positive but realistic.`;

    try {
      const synthesis = await chat(
        [
          {
            role: 'system',
            content: 'You are a friendly financial coach for students. Reply in English.',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.7, maxTokens: 500 }
      );

      span.setAttributes({
        'synthesis.length': synthesis.length,
      });

      return synthesis;
    } catch {
      // Fallback if LLM fails
      return `## Plan for ${goalName}

**Goal**: ${analysis.weeklyTarget * analysis.weeksAvailable}€ in ${analysis.weeksAvailable} weeks (${analysis.weeklyTarget}€/week)

**Top strategy**: ${strategies[0]?.name || 'To be defined'}

**Start now** with the immediate actions to build momentum!

You've got this! 💪`;
    }
  });
}

// ============================================
// MAIN WORKFLOW
// ============================================

/**
 * Run the complete goal planning workflow
 */
export async function runGoalPlanningWorkflow(input: GoalPlanningInput): Promise<GoalPlanResult> {
  return trace('goal_planning_workflow', async (span) => {
    const goalId = randomUUID();

    span.setAttributes({
      'goal.id': goalId,
      'goal.amount': input.goalAmount,
      'goal.name': input.goalName,
      'goal.weeks_to_deadline': Math.ceil(
        (input.goalDeadline.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      ),
    });

    // Step 1: Analyze feasibility
    const currentMargin = input.userProfile.monthlyIncome - input.userProfile.monthlyExpenses;
    const analysis = await analyzeGoalFeasibility(
      input.goalAmount,
      input.goalDeadline,
      currentMargin
    );

    // Determine urgency
    const urgency: 'high' | 'medium' | 'low' =
      analysis.weeksAvailable < 4 ? 'high' : analysis.weeksAvailable < 12 ? 'medium' : 'low';

    // Step 2: Find strategies in parallel
    const [jobs, hustles, selling, optimizations] = await Promise.all([
      findMatchingJobs(input.userProfile.skills, input.userProfile.availableHours),
      findSideHustles(input.constraints),
      findSellingOptions(input.constraints),
      findOptimizationsForGoal([
        { category: 'loyer', amount: input.userProfile.monthlyExpenses * 0.4 },
        { category: 'alimentation', amount: input.userProfile.monthlyExpenses * 0.25 },
        { category: 'transport', amount: input.userProfile.monthlyExpenses * 0.1 },
      ]),
    ]);

    // Step 3: Rank strategies
    const strategies = await rankStrategies(
      jobs,
      hustles,
      selling,
      optimizations,
      analysis.weeklyTarget,
      urgency
    );

    // Step 4: Generate milestones
    const milestones = await generateMilestones(
      input.goalAmount,
      analysis.weeksAvailable,
      strategies
    );

    // Step 5: Generate action plan
    const actionPlan = await generateActionPlan(strategies, analysis.weeksAvailable);

    // Step 6: Generate synthesis
    const synthesis = await generateGoalSynthesis(input.goalName, analysis, strategies, actionPlan);

    // Step 7: Setup gamification
    const gamification: Gamification = {
      possibleAchievements: ACHIEVEMENTS,
      totalMilestones: milestones.length,
      estimatedXP: milestones.length * 100 + ACHIEVEMENTS.length * 50,
    };

    // Save goal to database
    try {
      await execute(`
        INSERT INTO goals (id, profile_id, goal_name, goal_amount, goal_deadline,
                           feasibility_score, risk_level, weekly_target, status)
        VALUES ('${goalId}', '${input.userId || 'default'}', '${input.goalName.replace(/'/g, "''")}',
                ${input.goalAmount}, '${toISODate(input.goalDeadline)}',
                ${analysis.feasibilityScore}, '${analysis.riskLevel}', ${analysis.weeklyTarget}, 'active')
      `);
    } catch (error) {
      console.error('Failed to save goal to database:', error);
    }

    span.setAttributes({
      'goal.feasibility': analysis.feasibilityScore,
      'goal.strategies_count': strategies.length,
      'goal.milestones_count': milestones.length,
    });

    return {
      goalId,
      analysis,
      strategies,
      milestones,
      actionPlan,
      gamification,
      synthesis,
      traceId: getCurrentTraceId() || undefined,
    };
  });
}

// ============================================
// RETROPLANNING WORKFLOW
// ============================================

/**
 * Extended input for capacity-aware planning
 */
export interface RetroplanningWorkflowInput extends GoalPlanningInput {
  enableCapacityPlanning?: boolean;
  preferences?: {
    preferFrontLoading?: boolean;
    protectWeekends?: boolean;
    energyTrackingEnabled?: boolean;
  };
}

/**
 * Extended result including retroplan
 */
export interface RetroplanningWorkflowResult extends GoalPlanResult {
  retroplan?: Retroplan;
  capacityAware: boolean;
}

/**
 * Run the goal planning workflow with capacity-aware retroplanning
 */
export async function runRetroplanningWorkflow(
  input: RetroplanningWorkflowInput
): Promise<RetroplanningWorkflowResult> {
  return trace('retroplanning_workflow', async (span) => {
    // First, run the standard goal planning workflow
    const basePlan = await runGoalPlanningWorkflow(input);

    // If capacity planning is not enabled, return base plan
    if (!input.enableCapacityPlanning) {
      return {
        ...basePlan,
        capacityAware: false,
      };
    }

    span.setAttributes({
      'retroplan.enabled': true,
      'retroplan.goal_id': basePlan.goalId,
    });

    // Fetch user's academic events, commitments, and energy history
    const userId = input.userId || 'default';

    const [academicEventsRows, commitmentsRows, energyLogsRows] = await Promise.all([
      query<{
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
      }>(
        `SELECT * FROM academic_events WHERE profile_id = '${userId}' AND end_date >= CURRENT_DATE`
      ),
      query<{
        id: string;
        profile_id: string;
        commitment_type: CommitmentType;
        commitment_name: string;
        hours_per_week: number;
        flexible_hours: boolean;
        day_preferences: DayOfWeek[];
        priority: CommitmentPriority;
      }>(`SELECT * FROM commitments WHERE profile_id = '${userId}'`),
      query<{
        id: string;
        profile_id: string;
        log_date: string;
        energy_level: 1 | 2 | 3 | 4 | 5;
        mood_score: 1 | 2 | 3 | 4 | 5;
        stress_level: 1 | 2 | 3 | 4 | 5;
        hours_slept: number;
        notes: string;
      }>(`SELECT * FROM energy_logs WHERE profile_id = '${userId}'
          AND log_date >= CURRENT_DATE - INTERVAL 30 DAY ORDER BY log_date DESC`),
    ]);

    // Convert to proper types
    const academicEvents: AcademicEvent[] = academicEventsRows.map((e) => ({
      id: e.id,
      userId: e.profile_id,
      type: e.event_type,
      name: e.event_name,
      startDate: new Date(e.start_date),
      endDate: new Date(e.end_date),
      capacityImpact: e.capacity_impact,
      priority: e.priority,
      isRecurring: e.is_recurring,
      recurrencePattern: e.recurrence_pattern as 'weekly' | 'monthly' | 'semester' | undefined,
    }));

    const commitments: Commitment[] = commitmentsRows.map((c) => ({
      id: c.id,
      userId: c.profile_id,
      type: c.commitment_type,
      name: c.commitment_name,
      hoursPerWeek: c.hours_per_week,
      flexibleHours: c.flexible_hours,
      dayPreferences: c.day_preferences,
      priority: c.priority,
    }));

    const energyHistory: EnergyLog[] = energyLogsRows.map((e) => ({
      id: e.id,
      userId: e.profile_id,
      date: new Date(e.log_date),
      energyLevel: e.energy_level,
      moodScore: e.mood_score,
      stressLevel: e.stress_level,
      hoursSlept: e.hours_slept,
      notes: e.notes,
    }));

    // Build retroplan input
    const retroplanInput: RetroplanInput = {
      goalId: basePlan.goalId,
      userId,
      goalAmount: input.goalAmount,
      deadline: input.goalDeadline,
      goalName: input.goalName,
      userProfile: {
        skills: input.userProfile.skills,
        monthlyIncome: input.userProfile.monthlyIncome,
        monthlyExpenses: input.userProfile.monthlyExpenses,
        availableHours: input.userProfile.availableHours,
        defaultHourlyRate: 15, // Default hourly rate
      },
      academicEvents,
      commitments,
      energyHistory,
      preferences: input.preferences || {
        preferFrontLoading: true,
        protectWeekends: false,
        energyTrackingEnabled: energyHistory.length > 0,
      },
    };

    // Generate retroplan
    const retroplan = await generateRetroplan(retroplanInput);

    // Save retroplan to database
    try {
      await execute(`
        INSERT INTO retroplans (id, goal_id, profile_id, config, milestones, total_weeks,
                                high_capacity_weeks, medium_capacity_weeks, low_capacity_weeks,
                                protected_weeks, feasibility_score, confidence_low, confidence_high,
                                risk_factors, front_loaded_percentage, is_active)
        VALUES ('${retroplan.id}', '${basePlan.goalId}', '${userId}',
                '${JSON.stringify(retroplan.config)}',
                '${JSON.stringify(retroplan.milestones)}',
                ${retroplan.totalWeeks}, ${retroplan.highCapacityWeeks},
                ${retroplan.mediumCapacityWeeks}, ${retroplan.lowCapacityWeeks},
                ${retroplan.protectedWeeks}, ${retroplan.feasibilityScore},
                ${retroplan.confidenceInterval.low}, ${retroplan.confidenceInterval.high},
                '${JSON.stringify(retroplan.riskFactors)}',
                ${retroplan.frontLoadedPercentage}, TRUE)
      `);
    } catch (error) {
      console.error('Failed to save retroplan:', error);
    }

    span.setAttributes({
      'retroplan.id': retroplan.id,
      'retroplan.feasibility': retroplan.feasibilityScore,
      'retroplan.total_weeks': retroplan.totalWeeks,
      'retroplan.protected_weeks': retroplan.protectedWeeks,
      'retroplan.front_loaded_pct': retroplan.frontLoadedPercentage,
    });

    return {
      ...basePlan,
      retroplan,
      capacityAware: true,
      // Override analysis with capacity-aware data
      analysis: {
        ...basePlan.analysis,
        feasibilityScore: retroplan.feasibilityScore,
        riskFactors: [...basePlan.analysis.riskFactors, ...retroplan.riskFactors],
      },
    };
  });
}

export default { runGoalPlanningWorkflow, runRetroplanningWorkflow };
