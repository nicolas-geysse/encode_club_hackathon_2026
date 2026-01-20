/**
 * Mastra Agent API Route
 *
 * Provides access to Mastra agents for complex reasoning and tool use.
 * Use this for tasks that benefit from specialized agents vs direct Groq calls.
 *
 * @see sprint-10-5.md Phase 4
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Agent');

// Agent instance cache (singleton pattern for performance)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let agentCache: Map<string, any> | null = null;

/**
 * Get or create agent instances (lazy loaded, singleton)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAgents(): Promise<Map<string, any>> {
  if (agentCache) {
    return agentCache;
  }

  try {
    // Dynamic import to avoid bundling issues with native modules
    const {
      createBudgetCoachAgent,
      createJobMatcherAgent,
      createGuardianAgent,
      createMoneyMakerAgent,
      createStrategyComparatorAgent,
      getOnboardingAgent,
    } = await import('@stride/mcp-server/agents');

    // Create all agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentCache = new Map<string, any>();

    // Create agents in parallel where possible
    const [budgetCoach, jobMatcher, guardian, moneyMaker, strategyComparator, onboarding] =
      await Promise.all([
        createBudgetCoachAgent(),
        createJobMatcherAgent(),
        createGuardianAgent(),
        createMoneyMakerAgent(),
        createStrategyComparatorAgent(),
        getOnboardingAgent(),
      ]);

    agentCache.set('budget-coach', budgetCoach);
    agentCache.set('job-matcher', jobMatcher);
    agentCache.set('guardian', guardian);
    agentCache.set('money-maker', moneyMaker);
    agentCache.set('strategy-comparator', strategyComparator);
    agentCache.set('onboarding', onboarding);

    logger.info('Agents initialized', { count: agentCache.size });
    return agentCache;
  } catch (error) {
    logger.error('Failed to initialize agents', { error });
    throw error;
  }
}

/**
 * Load profile from API
 */
async function loadProfile(profileId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `${process.env.INTERNAL_API_URL || 'http://localhost:3000'}/api/profiles?id=${profileId}`
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.warn('Failed to load profile', { profileId, error });
    return null;
  }
}

/**
 * POST /api/agent
 * Run a Mastra agent
 */
export async function POST({ request }: APIEvent) {
  try {
    const body = await request.json();
    const {
      message,
      profileId,
      agentType = 'budget-coach',
      context: additionalContext = {},
    } = body as {
      message: string;
      profileId?: string;
      agentType?: string;
      context?: Record<string, unknown>;
    };

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get agents
    const agents = await getAgents();
    const agent = agents.get(agentType);

    if (!agent) {
      return new Response(
        JSON.stringify({
          error: `Unknown agent type: ${agentType}`,
          availableAgents: Array.from(agents.keys()),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Load profile context if profileId provided
    let profile: Record<string, unknown> | null = null;
    if (profileId) {
      profile = await loadProfile(profileId);
    }

    // Build context for agent
    const runContext = {
      ...additionalContext,
      profile,
      currentDate: new Date().toISOString(),
    };

    logger.info('Running agent', {
      agentType,
      profileId,
      messageLength: message.length,
    });

    // Run the agent
    // Mastra agent.run() returns { output, toolCalls, ... }
    const result = await agent.generate(message, {
      context: runContext,
    });

    // Extract response data
    const response = {
      message: result.text || result.output || '',
      toolCalls: result.toolCalls || [],
      agentType,
      // UIResource could be added based on agent response patterns
      uiResource: extractUIResource(result, agentType),
    };

    logger.info('Agent completed', {
      agentType,
      responseLength: response.message.length,
      toolCallCount: response.toolCalls.length,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Agent error', { error });
    return new Response(
      JSON.stringify({
        error: 'Agent execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Extract UI Resource from agent response if applicable
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUIResource(result: any, agentType: string): Record<string, unknown> | undefined {
  // Check if the agent explicitly returned a uiResource
  if (result.uiResource) {
    return result.uiResource;
  }

  // Check tool results for UI components
  if (result.toolCalls) {
    for (const call of result.toolCalls) {
      if (call.result?.uiResource) {
        return call.result.uiResource;
      }
    }
  }

  // Auto-generate UI based on agent type and response patterns
  // This is a placeholder - could be enhanced with more sophisticated logic
  if (agentType === 'budget-coach' && result.toolCalls?.length > 0) {
    const budgetAnalysis = result.toolCalls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.toolName === 'analyze_budget'
    );
    if (budgetAnalysis?.result) {
      return {
        type: 'budget-summary',
        data: budgetAnalysis.result,
      };
    }
  }

  return undefined;
}

/**
 * GET /api/agent
 * List available agents and their status
 */
export async function GET() {
  try {
    const agents = await getAgents();

    // Get agent configs for descriptions
    const { AGENT_CONFIGS } = await import('@stride/mcp-server/agents');

    const agentList = Array.from(agents.keys()).map((id) => {
      const config = AGENT_CONFIGS.find((c: { id: string }) => c.id === id);
      return {
        id,
        name: config?.name || id,
        description: config?.description || '',
        available: true,
      };
    });

    return new Response(
      JSON.stringify({
        agents: agentList,
        count: agentList.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Failed to list agents', { error });
    return new Response(
      JSON.stringify({
        error: 'Failed to list agents',
        agents: [],
        count: 0,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
