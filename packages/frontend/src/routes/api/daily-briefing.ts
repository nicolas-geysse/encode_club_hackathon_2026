/**
 * Daily Briefing API Endpoint
 *
 * Generates a personalized morning briefing for the "New Day" popup.
 * Uses the dedicated daily-briefing agent optimized for fast responses.
 *
 * Features:
 * - Aggregates missions, deadlines, energy, and progress
 * - Provides a single focused action for the day
 * - Includes quick stats (days left, progress, energy)
 * - Full Opik tracing with feedback support
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('DailyBriefingAPI');

// ============================================================================
// Request/Response Types
// ============================================================================

interface DailyBriefingRequest {
  profileId: string;
  currentEnergy: number;
  energyHistory: number[];
  goalProgress: number;
  goalAmount?: number;
  currentAmount?: number;
  goalDeadline?: string;
  goalName?: string;
  activeMissions: {
    id: string;
    title: string;
    category: string;
    weeklyHours: number;
    weeklyEarnings: number;
    progress?: number;
    deadline?: string;
  }[];
  upcomingDeadlines?: {
    title: string;
    date: string;
    type: 'exam' | 'project' | 'payment' | 'goal' | 'other';
    importance: 'high' | 'medium' | 'low';
  }[];
  recentAchievements?: string[];
  lastCheckIn?: string;
  currentDate?: string; // For simulation mode
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
    logger.info('Loading MCP modules for daily briefing');

    const [agentsModule, servicesModule] = await Promise.all([
      import('@stride/mcp-server/agents'),
      import('@stride/mcp-server/services'),
    ]);

    agents = agentsModule;
    services = servicesModule;
    modulesLoaded = true;

    // Initialize services
    await Promise.all([servicesModule.initOpik(), servicesModule.initGroq()]);

    logger.info('Loaded MCP agents and services for daily briefing');
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
    const body = (await event.request.json()) as DailyBriefingRequest;

    // Validate required fields
    if (!body.profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Load modules
    const { agents: agentsModule } = await loadModules();

    logger.info('Generating daily briefing', {
      profileId: body.profileId,
      energy: body.currentEnergy,
      missionsCount: body.activeMissions?.length || 0,
      hasDeadlines: !!(body.upcomingDeadlines?.length || body.goalDeadline),
    });

    // Generate the briefing
    const result = await agentsModule.generateDailyBriefing({
      profileId: body.profileId,
      currentEnergy: body.currentEnergy,
      energyHistory: body.energyHistory || [],
      goalProgress: body.goalProgress,
      goalAmount: body.goalAmount,
      currentAmount: body.currentAmount,
      goalDeadline: body.goalDeadline,
      goalName: body.goalName,
      activeMissions: body.activeMissions || [],
      upcomingDeadlines: body.upcomingDeadlines,
      recentAchievements: body.recentAchievements,
      lastCheckIn: body.lastCheckIn,
      currentDate: body.currentDate,
    });

    logger.info('Daily briefing generated', {
      traceId: result.traceId,
      priority: result.briefing.priority,
      durationMs: result.processingInfo.durationMs,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Daily briefing API error', { error });

    // Fallback response
    const fallbackResponse = {
      briefing: {
        greeting: 'Good day',
        title: 'Ready for a new day',
        message: 'Every step counts toward your goal. What will you accomplish today?',
        priority: 'general',
        action: { label: 'View dashboard', href: '/suivi' },
      },
      context: {
        energyTrend: 'stable',
        missionsActive: 0,
        isComeback: false,
        isEnergyDebt: false,
      },
      processingInfo: {
        agentsUsed: [],
        durationMs: 0,
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
