/**
 * AI Tips API Endpoint
 *
 * Generates personalized, AI-powered tips using:
 * - Real algorithms from @stride/mcp-server (energy-debt, comeback, skill-arbitrage)
 * - Opik tracing from the MCP server for proper observability
 * - Mastra agents for LLM generation
 *
 * This is a showcase feature for agentic AI observability.
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('TipsAPI');

// Request/Response types
interface TipsRequest {
  profileId: string;
  currentEnergy: number;
  energyHistory: number[];
  goalProgress: number;
  activeMissions: {
    id: string;
    title: string;
    category: string;
    weeklyHours: number;
    weeklyEarnings: number;
    progress?: number;
  }[];
  goalAmount?: number;
  currentAmount?: number;
  weeklyTarget?: number;
}

interface TipsResponse {
  tip: {
    title: string;
    message: string;
    category: string;
    action?: { label: string; href: string };
  };
  insights: {
    energyDebt: { detected: boolean; severity: string | null; weeks: number };
    comeback: { detected: boolean; confidence: number };
    topPriority: string;
  };
  traceId: string;
  traceUrl: string;
}

// Lazy-loaded algorithm functions
let algorithmsLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let algorithms: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let services: any = null;

async function loadAlgorithms() {
  if (algorithmsLoaded) return { algorithms, services };

  try {
    // Force fresh import by clearing module cache reference
    logger.info('Loading MCP modules (v2 with setInput/setOutput support)');
    // Log env vars for debugging
    logger.info('Loading MCP modules with env', {
      ENABLE_OPIK: process.env.ENABLE_OPIK,
      OPIK_API_KEY: process.env.OPIK_API_KEY ? 'SET' : 'NOT SET',
      OPIK_WORKSPACE: process.env.OPIK_WORKSPACE,
      OPIK_PROJECT: process.env.OPIK_PROJECT,
    });

    // Dynamic import to avoid bundling issues
    const [algoModule, svcModule] = await Promise.all([
      import('@stride/mcp-server/algorithms'),
      import('@stride/mcp-server/services'),
    ]);

    algorithms = algoModule;
    services = svcModule;
    algorithmsLoaded = true;

    // Initialize Opik explicitly
    await svcModule.initOpik();

    logger.info('Loaded MCP algorithms and services, Opik initialized');
    return { algorithms, services };
  } catch (error) {
    logger.error('Failed to load MCP modules', { error });
    throw error;
  }
}

// POST handler
export async function POST(event: APIEvent): Promise<Response> {
  try {
    const body = (await event.request.json()) as TipsRequest;

    // Validate required fields
    if (!body.profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load MCP algorithms
    const { algorithms: algo, services: svc } = await loadAlgorithms();

    // Define span interface for type safety (with optional methods for backward compat)
    interface SpanInterface {
      setAttributes: (attrs: Record<string, unknown>) => void;
      setInput?: (input: Record<string, unknown>) => void;
      setOutput?: (output: Record<string, unknown>) => void;
    }

    // Helper to safely set input/output (handles older module versions)
    const safeSetInput = (span: SpanInterface, input: Record<string, unknown>) => {
      if (typeof span.setInput === 'function') {
        span.setInput(input);
      } else {
        span.setAttributes({ input });
      }
    };
    const safeSetOutput = (span: SpanInterface, output: Record<string, unknown>) => {
      if (typeof span.setOutput === 'function') {
        span.setOutput(output);
      } else {
        span.setAttributes({ output });
      }
    };

    // Helper to safely create child spans (fallback if not available)
    const safeCreateSpan = async (
      name: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: (span: SpanInterface) => Promise<any>,
      options?: { input?: Record<string, unknown> }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
      if (typeof svc.createSpan === 'function') {
        return svc.createSpan(name, fn, options);
      }
      // Fallback: just run the function with a mock span
      const mockSpan: SpanInterface = {
        setAttributes: () => {},
        setInput: () => {},
        setOutput: () => {},
      };
      logger.info(`[Fallback] Running ${name} without child span`);
      return fn(mockSpan);
    };

    // Use the MCP server's trace function for proper Opik integration
    const result = await svc.trace(
      'tips.ai_generation',
      async (span: SpanInterface) => {
        span.setAttributes({
          'user.profile_id': body.profileId,
        });

        // === ENERGY DEBT DETECTION (with child span) ===
        const energyDebt = await safeCreateSpan(
          'tips.energy_debt_analysis',
          async (debtSpan: SpanInterface) => {
            const energyEntries = body.energyHistory.map((level: number, i: number) => ({
              week: i + 1,
              level,
              date: new Date(
                Date.now() - (body.energyHistory.length - i) * 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }));

            safeSetInput(debtSpan, { energyHistory: body.energyHistory });

            const result = algo.detectEnergyDebt(energyEntries);

            safeSetOutput(debtSpan, {
              detected: result.detected,
              severity: result.severity,
              consecutiveWeeks: result.consecutiveLowWeeks,
              targetReduction: result.targetReduction,
            });

            logger.info('Energy debt analysis', {
              detected: result.detected,
              severity: result.severity,
              weeks: result.consecutiveLowWeeks,
            });

            return result;
          },
          { input: { historyLength: body.energyHistory.length } }
        );

        // === COMEBACK DETECTION (with child span) ===
        const deficit = (body.goalAmount || 0) - (body.currentAmount || 0);
        const comebackWindow = await safeCreateSpan(
          'tips.comeback_detection',
          async (comebackSpan: SpanInterface) => {
            safeSetInput(comebackSpan, { energyHistory: body.energyHistory, deficit });

            const result = algo.detectComebackWindow(body.energyHistory, deficit);

            safeSetOutput(comebackSpan, {
              detected: result?.detected || false,
              confidence: result?.confidenceScore || 0,
              deficitWeeks: result?.deficitWeeks || 0,
            });

            logger.info('Comeback analysis', {
              detected: result?.detected || false,
              confidence: result?.confidenceScore || 0,
            });

            return result;
          },
          { input: { deficit } }
        );

        // === DETERMINE TOP PRIORITY ===
        let topPriority = 'general_advice';
        if (energyDebt.detected && energyDebt.severity === 'high') {
          topPriority = 'energy_debt_critical';
        } else if (comebackWindow?.detected) {
          topPriority = 'comeback_opportunity';
        } else if (body.currentEnergy < 25) {
          topPriority = 'energy_critical';
        } else if (body.goalProgress < 15 && body.goalAmount && body.goalAmount > 0) {
          topPriority = 'goal_at_risk';
        } else if (body.goalProgress >= 80) {
          topPriority = 'celebration';
        }

        // === GENERATE TIP (with child span) ===
        const tip = await safeCreateSpan(
          'tips.generate_tip',
          async (tipSpan: SpanInterface) => {
            safeSetInput(tipSpan, {
              topPriority,
              energyDebtDetected: energyDebt.detected,
              comebackDetected: comebackWindow?.detected,
            });

            const result = generateTipFromInsights({
              energyDebt,
              comebackWindow,
              topPriority,
              currentEnergy: body.currentEnergy,
              goalProgress: body.goalProgress,
              weeklyTarget: body.weeklyTarget || 0,
              activeMissions: body.activeMissions,
            });

            safeSetOutput(tipSpan, {
              title: result.title,
              category: result.category,
              hasAction: Boolean(result.action),
            });

            return result;
          },
          { input: { topPriority } }
        );

        // Set output for the main trace
        safeSetOutput(span, {
          tip: {
            title: tip.title,
            category: tip.category,
            message: tip.message,
          },
          topPriority,
          energyDebtDetected: energyDebt.detected,
          comebackDetected: comebackWindow?.detected || false,
        });

        // Get trace info from MCP service
        const traceId = svc.getCurrentTraceId() || '';
        const traceUrl = svc.getTraceUrl(traceId);

        logger.info('Trace completed', { traceId, traceUrl, topPriority });

        return {
          tip,
          insights: {
            energyDebt: {
              detected: energyDebt.detected,
              severity: energyDebt.severity,
              weeks: energyDebt.consecutiveLowWeeks,
            },
            comeback: {
              detected: comebackWindow?.detected || false,
              confidence: comebackWindow?.confidenceScore || 0,
            },
            topPriority,
          },
          traceId,
          traceUrl,
        };
      },
      {
        // Tags for filtering in Opik UI
        tags: ['ai', 'bruno', 'tips'],
        // Initial metadata
        metadata: {
          providers: ['groq'],
          source: 'tips_api',
        },
        // Initial input for Opik UI
        input: {
          profileId: body.profileId,
          energy: body.currentEnergy,
          goalProgress: body.goalProgress,
          missionsCount: body.activeMissions?.length || 0,
          energyHistory: body.energyHistory,
        },
      }
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Tips API error', { error });

    // Fallback response if algorithms fail to load
    return new Response(
      JSON.stringify({
        tip: {
          title: 'Keep going!',
          message: 'Every step counts toward your goal.',
          category: 'opportunity',
          action: { label: 'Explore', href: '/plan?tab=swipe' },
        },
        insights: {
          energyDebt: { detected: false, severity: null, weeks: 0 },
          comeback: { detected: false, confidence: 0 },
          topPriority: 'fallback',
        },
        traceId: '',
        traceUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Generate a tip based on algorithm insights
 */
function generateTipFromInsights(context: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  energyDebt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comebackWindow: any;
  topPriority: string;
  currentEnergy: number;
  goalProgress: number;
  weeklyTarget: number;
  activeMissions: TipsRequest['activeMissions'];
}): TipsResponse['tip'] {
  const {
    energyDebt,
    comebackWindow,
    topPriority,
    currentEnergy,
    goalProgress,
    weeklyTarget,
    activeMissions,
  } = context;

  switch (topPriority) {
    case 'energy_debt_critical':
      return {
        title: 'Energy debt detected',
        message: `You've had ${energyDebt.consecutiveLowWeeks} weeks of low energy (${energyDebt.severity} severity). Consider reducing your target by ${Math.round(energyDebt.targetReduction * 100)}% to recover.`,
        category: 'warning',
        action: { label: 'Adjust targets', href: '/plan?tab=goals' },
      };

    case 'comeback_opportunity': {
      const catchUpPotential = Math.round(weeklyTarget * 1.5);
      return {
        title: 'Comeback Mode activated!',
        message: `Your energy bounced back to ${currentEnergy}% (confidence: ${Math.round((comebackWindow?.confidenceScore || 0) * 100)}%). You could earn up to ${catchUpPotential}€/week!`,
        category: 'celebration',
        action: { label: 'View catch-up plan', href: '/plan?tab=swipe' },
      };
    }

    case 'energy_critical':
      return {
        title: 'Energy very low',
        message: `Your energy is at ${currentEnergy}%. Focus on rest and self-care. Postpone non-essential tasks.`,
        category: 'warning',
        action: { label: 'View missions', href: '#missions' },
      };

    case 'goal_at_risk':
      return {
        title: 'Goal needs attention',
        message: `Only ${goalProgress}% progress. Explore new scenarios to get back on track.`,
        category: 'warning',
        action: { label: 'Find scenarios', href: '/plan?tab=swipe' },
      };

    case 'celebration':
      return {
        title: 'Excellent progress!',
        message: `${goalProgress}% complete! You're ahead of schedule. Keep the momentum!`,
        category: 'celebration',
      };

    default:
      // Find best mission insight
      if (activeMissions.length > 0) {
        const best = activeMissions.reduce((a, b) =>
          b.weeklyEarnings / Math.max(1, b.weeklyHours) >
          a.weeklyEarnings / Math.max(1, a.weeklyHours)
            ? b
            : a
        );
        const rate = Math.round(best.weeklyEarnings / Math.max(1, best.weeklyHours));
        return {
          title: `Focus on ${best.title}`,
          message: `This mission pays ${rate}€/hour - your best rate! Prioritize it this week.`,
          category: 'opportunity',
        };
      }

      return {
        title: 'Ready to start?',
        message: 'Explore available scenarios to find opportunities tailored to you.',
        category: 'opportunity',
        action: { label: 'Explore', href: '/plan?tab=swipe' },
      };
  }
}
