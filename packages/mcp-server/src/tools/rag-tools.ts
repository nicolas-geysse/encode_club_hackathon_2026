/**
 * RAG Tools - MCP Tool Definitions for RAG operations
 *
 * Exposes RAG functionality via MCP tools for:
 * - Querying similar profiles/advice/goals
 * - Indexing new data
 * - Feedback learning
 */

import { trace } from '../services/opik.js';
import { rag, getRAGContext, formatRAGContextForPrompt } from './rag.js';

/**
 * RAG Tool Definitions
 */
export const RAG_TOOLS = {
  // === RAG Query Tool ===
  get_rag_context: {
    description:
      'Retrieve personalized context from similar students, past advice, and similar goals for RAG-enhanced responses.',
    inputSchema: {
      type: 'object',
      properties: {
        query_text: {
          type: 'string',
          description:
            'The query to find similar context for (e.g., student situation, goal description)',
        },
        current_user_id: {
          type: 'string',
          description: 'Current user ID to exclude from results',
        },
        goal_type: {
          type: 'string',
          description: 'Filter advice by goal type (e.g., savings, debt_payoff, purchase)',
        },
        only_helpful_advice: {
          type: 'boolean',
          description: 'Only return advice marked as helpful',
          default: true,
        },
        max_results: {
          type: 'number',
          description: 'Maximum total results to return',
          default: 10,
        },
      },
      required: ['query_text'],
    },
  },

  // === Index Profile Tool ===
  index_student_profile: {
    description:
      'Index a student profile for RAG similarity search. Call this when a profile is created or updated.',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: {
          type: 'string',
          description: 'Unique profile ID',
        },
        name: { type: 'string' },
        diploma: { type: 'string' },
        field: { type: 'string' },
        skills: {
          type: 'array',
          items: { type: 'string' },
        },
        city: { type: 'string' },
        monthly_income: { type: 'number' },
        monthly_expenses: { type: 'number' },
        monthly_margin: { type: 'number' },
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
      },
      required: ['profile_id'],
    },
  },

  // === Index Advice Tool ===
  index_advice: {
    description:
      'Index advice given to a student for RAG retrieval. Call this after generating advice.',
    inputSchema: {
      type: 'object',
      properties: {
        advice_id: {
          type: 'string',
          description: 'Unique advice ID',
        },
        advice_text: {
          type: 'string',
          description: 'The advice text',
        },
        profile_id: {
          type: 'string',
          description: 'ID of the profile that received this advice',
        },
        context: {
          type: 'string',
          description: 'Context in which advice was given',
        },
        goal_type: {
          type: 'string',
          description: 'Type of goal this advice relates to',
        },
      },
      required: ['advice_id', 'advice_text', 'profile_id'],
    },
  },

  // === Index Goal Tool ===
  index_goal: {
    description: 'Index a goal for RAG similarity search. Call this when a goal is created.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: {
          type: 'string',
          description: 'Unique goal ID',
        },
        goal_name: {
          type: 'string',
          description: 'Name of the goal',
        },
        goal_amount: {
          type: 'number',
          description: 'Target amount',
        },
        user_id: {
          type: 'string',
          description: 'ID of the user who owns this goal',
        },
        deadline: {
          type: 'string',
          description: 'Goal deadline (ISO date string)',
        },
        description: {
          type: 'string',
          description: 'Goal description',
        },
        category: {
          type: 'string',
          description: 'Goal category',
        },
        feasibility_score: {
          type: 'number',
          description: 'Calculated feasibility score (0-1)',
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'paused', 'cancelled'],
        },
      },
      required: ['goal_id', 'goal_name', 'goal_amount', 'user_id'],
    },
  },

  // === Update Advice Feedback Tool ===
  update_advice_feedback: {
    description: 'Update feedback on advice for learning. Call this when user rates advice.',
    inputSchema: {
      type: 'object',
      properties: {
        advice_id: {
          type: 'string',
          description: 'ID of the advice to update',
        },
        outcome: {
          type: 'string',
          enum: ['helpful', 'neutral', 'unhelpful'],
          description: 'User feedback on the advice',
        },
      },
      required: ['advice_id', 'outcome'],
    },
  },

  // === Find Similar Students Tool ===
  find_similar_students: {
    description: 'Find students with similar profiles for benchmarking and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        query_text: {
          type: 'string',
          description: 'Description of the student to find similar profiles for',
        },
        exclude_user_id: {
          type: 'string',
          description: 'User ID to exclude from results',
        },
        top_k: {
          type: 'number',
          description: 'Maximum number of results',
          default: 5,
        },
        min_score: {
          type: 'number',
          description: 'Minimum similarity score (0-1)',
          default: 0.6,
        },
      },
      required: ['query_text'],
    },
  },

  // === Find Similar Goals Tool ===
  find_similar_goals: {
    description: 'Find similar goals achieved by other students for inspiration and benchmarking.',
    inputSchema: {
      type: 'object',
      properties: {
        query_text: {
          type: 'string',
          description: 'Description of the goal to find similar ones for',
        },
        only_completed: {
          type: 'boolean',
          description: 'Only return completed goals',
          default: true,
        },
        exclude_user_id: {
          type: 'string',
          description: 'User ID to exclude from results',
        },
        top_k: {
          type: 'number',
          description: 'Maximum number of results',
          default: 5,
        },
      },
      required: ['query_text'],
    },
  },
};

/**
 * Handle RAG tool calls
 */
export async function handleRAGTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_rag_context':
      return handleGetRAGContext(args);
    case 'index_student_profile':
      return handleIndexProfile(args);
    case 'index_advice':
      return handleIndexAdvice(args);
    case 'index_goal':
      return handleIndexGoal(args);
    case 'update_advice_feedback':
      return handleUpdateFeedback(args);
    case 'find_similar_students':
      return handleFindSimilarStudents(args);
    case 'find_similar_goals':
      return handleFindSimilarGoals(args);
    default:
      throw new Error(`Unknown RAG tool: ${name}`);
  }
}

// === Handler Implementations ===

async function handleGetRAGContext(args: Record<string, unknown>) {
  return trace('rag_tool.get_context', async (span) => {
    const queryText = args.query_text as string;
    const maxResults = (args.max_results as number) || 10;

    const context = await getRAGContext({
      queryText,
      currentUserId: args.current_user_id as string | undefined,
      goalType: args.goal_type as string | undefined,
      onlyHelpfulAdvice: (args.only_helpful_advice as boolean) ?? true,
      maxProfiles: Math.ceil(maxResults / 3),
      maxAdvice: Math.ceil(maxResults / 2),
      maxGoals: Math.ceil(maxResults / 3),
    });

    // Format for prompt
    const promptContext = formatRAGContextForPrompt(context);

    span.setAttributes({
      'query.length': queryText.length,
      'results.profiles': context.stats.profilesFound,
      'results.advice': context.stats.adviceFound,
      'results.goals': context.stats.goalsFound,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'context-summary',
          type: 'text',
          params: {
            content: `## RAG Context Retrieved\n\n- Similar profiles: ${context.stats.profilesFound}\n- Relevant advice: ${context.stats.adviceFound}\n- Similar goals: ${context.stats.goalsFound}\n- Avg profile similarity: ${(context.stats.avgProfileSimilarity * 100).toFixed(1)}%\n- Avg advice similarity: ${(context.stats.avgAdviceSimilarity * 100).toFixed(1)}%`,
            markdown: true,
          },
        },
        {
          id: 'prompt-context',
          type: 'text',
          params: {
            content: promptContext || '*No relevant context found*',
            markdown: true,
          },
        },
      ],
      metadata: {
        context,
        promptAddition: promptContext,
      },
    };
  });
}

async function handleIndexProfile(args: Record<string, unknown>) {
  return trace('rag_tool.index_profile', async (span) => {
    const profileId = args.profile_id as string;

    await rag.indexProfile(profileId, {
      name: args.name as string | undefined,
      diploma: args.diploma as string | undefined,
      field: args.field as string | undefined,
      skills: args.skills as string[] | undefined,
      city: args.city as string | undefined,
      monthlyIncome: args.monthly_income as number | undefined,
      monthlyExpenses: args.monthly_expenses as number | undefined,
      monthlyMargin: args.monthly_margin as number | undefined,
      goals: args.goals as Array<{ name: string; amount: number }> | undefined,
    });

    span.setAttributes({
      'profile.id': profileId,
    });

    return {
      type: 'text',
      params: {
        content: `Profile ${profileId} indexed for RAG`,
        markdown: false,
      },
    };
  });
}

async function handleIndexAdvice(args: Record<string, unknown>) {
  return trace('rag_tool.index_advice', async (span) => {
    const adviceId = args.advice_id as string;
    const adviceText = args.advice_text as string;
    const profileId = args.profile_id as string;

    await rag.indexAdvice(adviceId, {
      text: adviceText,
      profileId,
      context: args.context as string | undefined,
      goalType: args.goal_type as string | undefined,
    });

    span.setAttributes({
      'advice.id': adviceId,
      'advice.profileId': profileId,
    });

    return {
      type: 'text',
      params: {
        content: `Advice ${adviceId} indexed for RAG`,
        markdown: false,
      },
    };
  });
}

async function handleIndexGoal(args: Record<string, unknown>) {
  return trace('rag_tool.index_goal', async (span) => {
    const goalId = args.goal_id as string;

    await rag.indexGoal(goalId, {
      name: args.goal_name as string,
      amount: args.goal_amount as number,
      userId: args.user_id as string,
      deadline: args.deadline as string | undefined,
      description: args.description as string | undefined,
      category: args.category as string | undefined,
      feasibilityScore: args.feasibility_score as number | undefined,
      status: args.status as string | undefined,
    });

    span.setAttributes({
      'goal.id': goalId,
      'goal.name': args.goal_name as string,
    });

    return {
      type: 'text',
      params: {
        content: `Goal ${goalId} indexed for RAG`,
        markdown: false,
      },
    };
  });
}

async function handleUpdateFeedback(args: Record<string, unknown>) {
  return trace('rag_tool.update_feedback', async (span) => {
    const adviceId = args.advice_id as string;
    const outcome = args.outcome as 'helpful' | 'neutral' | 'unhelpful';

    await rag.updateFeedback(adviceId, outcome);

    span.setAttributes({
      'advice.id': adviceId,
      'advice.outcome': outcome,
    });

    return {
      type: 'text',
      params: {
        content: `Advice ${adviceId} feedback updated: ${outcome}`,
        markdown: false,
      },
    };
  });
}

async function handleFindSimilarStudents(args: Record<string, unknown>) {
  return trace('rag_tool.find_similar_students', async (span) => {
    const queryText = args.query_text as string;
    const topK = (args.top_k as number) || 5;
    const minScore = (args.min_score as number) || 0.6;

    // Use embeddings to generate query vector
    const { embeddings } = await import('../services/embeddings');
    const queryEmbedding = await embeddings.generate(queryText);

    // Search for similar profiles
    const { vectorstore } = await import('../services/vectorstore');
    const results = await vectorstore.findSimilarProfiles(queryEmbedding, topK, minScore);

    // Filter out excluded user
    const excludeId = args.exclude_user_id as string | undefined;
    const filtered = excludeId
      ? results.filter((r) => r.metadata.profileId !== excludeId)
      : results;

    span.setAttributes({
      'query.length': queryText.length,
      'results.count': filtered.length,
    });

    return {
      type: 'table',
      params: {
        title: 'Similar Students',
        columns: [
          { key: 'id', label: 'Profile ID' },
          { key: 'similarity', label: 'Similarity' },
          { key: 'diploma', label: 'Diploma' },
          { key: 'skills', label: 'Skills' },
        ],
        rows: filtered.map((r) => ({
          id: r.id,
          similarity: `${(r.score * 100).toFixed(1)}%`,
          diploma: (r.metadata.diploma as string) || '-',
          skills: ((r.metadata.skills as string[]) || []).slice(0, 3).join(', ') || '-',
        })),
      },
    };
  });
}

async function handleFindSimilarGoals(args: Record<string, unknown>) {
  return trace('rag_tool.find_similar_goals', async (span) => {
    const queryText = args.query_text as string;
    const topK = (args.top_k as number) || 5;
    const onlyCompleted = (args.only_completed as boolean) ?? true;

    // Use embeddings to generate query vector
    const { embeddings } = await import('../services/embeddings');
    const queryEmbedding = await embeddings.generate(queryText);

    // Search for similar goals
    const { vectorstore } = await import('../services/vectorstore');
    const results = await vectorstore.findSimilarGoals(queryEmbedding, {
      topK,
      onlyCompleted,
      excludeUserId: args.exclude_user_id as string | undefined,
    });

    span.setAttributes({
      'query.length': queryText.length,
      'results.count': results.length,
    });

    return {
      type: 'table',
      params: {
        title: 'Similar Goals',
        columns: [
          { key: 'id', label: 'Goal ID' },
          { key: 'name', label: 'Goal' },
          { key: 'amount', label: 'Amount' },
          { key: 'similarity', label: 'Similarity' },
          { key: 'status', label: 'Status' },
        ],
        rows: results.map((r) => ({
          id: r.id,
          name: (r.metadata.goalName as string) || '-',
          amount: `${(r.metadata.goalAmount as number) || 0}€`,
          similarity: `${(r.score * 100).toFixed(1)}%`,
          status: (r.metadata.status as string) || '-',
        })),
      },
    };
  });
}
