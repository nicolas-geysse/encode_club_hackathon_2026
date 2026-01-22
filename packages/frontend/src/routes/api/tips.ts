/**
 * AI Tips API Endpoint (v2 - Multi-Agent Orchestration)
 *
 * Generates personalized, AI-powered tips using:
 * - Multi-agent orchestration (Budget Coach, Job Matcher, Strategy Comparator, Guardian)
 * - Location-aware recommendations
 * - Full Opik tracing with nested spans
 *
 * Fallback levels:
 * - Level 0: Full orchestration (4 agents, ~15s)
 * - Level 1: Single agent (Budget Coach only, ~8s)
 * - Level 2: Algorithms only (energy debt, comeback, ~2s)
 * - Level 3: Static tip (if all else fails)
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('TipsAPI');

// ============================================================================
// Request/Response Types
// ============================================================================

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
  // Location data (optional, for location-aware tips)
  location?: {
    city: string;
    coordinates?: { lat: number; lng: number };
    currency: 'USD' | 'EUR' | 'GBP';
    region?: 'france' | 'uk' | 'us' | 'europe';
  };
  // Profile data for agents
  skills?: string[];
  monthlyMargin?: number;
  hoursAvailable?: number;
  // Orchestration options
  enableFullOrchestration?: boolean;
}

interface AgentRecommendations {
  budgetCoach?: {
    advice: string[];
    topOptimization?: {
      solution: string;
      potentialSavings: number;
    };
    budgetStatus: 'positive' | 'deficit';
    severity: 'critical' | 'warning' | 'tight' | 'comfortable';
  };
  jobMatcher?: {
    topMatch?: {
      name: string;
      hourlyRate: number;
      arbitrageScore: number;
      platform: string;
    };
    matchesCount: number;
    energyAdjusted: boolean;
  };
  strategyComparator?: {
    bestStrategy: string;
    bestQuickWin: string;
    bestLongTerm: string;
    recommendation: string;
  };
}

interface LocalOpportunities {
  jobs: { title: string; company: string; distance?: string }[];
  regionalTips: string[];
  nearbyPlaces?: { name: string; type: string; distance?: string }[];
}

interface TipsResponse {
  tip: {
    title: string;
    message: string;
    category: string;
    action?: { label: string; href: string };
  };
  insights: {
    energyDebt: {
      detected: boolean;
      severity: string | null;
      weeks: number;
      targetReduction?: number;
    };
    comeback: { detected: boolean; confidence: number };
    topPriority: string;
    agentRecommendations?: AgentRecommendations;
    localOpportunities?: LocalOpportunities;
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'single' | 'algorithms' | 'static';
  };
  traceId: string;
  traceUrl: string;
}

// ============================================================================
// Module Loading
// ============================================================================

let modulesLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let agents: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let services: any = null;

async function loadModules() {
  if (modulesLoaded) return { agents, services };

  try {
    logger.info('Loading MCP modules (v2 with multi-agent orchestration)');
    logger.info('Loading MCP modules with env', {
      ENABLE_OPIK: process.env.ENABLE_OPIK,
      OPIK_API_KEY: process.env.OPIK_API_KEY ? 'SET' : 'NOT SET',
      OPIK_WORKSPACE: process.env.OPIK_WORKSPACE,
      OPIK_PROJECT: process.env.OPIK_PROJECT,
    });

    const [agentsModule, servicesModule] = await Promise.all([
      import('@stride/mcp-server/agents'),
      import('@stride/mcp-server/services'),
    ]);

    agents = agentsModule;
    services = servicesModule;
    modulesLoaded = true;

    // Initialize services
    await Promise.all([servicesModule.initOpik(), servicesModule.initGroq()]);

    logger.info('Loaded MCP agents and services, Opik + Groq initialized');
    return { agents, services };
  } catch (error) {
    logger.error('Failed to load MCP modules', { error });
    throw error;
  }
}

// ============================================================================
// POST Handler
// ============================================================================

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

    // Load modules
    const { agents: agentsModule, services: svc } = await loadModules();

    // Build orchestrator input
    const orchestratorInput = {
      profileId: body.profileId,
      currentEnergy: body.currentEnergy,
      energyHistory: body.energyHistory,
      goalProgress: body.goalProgress,
      activeMissions: body.activeMissions,
      goalAmount: body.goalAmount,
      currentAmount: body.currentAmount,
      weeklyTarget: body.weeklyTarget,
      location: body.location,
      skills: body.skills,
      monthlyMargin: body.monthlyMargin,
      hoursAvailable: body.hoursAvailable || 10,
      enableFullOrchestration: body.enableFullOrchestration !== false,
      timeoutMs: 15000,
    };

    logger.info('Running tips orchestration', {
      profileId: body.profileId,
      hasLocation: !!body.location,
      hasSkills: !!body.skills?.length,
      enableFull: body.enableFullOrchestration !== false,
    });

    // Run the multi-agent orchestrator
    const result = await agentsModule.orchestrateTips(orchestratorInput);

    // Get trace info
    const traceId = svc.getCurrentTraceId() || '';
    const traceUrl = svc.getTraceUrl(traceId);

    // Add trace info to result
    result.traceId = traceId;
    result.traceUrl = traceUrl;

    logger.info('Tips orchestration completed', {
      traceId,
      fallbackLevel: result.processingInfo.fallbackLevel,
      orchestrationType: result.processingInfo.orchestrationType,
      agentsUsed: result.processingInfo.agentsUsed,
      durationMs: result.processingInfo.durationMs,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Tips API error', { error });

    // Fallback response
    const fallbackResponse: TipsResponse = {
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
      processingInfo: {
        agentsUsed: [],
        fallbackLevel: 3,
        durationMs: 0,
        orchestrationType: 'static',
      },
      traceId: '',
      traceUrl: '',
    };

    return new Response(JSON.stringify(fallbackResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
