/**
 * Goals API Route
 *
 * Handles goal management operations.
 * This bridges the frontend to the goal tools in the MCP server.
 */

import type { APIEvent } from '@solidjs/start/server';

// For the hackathon, we'll store goals in memory
// In production, this would call the MCP server's DuckDB tools
interface Goal {
  id: string;
  userId: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  minimumBudget: number;
  status: 'active' | 'completed' | 'abandoned';
  feasibilityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  weeklyTarget: number;
  createdAt: string;
  plan?: GoalPlan;
}

interface GoalPlan {
  strategies: Strategy[];
  milestones: Milestone[];
  achievements: Achievement[];
}

interface Strategy {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  name: string;
  monthlyImpact: number;
  effort: 'low' | 'medium' | 'high';
  description: string;
}

interface Milestone {
  weekNumber: number;
  targetAmount: number;
  cumulativeTarget: number;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  actions: string[];
  earnedAmount?: number;
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

// In-memory storage (would be DuckDB in production)
const goalsStore: Map<string, Goal> = new Map();

// Helper to generate UUID
function generateId(): string {
  return 'goal_' + Math.random().toString(36).substring(2, 15);
}

// Calculate weekly target
function calculateWeeklyTarget(amount: number, deadline: string): number {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const weeksRemaining = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weeksRemaining > 0 ? Math.ceil(amount / weeksRemaining) : amount;
}

// Calculate feasibility score
function calculateFeasibility(
  amount: number,
  weeklyTarget: number,
  minimumBudget: number
): { score: number; risk: 'low' | 'medium' | 'high' } {
  // Simple heuristic: if weekly target is reasonable, it's feasible
  const avgMonthlyEarningPotential = 400; // Estimate for student
  const monthlyTarget = weeklyTarget * 4;

  if (monthlyTarget <= avgMonthlyEarningPotential * 0.5) {
    return { score: 0.9, risk: 'low' };
  } else if (monthlyTarget <= avgMonthlyEarningPotential) {
    return { score: 0.7, risk: 'medium' };
  } else {
    return { score: 0.4, risk: 'high' };
  }
}

// Generate strategies based on profile
function generateStrategies(profile: any): Strategy[] {
  const strategies: Strategy[] = [];

  // Always suggest optimizations
  strategies.push({
    id: 'opt_food',
    type: 'optimization',
    name: 'Resto U CROUS',
    monthlyImpact: 100,
    effort: 'low',
    description: 'Manger au CROUS plutot que de cuisiner ou commander',
  });

  // Check skills for jobs
  if (profile?.skills?.includes('python') || profile?.skills?.includes('javascript')) {
    strategies.push({
      id: 'job_freelance',
      type: 'job',
      name: 'Dev Freelance (Malt)',
      monthlyImpact: 500,
      effort: 'medium',
      description: '10h/semaine de freelance dev a 25€/h',
    });
  }

  // Side hustles
  strategies.push({
    id: 'hustle_delivery',
    type: 'hustle',
    name: 'Livraison (Uber Eats)',
    monthlyImpact: 300,
    effort: 'medium',
    description: 'Livraisons le soir et week-end',
  });

  strategies.push({
    id: 'sell_stuff',
    type: 'selling',
    name: 'Vente objets inutiles',
    monthlyImpact: 150,
    effort: 'low',
    description: 'Vendre sur Leboncoin/Vinted',
  });

  return strategies;
}

// Generate milestones
function generateMilestones(amount: number, weeklyTarget: number, deadline: string): Milestone[] {
  const milestones: Milestone[] = [];
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const weeksRemaining = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  for (let week = 1; week <= Math.min(weeksRemaining, 12); week++) {
    milestones.push({
      weekNumber: week,
      targetAmount: weeklyTarget,
      cumulativeTarget: weeklyTarget * week,
      status: week === 1 ? 'in_progress' : 'pending',
      actions: week <= 2 ? ['Vendre des objets', 'Optimiser depenses'] : ['Continuer les efforts'],
    });
  }

  return milestones;
}

// Generate achievements
function generateAchievements(): Achievement[] {
  return [
    {
      id: 'first_100',
      name: 'First Blood',
      icon: '💰',
      description: 'Gagner 100€',
      unlocked: false,
    },
    {
      id: 'halfway',
      name: 'Mi-chemin',
      icon: '🎯',
      description: 'Atteindre 50%',
      unlocked: false,
    },
    {
      id: 'streak_4',
      name: 'On Fire',
      icon: '🔥',
      description: '4 semaines consecutives',
      unlocked: false,
    },
    {
      id: 'diversified',
      name: 'Diversifie',
      icon: '📈',
      description: '3+ sources de revenus',
      unlocked: false,
    },
    {
      id: 'goal_achieved',
      name: 'Objectif!',
      icon: '🏆',
      description: "Atteindre l'objectif",
      unlocked: false,
    },
  ];
}

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { action } = body;

    switch (action) {
      case 'create': {
        const { goalName, goalAmount, goalDeadline, minimumBudget, profile } = body;

        const weeklyTarget = calculateWeeklyTarget(goalAmount, goalDeadline);
        const { score, risk } = calculateFeasibility(goalAmount, weeklyTarget, minimumBudget || 0);

        const goal: Goal = {
          id: generateId(),
          userId: profile?.name || 'anonymous',
          goalName,
          goalAmount,
          goalDeadline,
          minimumBudget: minimumBudget || 0,
          status: 'active',
          feasibilityScore: score,
          riskLevel: risk,
          weeklyTarget,
          createdAt: new Date().toISOString(),
          plan: {
            strategies: generateStrategies(profile),
            milestones: generateMilestones(goalAmount, weeklyTarget, goalDeadline),
            achievements: generateAchievements(),
          },
        };

        goalsStore.set(goal.id, goal);

        return new Response(JSON.stringify(goal), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'list': {
        const goals = Array.from(goalsStore.values());
        return new Response(JSON.stringify({ goals }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'get': {
        const { goalId } = body;
        const goal = goalsStore.get(goalId);

        if (!goal) {
          return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(goal), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'update_progress': {
        const { goalId, weekNumber, earnedAmount, actionsCompleted } = body;
        const goal = goalsStore.get(goalId);

        if (!goal || !goal.plan) {
          return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Update milestone
        const milestone = goal.plan.milestones.find((m) => m.weekNumber === weekNumber);
        if (milestone) {
          milestone.earnedAmount = earnedAmount;
          milestone.status = earnedAmount >= milestone.targetAmount ? 'completed' : 'in_progress';
        }

        // Calculate total earned
        const totalEarned = goal.plan.milestones.reduce(
          (sum, m) => sum + (m.earnedAmount || 0),
          0
        );

        // Check achievements
        if (totalEarned >= 100) {
          const firstBlood = goal.plan.achievements.find((a) => a.id === 'first_100');
          if (firstBlood && !firstBlood.unlocked) {
            firstBlood.unlocked = true;
            firstBlood.unlockedAt = new Date().toISOString();
          }
        }

        if (totalEarned >= goal.goalAmount / 2) {
          const halfway = goal.plan.achievements.find((a) => a.id === 'halfway');
          if (halfway && !halfway.unlocked) {
            halfway.unlocked = true;
            halfway.unlockedAt = new Date().toISOString();
          }
        }

        if (totalEarned >= goal.goalAmount) {
          goal.status = 'completed';
          const achieved = goal.plan.achievements.find((a) => a.id === 'goal_achieved');
          if (achieved && !achieved.unlocked) {
            achieved.unlocked = true;
            achieved.unlockedAt = new Date().toISOString();
          }
        }

        goalsStore.set(goal.id, goal);

        return new Response(
          JSON.stringify({
            goal,
            totalEarned,
            progressPercent: Math.round((totalEarned / goal.goalAmount) * 100),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(JSON.stringify({ error: true, message: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Goals API error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
