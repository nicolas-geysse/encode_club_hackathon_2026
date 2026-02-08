/**
 * Tab Tips API Endpoint (v2 - Strategy Pattern)
 *
 * Generates personalized tips for each tab using the Strategy pattern.
 * Each tab provides its own strategy defining context, agents, validation, and prompts.
 *
 * Features:
 * - Tab-specific multi-agent orchestration
 * - Full Opik tracing with nested spans
 * - 4-level fallback system (full → partial → algorithms → static)
 * - Smart caching with hash-based invalidation
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('TabTipsAPI');

type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

interface TabTipRequest {
  tabType: TabType;
  profileId: string;
  contextData?: Record<string, unknown>;
  options?: {
    enableFullOrchestration?: boolean;
    timeoutMs?: number;
  };
}

interface TabTipResponse {
  tip: {
    title: string;
    message: string;
    category: 'energy' | 'progress' | 'mission' | 'opportunity' | 'warning' | 'celebration';
    action?: { label: string; href: string };
  };
  insights: {
    tabSpecific: Record<string, unknown>;
    agentRecommendations?: Array<{
      agentId: string;
      recommendation: string;
      confidence: number;
    }>;
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'partial' | 'algorithms' | 'static';
    cached: boolean;
    cacheKey?: string;
  };
  traceId: string;
  traceUrl: string;
}

// ============================================================================
// Smart LRU Cache with Hash-based Invalidation
// ============================================================================

interface CacheEntry {
  response: TabTipResponse;
  timestamp: number;
  contextHash: string;
}

const tipCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

/**
 * Generate a simple hash of context data for invalidation
 */
function hashContext(context: Record<string, unknown>): string {
  // Only hash meaningful fields that should trigger recalculation
  const meaningfulData = {
    // Goals
    goalsCount: Array.isArray(context.goals) ? context.goals.length : 0,
    goalsProgress: Array.isArray(context.goals)
      ? context.goals.map((g: { progress?: number }) => g.progress || 0).join(',')
      : '',
    // Budget
    monthlyMargin: context.monthlyMargin,
    monthlyIncome: context.monthlyIncome,
    monthlyExpenses: context.monthlyExpenses,
    // Energy
    currentEnergy: context.currentEnergy,
    // Skills
    skillsCount: Array.isArray(context.skills) ? context.skills.length : 0,
    // Inventory
    inventoryCount: Array.isArray(context.inventory) ? context.inventory.length : 0,
    // Skipped steps
    skippedSteps: Array.isArray(context.skippedSteps) ? context.skippedSteps.join(',') : '',
  };

  // Simple hash
  const str = JSON.stringify(meaningfulData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Get cached response if valid
 */
function getCachedResponse(cacheKey: string, contextHash: string): TabTipResponse | null {
  const entry = tipCache.get(cacheKey);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    tipCache.delete(cacheKey);
    return null;
  }

  // Check if context changed meaningfully
  if (entry.contextHash !== contextHash) {
    tipCache.delete(cacheKey);
    return null;
  }

  return entry.response;
}

/**
 * Store response in cache with LRU eviction
 */
function setCachedResponse(cacheKey: string, contextHash: string, response: TabTipResponse): void {
  // LRU eviction if cache is full
  if (tipCache.size >= MAX_CACHE_SIZE) {
    const firstKey = tipCache.keys().next().value;
    if (firstKey) tipCache.delete(firstKey);
  }

  tipCache.set(cacheKey, {
    response: { ...response, processingInfo: { ...response.processingInfo, cached: true } },
    timestamp: Date.now(),
    contextHash,
  });
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
    logger.info('Loading MCP modules for tab tips (Strategy pattern)');

    const [agentsModule, servicesModule] = await Promise.all([
      import('@stride/mcp-server/agents'),
      import('@stride/mcp-server/services'),
    ]);

    agents = agentsModule;
    services = servicesModule;
    modulesLoaded = true;

    // Initialize services
    await Promise.all([servicesModule.initOpik(), servicesModule.initGroq()]);

    logger.info('Loaded MCP modules with Strategy pattern orchestrator');
    return { agents, services };
  } catch (error) {
    logger.error('Failed to load MCP modules', { error });
    throw error;
  }
}

// ============================================================================
// Fallback Tips
// ============================================================================

const FALLBACK_TIPS: Record<
  TabType,
  Omit<TabTipResponse, 'insights' | 'processingInfo' | 'traceId' | 'traceUrl'>
> = {
  profile: {
    tip: {
      title: 'Complète ton profil',
      message: 'Ajoute tes compétences pour recevoir des conseils personnalisés.',
      category: 'opportunity',
      action: { label: 'Éditer', href: '/me' },
    },
  },
  goals: {
    tip: {
      title: 'Définis un objectif',
      message: 'Un objectif SMART te donnera une direction claire.',
      category: 'progress',
      action: { label: 'Ajouter', href: '/me#goals' },
    },
  },
  budget: {
    tip: {
      title: 'Suis ton budget',
      message: 'Connaître ta marge aide à mieux planifier.',
      category: 'opportunity',
      action: { label: 'Budget', href: '/me#budget' },
    },
  },
  trade: {
    tip: {
      title: 'Liste tes objets',
      message: 'Ajoute ce que tu pourrais vendre ou échanger.',
      category: 'opportunity',
      action: { label: 'Inventaire', href: '/me#trade' },
    },
  },
  jobs: {
    tip: {
      title: 'Explore les opportunités',
      message: 'Découvre des missions adaptées à tes compétences.',
      category: 'opportunity',
      action: { label: 'Jobs', href: '/me#jobs' },
    },
  },
  swipe: {
    tip: {
      title: 'Swipe pour découvrir',
      message: "Swipe à droite sur les stratégies qui t'intéressent !",
      category: 'opportunity',
      action: { label: 'Swipe', href: '/swipe' },
    },
  },
};

// ============================================================================
// POST Handler
// ============================================================================

/**
 * POST /api/tab-tips
 *
 * Request body:
 * {
 *   tabType: 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe'
 *   profileId: string
 *   contextData?: Record<string, unknown>
 *   options?: { enableFullOrchestration?: boolean, timeoutMs?: number }
 * }
 */
export async function POST({ request }: APIEvent): Promise<Response> {
  try {
    const body = (await request.json()) as TabTipRequest;
    const { tabType, profileId, contextData = {}, options = {} } = body;

    if (!tabType || !profileId) {
      return new Response(JSON.stringify({ error: 'tabType and profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate tab type
    const validTabs: TabType[] = ['profile', 'goals', 'budget', 'trade', 'jobs', 'swipe'];
    if (!validTabs.includes(tabType)) {
      return new Response(
        JSON.stringify({ error: `Invalid tabType. Must be one of: ${validTabs.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const cacheKey = `${tabType}:${profileId}`;
    const contextHash = hashContext(contextData);
    const cached = getCachedResponse(cacheKey, contextHash);

    if (cached) {
      logger.debug('Returning cached tab tip', { tabType, profileId, cacheKey });
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load modules
    const { agents: agentsModule, services: svc } = await loadModules();

    // Check if new orchestrator is available
    if (agentsModule.orchestrateTabTips) {
      logger.info('Using Strategy pattern orchestrator', { tabType, profileId });

      // Build orchestrator input
      const orchestratorInput = {
        tabType,
        profileId,
        contextData,
        options: {
          enableFullOrchestration: options.enableFullOrchestration !== false,
          timeoutMs: options.timeoutMs || 5000,
        },
      };

      // Run the tab-agnostic orchestrator
      const result = await agentsModule.orchestrateTabTips(orchestratorInput);

      logger.info('Tab tips orchestration completed', {
        tabType,
        profileId,
        fallbackLevel: result.processingInfo.fallbackLevel,
        orchestrationType: result.processingInfo.orchestrationType,
        agentsUsed: result.processingInfo.agentsUsed,
        durationMs: result.processingInfo.durationMs,
      });

      // Cache the result
      setCachedResponse(cacheKey, contextHash, result);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fallback to legacy implementation if new orchestrator not available
    logger.warn('Strategy orchestrator not available, using fallback', { tabType });
    return handleLegacyRequest(tabType, profileId, contextData);
  } catch (error) {
    logger.error('Tab tips request failed', { error });

    // Return a fallback response to avoid breaking the UI
    const tabType = 'profile' as TabType;
    const fallback = FALLBACK_TIPS[tabType];

    const fallbackResponse: TabTipResponse = {
      ...fallback,
      insights: { tabSpecific: { error: true } },
      processingInfo: {
        agentsUsed: [],
        fallbackLevel: 3,
        durationMs: 0,
        orchestrationType: 'static',
        cached: false,
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

/**
 * Legacy request handler (for backward compatibility)
 */
async function handleLegacyRequest(
  tabType: TabType,
  profileId: string,
  contextData: Record<string, unknown>
): Promise<Response> {
  try {
    const { llmChat, trace, getCurrentTraceId, getTraceUrl } =
      await import('@stride/mcp-server/services');

    const TAB_PROMPTS: Record<TabType, string> = {
      profile: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le profil de l'étudiant et donne UN conseil court et actionnable pour l'améliorer.
Focus sur: compléter les informations manquantes, optimiser les préférences de travail, ou valoriser les certifications.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
      goals: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les objectifs financiers de l'étudiant et donne UN conseil court et actionnable.
Focus sur: faisabilité des objectifs, décomposition en étapes, ou ajustement des montants/délais.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
      budget: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le budget de l'étudiant (revenus et dépenses) et donne UN conseil court et actionnable.
Focus sur: réduire une dépense spécifique, augmenter les revenus, ou optimiser la marge d'épargne.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
      trade: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse l'inventaire et les échanges de l'étudiant et donne UN conseil court et actionnable.
Focus sur: identifier un objet à vendre, suggérer un emprunt plutôt qu'un achat, ou valoriser le karma d'entraide.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
      jobs: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les compétences et la recherche d'emploi de l'étudiant et donne UN conseil court et actionnable.
Focus sur: matcher une compétence avec une opportunité, suggérer une nouvelle piste, ou optimiser le taux horaire.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
      swipe: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Donne UN conseil court sur comment utiliser le swipe de scénarios efficacement.
Focus sur: équilibrer effort et revenus, diversifier les sources de revenus, ou écouter ses préférences.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
    };

    let tip = '';
    let traceId = '';

    await trace(
      `tab-tips.legacy.${tabType}`,
      async (ctx) => {
        ctx.setAttributes({
          'tab.type': tabType,
          'profile.id': profileId,
          orchestrator: 'legacy',
        });

        const response = await llmChat(
          [
            { role: 'system', content: TAB_PROMPTS[tabType] },
            { role: 'user', content: `Contexte: ${JSON.stringify(contextData).slice(0, 500)}` },
          ],
          { maxTokens: 150, temperature: 0.7 }
        );

        tip = response.trim();
        traceId = getCurrentTraceId() || '';
      },
      { metadata: { source: 'tab-tips-legacy', tabType, 'prompt.name': `tab-tips-${tabType}` } }
    );

    const response: TabTipResponse = {
      tip: {
        title: 'Conseil Bruno',
        message: tip || FALLBACK_TIPS[tabType].tip.message,
        category: 'opportunity',
      },
      insights: { tabSpecific: { legacy: true } },
      processingInfo: {
        agentsUsed: [],
        fallbackLevel: 2,
        durationMs: 0,
        orchestrationType: 'algorithms',
        cached: false,
      },
      traceId,
      traceUrl: getTraceUrl(traceId),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Legacy request failed', { error, tabType });
    const fallback = FALLBACK_TIPS[tabType];

    return new Response(
      JSON.stringify({
        ...fallback,
        insights: { tabSpecific: { error: true, legacy: true } },
        processingInfo: {
          agentsUsed: [],
          fallbackLevel: 3,
          durationMs: 0,
          orchestrationType: 'static',
          cached: false,
        },
        traceId: '',
        traceUrl: '',
      } as TabTipResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// DELETE Handler - Clear Cache
// ============================================================================

/**
 * DELETE /api/tab-tips?profileId=xxx
 * Clear cache for a specific profile or all cache
 */
export async function DELETE({ request }: APIEvent): Promise<Response> {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');
    const tabType = url.searchParams.get('tabType') as TabType | null;

    if (profileId && tabType) {
      // Clear specific tab cache
      const cacheKey = `${tabType}:${profileId}`;
      tipCache.delete(cacheKey);
      logger.debug('Cleared tab tip cache', { tabType, profileId });
    } else if (profileId) {
      // Clear all tabs for profile
      for (const key of tipCache.keys()) {
        if (key.includes(profileId)) {
          tipCache.delete(key);
        }
      }
      logger.debug('Cleared all tip cache for profile', { profileId });
    } else {
      // Clear all cache
      tipCache.clear();
      logger.debug('Cleared all tip cache');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to clear cache' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// GET Handler - Warmup
// ============================================================================

/**
 * GET /api/tab-tips/warmup?profileId=xxx
 * Pre-fetch tips for common tabs
 */
export async function GET({ request }: APIEvent): Promise<Response> {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: 'profileId required for warmup' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load modules
    const { agents: agentsModule } = await loadModules();

    // Check if warmup function is available
    if (agentsModule.warmupTabTips) {
      logger.info('Running tab tips warmup', { profileId });

      const results = await agentsModule.warmupTabTips(profileId, ['goals', 'budget', 'jobs']);

      // Cache the results
      for (const [tabType, result] of results.entries()) {
        const cacheKey = `${tabType}:${profileId}`;
        const contextHash = 'warmup'; // Simple hash for warmup
        setCachedResponse(cacheKey, contextHash, result);
      }

      return new Response(
        JSON.stringify({
          success: true,
          warmed: Array.from(results.keys()),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: false, reason: 'Warmup not available' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Warmup failed', { error });
    return new Response(JSON.stringify({ error: 'Warmup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
