/**
 * RAG Tool - Retrieval Augmented Generation for personalized advice
 *
 * Provides context from similar students and past successful advice
 * to generate more personalized and relevant recommendations.
 */

import { trace, maybeTrace } from '../services/opik.js';
import { vectorstore } from '../services/vectorstore.js';
import { embeddings } from '../services/embeddings.js';

/**
 * Context retrieved for RAG
 */
export interface RAGContext {
  /** Similar student profiles */
  similarProfiles: Array<{
    profileId: string;
    similarity: number;
    diploma?: string;
    skills?: string[];
    monthlyMargin?: number;
  }>;
  /** Past advice that was helpful in similar situations */
  relevantAdvice: Array<{
    adviceId: string;
    similarity: number;
    text: string;
    outcome?: string;
    goalType?: string;
  }>;
  /** Similar goals achieved by other students */
  similarGoals: Array<{
    goalId: string;
    similarity: number;
    goalName: string;
    amount: number;
    status?: string;
    feasibilityScore?: number;
  }>;
  /** Summary statistics */
  stats: {
    profilesFound: number;
    adviceFound: number;
    goalsFound: number;
    avgProfileSimilarity: number;
    avgAdviceSimilarity: number;
  };
}

/**
 * Query parameters for RAG context retrieval
 */
export interface RAGQueryParams {
  /** The query text to find similar content */
  queryText: string;
  /** Optional: current user's profile for exclusion */
  currentUserId?: string;
  /** Optional: filter advice by goal type */
  goalType?: string;
  /** Optional: only return helpful advice */
  onlyHelpfulAdvice?: boolean;
  /** Maximum similar profiles to return */
  maxProfiles?: number;
  /** Maximum advice items to return */
  maxAdvice?: number;
  /** Maximum similar goals to return */
  maxGoals?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
}

/**
 * Retrieve RAG context for a query
 *
 * Searches across:
 * - Similar student profiles
 * - Past helpful advice
 * - Similar achieved goals
 */
export async function getRAGContext(params: RAGQueryParams): Promise<RAGContext> {
  return maybeTrace('rag.getContext', async (span) => {
    const {
      queryText,
      currentUserId,
      goalType,
      onlyHelpfulAdvice = true,
      maxProfiles = 3,
      maxAdvice = 5,
      maxGoals = 3,
      minScore = 0.6,
    } = params;

    // Generate embedding for the query
    const queryEmbedding = await embeddings.generate(queryText);

    // Skip vectorstore queries if embeddings are disabled
    if (queryEmbedding.length === 0) {
      span.setAttributes({
        'query.length': queryText.length,
        'embeddings.disabled': true,
        'results.profiles': 0,
        'results.advice': 0,
        'results.goals': 0,
      });

      return {
        similarProfiles: [],
        relevantAdvice: [],
        similarGoals: [],
        stats: {
          profilesFound: 0,
          adviceFound: 0,
          goalsFound: 0,
          avgProfileSimilarity: 0,
          avgAdviceSimilarity: 0,
        },
      };
    }

    // Search in parallel
    const [profileResults, adviceResults, goalResults] = await Promise.all([
      // Similar profiles (excluding current user)
      vectorstore.findSimilarProfiles(queryEmbedding, maxProfiles, minScore),

      // Relevant advice
      vectorstore.findSimilarAdvice(queryEmbedding, {
        topK: maxAdvice,
        minScore,
        onlyHelpful: onlyHelpfulAdvice,
        goalType,
      }),

      // Similar goals
      vectorstore.findSimilarGoals(queryEmbedding, {
        topK: maxGoals,
        minScore,
        onlyCompleted: true,
        excludeUserId: currentUserId,
      }),
    ]);

    // Filter out current user from profiles
    const filteredProfiles = currentUserId
      ? profileResults.filter((p) => p.metadata.profileId !== currentUserId)
      : profileResults;

    // Build context
    const context: RAGContext = {
      similarProfiles: filteredProfiles.map((p) => ({
        profileId: p.id,
        similarity: p.score,
        diploma: p.metadata.diploma as string | undefined,
        skills: p.metadata.skills as string[] | undefined,
        monthlyMargin: p.metadata.monthlyMargin as number | undefined,
      })),
      relevantAdvice: adviceResults.map((a) => ({
        adviceId: a.id,
        similarity: a.score,
        text: a.text,
        outcome: a.metadata.outcome as string | undefined,
        goalType: a.metadata.goalType as string | undefined,
      })),
      similarGoals: goalResults.map((g) => ({
        goalId: g.id,
        similarity: g.score,
        goalName: (g.metadata.goalName as string) || 'Unknown',
        amount: (g.metadata.goalAmount as number) || 0,
        status: g.metadata.status as string | undefined,
        feasibilityScore: g.metadata.feasibilityScore as number | undefined,
      })),
      stats: {
        profilesFound: filteredProfiles.length,
        adviceFound: adviceResults.length,
        goalsFound: goalResults.length,
        avgProfileSimilarity: filteredProfiles.length
          ? filteredProfiles.reduce((sum, p) => sum + p.score, 0) / filteredProfiles.length
          : 0,
        avgAdviceSimilarity: adviceResults.length
          ? adviceResults.reduce((sum, a) => sum + a.score, 0) / adviceResults.length
          : 0,
      },
    };

    span.setAttributes({
      'query.length': queryText.length,
      'query.goalType': goalType || 'any',
      'results.profiles': context.stats.profilesFound,
      'results.advice': context.stats.adviceFound,
      'results.goals': context.stats.goalsFound,
      'results.avgProfileSim': context.stats.avgProfileSimilarity.toFixed(3),
      'results.avgAdviceSim': context.stats.avgAdviceSimilarity.toFixed(3),
    });

    return context;
  });
}

/**
 * Format RAG context into a prompt addition for LLM
 */
export function formatRAGContextForPrompt(context: RAGContext): string {
  const sections: string[] = [];

  // Similar profiles section
  if (context.similarProfiles.length > 0) {
    const profileLines = context.similarProfiles.map((p, i) => {
      const parts = [`Profile ${i + 1} (${(p.similarity * 100).toFixed(0)}% similar)`];
      if (p.diploma) parts.push(`Education: ${p.diploma}`);
      if (p.skills?.length) parts.push(`Skills: ${p.skills.slice(0, 3).join(', ')}`);
      if (p.monthlyMargin !== undefined) parts.push(`Monthly margin: ${p.monthlyMargin}`);
      return parts.join(', ');
    });

    sections.push('## Similar Students\n' + profileLines.join('\n'));
  }

  // Relevant advice section
  if (context.relevantAdvice.length > 0) {
    const adviceLines = context.relevantAdvice.map((a, i) => {
      const prefix = `Advice ${i + 1} (${(a.similarity * 100).toFixed(0)}% relevant)`;
      const outcome = a.outcome === 'helpful' ? ' [HELPFUL]' : '';
      return `${prefix}${outcome}: ${a.text.slice(0, 200)}...`;
    });

    sections.push('## Past Helpful Advice\n' + adviceLines.join('\n'));
  }

  // Similar goals section
  if (context.similarGoals.length > 0) {
    const goalLines = context.similarGoals.map((g, i) => {
      const parts = [
        `Goal ${i + 1} (${(g.similarity * 100).toFixed(0)}% similar)`,
        `${g.goalName}: ${g.amount}`,
      ];
      if (g.status) parts.push(`Status: ${g.status}`);
      if (g.feasibilityScore) parts.push(`Feasibility: ${(g.feasibilityScore * 100).toFixed(0)}%`);
      return parts.join(', ');
    });

    sections.push('## Similar Goals Achieved\n' + goalLines.join('\n'));
  }

  if (sections.length === 0) {
    return '';
  }

  return '\n---\n## Context from Similar Students\n' + sections.join('\n\n') + '\n---\n';
}

/**
 * Index a new student profile for RAG
 */
export async function indexStudentProfile(
  profileId: string,
  profile: {
    name?: string;
    diploma?: string;
    field?: string;
    skills?: string[];
    city?: string;
    monthlyIncome?: number;
    monthlyExpenses?: number;
    monthlyMargin?: number;
    goals?: Array<{ name: string; amount: number }>;
  }
): Promise<void> {
  return maybeTrace('rag.indexProfile', async (span) => {
    const embedding = await embeddings.embedProfile(profile);

    // Skip indexing if embeddings are disabled
    if (embedding.length === 0) {
      span.setAttributes({
        'profile.id': profileId,
        'embeddings.disabled': true,
      });
      return;
    }

    await vectorstore.embedProfile(profileId, JSON.stringify(profile), embedding, {
      diploma: profile.diploma,
      skills: profile.skills,
      monthlyMargin: profile.monthlyMargin,
      city: profile.city,
    });

    span.setAttributes({
      'profile.id': profileId,
      'profile.hasSkills': (profile.skills?.length || 0) > 0,
      'profile.hasGoals': (profile.goals?.length || 0) > 0,
    });
  });
}

/**
 * Index advice given to a student
 */
export async function indexAdvice(
  adviceId: string,
  advice: {
    text: string;
    profileId: string;
    context?: string;
    goalType?: string;
    outcome?: 'helpful' | 'neutral' | 'unhelpful';
  }
): Promise<void> {
  return maybeTrace('rag.indexAdvice', async (span) => {
    const embedding = await embeddings.embedAdvice({
      text: advice.text,
      context: advice.context,
      goalType: advice.goalType,
    });

    // Skip indexing if embeddings are disabled
    if (embedding.length === 0) {
      span.setAttributes({
        'advice.id': adviceId,
        'embeddings.disabled': true,
      });
      return;
    }

    await vectorstore.storeAdvice(adviceId, advice.text, embedding, {
      profileId: advice.profileId,
      goalType: advice.goalType,
      outcome: advice.outcome,
      timestamp: new Date().toISOString(),
    });

    span.setAttributes({
      'advice.id': adviceId,
      'advice.profileId': advice.profileId,
      'advice.goalType': advice.goalType || 'general',
    });
  });
}

/**
 * Index a goal
 */
export async function indexGoal(
  goalId: string,
  goal: {
    name: string;
    amount: number;
    userId: string;
    deadline?: string;
    description?: string;
    category?: string;
    feasibilityScore?: number;
    status?: string;
  }
): Promise<void> {
  return maybeTrace('rag.indexGoal', async (span) => {
    const embedding = await embeddings.embedGoal({
      name: goal.name,
      amount: goal.amount,
      deadline: goal.deadline,
      description: goal.description,
      category: goal.category,
    });

    // Skip indexing if embeddings are disabled
    if (embedding.length === 0) {
      span.setAttributes({
        'goal.id': goalId,
        'embeddings.disabled': true,
      });
      return;
    }

    await vectorstore.embedGoal(goalId, JSON.stringify(goal), embedding, {
      userId: goal.userId,
      goalName: goal.name,
      goalAmount: goal.amount,
      feasibilityScore: goal.feasibilityScore,
      status: goal.status,
    });

    span.setAttributes({
      'goal.id': goalId,
      'goal.name': goal.name,
      'goal.amount': goal.amount,
    });
  });
}

/**
 * Update advice feedback (for learning)
 */
export async function updateAdviceFeedback(
  adviceId: string,
  outcome: 'helpful' | 'neutral' | 'unhelpful'
): Promise<void> {
  return maybeTrace('rag.updateFeedback', async (span) => {
    await vectorstore.updateAdviceOutcome(adviceId, outcome);

    span.setAttributes({
      'advice.id': adviceId,
      'advice.outcome': outcome,
    });
  });
}

// Export RAG service
export const rag = {
  getContext: getRAGContext,
  formatForPrompt: formatRAGContextForPrompt,
  indexProfile: indexStudentProfile,
  indexAdvice,
  indexGoal,
  updateFeedback: updateAdviceFeedback,
};

export default rag;
