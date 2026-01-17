/**
 * Swipe API Route
 *
 * Handles swipe scenarios generation and preference learning.
 * Actions: roll_dice, record_decision, get_preferences, reset_session
 */

import type { APIEvent } from '@solidjs/start/server';

// Types
export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade';
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number;
  flexibilityScore: number;
  hourlyRate: number;
}

export interface UserPreferences {
  effortSensitivity: number;
  hourlyRatePriority: number;
  timeFlexibility: number;
  incomeStability: number;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeDecision {
  scenarioId: string;
  decision: SwipeDirection;
  timeSpent: number;
  timestamp: string;
}

export interface SwipeSession {
  id: string;
  userId: string;
  preferences: UserPreferences;
  decisions: SwipeDecision[];
  scenarios: Scenario[];
  acceptedScenarios: Scenario[];
  rejectedScenarios: Scenario[];
  mehScenarioIds: string[];
  createdAt: string;
  updatedAt: string;
}

// In-memory storage (hackathon MVP)
const sessionsStore: Map<string, SwipeSession> = new Map();

// Helper to generate UUID
function generateId(): string {
  return 'swipe_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
}

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  effortSensitivity: 0.5,
  hourlyRatePriority: 0.5,
  timeFlexibility: 0.5,
  incomeStability: 0.5,
};

// Preference learning algorithm
function updatePreferences(
  currentPrefs: UserPreferences,
  scenario: Scenario,
  direction: SwipeDirection
): UserPreferences {
  const learningRate = 0.15;

  const multipliers: Record<SwipeDirection, number> = {
    right: 1.0,
    left: -1.0,
    up: 1.5,
    down: -0.3,
  };
  const multiplier = multipliers[direction];

  const normalizedEffort = scenario.effortLevel / 5;
  const normalizedRate = scenario.hourlyRate > 20 ? 1 : scenario.hourlyRate / 20;
  const normalizedFlexibility = scenario.flexibilityScore / 5;
  const stabilitySignal = scenario.category === 'freelance' ? 0.3 : 0.7;

  const clamp = (value: number) => Math.max(0, Math.min(1, value));

  return {
    effortSensitivity: clamp(
      currentPrefs.effortSensitivity + learningRate * multiplier * (1 - normalizedEffort)
    ),
    hourlyRatePriority: clamp(
      currentPrefs.hourlyRatePriority + learningRate * multiplier * normalizedRate
    ),
    timeFlexibility: clamp(
      currentPrefs.timeFlexibility + learningRate * multiplier * normalizedFlexibility
    ),
    incomeStability: clamp(
      currentPrefs.incomeStability + learningRate * multiplier * stabilitySignal
    ),
  };
}

// Score scenarios based on preferences
function scoreScenario(scenario: Scenario, prefs: UserPreferences): number {
  const effortScore = (1 - prefs.effortSensitivity) * (1 - scenario.effortLevel / 5);
  const rateScore = prefs.hourlyRatePriority * (scenario.hourlyRate / 30);
  const flexScore = prefs.timeFlexibility * (scenario.flexibilityScore / 5);
  const stabilityScore = prefs.incomeStability * (scenario.category === 'freelance' ? 0.3 : 0.7);

  return effortScore + rateScore + flexScore + stabilityScore;
}

// Generate scenarios from profile data
function generateScenarios(
  skills?: { name: string; hourlyRate: number }[],
  items?: { name: string; estimatedValue: number }[],
  lifestyle?: { name: string; optimizedCost?: number; currentCost: number }[],
  trades?: { name: string; value: number }[]
): Scenario[] {
  const scenarios: Scenario[] = [];

  // Skill-based scenarios
  skills?.forEach((skill, index) => {
    scenarios.push({
      id: `skill_${index}`,
      title: `Freelance ${skill.name}`,
      description: `Offer ${skill.name} services on platforms like Malt or Fiverr`,
      category: 'freelance',
      weeklyHours: 5,
      weeklyEarnings: skill.hourlyRate * 5,
      effortLevel: 4,
      flexibilityScore: 5,
      hourlyRate: skill.hourlyRate,
    });

    scenarios.push({
      id: `tutoring_${index}`,
      title: `${skill.name} Tutoring`,
      description: `Give ${skill.name} tutoring sessions to students`,
      category: 'tutoring',
      weeklyHours: 3,
      weeklyEarnings: (skill.hourlyRate - 3) * 3,
      effortLevel: 3,
      flexibilityScore: 4,
      hourlyRate: skill.hourlyRate - 3,
    });
  });

  // Item-based scenarios
  items?.forEach((item, index) => {
    scenarios.push({
      id: `sell_${index}`,
      title: `Sell ${item.name}`,
      description: `List ${item.name} for sale on eBay or Craigslist`,
      category: 'selling',
      weeklyHours: 1,
      weeklyEarnings: Math.round(item.estimatedValue / 2),
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: Math.round(item.estimatedValue / 2),
    });
  });

  // Lifestyle optimization scenarios
  const totalSavings =
    lifestyle?.reduce((sum, item) => {
      if (item.optimizedCost !== undefined) {
        return sum + (item.currentCost - item.optimizedCost);
      }
      return sum;
    }, 0) || 0;

  if (totalSavings > 0) {
    scenarios.push({
      id: 'lifestyle_opt',
      title: 'Optimize expenses',
      description: `Apply lifestyle optimizations to save $${totalSavings}/month`,
      category: 'lifestyle',
      weeklyHours: 0,
      weeklyEarnings: Math.round(totalSavings / 4),
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: 0,
    });
  }

  // Trade-based scenarios
  trades?.forEach((trade, index) => {
    scenarios.push({
      id: `trade_${index}`,
      title: `Trade: ${trade.name}`,
      description: `Complete the ${trade.name} trade exchange`,
      category: 'trade',
      weeklyHours: 1,
      weeklyEarnings: trade.value,
      effortLevel: 2,
      flexibilityScore: 3,
      hourlyRate: trade.value,
    });
  });

  // Default scenarios if not enough data
  if (scenarios.length < 4) {
    const defaults: Scenario[] = [
      {
        id: 'default_1',
        title: 'Baby-sitting',
        description: 'Watch children in the evening or on weekends',
        category: 'freelance',
        weeklyHours: 4,
        weeklyEarnings: 48,
        effortLevel: 2,
        flexibilityScore: 3,
        hourlyRate: 12,
      },
      {
        id: 'default_2',
        title: 'Uber Eats Delivery',
        description: 'Deliver meals by bike or scooter',
        category: 'freelance',
        weeklyHours: 6,
        weeklyEarnings: 60,
        effortLevel: 3,
        flexibilityScore: 5,
        hourlyRate: 10,
      },
      {
        id: 'default_3',
        title: 'Homework Help',
        description: 'Help students with their homework',
        category: 'tutoring',
        weeklyHours: 3,
        weeklyEarnings: 45,
        effortLevel: 2,
        flexibilityScore: 4,
        hourlyRate: 15,
      },
      {
        id: 'default_4',
        title: 'Sell Clothes',
        description: 'Sort and sell clothes you no longer wear',
        category: 'selling',
        weeklyHours: 2,
        weeklyEarnings: 30,
        effortLevel: 1,
        flexibilityScore: 5,
        hourlyRate: 15,
      },
    ];

    defaults.forEach((d) => {
      if (!scenarios.find((s) => s.id === d.id)) {
        scenarios.push(d);
      }
    });
  }

  return scenarios.slice(0, 8);
}

// Interpret preferences for human-readable output
function interpretPreferences(prefs: UserPreferences): {
  profile: string;
  recommendations: string[];
} {
  const traits: string[] = [];
  const recommendations: string[] = [];

  if (prefs.effortSensitivity > 0.6) {
    traits.push('prefers low-effort work');
    recommendations.push('Focus on selling items and passive income');
  } else if (prefs.effortSensitivity < 0.4) {
    traits.push('willing to put in effort');
    recommendations.push('Consider freelance work for higher pay');
  }

  if (prefs.hourlyRatePriority > 0.6) {
    traits.push('prioritizes high pay');
    recommendations.push('Look for specialized tutoring or consulting');
  } else if (prefs.hourlyRatePriority < 0.4) {
    traits.push('flexible on pay');
    recommendations.push('Volume-based work like deliveries could work');
  }

  if (prefs.timeFlexibility > 0.6) {
    traits.push('needs flexible schedule');
    recommendations.push('Freelance platforms offer best flexibility');
  } else if (prefs.timeFlexibility < 0.4) {
    traits.push('can commit to fixed hours');
    recommendations.push('Regular tutoring sessions may suit you');
  }

  if (prefs.incomeStability > 0.6) {
    traits.push('prefers stable income');
    recommendations.push('Consider recurring tutoring or part-time jobs');
  } else if (prefs.incomeStability < 0.4) {
    traits.push('okay with variable income');
    recommendations.push('Gig work and selling items are good options');
  }

  return {
    profile: traits.length > 0 ? traits.join(', ') : 'balanced preferences',
    recommendations: recommendations.length > 0 ? recommendations : ['Keep exploring options!'],
  };
}

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { action, userId = 'anonymous' } = body;

    switch (action) {
      case 'roll_dice': {
        const { skills, items, lifestyle, trades, sessionId } = body;

        // Generate scenarios
        const scenarios = generateScenarios(skills, items, lifestyle, trades);

        // Create or update session
        let session = sessionId ? sessionsStore.get(sessionId) : null;

        if (!session) {
          session = {
            id: generateId(),
            userId,
            preferences: { ...DEFAULT_PREFERENCES },
            decisions: [],
            scenarios,
            acceptedScenarios: [],
            rejectedScenarios: [],
            mehScenarioIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        } else {
          session.scenarios = scenarios;
          session.updatedAt = new Date().toISOString();
        }

        sessionsStore.set(session.id, session);

        // Sort scenarios by score for optimal presentation
        const scoredScenarios = scenarios
          .map((s) => ({ ...s, score: scoreScenario(s, session!.preferences) }))
          .sort((a, b) => b.score - a.score);

        return new Response(
          JSON.stringify({
            sessionId: session.id,
            scenarios: scoredScenarios,
            preferences: session.preferences,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'record_decision': {
        const { sessionId, scenarioId, decision, timeSpent } = body;

        const session = sessionsStore.get(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ error: true, message: 'Session not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const scenario = session.scenarios.find((s) => s.id === scenarioId);
        if (!scenario) {
          return new Response(JSON.stringify({ error: true, message: 'Scenario not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Record decision
        const swipeDecision: SwipeDecision = {
          scenarioId,
          decision,
          timeSpent: timeSpent || 0,
          timestamp: new Date().toISOString(),
        };
        session.decisions.push(swipeDecision);

        // Update accepted/rejected lists
        const isAccepted = decision === 'right' || decision === 'up';
        if (isAccepted) {
          session.acceptedScenarios.push(scenario);
        } else {
          session.rejectedScenarios.push(scenario);
        }

        // Track "meh" (down swipe = strong dislike)
        if (decision === 'down') {
          session.mehScenarioIds.push(scenarioId);
        }

        // Update preferences using learning algorithm
        session.preferences = updatePreferences(session.preferences, scenario, decision);
        session.updatedAt = new Date().toISOString();

        sessionsStore.set(sessionId, session);

        return new Response(
          JSON.stringify({
            success: true,
            preferences: session.preferences,
            acceptedCount: session.acceptedScenarios.length,
            rejectedCount: session.rejectedScenarios.length,
            remainingCount:
              session.scenarios.length -
              session.acceptedScenarios.length -
              session.rejectedScenarios.length,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get_preferences': {
        const { sessionId } = body;

        const session = sessionsStore.get(sessionId);
        if (!session) {
          return new Response(
            JSON.stringify({
              preferences: DEFAULT_PREFERENCES,
              interpretation: interpretPreferences(DEFAULT_PREFERENCES),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify({
            preferences: session.preferences,
            interpretation: interpretPreferences(session.preferences),
            stats: {
              totalDecisions: session.decisions.length,
              accepted: session.acceptedScenarios.length,
              rejected: session.rejectedScenarios.length,
              meh: session.mehScenarioIds.length,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get_session': {
        const { sessionId } = body;

        const session = sessionsStore.get(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ error: true, message: 'Session not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'reset_session': {
        const { sessionId } = body;

        if (sessionId) {
          sessionsStore.delete(sessionId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Session reset',
            newPreferences: DEFAULT_PREFERENCES,
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
    console.error('Swipe API error:', error);
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
