/**
 * Agent Executor
 *
 * Provides direct execution of agent logic for the tab-tips orchestrator.
 * This bridges the Strategy pattern orchestration with the actual agent algorithms.
 *
 * Note: Instead of calling Mastra tools directly (which have complex union types),
 * we extract and call the core logic functions directly for cleaner code.
 */

import { createLogger } from '../services/logger.js';
import type { TabContext } from './strategies/types.js';
import {
  calculateArbitrageScore,
  type Skill as ArbitrageSkill,
  DEFAULT_WEIGHTS,
} from '../algorithms/skill-arbitrage.js';

const logger = createLogger('AgentExecutor');

// ============================================================================
// Types
// ============================================================================

export interface AgentAnalysis {
  agentId: string;
  recommendation: string;
  confidence: number;
  data?: Record<string, unknown>;
}

// ============================================================================
// Budget Coach Executor
// ============================================================================

export async function executeBudgetCoach(context: TabContext): Promise<AgentAnalysis> {
  logger.debug('Executing budget-coach agent', { profileId: context.profileId });

  try {
    const monthlyIncome = context.budget?.monthlyIncome || 0;
    const monthlyExpenses = context.budget?.monthlyExpenses || 0;
    const margin = context.monthlyMargin ?? monthlyIncome - monthlyExpenses;

    // Analyze budget status
    const status = margin >= 0 ? 'positive' : 'deficit';
    const severity =
      margin < -100 ? 'critical' : margin < 0 ? 'warning' : margin < 50 ? 'tight' : 'comfortable';
    const savingsRate = monthlyIncome > 0 ? Math.round((margin / monthlyIncome) * 100) : 0;

    // Generate advice based on margin
    const advice: string[] = [];
    if (margin < 0) {
      advice.push(
        'Priority: reduce the deficit. Look for financial aid or a compatible part-time job.'
      );
    } else if (margin < 50) {
      advice.push('Your margin is tight. Building a small safety cushion is recommended.');
    } else if (margin < 200) {
      advice.push('Good balance! You can start saving regularly.');
    } else {
      advice.push('Excellent margin! You have flexibility to invest in yourself.');
    }

    // Find optimizations if margin is tight
    const optimizations: string[] = [];
    if (margin < 100 && context.budget?.expenses) {
      const expenses = context.budget.expenses;
      const housingCost =
        expenses.find((e) => e.category.toLowerCase().includes('housing'))?.amount || 0;
      const foodCost = expenses.find((e) => e.category.toLowerCase().includes('food'))?.amount || 0;

      if (housingCost > 0 && housingCost > monthlyIncome * 0.4) {
        optimizations.push('Consider roommates or alternative housing to reduce rent.');
      }
      if (foodCost > 0 && foodCost > 300) {
        optimizations.push('Meal prep and cooking can reduce food expenses by 30-40%.');
      }
    }

    // Build recommendation
    const parts: string[] = [];
    if (status === 'positive') {
      if (severity === 'comfortable') {
        parts.push(`Great! You have a healthy margin of €${margin}/month.`);
      } else {
        parts.push(`You're balanced with €${margin}/month margin.`);
      }
    } else {
      parts.push(`Attention: ${severity} deficit of €${Math.abs(margin)}/month.`);
    }
    if (advice.length > 0) parts.push(advice[0]);
    if (optimizations.length > 0) parts.push(`Tip: ${optimizations[0]}`);

    return {
      agentId: 'budget-coach',
      recommendation: parts.join(' '),
      confidence: status === 'positive' ? 0.85 : 0.75,
      data: {
        margin,
        status,
        severity,
        savingsRate,
        adviceCount: advice.length,
        optimizationsCount: optimizations.length,
      },
    };
  } catch (error) {
    logger.warn('Budget coach execution failed', { error });
    return {
      agentId: 'budget-coach',
      recommendation: 'Add your income and expenses to get personalized budget advice.',
      confidence: 0.3,
      data: { error: true },
    };
  }
}

// ============================================================================
// Job Matcher Executor
// ============================================================================

// Job database for matching
const JOB_DATABASE = [
  {
    id: 'freelance_dev',
    name: 'Freelance Developer',
    hourlyRate: 25,
    skills: ['python', 'javascript', 'sql', 'web'],
    coBenefit: 'Resume builder + portfolio',
    marketDemand: 5,
    effort: 4,
  },
  {
    id: 'tutoring',
    name: 'Private Tutoring',
    hourlyRate: 20,
    skills: ['python', 'math', 'english', 'writing'],
    coBenefit: 'Reinforces learning',
    marketDemand: 5,
    effort: 3,
  },
  {
    id: 'data_entry',
    name: 'Data Entry',
    hourlyRate: 12,
    skills: ['excel', 'sql'],
    coBenefit: 'Automation opportunity',
    marketDemand: 4,
    effort: 1,
  },
  {
    id: 'community_manager',
    name: 'Community Manager',
    hourlyRate: 15,
    skills: ['social_media', 'writing', 'design'],
    coBenefit: 'Digital industry insights',
    marketDemand: 4,
    effort: 2,
  },
  {
    id: 'research_assistant',
    name: 'Research Assistant',
    hourlyRate: 12,
    skills: ['python', 'sql', 'writing'],
    coBenefit: 'Academic network',
    marketDemand: 3,
    effort: 4,
  },
  {
    id: 'translator',
    name: 'Freelance Translator',
    hourlyRate: 18,
    skills: ['languages', 'writing'],
    coBenefit: 'International clients',
    marketDemand: 3,
    effort: 2,
  },
];

export async function executeJobMatcher(context: TabContext): Promise<AgentAnalysis> {
  logger.debug('Executing job-matcher agent', { profileId: context.profileId });

  try {
    const skills = context.jobs?.skills?.map((s) => s.name) || context.profile?.skills || [];

    if (skills.length === 0) {
      return {
        agentId: 'job-matcher',
        recommendation: 'Add your skills to discover matching job opportunities.',
        confidence: 0.5,
        data: { fallback: true },
      };
    }

    const skillsLower = skills.map((s) => s.toLowerCase());
    const minRate = context.profile?.minHourlyRate || 0;

    // Match jobs
    const matches = JOB_DATABASE.filter((job) => job.hourlyRate >= minRate)
      .map((job) => {
        const matchingSkills = job.skills.filter((s) => skillsLower.includes(s.toLowerCase()));
        const skillScore = job.skills.length > 0 ? matchingSkills.length / job.skills.length : 0;
        const score = skillScore * 0.4 + (job.hourlyRate / 30) * 0.3 + 0.2;
        return { ...job, matchScore: Math.min(1, score), matchingSkills };
      })
      .filter((job) => job.matchScore > 0.1)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    if (matches.length === 0) {
      return {
        agentId: 'job-matcher',
        recommendation:
          'No direct matches found. Consider adding more skills or exploring new areas.',
        confidence: 0.6,
        data: { matchesFound: 0 },
      };
    }

    const topMatch = matches[0];
    const parts: string[] = [];
    parts.push(
      `Top match: ${topMatch.name} at €${topMatch.hourlyRate}/h (${Math.round(topMatch.matchScore * 100)}% fit).`
    );
    if (topMatch.coBenefit) parts.push(`Bonus: ${topMatch.coBenefit}.`);
    if (matches.length > 1) parts.push(`${matches.length - 1} other opportunities available.`);

    return {
      agentId: 'job-matcher',
      recommendation: parts.join(' '),
      confidence: Math.min(0.9, topMatch.matchScore + 0.1),
      data: {
        topMatch: topMatch.name,
        topMatchScore: topMatch.matchScore,
        hourlyRate: topMatch.hourlyRate,
        matchesFound: matches.length,
        skillsUsed: skills.length,
      },
    };
  } catch (error) {
    logger.warn('Job matcher execution failed', { error });
    return {
      agentId: 'job-matcher',
      recommendation: 'Unable to match jobs at this time.',
      confidence: 0.3,
      data: { error: true },
    };
  }
}

// ============================================================================
// Money Maker Executor
// ============================================================================

// Side hustles database
const SIDE_HUSTLES = [
  {
    id: 'tutoring',
    name: 'Tutoring',
    monthlyPotential: 300,
    skills: ['math', 'english', 'python'],
    effort: 'medium',
  },
  {
    id: 'freelance_dev',
    name: 'Freelance Development',
    monthlyPotential: 500,
    skills: ['python', 'javascript', 'web'],
    effort: 'high',
  },
  {
    id: 'reselling',
    name: 'Reselling (Vinted, eBay)',
    monthlyPotential: 150,
    skills: [],
    effort: 'low',
  },
  { id: 'delivery', name: 'Food Delivery', monthlyPotential: 400, skills: [], effort: 'medium' },
  {
    id: 'content_creation',
    name: 'Content Creation',
    monthlyPotential: 200,
    skills: ['writing', 'video', 'design'],
    effort: 'medium',
  },
];

export async function executeMoneyMaker(context: TabContext): Promise<AgentAnalysis> {
  logger.debug('Executing money-maker agent', { profileId: context.profileId });

  try {
    const inventory = context.trade?.inventory || [];
    const trades = context.trade?.trades || [];
    const skills = (context.profile?.skills || []).map((s) => s.toLowerCase());

    // Find best matching hustle
    const hustleMatches = SIDE_HUSTLES.map((hustle) => {
      const skillMatch =
        hustle.skills.length > 0
          ? hustle.skills.filter((s) => skills.includes(s.toLowerCase())).length /
            hustle.skills.length
          : 0.5;
      return { ...hustle, matchScore: skillMatch };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const topHustle = hustleMatches[0];

    // Calculate inventory potential
    const inventoryPotential = inventory
      .slice(0, 3)
      .reduce((sum, item) => sum + (item.estimatedValue || 0), 0);

    // Build recommendation
    const parts: string[] = [];
    if (topHustle) {
      parts.push(`Side hustle idea: ${topHustle.name} (~€${topHustle.monthlyPotential}/month).`);
    }
    if (inventoryPotential > 0) {
      parts.push(`You have ~€${inventoryPotential} in items to sell.`);
    } else if (inventory.length === 0) {
      parts.push('Add items you could sell to estimate earnings.');
    }
    if (trades.filter((t) => t.status === 'active').length > 0) {
      parts.push(
        `${trades.filter((t) => t.status === 'active').length} active trades in progress.`
      );
    }

    return {
      agentId: 'money-maker',
      recommendation:
        parts.length > 0
          ? parts.join(' ')
          : 'Explore trading and side hustles to boost your savings.',
      confidence: 0.75,
      data: {
        topHustle: topHustle?.name,
        hustleMonthlyPotential: topHustle?.monthlyPotential,
        inventoryPotential,
        inventoryItems: inventory.length,
        activeTrades: trades.filter((t) => t.status === 'active').length,
      },
    };
  } catch (error) {
    logger.warn('Money maker execution failed', { error });
    return {
      agentId: 'money-maker',
      recommendation: 'Explore side hustles and selling items to boost your income.',
      confidence: 0.4,
      data: { error: true },
    };
  }
}

// ============================================================================
// Strategy Comparator Executor
// ============================================================================

export async function executeStrategyComparator(context: TabContext): Promise<AgentAnalysis> {
  logger.debug('Executing strategy-comparator agent', { profileId: context.profileId });

  try {
    // Quick comparison if we have goals
    if (context.goals && context.goals.length > 0) {
      const topGoal = context.goals[0];
      const margin = context.monthlyMargin || 0;
      const deadline = topGoal.deadline ? new Date(topGoal.deadline) : null;
      const weeksRemaining = deadline
        ? Math.ceil((deadline.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))
        : 12;

      const weeklyNeed = topGoal.amount / Math.max(1, weeksRemaining);
      const savingsStrategy = margin > 0 ? `Save €${Math.round(margin)}/month from budget` : null;
      const workStrategy =
        weeklyNeed > 0 ? `Work ${Math.ceil(weeklyNeed / 15)}h/week at €15/h` : null;

      const parts: string[] = [];
      if (margin >= weeklyNeed * 4) {
        parts.push(
          `Your savings alone can reach €${topGoal.amount} in ${Math.ceil(topGoal.amount / margin)} months.`
        );
      } else if (savingsStrategy && workStrategy) {
        parts.push(
          `Combine savings (€${Math.round(margin)}/mo) with ${Math.ceil(weeklyNeed / 15)}h/week work to reach your goal.`
        );
      } else if (workStrategy) {
        parts.push(`Focus on earning: ${workStrategy} to reach €${topGoal.amount}.`);
      }

      return {
        agentId: 'strategy-comparator',
        recommendation:
          parts.length > 0
            ? parts.join(' ')
            : 'Compare different strategies to reach your goal faster.',
        confidence: 0.8,
        data: {
          goalName: topGoal.name,
          goalAmount: topGoal.amount,
          weeklyNeed,
          margin,
          weeksRemaining,
        },
      };
    }

    // Fallback for swipe context
    if (context.swipe) {
      return {
        agentId: 'strategy-comparator',
        recommendation: 'Swipe through scenarios to discover your preferred earning strategies.',
        confidence: 0.7,
        data: {
          scenariosCount: context.swipe.scenariosCount,
          hasPreferences: Object.keys(context.swipe.preferences || {}).length > 0,
        },
      };
    }

    return {
      agentId: 'strategy-comparator',
      recommendation: 'Set a goal to compare strategies for reaching it.',
      confidence: 0.5,
      data: { fallback: true },
    };
  } catch (error) {
    logger.warn('Strategy comparator execution failed', { error });
    return {
      agentId: 'strategy-comparator',
      recommendation: 'Unable to compare strategies at this time.',
      confidence: 0.3,
      data: { error: true },
    };
  }
}

// ============================================================================
// Guardian Executor
// ============================================================================

export async function executeGuardian(context: TabContext): Promise<AgentAnalysis> {
  logger.debug('Executing guardian agent', { profileId: context.profileId });

  try {
    const margin = context.monthlyMargin || 0;
    const energy = context.currentEnergy || 70;
    const hasGoal = context.goals && context.goals.length > 0;

    // Risk assessment
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let riskScore = 0;

    // Check margin
    if (margin < -100) {
      warnings.push('Critical deficit detected');
      riskLevel = 'critical';
      riskScore += 40;
    } else if (margin < 0) {
      warnings.push('Budget deficit');
      riskLevel = 'high';
      riskScore += 25;
    } else if (margin < 50) {
      suggestions.push('Build a small emergency buffer');
      riskScore += 10;
    }

    // Check energy
    if (energy < 40) {
      warnings.push('Low energy - take care of yourself first');
      riskScore += 20;
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Check profile completeness
    const profileFields = [
      context.profile?.name,
      context.profile?.diploma,
      context.profile?.skills?.length,
      context.profile?.city,
    ];
    const completeness = profileFields.filter(Boolean).length / profileFields.length;
    if (completeness < 0.5) {
      suggestions.push('Complete your profile for better recommendations');
    }

    // Build recommendation
    const parts: string[] = [];
    if (warnings.length > 0) {
      parts.push(`⚠️ Risk alert: ${warnings[0]}.`);
    }
    if (suggestions.length > 0 && parts.length === 0) {
      parts.push(`Suggestion: ${suggestions[0]}`);
    }

    return {
      agentId: 'guardian',
      recommendation:
        parts.length > 0
          ? parts.join(' ')
          : 'Your profile looks good! Keep tracking your progress.',
      confidence: 0.8,
      data: {
        riskLevel,
        riskScore,
        warnings: warnings.length,
        suggestions: suggestions.length,
        profileCompleteness: Math.round(completeness * 100),
      },
    };
  } catch (error) {
    logger.warn('Guardian execution failed', { error });
    return {
      agentId: 'guardian',
      recommendation: 'Keep your profile up to date for better recommendations.',
      confidence: 0.4,
      data: { error: true },
    };
  }
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute the appropriate agent based on agent ID
 */
export async function executeAgent(agentId: string, context: TabContext): Promise<AgentAnalysis> {
  switch (agentId) {
    case 'budget-coach':
      return executeBudgetCoach(context);
    case 'job-matcher':
      return executeJobMatcher(context);
    case 'money-maker':
      return executeMoneyMaker(context);
    case 'strategy-comparator':
      return executeStrategyComparator(context);
    case 'guardian':
      return executeGuardian(context);
    default:
      logger.warn('Unknown agent ID', { agentId });
      return {
        agentId,
        recommendation: `Analysis from ${agentId}`,
        confidence: 0.5,
        data: { unknown: true },
      };
  }
}
