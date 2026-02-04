/**
 * RAG (Retrieval Augmented Generation) API Endpoint
 *
 * Provides personalized context from similar profiles and past advice.
 * Falls back gracefully when vector store is not available.
 *
 * @see sprint-10-5.md Phase 2
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';

const logger = createLogger('RAG');

/**
 * RAG Context structure
 */
export interface RAGContext {
  similarProfiles: Array<{
    profileId: string;
    similarity: number;
    diploma?: string;
    skills?: string[];
  }>;
  relevantAdvice: Array<{
    text: string;
    similarity: number;
    outcome?: string;
  }>;
  similarGoals: Array<{
    goalName: string;
    amount: number;
    similarity: number;
    status?: string;
  }>;
  stats: {
    profilesFound: number;
    adviceFound: number;
    goalsFound: number;
  };
}

/**
 * Empty context when RAG is not available
 */
function getEmptyContext(): RAGContext {
  return {
    similarProfiles: [],
    relevantAdvice: [],
    similarGoals: [],
    stats: {
      profilesFound: 0,
      adviceFound: 0,
      goalsFound: 0,
    },
  };
}

/**
 * Try to get RAG context from MCP server services
 * Falls back to empty context if not available
 */
async function getRAGContextFromServices(
  queryText: string,
  profileId?: string
): Promise<RAGContext> {
  try {
    // Dynamic import to avoid bundling issues with native modules
    // This will only work on server-side and when mcp-server is built
    const services = await import('@stride/mcp-server/services');

    // Check if RAG services are available
    if (!services.getRAGContext) {
      logger.warn('getRAGContext not exported from services');
      return getEmptyContext();
    }

    const context = await services.getRAGContext({
      queryText,
      currentUserId: profileId,
      maxProfiles: 3,
      maxAdvice: 5,
      maxGoals: 3,
      minScore: 0.5,
      onlyHelpfulAdvice: true,
    });

    // Map to our interface (services might have slightly different shape)
    return {
      similarProfiles: context.similarProfiles || [],
      relevantAdvice: context.relevantAdvice || [],
      similarGoals: context.similarGoals || [],
      stats: context.stats || {
        profilesFound: 0,
        adviceFound: 0,
        goalsFound: 0,
      },
    };
  } catch (error) {
    // RAG services not available (expected during development or if not initialized)
    logger.warn('Services not available, using empty context', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return getEmptyContext();
  }
}

/**
 * POST /api/rag
 * Get RAG context for a query
 */
export async function POST({ request }: APIEvent) {
  // Define formatRAGContextForPrompt locally inside handler to avoid
  // Vinxi code-splitting issues with ?pick=POST tree-shaking exports
  const formatRAGContextForPrompt = (context: RAGContext): string => {
    const parts: string[] = [];

    if (context.similarProfiles.length > 0) {
      parts.push('## Similar Student Profiles');
      for (const p of context.similarProfiles) {
        const skills = p.skills?.slice(0, 3).join(', ') || 'N/A';
        parts.push(
          `- ${p.diploma || 'Student'} (${Math.round(p.similarity * 100)}% similar): skills: ${skills}`
        );
      }
      parts.push('');
    }

    if (context.relevantAdvice.length > 0) {
      parts.push('## Relevant Past Advice');
      for (const a of context.relevantAdvice) {
        const outcome = a.outcome ? ` (outcome: ${a.outcome})` : '';
        parts.push(`- "${a.text}"${outcome}`);
      }
      parts.push('');
    }

    if (context.similarGoals.length > 0) {
      parts.push('## Similar Goals');
      for (const g of context.similarGoals) {
        const status = g.status ? ` - ${g.status}` : '';
        parts.push(
          `- "${g.goalName}" ${g.amount}€ (${Math.round(g.similarity * 100)}% similar)${status}`
        );
      }
      parts.push('');
    }

    if (parts.length === 0) {
      return ''; // No context available
    }

    return `---\n## Context from Similar Students\n\n${parts.join('\n')}\n---\n`;
  };

  try {
    const body = await request.json();
    const { queryText, profileId } = body as { queryText: string; profileId?: string };

    if (!queryText) {
      return new Response(JSON.stringify({ error: 'queryText is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const context = await getRAGContextFromServices(queryText, profileId);
    const formattedContext = formatRAGContextForPrompt(context);

    return new Response(
      JSON.stringify({
        context,
        formattedContext,
        available:
          context.stats.profilesFound > 0 ||
          context.stats.adviceFound > 0 ||
          context.stats.goalsFound > 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error', { error });
    return new Response(
      JSON.stringify({
        error: 'RAG retrieval failed',
        context: getEmptyContext(),
        formattedContext: '',
        available: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/rag/health
 * Check if RAG services are available
 */
export async function GET() {
  try {
    // Try to import RAG services
    await import('@stride/mcp-server/services');
    return new Response(JSON.stringify({ available: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({ available: false, reason: 'mcp-server services not available' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
