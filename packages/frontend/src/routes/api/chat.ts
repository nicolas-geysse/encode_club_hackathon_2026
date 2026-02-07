/**
 * Chat API Route
 *
 * Handles LLM-powered chat for onboarding and general conversation.
 * Uses any OpenAI-compatible LLM provider (Groq, Mistral, OpenAI, etc.)
 * Traces everything to Opik for observability.
 *
 * Refactored to use lib/chat modules for:
 * - Extraction patterns and regex (lib/chat/extraction)
 * - Prompts and interpolation (lib/chat/prompts)
 * - Flow control and step management (lib/chat/flow)
 * - Intent detection (lib/chat/intent)
 * - Slash commands (lib/chat/commands)
 * - Response evaluation (lib/chat/evaluation)
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  getLLMClient,
  getModel,
  getProvider,
  calculateCost,
  type ChatMessage,
  OpenAI,
} from '../../lib/llm';
import {
  trace,
  logFeedbackScores,
  getCurrentTraceId,
  getTraceUrl,
  type TraceOptions,
  type TraceContext,
} from '../../lib/opik';
import { processWithGroqExtractor, type ProfileData } from '../../lib/chat/extraction';
import { createLogger } from '../../lib/logger';
import { ActionDispatcher } from '../../lib/chat/ActionDispatcher';
import { ActionExecutor } from '../../lib/chat/ActionExecutor';
import { ACTIONS, type ActionType } from '../../types/actions';
import type { UIResource } from '../../types/chat';

// Import from refactored modules
import { type OnboardingStep, type ChatMode, type DetectedIntent } from '../../lib/chat/types';
import { extractWithRegex } from '../../lib/chat/extraction';
import {
  SYSTEM_PROMPTS,
  STEP_PROMPTS,
  EXTRACTION_PROMPT,
  interpolatePrompt,
  getCurrencySymbol,
} from '../../lib/chat/prompts';
import {
  getNextStep,
  findFirstIncompleteStep,
  getStepQuestion,
  getClarificationMessage,
  getFallbackStepResponse,
  generateCompletionMessage,
} from '../../lib/chat/flow';
import { detectIntent, isIntentFallback } from '../../lib/chat/intent';
import { parseSlashCommand, executeSlashCommand } from '../../lib/chat/commands';
import { runResponseEvaluation } from '../../lib/chat/evaluation';
import { WorkingMemory } from '../../lib/mastra/workingMemory';
import {
  getReferenceDate,
  isDeadlinePassed,
  formatTimeRemaining,
  getWeeksUntil,
  type TimeContext,
} from '../../lib/timeAwareDate';
import {
  calculateProjection,
  buildProjectionSummary,
  type FinancialData,
  type ScenarioModifications,
} from '../../lib/budgetEngine';
import {
  buildChartGallery,
  buildBudgetBreakdownChart,
  buildProgressChart,
  buildProjectionChart,
  buildEnergyChart,
  buildSkillArbitrageChart,
  buildMissionChart,
  buildCapacityChart,
  buildChartWithLinks,
  type EnergyLogEntry,
  type TradePotential,
  type SkillJobMatch,
  type MissionSummary,
  type WeekCapacity,
} from '../../lib/chatChartBuilder';
import { toISODate } from '../../lib/dateUtils';
import {
  handleProgressSummary,
  handleRecommendFocus,
  handleCompleteMission,
  handleSkipMission,
  handleUpdateEnergy,
  type ChatHandlerContext,
} from '../../lib/chat/handlers';

const logger = createLogger('ChatAPI');

/**
 * Consolidated budget context for chat
 */
interface BudgetContext {
  totalIncome: number;
  activeExpenses: number;
  netMargin: number;
  pausedSavings: number;
  tradeSalesCompleted: number;
  tradeBorrowSavings: number;
  tradePotential: number;
  tradeSalesPotential: number;
  tradeBorrowPotential: number;
  adjustedMargin: number;
  goalProgress: number;
  monthsUntilDeadline: number;
}

/**
 * Project currentSaved forward based on simulation offset.
 * If simulating +X days, add (X/7) weeks of savings.
 *
 * @param currentSaved - Current saved amount (static)
 * @param weeklySavings - Weekly savings rate
 * @param timeCtx - Time context with simulation info
 * @returns Projected savings amount
 */
function getProjectedSavings(
  currentSaved: number,
  weeklySavings: number,
  timeCtx: TimeContext
): number {
  if (!timeCtx.isSimulating || !timeCtx.offsetDays || weeklySavings <= 0) {
    return currentSaved;
  }
  const weeksElapsed = timeCtx.offsetDays / 7;
  return Math.round(currentSaved + weeklySavings * weeksElapsed);
}

/**
 * Fetch consolidated budget context for a profile
 * Returns null on failure (non-blocking)
 */
async function fetchBudgetContext(profileId?: string): Promise<BudgetContext | null> {
  if (!profileId) return null;

  try {
    const url = `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/budget?profileId=${profileId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.error || !data.budget) {
      return null;
    }

    const b = data.budget;
    return {
      totalIncome: b.totalIncome || 0,
      activeExpenses: b.activeExpenses || 0,
      netMargin: b.netMargin || 0,
      pausedSavings: b.pausedSavings || 0,
      tradeSalesCompleted: b.tradeSalesCompleted || 0,
      tradeBorrowSavings: b.tradeBorrowSavings || 0,
      tradePotential: b.totalTradePotential || 0,
      tradeSalesPotential: b.tradeSalesPotential || 0,
      tradeBorrowPotential: b.tradeBorrowPotential || 0,
      adjustedMargin: b.adjustedMargin || 0,
      goalProgress: b.goalProgress || 0,
      monthsUntilDeadline: b.monthsUntilDeadline || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch active goal data for a profile as fallback
 * Returns null if no active goal or on failure
 */
interface GoalData {
  name: string;
  amount: number;
  deadline?: string;
  currentSaved?: number;
}

async function fetchActiveGoal(profileId?: string): Promise<GoalData | null> {
  if (!profileId) return null;

  try {
    const url = `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/goals?profileId=${profileId}&status=active`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const goals = await response.json();
    if (!Array.isArray(goals) || goals.length === 0) {
      return null;
    }

    // Return the first active goal
    const goal = goals[0];
    return {
      name: goal.name,
      amount: goal.amount,
      deadline: goal.deadline,
      currentSaved: goal.currentSaved || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Format budget context for LLM prompt
 * Uses correct semantic separation: monthly recurring vs one-time gains
 */
function formatBudgetForPrompt(budget: BudgetContext): string {
  const lines: string[] = ['Financial Summary:'];

  // MONTHLY RECURRING (continuous cash flows)
  lines.push('');
  lines.push('MONTHLY INCOME (recurring):');
  lines.push(`- Income: ${budget.totalIncome}€/month`);
  lines.push(`- Expenses: ${budget.activeExpenses}€/month`);
  lines.push(`- Net margin: ${budget.netMargin}€/month`);

  // ONE-TIME GAINS (realized)
  const oneTimeGainsTotal =
    (budget.tradeSalesCompleted || 0) +
    (budget.tradeBorrowSavings || 0) +
    (budget.pausedSavings || 0);

  if (oneTimeGainsTotal > 0) {
    lines.push('');
    lines.push('ONE-TIME GAINS (realized):');
    if (budget.tradeSalesCompleted > 0) {
      lines.push(`- Completed sales: +${budget.tradeSalesCompleted}€`);
    }
    if (budget.tradeBorrowSavings > 0) {
      lines.push(`- Borrowing savings: +${budget.tradeBorrowSavings}€`);
    }
    if (budget.pausedSavings > 0) {
      lines.push(`- Paused items: +${budget.pausedSavings}€`);
    }
    lines.push(`- Total one-time gains: +${oneTimeGainsTotal}€`);
  }

  // POTENTIAL (not yet realized)
  if (budget.tradePotential > 0) {
    lines.push('');
    lines.push('POTENTIAL GAINS (unrealized):');
    lines.push(`- Pending trades: +${budget.tradePotential}€`);
  }

  // GOAL PROJECTION (combines correctly)
  if (budget.goalProgress > 0 && budget.monthsUntilDeadline > 0) {
    const fromMonthlyMargin = budget.netMargin * budget.monthsUntilDeadline;
    const totalProjected = fromMonthlyMargin + oneTimeGainsTotal;

    lines.push('');
    lines.push('GOAL PROJECTION:');
    lines.push(`- Months remaining: ${budget.monthsUntilDeadline}`);
    lines.push(
      `- From monthly margin: ${fromMonthlyMargin}€ (${budget.netMargin}€ × ${budget.monthsUntilDeadline} months)`
    );
    lines.push(`- From one-time gains: ${oneTimeGainsTotal}€`);
    lines.push(`- PROJECTED TOTAL: ${totalProjected}€`);
    lines.push(`- Progress: ${budget.goalProgress.toFixed(1)}%`);
  }

  return lines.join('\n');
}

/**
 * Fetch RAG context for a query (non-blocking, returns empty on failure)
 * @see sprint-10-5.md Phase 2
 */
async function fetchRAGContext(queryText: string, profileId?: string): Promise<string> {
  try {
    // Try to get RAG context via internal API
    const response = await fetch(
      `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/rag`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText, profileId }),
      }
    );

    if (!response.ok) {
      return ''; // RAG not available
    }

    const data = (await response.json()) as { formattedContext?: string; available?: boolean };
    if (data.available && data.formattedContext) {
      return data.formattedContext;
    }
    return '';
  } catch {
    // RAG fetch failed - continue without it
    return '';
  }
}

// Feature flag for LLM extractor (set to false to use legacy approach without JSON mode)
const USE_GROQ_EXTRACTOR = process.env.USE_GROQ_EXTRACTOR !== 'false';

// Opik initialization state (run once per server instance)
let opikInitialized = false;

/**
 * Auto-initialize Opik evaluators and feedback definitions on first request
 * This sets up the LLM-as-judge evaluators and annotation queues in Opik
 */
async function ensureOpikSetup(): Promise<void> {
  if (opikInitialized) return;

  try {
    const { isOpikRestAvailable, initializeStrideOpikSetup } = await import('../../lib/opikRest');
    if (await isOpikRestAvailable()) {
      const projectName = process.env.OPIK_PROJECT || 'stride';
      await initializeStrideOpikSetup(projectName);
      opikInitialized = true;
      logger.info('Opik evaluators auto-initialized', { projectName });
    }
  } catch (error) {
    // Non-fatal: evaluators are optional enhancement
    logger.info('Opik setup skipped (non-fatal)', { error });
    opikInitialized = true; // Mark as done to avoid retrying every request
  }
}

interface ChatRequest {
  message: string;
  step: OnboardingStep;
  /** Chat mode: onboarding, conversation, or profile-edit */
  mode?: ChatMode;
  context?: Record<string, unknown>;
  /** Thread ID for grouping conversation turns in Opik */
  threadId?: string;
  /** Profile ID for user identification */
  profileId?: string;
  /** Recent conversation history for context (last 4 turns = 8 messages) */
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  /** Time context for simulation support */
  timeContext?: {
    simulatedDate: string;
    isSimulating: boolean;
    offsetDays: number;
    deadlinePassed?: boolean;
  };
}

interface ChatResponse {
  response: string;
  extractedData: Record<string, unknown>;
  nextStep: OnboardingStep;
  /** Detected intent from the message */
  intent?: DetectedIntent;
  /** Trace ID for this turn (useful for feedback) */
  traceId?: string;
  /** Opik trace URL for "Explain This" feature */
  traceUrl?: string;
  /** Source of the response: 'llm' (JSON mode), 'llm_legacy' (text mode), or 'fallback' (regex) */
  source?: 'llm' | 'llm_legacy' | 'fallback';
  /** MCP-UI interactive component to render in chat */
  uiResource?: UIResource;
}

/**
 * Generate a UI resource for the response based on context
 * Returns interactive MCP-UI components for specific scenarios
 */
function generateUIResourceForResponse(
  extractedData: Record<string, unknown>,
  currentStep: OnboardingStep,
  _response: string,
  context?: Record<string, unknown>
): UIResource | undefined {
  // Get currency symbol from context (profile data) or default to $
  const currencySymbol = getCurrencySymbol((context?.currency as string) || 'USD');
  // Note: Goal confirmation form removed - OnboardingFormStep already captures goal data
  // directly, making a second confirmation redundant and confusing for users.

  // Onboarding complete summary
  if (currentStep === 'complete' || currentStep === 'lifestyle') {
    const summaryData: Record<string, string> = {};
    if (extractedData.name) summaryData['Name'] = String(extractedData.name);
    if (extractedData.goalName) summaryData['Goal'] = String(extractedData.goalName);
    if (extractedData.goalAmount)
      summaryData['Target'] = `${currencySymbol}${extractedData.goalAmount}`;

    // Only show summary if we have data
    if (Object.keys(summaryData).length > 0) {
      return {
        type: 'composite',
        components: [
          {
            type: 'metric',
            params: {
              title: 'Profile Ready',
              value: Object.keys(summaryData).length,
              unit: 'fields completed',
            },
          },
          {
            type: 'action',
            params: {
              type: 'button',
              label: 'Go to Me',
              variant: 'primary',
              action: 'navigate',
              params: { to: '/me' },
            },
          },
        ],
      };
    }
  }

  // Budget analysis - when income/expenses extracted
  if (currentStep === 'budget' && extractedData.income && extractedData.expenses) {
    const income = Number(extractedData.income);
    const expenses = Number(extractedData.expenses);
    const margin = income - expenses;

    return {
      type: 'grid',
      params: {
        columns: 2,
        children: [
          {
            type: 'metric',
            params: {
              title: 'Monthly Income',
              value: income,
              unit: currencySymbol,
            },
          },
          {
            type: 'metric',
            params: {
              title: 'Monthly Expenses',
              value: expenses,
              unit: currencySymbol,
            },
          },
          {
            type: 'metric',
            params: {
              title: 'Monthly Margin',
              value: margin,
              unit: currencySymbol,
              trend: { direction: margin >= 0 ? 'up' : 'down' },
            },
          },
        ],
      },
    };
  }

  // Skills list - when skills extracted
  if (
    currentStep === 'skills' &&
    Array.isArray(extractedData.skills) &&
    extractedData.skills.length > 0
  ) {
    return {
      type: 'table',
      params: {
        title: 'Your Skills',
        columns: [{ key: 'skill', label: 'Skill' }],
        rows: (extractedData.skills as string[]).map((skill) => ({ skill })),
      },
    };
  }

  return undefined;
}

// POST: Handle chat message
export async function POST(event: APIEvent) {
  // Auto-initialize Opik evaluators on first request (non-blocking)
  ensureOpikSetup().catch(() => {});

  try {
    const body = (await event.request.json()) as ChatRequest;
    const {
      message,
      step,
      mode = 'onboarding',
      context = {},
      threadId,
      profileId,
      conversationHistory,
      timeContext,
    } = body;

    if (!message || !step) {
      return new Response(
        JSON.stringify({ error: true, message: 'message and step are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Load Working Memory (Scratchpad)
    let currentWorkingMemory: string[] = [];
    if (profileId) {
      try {
        currentWorkingMemory = await WorkingMemory.get(profileId);
      } catch (e) {
        logger.error('Failed to load working memory', { error: e });
      }
    }

    // Check for slash commands first (works in any mode)
    const slashCommand = parseSlashCommand(message);
    if (slashCommand) {
      const commandResult = await executeSlashCommand(slashCommand, context, profileId);
      if (commandResult) {
        logger.info('Slash command executed', { command: slashCommand });
        return new Response(
          JSON.stringify({
            response: commandResult.response,
            uiResource: commandResult.uiResource,
            extractedData: commandResult.extractedData || {},
            source: 'command',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Unknown command - return helpful error
      return new Response(
        JSON.stringify({
          response: `Unknown command: /${slashCommand}. Type /help to see available commands.`,
          extractedData: {},
          source: 'command',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // DIRECT ACTION PARSING - Handle __action: prefix from quick links
    // Bypasses intent detection for reliable chart rendering
    // =========================================================================
    if (message.startsWith('__action:')) {
      const directAction = message.slice('__action:'.length);
      logger.info('Direct action received', { action: directAction });

      // Create a synthetic intent for the action
      const syntheticIntent: DetectedIntent = {
        mode: 'conversation',
        action: directAction,
        _matchedPattern: 'direct_action',
      };

      // Route to conversation mode handler with the direct action
      const directResult = await handleConversationMode(
        message,
        'conversation',
        context,
        threadId,
        profileId,
        timeContext,
        syntheticIntent // Pass intent directly to skip detection
      );

      return new Response(JSON.stringify(directResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // CHART REQUESTS - Only in conversation/profile-edit modes
    // Skip during onboarding: LLM fallback can misclassify skills/data as show_* intents
    // =========================================================================
    if (mode !== 'onboarding') {
      const chartIntent = await detectIntent(message, context, {
        llmClient: getLLMClient() || undefined,
        mode: mode || 'conversation',
        currentStep: step,
      });
      if (chartIntent.action?.startsWith('show_')) {
        // Redirect to conversation mode handler for ALL display actions (charts, swipe, etc.)
        const chartResult = await handleConversationMode(
          message,
          'conversation', // Force conversation mode for charts
          context,
          threadId,
          profileId,
          timeContext
        );
        return new Response(JSON.stringify(chartResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle conversation mode (after onboarding is complete)
    if (mode === 'conversation' || mode === 'profile-edit') {
      const conversationResult = await handleConversationMode(
        message,
        mode,
        context,
        threadId,
        profileId,
        timeContext
      );
      return new Response(JSON.stringify(conversationResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build trace options with threadId for conversation grouping
    const traceOptions: TraceOptions = {
      source: 'frontend_api',
      threadId: threadId, // Groups all turns of a conversation in Opik UI
      input: {
        message: message.substring(0, 500),
        step,
        mode,
        profileId,
      },
      tags: ['onboarding', step],
    };

    // Try Groq extractor with JSON mode first (if enabled)
    if (USE_GROQ_EXTRACTOR) {
      try {
        const groqResult = await processWithGroqExtractor({
          message,
          currentStep: step,
          existingProfile: context as ProfileData,
          threadId, // Pass threadId for conversation grouping in Opik
          conversationHistory, // Pass history for context awareness
          workingMemory: currentWorkingMemory, // Pass working memory for context
          timeContext, // Pass time context for deadline normalization (simulation support)
        });

        // Get trace ID for response
        const traceId = getCurrentTraceId();

        // Log automatic feedback scores based on extraction quality
        if (traceId) {
          const extractedCount = Object.keys(groqResult.extractedData).length;
          const didAdvance = groqResult.nextStep !== step;

          // Non-blocking feedback logging
          logFeedbackScores(traceId, [
            {
              name: 'extraction_success',
              value: extractedCount > 0 ? 1 : 0,
              reason:
                extractedCount > 0 ? `Extracted ${extractedCount} fields` : 'No fields extracted',
            },
            {
              name: 'conversation_progress',
              value: didAdvance ? 1 : 0.5,
              reason: didAdvance ? 'Advanced to next step' : 'Stayed on same step',
            },
          ]).catch(() => {});
        }

        // Save Working Memory Updates
        const workingMemoryUpdates = groqResult.extractedData?.workingMemoryUpdates;
        if (
          workingMemoryUpdates &&
          Array.isArray(workingMemoryUpdates) &&
          workingMemoryUpdates.length > 0 &&
          profileId
        ) {
          WorkingMemory.update(profileId, workingMemoryUpdates as string[])
            .then(() => {
              logger.debug(`WorkingMemory updated for ${profileId}`, {
                updates: workingMemoryUpdates,
              });
            })
            .catch((err) => {
              logger.error('WorkingMemory failed to save updates', { error: err });
            });
        }

        // Convert to ChatResponse format - use actual source from result
        const extractedData = groqResult.extractedData as Record<string, unknown>;
        const nextStep = groqResult.nextStep as OnboardingStep;
        const uiResource = generateUIResourceForResponse(
          extractedData,
          step,
          groqResult.response,
          context
        );

        const result: ChatResponse = {
          response: groqResult.response,
          extractedData,
          nextStep,
          traceId: traceId || undefined,
          source: groqResult.source === 'llm' ? 'llm' : 'fallback',
          uiResource,
        };

        logger.debug(`Response source: ${groqResult.source}`);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (groqError) {
        logger.error('Groq extractor failed, falling back to legacy', { error: groqError });
        // Fall through to legacy Groq approach
      }
    }

    // Legacy Groq-only approach (fallback)
    const client = getLLMClient();
    if (!client) {
      // Fallback: return simple response without LLM
      logger.debug('Response from fallback (no LLM)');
      const fallbackResult = getFallbackResponse(message, step, context);
      const fallbackUiResource = generateUIResourceForResponse(
        fallbackResult.extractedData,
        step,
        fallbackResult.response,
        context
      );
      return new Response(
        JSON.stringify({ ...fallbackResult, source: 'fallback', uiResource: fallbackUiResource }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Wrap entire chat flow with trace
    const result = await trace(
      'chat.onboarding.legacy',
      async (span) => {
        span.setAttributes({
          'chat.step': step,
          'chat.message_length': message.length,
          'chat.context_keys': Object.keys(context).length,
          'chat.mode': 'legacy_groq',
          'chat.profile_id': profileId || 'anonymous',
        });
        // threadId is handled by trace options

        // Step 1: Extract data from user message
        const extractedData = await extractDataFromMessage(client, message, context);

        // Merge with existing context
        const updatedContext = { ...context, ...extractedData };

        // Step 2: Determine next step (only advances if relevant data was extracted)
        const nextStep = getNextStep(step, extractedData);
        const didAdvance = nextStep !== step;

        // Step 3: Generate response
        let response: string;
        if (nextStep === 'complete') {
          response = generateCompletionMessage(updatedContext);
        } else if (!didAdvance) {
          // Didn't advance - generate a clarification message
          response = await generateClarificationResponse(client, step, updatedContext);
        } else {
          response = await generateStepResponse(client, nextStep, updatedContext);
        }

        // Step 4: Quick evaluation of response (non-blocking)
        const evaluation = await runResponseEvaluation(response, updatedContext);
        if (evaluation) {
          span.setAttributes({
            'evaluation.passed': evaluation.passed,
            'evaluation.score': evaluation.score,
            'evaluation.issues_count': evaluation.issues.length,
          });
        }

        span.setAttributes({
          'chat.next_step': nextStep,
          'chat.did_advance': didAdvance,
          'chat.extracted_fields': Object.keys(extractedData).length,
          'chat.extracted_keys': Object.keys(extractedData).join(','),
          'chat.response_length': response.length,
          // Add input/output for better Opik visibility
          'input.message': message.substring(0, 500),
          'input.step': step,
          'output.response': response.substring(0, 500),
          'output.next_step': nextStep,
        });

        // Get trace ID for feedback
        const currentTraceId = getCurrentTraceId();

        // Log feedback scores for legacy path too
        if (currentTraceId) {
          const extractedCount = Object.keys(extractedData).length;
          logFeedbackScores(currentTraceId, [
            {
              name: 'extraction_success',
              value: extractedCount > 0 ? 1 : 0,
              reason:
                extractedCount > 0 ? `Extracted ${extractedCount} fields` : 'No fields extracted',
            },
            {
              name: 'conversation_progress',
              value: didAdvance ? 1 : 0.5,
              reason: didAdvance ? 'Advanced to next step' : 'Stayed on same step',
            },
          ]).catch(() => {});
        }

        // Generate UI resource for legacy path
        const legacyUiResource = generateUIResourceForResponse(
          extractedData,
          step,
          response,
          context
        );

        return {
          response,
          extractedData,
          nextStep,
          traceId: currentTraceId || undefined,
          source: 'llm_legacy',
          uiResource: legacyUiResource,
        } as ChatResponse;
      },
      traceOptions // Use full trace options with threadId
    );

    logger.debug('Response from Groq (legacy path)');
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Chat API error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Extract structured data from user message using LLM
async function extractDataFromMessage(
  client: OpenAI,
  message: string,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return trace('chat.extraction', async (span) => {
    span.setAttributes({
      'extraction.message_length': message.length,
      'extraction.model': getModel(),
    });

    // First try regex extraction for common patterns (faster and more reliable)
    // Determine current step from context for regex extraction
    const currentStep = (context.step as OnboardingStep) || 'greeting';
    const regexData = extractWithRegex(message, currentStep, context);

    try {
      const prompt = EXTRACTION_PROMPT.replace('{message}', message);

      const completion = await client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.extraction },
          { role: 'user', content: prompt },
        ],
        temperature: 0.0, // Zero temperature for deterministic extraction
        max_tokens: 512,
      });

      const content = completion.choices[0]?.message?.content || '{}';

      // Set usage for Opik
      if (completion.usage) {
        span.setUsage({
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        });
      }

      span.setAttributes({
        'extraction.response_length': content.length,
      });

      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          // Merge LLM extraction with regex extraction (regex takes priority for found fields)
          const merged = { ...extracted, ...regexData };
          span.setAttributes({
            'extraction.fields_found': Object.keys(merged).length,
            'extraction.llm_fields': Object.keys(extracted).length,
            'extraction.regex_fields': Object.keys(regexData).length,
            'extraction.method': 'llm+regex',
            'input.message': message.substring(0, 200),
            'output.extracted': JSON.stringify(merged).substring(0, 500),
          });
          return merged;
        } catch (parseError) {
          logger.error('JSON parse error', {
            error: parseError,
            content: content?.substring(0, 200),
          });
        }
      }

      // LLM didn't return valid JSON, use regex only
      span.setAttributes({
        'extraction.fields_found': Object.keys(regexData).length,
        'extraction.method': 'regex_only',
      });
      return regexData;
    } catch (error) {
      logger.error('Extraction error', { error });
      span.setAttributes({
        'extraction.fields_found': Object.keys(regexData).length,
        'extraction.method': 'regex_fallback',
      });
      return regexData;
    }
  });
}

// Generate response for a specific step
async function generateStepResponse(
  client: OpenAI,
  step: OnboardingStep,
  context: Record<string, unknown>
): Promise<string> {
  return trace('chat.generation', async (span) => {
    span.setAttributes({
      'generation.step': step,
      'generation.model': getModel(),
    });

    const promptTemplate = STEP_PROMPTS[step];
    if (!promptTemplate) {
      span.setAttributes({ 'generation.fallback': 'no_template' });
      return "Let's continue!";
    }

    // Interpolate context into prompt using the utility function
    const prompt = interpolatePrompt(promptTemplate, context);

    try {
      const completion = await client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.onboarding },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 600, // B.4: Increased for fuller responses
      });

      const response = completion.choices[0]?.message?.content || "Let's continue!";

      // Set usage for Opik
      if (completion.usage) {
        span.setUsage({
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        });
      }

      span.setAttributes({
        'generation.response_length': response.length,
        'generation.method': 'llm',
      });

      return response;
    } catch (error) {
      logger.error('Response generation error', { error });
      span.setAttributes({ 'generation.method': 'fallback' });
      return getFallbackStepResponse(step, context);
    }
  });
}

// Generate clarification message when user input wasn't understood
async function generateClarificationResponse(
  client: OpenAI,
  step: OnboardingStep,
  _context: Record<string, unknown>
): Promise<string> {
  const clarificationText = getClarificationMessage(step);

  // Try LLM for a more natural response, fall back to static
  try {
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.onboarding },
        {
          role: 'user',
          content: `The user's message wasn't clear enough. Politely ask again for: ${clarificationText}
Keep it short and friendly (1-2 sentences).`,
        },
      ],
      temperature: 0.7,
      max_tokens: 250, // B.4: Increased to avoid cut-off
    });

    return completion.choices[0]?.message?.content || clarificationText;
  } catch {
    return clarificationText;
  }
}

// Fallback response when LLM is unavailable
function getFallbackResponse(
  message: string,
  step: OnboardingStep,
  context: Record<string, unknown>
): ChatResponse {
  const extractedData = extractWithRegex(message, step, context) as Record<string, unknown>;
  const nextStep = getNextStep(step, extractedData);
  const updatedContext = { ...context, ...extractedData };

  return {
    response: getFallbackStepResponse(nextStep, updatedContext),
    extractedData,
    nextStep,
  };
}

// =============================================================================
// Conversation Mode (Post-Onboarding)
// =============================================================================

/**
 * Build contextual follow-up suggestion buttons based on user state (Phase 4.3)
 * Returns null if the current action already includes its own action buttons.
 */
function buildFollowUpSuggestions(
  context: Record<string, unknown>,
  currentAction: string
): UIResource | null {
  // Actions that already return rich UI with buttons
  const actionsWithOwnButtons = [
    'progress_summary',
    'check_progress',
    'recommend_focus',
    'complete_mission',
    'skip_mission',
    'update_energy',
    'show_budget_chart',
    'show_progress_chart',
    'show_energy_chart',
    'show_earnings_chart',
    'show_projection_chart',
    'show_comparison_chart',
    'show_skills_chart',
    'show_missions_chart',
    'show_capacity_chart',
    'show_chart_gallery',
    'get_advice',
    'search_jobs',
    'search_remote_jobs',
    'show_sellable_items',
    'show_swipe_embed',
    'new_goal',
    'pause_subscription',
  ];
  if (actionsWithOwnButtons.includes(currentAction)) return null;

  const suggestions: Array<{
    label: string;
    to?: string;
    action?: string;
    actionParams?: Record<string, unknown>;
  }> = [];
  const hasGoal = Boolean(context.goalName);
  const goalProgress = (context._goalProgress as number) || 0;

  if (!hasGoal) {
    suggestions.push({ label: 'Create Goal', action: 'navigate', to: '/me?tab=goals' });
    suggestions.push({
      label: 'See Budget',
      action: 'show_chart',
      actionParams: { chartType: 'budget_breakdown' },
    });
  } else if (goalProgress >= 100) {
    suggestions.push({ label: 'New Goal', action: 'navigate', to: '/me?tab=goals' });
    suggestions.push({
      label: 'Final Stats',
      action: 'show_chart',
      actionParams: { chartType: 'progress' },
    });
  } else if (goalProgress < 50) {
    suggestions.push({ label: 'Swipe', to: '/swipe' });
    suggestions.push({
      label: 'What If...',
      action: 'show_chart',
      actionParams: { chartType: 'projection' },
    });
  }

  if (suggestions.length === 0) return null;

  return {
    type: 'grid',
    params: {
      columns: suggestions.length,
      children: suggestions.map((s) => ({
        type: 'action' as const,
        params: s.to
          ? { type: 'button', label: s.label, action: 'navigate', params: { to: s.to } }
          : { type: 'button', label: s.label, action: s.action || '', params: s.actionParams },
      })),
    },
  };
}

/**
 * Handle conversation mode chat (after onboarding)
 * @param providedIntent - Optional intent to skip detection (used by direct action routing)
 */
async function handleConversationMode(
  message: string,
  currentMode: ChatMode,
  context: Record<string, unknown>,
  threadId?: string,
  profileId?: string,
  timeContext?: TimeContext,
  providedIntent?: DetectedIntent
): Promise<ChatResponse> {
  // Build time context for internal use (default to current date if not provided)
  const timeCtx: TimeContext = timeContext || {
    simulatedDate: new Date().toISOString(),
    isSimulating: false,
    offsetDays: 0,
  };

  // Use provided intent or detect from message (Phase 2: async with LLM fallback)
  const preIntent =
    providedIntent ||
    (await detectIntent(message, context, {
      llmClient: getLLMClient() || undefined,
      mode: currentMode,
      currentStep: 'conversation', // In conversation mode, step is generic
    }));

  const traceOptions: TraceOptions = {
    source: 'frontend_api',
    threadId,
    input: {
      message: message.substring(0, 500),
      mode: currentMode,
      profileId,
      goalName: context.goalName,
      goalAmount: context.goalAmount,
    },
    tags: [
      'conversation',
      currentMode,
      `action:${preIntent.action || 'general'}`,
      preIntent.field ? `field:${preIntent.field}` : undefined,
    ].filter(Boolean) as string[],
  };

  return trace(
    'chat.conversation',
    async (ctx: TraceContext) => {
      // Span 1: Intent Detection (type: tool - it's a processing step)
      const intent = await ctx.createChildSpan(
        'chat.intent_detection',
        async (span) => {
          const detected = preIntent;
          // Determine if this is a fallback (no specific intent matched)
          const isFallback = isIntentFallback(detected);
          span.setAttributes({
            detected_mode: detected.mode,
            detected_action: detected.action || 'general',
            detected_field: detected.field || 'none',
            message_length: message.length,
            // Enhanced observability for intent detection
            message_preview: message.substring(0, 100),
            is_fallback: isFallback,
            matched_pattern: detected._matchedPattern || 'unknown',
          });
          span.setOutput({ intent: detected, is_fallback: isFallback });
          return detected;
        },
        { type: 'tool', input: { message: message.substring(0, 200) } }
      );

      // Span 2: Profile/Context Lookup (type: tool)
      await ctx.createChildSpan(
        'chat.context_lookup',
        async (span) => {
          span.setAttributes({
            profile_id: profileId || 'anonymous',
            has_name: Boolean(context.name),
            has_goal: Boolean(context.goalName),
            goal_amount: context.goalAmount || 0,
            context_keys: Object.keys(context).length,
          });
          span.setOutput({ profile_id: profileId, has_profile: Boolean(context.name) });
        },
        { type: 'tool', input: { profileId } }
      );

      // Span 2.5: Fetch consolidated budget context (type: tool)
      const budgetContext = await ctx.createChildSpan(
        'chat.budget_context',
        async (span) => {
          const budget = await fetchBudgetContext(profileId);
          span.setAttributes({
            'budget.available': budget !== null,
            'budget.net_margin': budget?.netMargin || 0,
            'budget.adjusted_margin': budget?.adjustedMargin || 0,
            'budget.goal_progress': budget?.goalProgress || 0,
          });
          if (budget) {
            span.setOutput({
              netMargin: budget.netMargin,
              adjustedMargin: budget.adjustedMargin,
              goalProgress: budget.goalProgress,
            });
          }
          return budget;
        },
        { type: 'tool', input: { profileId } }
      );

      // Span 2.6: Fetch goal data as fallback if not in context
      const goalFallback = await ctx.createChildSpan(
        'chat.goal_fallback',
        async (span) => {
          // Only fetch if context doesn't have goal data
          if (context.goalDeadline && context.goalName && context.goalAmount) {
            span.setAttributes({ 'goal.source': 'context', 'goal.fetch_needed': false });
            return null; // Context already has goal data
          }

          const goal = await fetchActiveGoal(profileId);
          span.setAttributes({
            'goal.source': goal ? 'api_fallback' : 'none',
            'goal.fetch_needed': true,
            'goal.found': goal !== null,
          });

          if (goal) {
            // Enrich context with goal data from API
            context.goalName = context.goalName || goal.name;
            context.goalAmount = context.goalAmount || goal.amount;
            context.goalDeadline = context.goalDeadline || goal.deadline;
            context.currentSaved = context.currentSaved || goal.currentSaved;
            span.setOutput({
              goal_name: goal.name,
              goal_amount: goal.amount,
              goal_deadline: goal.deadline,
            });
          }
          return goal;
        },
        { type: 'tool', input: { profileId, has_context_goal: Boolean(context.goalDeadline) } }
      );

      // Log intent detection feedback scores for evaluation and dashboard
      const isFallback = isIntentFallback(intent);
      const traceIdForFeedback = ctx.getTraceId();
      if (traceIdForFeedback) {
        // Non-blocking: log multiple feedback scores for intent detection quality
        logFeedbackScores(traceIdForFeedback, [
          {
            name: 'intent_detection_confidence',
            value: isFallback ? 0.2 : 1.0, // Low confidence for fallback, high for matched pattern
            reason: isFallback
              ? `Fallback: "${message.substring(0, 50)}..."`
              : `Pattern: ${intent._matchedPattern}, action: ${intent.action}`,
          },
          {
            name: 'intent_is_fallback',
            value: isFallback ? 0 : 1, // 0 = fallback (bad), 1 = detected (good)
            reason: intent._matchedPattern || 'no_pattern',
          },
        ]).catch(() => {}); // Non-blocking
      }

      ctx.setAttributes({
        'chat.mode': currentMode,
        'chat.intent.mode': intent.mode,
        'chat.intent.action': intent.action || 'none',
        'chat.intent.field': intent.field || 'none',
        'user.profile_id': profileId || 'anonymous',
        'user.has_goal': Boolean(context.goalName),
      });

      // Generate response based on intent
      let response = '';
      const extractedData: Record<string, unknown> = {};

      // -----------------------------------------------------------------------
      // Agentic Action Dispatcher (Sprint 15)
      // -----------------------------------------------------------------------
      if (intent.action && intent.action in ACTIONS) {
        try {
          const actionStats = ActionDispatcher.dispatch(
            intent.action,
            { ...context, ...(intent.field ? { [intent.field]: intent.extractedValue } : {}) },
            traceIdForFeedback || 'unknown-trace'
          );

          if (actionStats.status === 'missing_info' && actionStats.uiResource) {
            const actionDef = ACTIONS[intent.action as ActionType];
            response = `I can help with that. Please provide the details for **${actionDef.description}**.`;

            const actionTraceId = traceIdForFeedback;

            ctx.setOutput({
              action: intent.action,
              status: 'missing_info',
              missing: actionStats.missingFields,
            });
            return {
              response,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              intent,
              traceId: actionTraceId || undefined,
              traceUrl: actionTraceId ? getTraceUrl(actionTraceId) : undefined,
              source: 'llm' as const,
              uiResource: actionStats.uiResource,
            };
          }

          // If status is 'ready', we allow it to fall through to specific handlers or default execution
          // For now, we'll let specific cases handle execution, or add a generic executor later.
          if (actionStats.status === 'ready') {
            const executionResult = await ActionExecutor.execute(
              intent.action as ActionType,
              actionStats.data,
              profileId || 'anonymous'
            );

            const actionTraceId = traceIdForFeedback;
            const traceUrl = actionTraceId ? getTraceUrl(actionTraceId) : undefined;

            ctx.setOutput({
              action: intent.action,
              status: executionResult.success ? 'executed' : 'failed',
              result: executionResult.message,
            });

            return {
              response: executionResult.message,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              intent,
              traceId: actionTraceId || undefined,
              traceUrl,
              source: 'llm' as const,
            };
          }
        } catch (err) {
          logger.error('ActionDispatcher error', { error: err });
        }
      }
      // -----------------------------------------------------------------------

      // Phase 2.3: Proactive detection — prefix response if notable state detected
      let proactivePrefix = '';
      const goalProgress = budgetContext?.goalProgress || 0;
      context._goalProgress = goalProgress; // Expose for follow-up suggestions
      if (goalProgress >= 100 && !context._goalCelebrated) {
        proactivePrefix = `**Goal Achieved!** You reached your target for ${context.goalName || 'your goal'}!\n\n`;
        context._goalCelebrated = true;
      } else if (goalProgress >= 80 && goalProgress < 100) {
        proactivePrefix = `**Almost there!** You're at ${Math.round(goalProgress)}% of your goal.\n\n`;
      }

      switch (intent.action) {
        case 'restart_new_profile': {
          // Signal frontend to reset ALL state and create a new profile
          response = `No problem! Let's start with a brand new profile. 🆕\n\n**What's your name?**`;
          const newProfileTraceId = ctx.getTraceId();
          const result = {
            response,
            extractedData: { _restartNewProfile: true },
            nextStep: 'greeting' as OnboardingStep, // Start at greeting to collect name
            source: 'llm' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'restart_new_profile' },
            traceId: newProfileTraceId || undefined,
            traceUrl: newProfileTraceId ? getTraceUrl(newProfileTraceId) : undefined,
          };
          ctx.setOutput({ response: response.substring(0, 300), action: 'restart_new_profile' });
          return result;
        }

        case 'restart_update_profile': {
          // Signal frontend to restart onboarding but KEEP the same profile ID (update mode)
          response = `Sure! Let's update your profile information. 🔄\n\n**What's your name?** (currently: ${context.name || 'not set'})`;
          const updateProfileTraceId = ctx.getTraceId();
          const result = {
            response,
            extractedData: { _restartUpdateProfile: true },
            nextStep: 'greeting' as OnboardingStep, // Start from greeting to ask name first
            source: 'llm' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'restart_update_profile' },
            traceId: updateProfileTraceId || undefined,
            traceUrl: updateProfileTraceId ? getTraceUrl(updateProfileTraceId) : undefined,
          };
          ctx.setOutput({ response: response.substring(0, 300), action: 'restart_update_profile' });
          return result;
        }

        case 'continue_onboarding': {
          // Find where user left off and resume from there
          const incompleteStep = findFirstIncompleteStep(context);
          const continueTraceId = ctx.getTraceId();
          const continueTraceUrl = continueTraceId ? getTraceUrl(continueTraceId) : undefined;
          if (incompleteStep === 'complete') {
            response = `Your profile is already complete! 🎉 You can:\n\n- **View your plan** - Go to "Me"\n- **Update something** - "Change my city to Paris"\n- **Set a new goal** - "I want to save for a laptop"`;
            const result = {
              response,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              source: 'llm' as const,
              intent: { mode: 'conversation' as ChatMode, action: 'continue_onboarding' },
              traceId: continueTraceId || undefined,
              traceUrl: continueTraceUrl,
            };
            ctx.setOutput({ response: response.substring(0, 300), action: 'continue_complete' });
            return result;
          }
          const stepQuestion = getStepQuestion(incompleteStep, context);
          response = `Let's continue! 📝\n\n${stepQuestion}`;
          const result = {
            response,
            extractedData: { _continueOnboarding: true, _resumeAtStep: incompleteStep },
            nextStep: incompleteStep,
            source: 'llm' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'continue_onboarding' },
            traceId: continueTraceId || undefined,
            traceUrl: continueTraceUrl,
          };
          ctx.setOutput({
            response: response.substring(0, 300),
            action: 'continue_onboarding',
            resumeAt: incompleteStep,
          });
          return result;
        }

        case 'update_name':
          if (intent.extractedValue) {
            extractedData.name = intent.extractedValue;
            response = `Got it! I've updated your name to **${intent.extractedValue}**. 👋\n\nIs there anything else you'd like to change?`;
          } else {
            response = `What would you like to change your name to?`;
          }
          break;

        case 'update':
          if (intent.field === 'city' && intent.extractedValue) {
            extractedData.city = intent.extractedValue;
            response = `Done! I've updated your city to **${intent.extractedValue}**. 🏙️\n\nYou can see this change in the **Profile** tab.`;
          } else if (intent.field === 'budget') {
            // Proximity-based extraction - associate amounts with nearest keywords
            const lower = message.toLowerCase();

            // Keywords with their positions in the string
            const incomeKeywords = [
              'income',
              'earn',
              'salary',
              'get',
              'receive',
              'make',
              'gagne',
              'revenu',
              'salaire',
            ];
            const expenseKeywords = [
              'expense',
              'spend',
              'pay',
              'cost',
              'rent',
              'loyer',
              'dépense',
              'paye',
              'charges',
            ];

            // Find all keyword positions
            type KeywordType = 'income' | 'expense';
            const findKeywordPositions = (
              keywords: string[],
              type: KeywordType
            ): { type: KeywordType; pos: number }[] => {
              const positions: { type: KeywordType; pos: number }[] = [];
              for (const kw of keywords) {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                let match;
                while ((match = regex.exec(lower)) !== null) {
                  positions.push({ type, pos: match.index });
                }
              }
              return positions;
            };

            const incomePositions = findKeywordPositions(incomeKeywords, 'income');
            const expensePositions = findKeywordPositions(expenseKeywords, 'expense');
            const allKeywords = [...incomePositions, ...expensePositions].sort(
              (a, b) => a.pos - b.pos
            );

            // Find all amounts with their positions
            const amountRegex = /[$€£]?\s*(\d[\d,.\s]*)/g;
            const amountsWithPos: { value: number; pos: number }[] = [];
            let amtMatch;
            while ((amtMatch = amountRegex.exec(message)) !== null) {
              const value = parseInt(amtMatch[1].replace(/[^\d]/g, ''), 10);
              if (value > 0) {
                amountsWithPos.push({ value, pos: amtMatch.index });
              }
            }

            // Associate each amount with nearest keyword (proximity-based)
            let detectedIncome: number | null = null;
            let detectedExpense: number | null = null;

            for (const amt of amountsWithPos) {
              let nearestKeyword: { type: KeywordType; pos: number } | null = null;
              let minDistance = Infinity;

              for (const kw of allKeywords) {
                const distance = Math.abs(amt.pos - kw.pos);
                if (distance < minDistance) {
                  minDistance = distance;
                  nearestKeyword = kw;
                }
              }

              if (nearestKeyword) {
                if (nearestKeyword.type === 'income') {
                  detectedIncome = amt.value;
                } else {
                  detectedExpense = amt.value;
                }
              }
            }

            // Fallback: if no keywords found but amounts exist, try to infer from single keyword presence
            if (detectedIncome === null && detectedExpense === null && amountsWithPos.length > 0) {
              const hasIncomeKw = incomePositions.length > 0;
              const hasExpenseKw = expensePositions.length > 0;

              if (hasIncomeKw && !hasExpenseKw) {
                detectedIncome = amountsWithPos[0].value;
              } else if (hasExpenseKw && !hasIncomeKw) {
                detectedExpense = amountsWithPos[0].value;
              } else {
                // No keywords at all - default to income (most common update)
                detectedIncome = amountsWithPos[0].value;
              }
            }

            // Build response based on what was detected
            if (detectedIncome !== null && detectedExpense !== null) {
              extractedData.income = detectedIncome;
              extractedData.expenses = detectedExpense;
              response = `Done! I've updated your budget: income **${detectedIncome}**, expenses **${detectedExpense}**. 💰\n\nYou can see this change in the **Profile** tab.`;
            } else if (detectedIncome !== null) {
              extractedData.income = detectedIncome;
              response = `Done! I've updated your monthly income to **${detectedIncome}**. 💰\n\nYou can see this change in the **Profile** tab.`;
            } else if (detectedExpense !== null) {
              extractedData.expenses = detectedExpense;
              response = `Done! I've updated your monthly expenses to **${detectedExpense}**. 💸\n\nYou can see this change in the **Profile** tab.`;
            } else {
              response = `Sure, I can help you update your budget. What's your new monthly income (and expenses if you want)?`;
            }
          } else if (intent.field === 'work_preferences') {
            // Extract work hours and hourly rate
            const hoursMatch = message.match(/(\d+)\s*h(?:ours?)?/i);
            const rateMatch = message.match(/[$€£]?\s*(\d+)\s*(?:\/h|per\s*h|hourly|€\/h|[$]\/h)/i);

            if (hoursMatch) {
              extractedData.maxWorkHours = parseInt(hoursMatch[1], 10);
            }
            if (rateMatch) {
              extractedData.minHourlyRate = parseInt(rateMatch[1], 10);
            }

            if (extractedData.maxWorkHours || extractedData.minHourlyRate) {
              const updates = [];
              if (extractedData.maxWorkHours)
                updates.push(`max hours: **${extractedData.maxWorkHours}h/week**`);
              if (extractedData.minHourlyRate)
                updates.push(`min rate: **${extractedData.minHourlyRate}/h**`);
              response = `Done! I've updated your work preferences: ${updates.join(', ')}. ⏰\n\nYou can see this change in the **Profile** tab.`;
            } else {
              response = `Sure, I can help you update your work preferences. What's your max hours per week and/or minimum hourly rate?`;
            }
          } else if (intent.field) {
            response = `Sure, I can help you update your ${intent.field.replace('_', ' ')}. What's the new value?`;
          } else {
            response = `I can help you update your profile. What would you like to change?\n\n- Name, diploma, city, skills\n- Work preferences (hours, hourly rate)\n- Budget (income, expenses)`;
          }
          break;

        case 'new_goal': {
          const extractedGoal = intent.extractedGoal;
          const hasName = extractedGoal?.name && extractedGoal.name.length > 0;
          const hasAmount = extractedGoal?.amount && extractedGoal.amount > 0;

          if (hasName && hasAmount) {
            // We have enough info to create the goal
            const goalName = extractedGoal.name!;
            const goalAmount = extractedGoal.amount!;

            // Parse deadline or default to 3 months from now
            let deadlineDate: Date;
            if (extractedGoal.deadline) {
              // Try to parse the deadline string
              const monthNames = [
                'january',
                'february',
                'march',
                'april',
                'may',
                'june',
                'july',
                'august',
                'september',
                'october',
                'november',
                'december',
              ];
              const monthMatch = extractedGoal.deadline.toLowerCase();
              const monthIndex = monthNames.findIndex((m) => monthMatch.includes(m));
              if (monthIndex !== -1) {
                const year = new Date().getFullYear();
                const targetMonth = monthIndex;
                deadlineDate = new Date(year, targetMonth + 1, 0); // Last day of month
                if (deadlineDate < new Date()) {
                  deadlineDate = new Date(year + 1, targetMonth + 1, 0); // Next year
                }
              } else {
                deadlineDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 3 months
              }
            } else {
              deadlineDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 3 months
            }

            const deadline = toISODate(deadlineDate);

            // Store goal data in extractedData for the frontend to save
            extractedData.newGoal = {
              name: goalName,
              amount: goalAmount,
              deadline,
              status: 'active',
              priority: 1,
            };

            const currencySymbol = getCurrencySymbol(context.currency as string);
            response = `I've created a new goal for you!\n\n🎯 **${goalName}**\n💰 Target: ${currencySymbol}${goalAmount}\n📅 Deadline: ${deadline}\n\nYou can view and manage this goal in the **Goals** tab!`;
          } else if (hasName || hasAmount) {
            // Partial info - ask for the missing piece
            const currencySymbol = getCurrencySymbol(context.currency as string);
            if (hasName && !hasAmount) {
              response = `Great, saving for **${extractedGoal?.name}**! How much do you need to save for it?`;
            } else {
              response = `Got it, ${currencySymbol}${extractedGoal?.amount}! What are you saving for?`;
            }
          } else {
            const currencySymbol = getCurrencySymbol(context.currency as string);
            response = `Great idea to set a new goal! Tell me:\n\n1. **What** are you saving for?\n2. **How much** do you need?\n3. **By when** do you need it?\n\nFor example: "Save ${currencySymbol}500 for a vacation by June"`;
          }
          break;
        }

        // =====================================================================
        // WHAT-IF SCENARIOS (Budget Projections) - Time-aware
        // =====================================================================
        case 'whatif_work': {
          const scenario = intent.extractedScenario || {};
          const hours = scenario.hours || 5;
          const rate = scenario.rate || (context.minHourlyRate as number) || 15;
          const currencySymbol = getCurrencySymbol(context.currency as string);

          // Build financial data for projection
          const goalDeadline = context.goalDeadline as string;
          if (!goalDeadline) {
            response = `I'd love to show you a projection, but you don't have a goal deadline set yet. Set a goal first!`;
            break;
          }

          const financialData: FinancialData = {
            income: (context.income as number) || 0,
            expenses: (context.expenses as number) || 0,
            currentSaved: (context.currentSaved as number) || 0,
            goalAmount: (context.goalAmount as number) || 0,
            goalDeadline,
          };

          const modifications: ScenarioModifications = {
            additionalHoursPerWeek: hours,
            hourlyRate: rate,
          };

          const projection = calculateProjection(financialData, timeCtx, modifications);

          // Build response with projection summary
          const summary = buildProjectionSummary(projection, currencySymbol);
          const extraMonthly = hours * rate * 4.33;

          if (projection.scenarioPath?.success && !projection.currentPath.success) {
            response = `Great idea! Working **${hours}h/week at ${currencySymbol}${rate}/h** would add **${currencySymbol}${Math.round(extraMonthly)}/month** to your budget.\n\n${summary}\n\nThis could help you reach your goal!`;
          } else if (projection.scenarioPath?.success) {
            response = `Working **${hours}h/week at ${currencySymbol}${rate}/h** would add **${currencySymbol}${Math.round(extraMonthly)}/month**.\n\n${summary}`;
          } else {
            response = `Working **${hours}h/week at ${currencySymbol}${rate}/h** would add **${currencySymbol}${Math.round(extraMonthly)}/month**, but you'd still need more to reach your goal.\n\n${summary}`;
          }

          // Add chart UI resource
          const chartResource: UIResource = {
            type: 'chart',
            params: {
              type: 'comparison',
              title: 'Goal Projection',
              data: {
                labels: ['Current Path', 'With Work'],
                datasets: [
                  {
                    label: 'Projected Amount',
                    data: [
                      Math.round(projection.currentPath.projectedTotal),
                      Math.round(projection.scenarioPath?.projectedTotal || 0),
                    ],
                    backgroundColor: ['rgba(239, 68, 68, 0.5)', 'rgba(34, 197, 94, 0.5)'],
                    borderColor: ['rgb(239, 68, 68)', 'rgb(34, 197, 94)'],
                  },
                ],
              },
              summary: {
                currentWeeks: projection.currentPath.weeksToGoal,
                scenarioWeeks: projection.scenarioPath?.weeksToGoal || null,
                weeksSaved: projection.delta?.weeks || 0,
              },
            },
          };

          const traceId = ctx.getTraceId();
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: traceId || undefined,
            traceUrl: traceId ? getTraceUrl(traceId) : undefined,
            source: 'llm' as const,
            uiResource: chartResource,
          };
        }

        case 'whatif_sell': {
          const scenario = intent.extractedScenario || {};
          const amount = scenario.amount || 100;
          const item = scenario.item || 'this item';
          const currencySymbol = getCurrencySymbol(context.currency as string);

          const goalDeadline = context.goalDeadline as string;
          if (!goalDeadline) {
            response = `I'd love to show you a projection, but you don't have a goal deadline set yet.`;
            break;
          }

          const financialData: FinancialData = {
            income: (context.income as number) || 0,
            expenses: (context.expenses as number) || 0,
            currentSaved: (context.currentSaved as number) || 0,
            goalAmount: (context.goalAmount as number) || 0,
            goalDeadline,
          };

          const modifications: ScenarioModifications = {
            oneTimeGain: amount,
          };

          const projection = calculateProjection(financialData, timeCtx, modifications);
          const summary = buildProjectionSummary(projection, currencySymbol);

          if (projection.scenarioPath?.success && !projection.currentPath.success) {
            response = `Selling **${item}** for **${currencySymbol}${amount}** would give your savings a nice boost!\n\n${summary}`;
          } else {
            response = `Selling **${item}** for **${currencySymbol}${amount}** would add to your progress.\n\n${summary}`;
          }
          break;
        }

        case 'whatif_cut': {
          const scenario = intent.extractedScenario || {};
          const amount = scenario.amount || 15;
          const service = scenario.service || 'this subscription';
          const currencySymbol = getCurrencySymbol(context.currency as string);

          const goalDeadline = context.goalDeadline as string;
          if (!goalDeadline) {
            response = `I'd love to show you a projection, but you don't have a goal deadline set yet.`;
            break;
          }

          const financialData: FinancialData = {
            income: (context.income as number) || 0,
            expenses: (context.expenses as number) || 0,
            currentSaved: (context.currentSaved as number) || 0,
            goalAmount: (context.goalAmount as number) || 0,
            goalDeadline,
          };

          const modifications: ScenarioModifications = {
            reducedExpenses: amount,
          };

          const projection = calculateProjection(financialData, timeCtx, modifications);
          const summary = buildProjectionSummary(projection, currencySymbol);

          response = `Cutting **${service}** (saving **${currencySymbol}${amount}/month**) would help!\n\n${summary}`;
          break;
        }

        case 'show_projection': {
          const currencySymbol = getCurrencySymbol(context.currency as string);
          const goalDeadline = context.goalDeadline as string;

          if (!goalDeadline) {
            response = `I don't have enough information for a projection. Set a goal with a deadline first!`;
            break;
          }

          const financialData: FinancialData = {
            income: (context.income as number) || 0,
            expenses: (context.expenses as number) || 0,
            currentSaved: (context.currentSaved as number) || 0,
            goalAmount: (context.goalAmount as number) || 0,
            goalDeadline,
          };

          const projection = calculateProjection(financialData, timeCtx);
          const summary = buildProjectionSummary(projection, currencySymbol);

          // Add time-aware context
          const timeRemaining = formatTimeRemaining(goalDeadline, timeCtx);
          const deadlinePassed = isDeadlinePassed(goalDeadline, timeCtx);

          if (deadlinePassed) {
            response = `Your goal deadline has **passed**. Consider updating your timeline.\n\n${summary}`;
          } else {
            response = `Here's your current projection (**${timeRemaining}** remaining):\n\n${summary}`;
          }
          break;
        }

        // =====================================================================
        // SWIPE EMBED (Swipe-in-Chat Feature)
        // =====================================================================

        case 'show_swipe_embed': {
          response = `Here are your available strategies!\n\nSwipe to choose your actions.`;
          const swipeResource: UIResource = {
            type: 'swipe_embed',
            params: {
              embedUrl: '/embed/swipe',
              fallbackUrl: '/swipe',
              height: 945,
              title: 'Swipe Strategies',
            },
          };
          const swipeTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_swipe_embed' });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: swipeTraceId || undefined,
            traceUrl: swipeTraceId ? getTraceUrl(swipeTraceId) : undefined,
            source: 'llm' as const,
            uiResource: swipeResource,
          };
        }

        // =====================================================================
        // CHART GALLERY & SPECIFIC CHARTS (Sprint Graphiques)
        // =====================================================================

        case 'show_chart_gallery': {
          response = `📊 **Available Charts**\n\nClick a button to display the chart:`;
          const galleryResource = buildChartGallery();
          const chartGalleryTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_chart_gallery', chartCount: 7 });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: chartGalleryTraceId || undefined,
            traceUrl: chartGalleryTraceId ? getTraceUrl(chartGalleryTraceId) : undefined,
            source: 'llm' as const,
            uiResource: galleryResource,
          };
        }

        case 'show_budget_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);

          // Prioritize budgetContext (fresh data from /api/budget) over context (snapshot)
          // This ensures paused expenses and other changes are reflected
          let income = budgetContext?.totalIncome || 0;
          let expenses = budgetContext?.activeExpenses || 0;

          // Fallback to context only if budgetContext unavailable
          if (income === 0) {
            if (typeof context.income === 'number') {
              income = context.income;
            } else if (Array.isArray(context.incomes)) {
              income = (context.incomes as Array<{ amount: number }>).reduce(
                (sum, i) => sum + (i.amount || 0),
                0
              );
            } else if (Array.isArray(context.income)) {
              income = (context.income as Array<{ amount: number }>).reduce(
                (sum, i) => sum + (i.amount || 0),
                0
              );
            }
          }

          if (expenses === 0) {
            if (typeof context.expenses === 'number') {
              expenses = context.expenses;
            } else if (Array.isArray(context.expenses)) {
              expenses = (context.expenses as Array<{ amount: number }>).reduce(
                (sum, e) => sum + (e.amount || 0),
                0
              );
            }
          }

          const savings = income - expenses;

          // Extract trade potential from budget context
          const sellPotential = budgetContext?.tradeSalesPotential || 0;
          const borrowPotential = budgetContext?.tradeBorrowPotential || 0;
          const tradePotential: TradePotential | undefined =
            sellPotential > 0 || borrowPotential > 0
              ? { sellPotential, borrowPotential }
              : undefined;

          if (income === 0 && expenses === 0) {
            response = `I don't have enough budget information yet. Tell me your income and expenses first!`;
            break;
          }

          // Build response text with trade potential if available
          let responseText = `📊 **Your Monthly Budget**\n\nIncome: **${currSymbol}${income}** | Expenses: **${currSymbol}${expenses}** | Savings: **${currSymbol}${savings}**`;

          if (tradePotential) {
            const tradeParts: string[] = [];
            if (sellPotential > 0) {
              tradeParts.push(`Sell items: **${currSymbol}${sellPotential}**`);
            }
            if (borrowPotential > 0) {
              tradeParts.push(`Borrow savings: **${currSymbol}${borrowPotential}**`);
            }
            responseText += `\n\n💰 **Trade Potential**: ${tradeParts.join(' | ')}`;
          }

          response = responseText;
          const budgetChartResource = buildBudgetBreakdownChart(
            income,
            expenses,
            savings,
            currSymbol,
            tradePotential
          );
          const budgetWithLinks = buildChartWithLinks(budgetChartResource, [
            { label: 'Edit Budget', to: '/me?tab=budget' },
            { label: 'Swipe', to: '/swipe' },
          ]);
          const budgetChartTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'show_budget_chart',
            income,
            expenses,
            savings,
            sellPotential,
            borrowPotential,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: budgetChartTraceId || undefined,
            traceUrl: budgetChartTraceId ? getTraceUrl(budgetChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: budgetWithLinks,
          };
        }

        case 'show_progress_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);
          const goalAmount = (context.goalAmount as number) || 0;
          const currentSaved = (context.currentSaved as number) || 0;

          // Extract one-time gains from budget context (already-realized gains)
          const oneTimeGainsTotal =
            (budgetContext?.tradeSalesCompleted || 0) +
            (budgetContext?.tradeBorrowSavings || 0) +
            (budgetContext?.pausedSavings || 0);

          // Calculate income/expenses from budget context or arrays
          let income = budgetContext?.totalIncome || 0;
          let expenses = budgetContext?.activeExpenses || 0;

          if (income === 0) {
            if (typeof context.income === 'number') {
              income = context.income;
            } else if (Array.isArray(context.incomes)) {
              income = (context.incomes as Array<{ amount: number }>).reduce(
                (sum, i) => sum + (i.amount || 0),
                0
              );
            }
          }
          if (expenses === 0) {
            if (typeof context.expenses === 'number') {
              expenses = context.expenses;
            } else if (Array.isArray(context.expenses)) {
              expenses = (context.expenses as Array<{ amount: number }>).reduce(
                (sum, e) => sum + (e.amount || 0),
                0
              );
            }
          }

          const weeklySavings = (income - expenses) / 4.33;

          // Project currentSaved forward if simulating, then add one-time gains
          const projectedSaved =
            getProjectedSavings(currentSaved, weeklySavings, timeCtx) + oneTimeGainsTotal;

          if (goalAmount === 0) {
            response = `You haven't set a savings goal yet. Create a goal first!`;
            break;
          }

          const weeksRemaining =
            weeklySavings > 0 ? Math.ceil((goalAmount - projectedSaved) / weeklySavings) : 52;

          // Add notes for simulation and trades
          const simNote = timeCtx.isSimulating
            ? `\n\n⏰ *Simulated: After ${timeCtx.offsetDays} days, you would have saved ~${currSymbol}${projectedSaved}*`
            : '';
          const tradesNote =
            oneTimeGainsTotal > 0
              ? ` (includes ${currSymbol}${oneTimeGainsTotal} from trades)`
              : '';
          response = `📈 **Progress Towards Your Goal**\n\nSaved: **${currSymbol}${projectedSaved}** of **${currSymbol}${goalAmount}**${tradesNote}${simNote}`;

          const progressChartResource = buildProgressChart(
            projectedSaved,
            goalAmount,
            weeksRemaining,
            weeklySavings,
            currSymbol,
            {
              isSimulating: timeCtx.isSimulating,
              offsetDays: timeCtx.offsetDays,
              simulatedDate: timeCtx.simulatedDate,
            },
            oneTimeGainsTotal
          );
          const progressWithLinks = buildChartWithLinks(progressChartResource, [
            { label: 'Go to Progress', to: '/progress' },
            {
              label: 'What-If Scenarios',
              action: 'show_chart',
              actionParams: { chartType: 'projection' },
            },
          ]);
          const progressChartTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'show_progress_chart',
            currentSaved: projectedSaved,
            goalAmount,
            weeksRemaining,
            oneTimeGains: oneTimeGainsTotal,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: progressChartTraceId || undefined,
            traceUrl: progressChartTraceId ? getTraceUrl(progressChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: progressWithLinks,
          };
        }

        case 'show_projection_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);
          const goalDeadlineForChart = context.goalDeadline as string;

          if (!goalDeadlineForChart) {
            response = `I don't have enough information for a projection. Set a goal with a deadline first!`;
            break;
          }

          // Calculate income/expenses from budget context or arrays
          let incomeForProjection = budgetContext?.totalIncome || 0;
          let expensesForProjection = budgetContext?.activeExpenses || 0;

          if (incomeForProjection === 0) {
            if (typeof context.income === 'number') {
              incomeForProjection = context.income;
            } else if (Array.isArray(context.incomes)) {
              incomeForProjection = (context.incomes as Array<{ amount: number }>).reduce(
                (sum, i) => sum + (i.amount || 0),
                0
              );
            }
          }
          if (expensesForProjection === 0) {
            if (typeof context.expenses === 'number') {
              expensesForProjection = context.expenses;
            } else if (Array.isArray(context.expenses)) {
              expensesForProjection = (context.expenses as Array<{ amount: number }>).reduce(
                (sum, e) => sum + (e.amount || 0),
                0
              );
            }
          }

          const financialDataForChart: FinancialData = {
            income: incomeForProjection,
            expenses: expensesForProjection,
            currentSaved: (context.currentSaved as number) || 0,
            goalAmount: (context.goalAmount as number) || 0,
            goalDeadline: goalDeadlineForChart,
          };

          const projectionForChart = calculateProjection(financialDataForChart, timeCtx);
          const summaryText = buildProjectionSummary(projectionForChart, currSymbol);
          const simNote = timeCtx.isSimulating
            ? `\n\n⏰ *Note: This projection is calculated from the simulated date (+${timeCtx.offsetDays} days)*`
            : '';
          response = `🎯 **Projection Towards Your Goal**\n\n${summaryText}${simNote}`;
          const projectionChartResource = buildProjectionChart(projectionForChart, currSymbol, {
            isSimulating: timeCtx.isSimulating,
            offsetDays: timeCtx.offsetDays,
            simulatedDate: timeCtx.simulatedDate,
          });
          const projectionChartTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'show_projection_chart',
            success: projectionForChart.currentPath.success,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: projectionChartTraceId || undefined,
            traceUrl: projectionChartTraceId ? getTraceUrl(projectionChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: projectionChartResource,
          };
        }

        case 'show_energy_chart': {
          // Priority order for energy data (most accurate first):
          // 1. energy_logs table via API (real mood data from daily logging)
          // 2. context.energyHistory as fallback (might be stale)
          let energyLogs: EnergyLogEntry[] = [];

          // Source 1 (PRIMARY): energy_logs API - real data from daily mood logging
          if (profileId) {
            try {
              const energyUrl = `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/energy-logs?profileId=${profileId}`;
              const energyResponse = await fetch(energyUrl);
              if (energyResponse.ok) {
                const energyData = await energyResponse.json();
                energyLogs = energyData.logs || [];
                if (energyLogs.length > 0) {
                  logger.debug('[show_energy_chart] Using energy_logs API (real data)', {
                    count: energyLogs.length,
                  });
                }
              }
            } catch (err) {
              logger.error('[show_energy_chart] Failed to fetch energy logs', {
                error: String(err),
              });
            }
          }

          // Source 2 (FALLBACK): context.energyHistory (might be stale followupData)
          if (energyLogs.length === 0) {
            const contextEnergyHistory = context.energyHistory as
              | Array<{ week: number; level: number; date: string }>
              | undefined;
            if (contextEnergyHistory && contextEnergyHistory.length > 0) {
              logger.debug('[show_energy_chart] Fallback to context.energyHistory', {
                count: contextEnergyHistory.length,
              });
              // Convert Suivi format to chart format (already 0-100 scale)
              energyLogs = contextEnergyHistory.map((entry) => ({
                date: entry.date || `Week ${entry.week}`,
                level: entry.level,
              }));
            }
          }

          logger.debug('[show_energy_chart] Final energyLogs', { count: energyLogs.length });

          if (energyLogs.length === 0) {
            response = `⚡ I don't have energy data yet. Start by logging your energy on the Tracking page!`;
            break;
          }

          response = `⚡ **Your Energy History**\n\nDashed lines indicate thresholds: red (40%) = fatigue, green (80%) = recovery.`;
          const energyChartResource = buildEnergyChart(energyLogs);
          const energyWithLinks = buildChartWithLinks(energyChartResource, [
            { label: 'Go to Progress', to: '/progress' },
          ]);
          const energyChartTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_energy_chart', logCount: energyLogs.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: energyChartTraceId || undefined,
            traceUrl: energyChartTraceId ? getTraceUrl(energyChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: energyWithLinks,
          };
        }

        case 'show_comparison_chart': {
          // For comparison, redirect to gallery since user needs to specify scenarios
          response = `📊 To compare scenarios, use "what if" commands. For example:\n\n- "What if I worked 5h/week?"\n- "What if I sold my bike?"\n- "What if I canceled Netflix?"\n\nOr choose a chart below:`;
          const comparisonGalleryResource = buildChartGallery();
          const comparisonTraceId = ctx.getTraceId();
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: comparisonTraceId || undefined,
            traceUrl: comparisonTraceId ? getTraceUrl(comparisonTraceId) : undefined,
            source: 'llm' as const,
            uiResource: comparisonGalleryResource,
          };
        }

        // =====================================================================
        // EARNINGS CHART (C.2 - Chat UI Consolidation)
        // =====================================================================
        case 'show_earnings_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);
          const goalAmount = (context.goalAmount as number) || 0;
          const currentSaved = (context.currentSaved as number) || 0;
          const goalName = context.goalName as string;

          if (goalAmount === 0) {
            response = `You haven't set a savings goal yet. Create a goal first to track your earnings progress!`;
            break;
          }

          // Calculate income/expenses from budget context
          let income = budgetContext?.totalIncome || 0;
          let expenses = budgetContext?.activeExpenses || 0;

          if (income === 0 && Array.isArray(context.incomes)) {
            income = (context.incomes as Array<{ amount: number }>).reduce(
              (sum, i) => sum + (i.amount || 0),
              0
            );
          }
          if (expenses === 0 && Array.isArray(context.expenses)) {
            expenses = (context.expenses as Array<{ amount: number }>).reduce(
              (sum, e) => sum + (e.amount || 0),
              0
            );
          }

          const weeklySavings = Math.max(0, (income - expenses) / 4.33);
          const projectedSaved = getProjectedSavings(currentSaved, weeklySavings, timeCtx);

          // Build weekly data for chart (project 8 weeks forward)
          const weekLabels: string[] = [];
          const actualData: number[] = [];
          const requiredPaceData: number[] = [];

          for (let week = 1; week <= 8; week++) {
            weekLabels.push(`Week ${week}`);
            // Cumulative projected earnings
            actualData.push(Math.round(projectedSaved + weeklySavings * (week - 1)));
            // Linear pace to goal
            requiredPaceData.push(Math.round((goalAmount / 8) * week));
          }

          response = `📊 **Earnings vs Goal Progress**\n\nGoal: **${goalName || 'Savings'}** (${currSymbol}${goalAmount})\nCurrent: **${currSymbol}${Math.round(projectedSaved)}** | Weekly pace: **${currSymbol}${Math.round(weeklySavings)}**`;

          const earningsChartResource: UIResource = {
            type: 'chart',
            params: {
              type: 'line',
              title: 'Earnings vs Goal Progress',
              data: {
                labels: weekLabels,
                datasets: [
                  {
                    label: 'Projected Earnings',
                    data: actualData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  },
                  {
                    label: 'Required Pace',
                    data: requiredPaceData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                  },
                  {
                    label: 'Goal Target',
                    data: weekLabels.map(() => goalAmount),
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                  },
                ],
              },
            },
          };

          const earningsChartTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'show_earnings_chart',
            goalAmount,
            currentSaved: projectedSaved,
            weeklySavings,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: earningsChartTraceId || undefined,
            traceUrl: earningsChartTraceId ? getTraceUrl(earningsChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: earningsChartResource,
          };
        }

        // =====================================================================
        // SKILL ARBITRAGE CHART (Phase 3.1)
        // =====================================================================
        case 'show_skills_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);
          const skills = (context.skills as string[]) || [];

          if (skills.length === 0) {
            response = `You haven't added any skills yet. Go to the Profile tab to add your skills!`;
            break;
          }

          // Build simplified arbitrage matches from context skills
          const matches: SkillJobMatch[] = skills.slice(0, 5).map((skill, i) => ({
            jobTitle: skill,
            score: Math.max(20, 90 - i * 15),
            rateScore: Math.max(0.3, 1 - i * 0.15),
            demandScore: Math.max(0.2, 0.9 - i * 0.1),
            effortScore: Math.max(0.3, 0.8 - i * 0.1),
            restScore: Math.max(0.4, 0.9 - i * 0.12),
            hourlyRate: Math.max(10, 25 - i * 3),
          }));

          const skillChart = buildSkillArbitrageChart(matches, currSymbol);
          const skillChartWithLinks = buildChartWithLinks(skillChart, [
            { label: 'Browse Jobs', to: '/me?tab=jobs' },
            { label: 'Swipe', to: '/swipe' },
          ]);

          response = `Here's your **Skill Arbitrage** breakdown — top ${matches.length} job matches based on your skills.`;
          const skillChartTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_skills_chart', skillCount: skills.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: skillChartTraceId || undefined,
            traceUrl: skillChartTraceId ? getTraceUrl(skillChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: skillChartWithLinks,
          };
        }

        // =====================================================================
        // MISSION PROGRESS CHART (Phase 3.2)
        // =====================================================================
        case 'show_missions_chart': {
          const followupData = context.followupData as
            | {
                missions?: Array<{
                  id: string;
                  title: string;
                  status?: string;
                  weeklyEarnings?: number;
                  hoursCompleted?: number;
                  weeklyHours?: number;
                  category?: string;
                }>;
              }
            | undefined;
          const missions = followupData?.missions || [];
          const activeMissions = missions.filter((m) => m.status === 'active');

          if (activeMissions.length === 0) {
            response = `You don't have any active missions. Go to Swipe to discover opportunities!`;
            break;
          }

          const summaries: MissionSummary[] = activeMissions.map((m) => ({
            title: m.title,
            progress:
              m.weeklyHours && m.weeklyHours > 0
                ? Math.min(100, Math.round(((m.hoursCompleted || 0) / m.weeklyHours) * 100))
                : (m.hoursCompleted || 0) > 0
                  ? 100
                  : 0,
            earnings: m.weeklyEarnings || 0,
            target: m.weeklyEarnings || 0,
            category: m.category || 'job_lead',
          }));

          const missionChart = buildMissionChart(summaries);
          const missionChartWithLinks = buildChartWithLinks(missionChart, [
            { label: 'Go to Progress', to: '/progress' },
            { label: 'Swipe for More', to: '/swipe' },
          ]);

          response = `Here are your **${activeMissions.length} active missions** and their progress.`;
          const missionChartTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_missions_chart', missionCount: activeMissions.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: missionChartTraceId || undefined,
            traceUrl: missionChartTraceId ? getTraceUrl(missionChartTraceId) : undefined,
            source: 'llm' as const,
            uiResource: missionChartWithLinks,
          };
        }

        // =====================================================================
        // WEEKLY CAPACITY CHART (Phase 3.3)
        // =====================================================================
        case 'show_capacity_chart': {
          const maxHours = (context.maxWorkHours as number) || 15;
          const academicEvents =
            (context.academicEvents as Array<{
              name: string;
              type: string;
              startDate?: string;
              endDate?: string;
            }>) || [];

          // Build 4-week capacity data
          const weeks: WeekCapacity[] = [];
          const now = new Date();
          for (let w = 0; w < 4; w++) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() + w * 7);
            const weekLabel = `Week ${w + 1} (${weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })})`;

            // Count protected hours from academic events overlapping this week
            let protectedHours = 0;
            for (const event of academicEvents) {
              if (event.startDate && event.endDate) {
                const evStart = new Date(event.startDate);
                const evEnd = new Date(event.endDate);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 7);
                if (evStart < weekEnd && evEnd > weekStart) {
                  protectedHours +=
                    event.type === 'exam_period' ? 20 : event.type === 'class_intensive' ? 10 : 0;
                }
              }
            }

            // Get committed hours from active missions
            const followup = context.followupData as
              | { missions?: Array<{ status?: string; weeklyHours?: number }> }
              | undefined;
            const activeMissions = (followup?.missions || []).filter((m) => m.status === 'active');
            const committedHours = activeMissions.reduce((sum, m) => sum + (m.weeklyHours || 0), 0);

            const available = Math.max(0, maxHours - protectedHours - committedHours);
            weeks.push({ weekLabel, protectedHours, committedHours, availableHours: available });
          }

          const capacityChart = buildCapacityChart(weeks);
          const capacityChartWithLinks = buildChartWithLinks(capacityChart, [
            { label: 'Academic Events', to: '/me?tab=profile' },
            { label: 'Swipe', to: '/swipe' },
          ]);

          response = `Here's your **weekly capacity** for the next 4 weeks (max ${maxHours}h/week).`;
          const capacityTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_capacity_chart', maxHours, weeks: weeks.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: capacityTraceId || undefined,
            traceUrl: capacityTraceId ? getTraceUrl(capacityTraceId) : undefined,
            source: 'llm' as const,
            uiResource: capacityChartWithLinks,
          };
        }

        // =====================================================================
        // JOB SEARCH (C.3 - Chat UI Consolidation)
        // =====================================================================
        case 'search_jobs':
        case 'search_remote_jobs': {
          const isRemote = intent.action === 'search_remote_jobs';
          const currSymbol = getCurrencySymbol(context.currency as string);

          // Use category data directly (no Google Maps API required)
          const { PROSPECTION_CATEGORIES } = await import('../../config/prospectionCategories');

          // Filter categories based on remote vs general
          const relevantCategories = isRemote
            ? PROSPECTION_CATEGORIES.filter(
                (c) => c.id === 'digital' || c.id === 'tutoring' || c.id === 'interim'
              )
            : PROSPECTION_CATEGORIES.slice(0, 6); // Top 6 categories

          // Platform URL mapping for clickable links
          const PLATFORM_URLS: Record<string, string> = {
            Indeed: 'https://www.indeed.fr/',
            StudentJob: 'https://www.studentjob.fr/',
            HelloWork: 'https://www.hellowork.com/',
            'Carrefour Jobs': 'https://recrute.carrefour.fr/',
            Monoprix: 'https://recrute.monoprix.fr/',
            O2: 'https://www.o2recrute.fr/',
            Shiva: 'https://www.shiva.fr/',
            TaskRabbit: 'https://www.taskrabbit.fr/',
            Frizbiz: 'https://www.frizbiz.com/',
            YoupiJob: 'https://youpijob.fr/',
            Yoopies: 'https://yoopies.fr/',
            Bsit: 'https://bsit.com/',
            'Nounou-Top': 'https://www.nounou-top.fr/',
            DogBuddy: 'https://www.rover.com/',
            Superprof: 'https://www.superprof.fr/',
            Kelprof: 'https://www.kelprof.com/',
            Acadomia: 'https://www.acadomia.fr/',
            Complétude: 'https://www.completude.com/',
            'Hotesse.com': 'https://www.hotesse.com/',
            Jobbing: 'https://www.jobbing.fr/',
            'Student Pop': 'https://www.studentpop.fr/',
            Adecco: 'https://www.adecco.fr/',
            Manpower: 'https://www.manpower.fr/',
            Randstad: 'https://www.randstad.fr/',
            Synergie: 'https://www.synergie.fr/',
            Malt: 'https://www.malt.fr/',
            Fiverr: 'https://www.fiverr.com/',
            Upwork: 'https://www.upwork.com/',
            Comeup: 'https://comeup.com/',
            Jobaviz: 'https://www.jobaviz.fr/',
            Jooble: 'https://fr.jooble.org/',
            'TotalEnergies Jobs': 'https://careers.totalenergies.com/',
          };

          const jobRows = relevantCategories.map((cat) => ({
            category: cat.label,
            rate: `${currSymbol}${cat.avgHourlyRate.min}-${cat.avgHourlyRate.max}/hr`,
            platforms: cat.platforms.slice(0, 2).map((p) => ({
              text: p,
              href:
                PLATFORM_URLS[p] ||
                `https://www.google.com/search?q=${encodeURIComponent(p + ' emploi étudiant')}`,
            })),
            flexibility: `${'★'.repeat(5 - cat.effortLevel)}${'☆'.repeat(cat.effortLevel)}`,
          }));

          response = isRemote
            ? `💼 **Remote & Digital Jobs**\n\nHere are job categories you can do from home:`
            : `💼 **Job Categories for Students**\n\nExplore these opportunities:`;

          const jobsTableResource: UIResource = {
            type: 'table',
            params: {
              title: isRemote ? 'Remote Job Categories' : 'Job Categories',
              columns: [
                { key: 'category', label: 'Category' },
                { key: 'rate', label: 'Rate' },
                { key: 'platforms', label: 'Platforms' },
                { key: 'flexibility', label: 'Flexibility' },
              ],
              rows: jobRows,
            },
          };

          const jobsTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: intent.action,
            categoryCount: relevantCategories.length,
            isRemote,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: jobsTraceId || undefined,
            traceUrl: jobsTraceId ? getTraceUrl(jobsTraceId) : undefined,
            source: 'llm' as const,
            uiResource: jobsTableResource,
          };
        }

        // =====================================================================
        // SELLABLE ITEMS (C.4 - Chat UI Consolidation)
        // =====================================================================
        case 'show_sellable_items': {
          const currSymbol = getCurrencySymbol(context.currency as string);

          try {
            // Fetch trades from trades API
            const tradesResponse = await fetch(
              `${process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3006}`}/api/trades?profileId=${profileId}&type=sell`
            );

            let trades: Array<{
              name: string;
              value: number;
              status: string;
              description?: string;
            }> = [];

            if (tradesResponse.ok) {
              trades = await tradesResponse.json();
            }

            // Filter to only pending/available items
            const availableTrades = trades.filter((t) => t.status === 'pending');

            if (availableTrades.length === 0) {
              response = `You don't have any items listed for sale yet.\n\nGo to the **Trade** tab to add items you could sell!`;
              break;
            }

            const totalValue = availableTrades.reduce((sum, t) => sum + (t.value || 0), 0);
            const tradeRows = availableTrades.map((t) => ({
              item: t.name,
              description: t.description || '-',
              value: `${currSymbol}${t.value || 0}`,
            }));

            response = `💰 **Items You Can Sell**\n\nTotal potential: **${currSymbol}${totalValue}**`;

            const tradesTableResource: UIResource = {
              type: 'table',
              params: {
                title: `Sellable Items (Total: ${currSymbol}${totalValue})`,
                columns: [
                  { key: 'item', label: 'Item' },
                  { key: 'description', label: 'Description' },
                  { key: 'value', label: 'Value' },
                ],
                rows: tradeRows,
              },
            };

            const tradesTraceId = ctx.getTraceId();
            ctx.setOutput({
              action: 'show_sellable_items',
              itemCount: availableTrades.length,
              totalValue,
            });
            return {
              response,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              intent,
              traceId: tradesTraceId || undefined,
              traceUrl: tradesTraceId ? getTraceUrl(tradesTraceId) : undefined,
              source: 'llm' as const,
              uiResource: tradesTableResource,
            };
          } catch (err) {
            logger.error('[show_sellable_items] Failed to fetch trades', { error: String(err) });
            response = `I couldn't fetch your items right now. Check the **Trade** tab directly!`;
            break;
          }
        }

        // ----- Extracted handlers (Phase 1: chat-final sprint) -----
        case 'progress_summary':
        case 'recommend_focus':
        case 'complete_mission':
        case 'skip_mission':
        case 'update_energy': {
          const handlerCtx: ChatHandlerContext = {
            profileId,
            context,
            budgetContext,
            intent,
            timeCtx,
            ctx,
          };

          const handlerMap: Record<
            string,
            (c: ChatHandlerContext) => Promise<import('../../lib/chat/handlers').ChatHandlerResult>
          > = {
            progress_summary: handleProgressSummary,
            recommend_focus: handleRecommendFocus,
            complete_mission: handleCompleteMission,
            skip_mission: handleSkipMission,
            update_energy: handleUpdateEnergy,
          };

          const handler = handlerMap[intent.action!];
          if (handler) {
            const result = await handler(handlerCtx);
            const handlerTraceId = ctx.getTraceId();
            ctx.setOutput({ action: intent.action, handler: 'extracted' });
            return {
              response: result.response,
              extractedData: result.extractedData || {},
              nextStep: 'complete' as OnboardingStep,
              intent,
              traceId: handlerTraceId || undefined,
              traceUrl: handlerTraceId ? getTraceUrl(handlerTraceId) : undefined,
              source: 'llm' as const,
              uiResource: result.uiResource,
            };
          }
          break;
        }

        case 'check_progress': {
          const goalNameCP = (context.goalName as string) || 'your goal';
          const goalAmountCP = (context.goalAmount as number) || 0;
          const currentSavedCP = (context.currentSaved as number) || 0;
          const currSymbolCP = getCurrencySymbol(context.currency as string);
          const marginCP = budgetContext?.adjustedMargin || budgetContext?.netMargin || 0;
          const progressCP =
            goalAmountCP > 0 ? Math.round((currentSavedCP / goalAmountCP) * 100) : 0;

          if (!context.goalName || !goalAmountCP) {
            response = `You don't have a savings goal set yet! Head to **Me** to create one, or tell me what you're saving for.`;
            break;
          }

          // Count active missions
          const followupCP = context.followupData as
            | { missions?: Array<{ status?: string }> }
            | undefined;
          const missionsCP = followupCP?.missions || [];
          const activeMissionsCP = missionsCP.filter((m) => m.status === 'active').length;

          // Build inline progress chart
          const weeklySavingsCP =
            Math.max(0, (budgetContext?.totalIncome || 0) - (budgetContext?.activeExpenses || 0)) /
            4.33;
          const goalDeadlineCP = context.goalDeadline as string;
          const weeksRemainingCP = goalDeadlineCP ? getWeeksUntil(goalDeadlineCP, timeCtx) : 12;
          const progressChartCP = buildProgressChart(
            currentSavedCP,
            goalAmountCP,
            Math.max(1, weeksRemainingCP),
            weeklySavingsCP,
            currSymbolCP
          );

          response = `Goal: **${goalNameCP}** — ${progressCP}% complete (${currSymbolCP}${currentSavedCP} / ${currSymbolCP}${goalAmountCP})`;

          const checkProgressResource: UIResource = {
            type: 'composite',
            components: [
              {
                type: 'grid',
                params: {
                  columns: 3,
                  children: [
                    { type: 'metric', params: { title: 'Progress', value: `${progressCP}%` } },
                    { type: 'metric', params: { title: 'Missions', value: `${activeMissionsCP}` } },
                    {
                      type: 'metric',
                      params: { title: 'Margin', value: `${currSymbolCP}${marginCP}/mo` },
                    },
                  ],
                },
              },
              progressChartCP,
              {
                type: 'grid',
                params: {
                  columns: 3,
                  children: [
                    {
                      type: 'action',
                      params: {
                        type: 'button',
                        label: 'Budget',
                        action: 'show_chart',
                        params: { chartType: 'budget_breakdown' },
                      },
                    },
                    {
                      type: 'action',
                      params: {
                        type: 'button',
                        label: 'Energy',
                        action: 'show_chart',
                        params: { chartType: 'energy' },
                      },
                    },
                    {
                      type: 'action',
                      params: {
                        type: 'button',
                        label: 'Progress',
                        action: 'navigate',
                        params: { to: '/progress' },
                      },
                    },
                  ],
                },
              },
            ],
          };

          const cpTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'check_progress',
            progress: progressCP,
            activeMissions: activeMissionsCP,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: cpTraceId || undefined,
            traceUrl: cpTraceId ? getTraceUrl(cpTraceId) : undefined,
            source: 'llm' as const,
            uiResource: checkProgressResource,
          };
        }

        case 'get_advice': {
          const currAdv = getCurrencySymbol(context.currency as string);
          const skillsAdv = (context.skills as string[]) || [];
          const inventoryAdv =
            (context.inventoryItems as Array<{ name: string; estimatedValue?: number }>) || [];

          const tips: Array<{ icon: string; text: string; impact: number }> = [];

          // 1. Budget optimization — top pausable subscription
          if (budgetContext && budgetContext.activeExpenses > 0) {
            const expenses =
              (context.expenses as Array<{ category: string; amount: number }>) || [];
            const topExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0];
            if (topExpense && topExpense.amount > 0) {
              tips.push({
                icon: '💸',
                text: `Review **${topExpense.category}** — ${currAdv}${topExpense.amount}/month is your biggest expense`,
                impact: topExpense.amount,
              });
            }
          }

          // 2. Top skill opportunity
          if (skillsAdv.length > 0) {
            tips.push({
              icon: '💼',
              text: `Leverage your **${skillsAdv[0]}** skill — check Jobs tab for matching opportunities`,
              impact: 15 * 10, // estimated hourly rate * hours
            });
          }

          // 3. Top sellable item
          if (inventoryAdv.length > 0) {
            const topItem = [...inventoryAdv].sort(
              (a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0)
            )[0];
            if (topItem && (topItem.estimatedValue || 0) > 0) {
              tips.push({
                icon: '📦',
                text: `Sell **${topItem.name}** — ~${currAdv}${topItem.estimatedValue}`,
                impact: topItem.estimatedValue || 0,
              });
            }
          }

          // 4. Generic tip if no data-driven tips
          if (tips.length === 0) {
            tips.push(
              {
                icon: '📊',
                text: 'Complete your **Budget** tab to get personalized tips',
                impact: 0,
              },
              { icon: '🃏', text: 'Try **Swipe** to discover savings opportunities', impact: 0 }
            );
          }

          tips.sort((a, b) => b.impact - a.impact);

          response =
            tips.length > 0
              ? `Top opportunities ranked by impact:\n\n` +
                tips.map((t, i) => `${i + 1}. ${t.icon} ${t.text}`).join('\n')
              : `Complete your profile in **Me** for personalized advice!`;

          const adviceResource: UIResource = {
            type: 'grid',
            params: {
              columns: 3,
              children: [
                {
                  type: 'action',
                  params: {
                    type: 'button',
                    label: 'Jobs',
                    action: 'navigate',
                    params: { to: '/me?tab=jobs' },
                  },
                },
                {
                  type: 'action',
                  params: {
                    type: 'button',
                    label: 'My Items',
                    action: 'show_chart',
                    params: { chartType: 'budget_breakdown' },
                  },
                },
                {
                  type: 'action',
                  params: {
                    type: 'button',
                    label: 'Swipe',
                    action: 'navigate',
                    params: { to: '/swipe' },
                  },
                },
              ],
            },
          };

          const advTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'get_advice', tipCount: tips.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: advTraceId || undefined,
            traceUrl: advTraceId ? getTraceUrl(advTraceId) : undefined,
            source: 'llm' as const,
            uiResource: adviceResource,
          };
        }

        case 'view_plan':
          response = `Your plan is ready in **Me**! There you can:\n\n- View your savings timeline\n- Track weekly progress\n- See job recommendations\n- Explore "what if" scenarios\n\nClick on "Me" to get started!`;
          break;

        case 'add_resource': {
          // HITL: Proactive subscription/item confirmation
          const resourceName = intent.extractedValue || 'this item';
          const field = intent.field || 'subscriptions';

          const confirmMessage = `Did you mean to add "${resourceName}" as a subscription?`;
          let dataToConfirm: Record<string, unknown> = {};

          if (field === 'subscriptions') {
            dataToConfirm = { subscriptions: [{ name: resourceName }] };
          }

          // Return confirmation UI
          const confirmationResource: UIResource = {
            type: 'confirmation',
            params: {
              message: confirmMessage,
              confirmLabel: 'Yes, add it',
              cancelLabel: 'No, ignore',
              data: dataToConfirm,
            },
          };

          const result: ChatResponse = {
            response: confirmMessage,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep, // Stay in conversation mode
            intent,
            source: 'llm' as const,
            uiResource: confirmationResource,
          };

          ctx.setOutput({ action: 'add_resource_confirmation', resource: resourceName });
          return result;
        }

        default: {
          // Span 3: LLM Generation (type: llm with model and provider)
          response = await ctx.createChildSpan(
            'chat.llm_generation',
            async (span) => {
              const client = getLLMClient();
              if (client) {
                try {
                  // Fetch RAG context for personalized response (non-blocking)
                  const ragContext = await fetchRAGContext(message, profileId);
                  const ragSection = ragContext
                    ? `\n${ragContext}\nUse this context from similar students to personalize your advice.\n`
                    : '';

                  // Build consolidated budget section for prompt
                  const budgetSection = budgetContext
                    ? `\n${formatBudgetForPrompt(budgetContext)}\n`
                    : '';

                  span.setAttributes({
                    'rag.available': ragContext.length > 0,
                    'rag.context_length': ragContext.length,
                    'budget.available': budgetContext !== null,
                  });

                  // Build time context section for system prompt
                  const goalDeadline = context.goalDeadline as string | undefined;
                  let timeSection = '';
                  if (timeCtx.isSimulating) {
                    const simDate = getReferenceDate(timeCtx);
                    timeSection = `
IMPORTANT - TIME SIMULATION ACTIVE:
- Current simulated date: ${simDate.toLocaleDateString()}
- Offset: +${timeCtx.offsetDays} days from real date
- ALL financial data shown reflects this simulated future state
- When answering about savings, progress, or financial status, you MUST mention that this is based on the simulated date (+${timeCtx.offsetDays} days in the future).
- Example phrasing: "Based on the simulated date (+${timeCtx.offsetDays} days), you would have saved..." or "In this simulation (+${timeCtx.offsetDays}d)..."`;
                  }
                  if (goalDeadline) {
                    const deadlinePassed = isDeadlinePassed(goalDeadline, timeCtx);
                    const timeRemaining = formatTimeRemaining(goalDeadline, timeCtx);
                    if (deadlinePassed) {
                      timeSection += `\nIMPORTANT: The goal deadline (${goalDeadline}) has PASSED. Adopt a supportive but direct tone. Suggest the user reset their goal or adjust their timeline.`;
                    } else {
                      timeSection += `\nGoal deadline: ${goalDeadline} (${timeRemaining} remaining).`;
                    }
                  }

                  // B.4: Use conversation-specific prompt for post-onboarding chat
                  const conversationPrompt =
                    SYSTEM_PROMPTS.conversation || SYSTEM_PROMPTS.onboarding;

                  // Build missing data hints for agent hooks
                  const missingDataHints: string[] = [];
                  if (
                    !context.skills ||
                    (Array.isArray(context.skills) && context.skills.length === 0)
                  ) {
                    missingDataHints.push('skills (needed for Job Matching on the Jobs tab)');
                  }
                  if (
                    !context.certifications ||
                    (Array.isArray(context.certifications) && context.certifications.length === 0)
                  ) {
                    missingDataHints.push('certifications (boosts hourly rate for certain jobs)');
                  }
                  if (
                    !context.academicEvents ||
                    (Array.isArray(context.academicEvents) && context.academicEvents.length === 0)
                  ) {
                    missingDataHints.push(
                      'academic schedule (exams, vacations — needed for smart planning)'
                    );
                  }
                  if (
                    !context.inventoryItems ||
                    (Array.isArray(context.inventoryItems) && context.inventoryItems.length === 0)
                  ) {
                    missingDataHints.push('items to sell (quick cash from unused stuff)');
                  }
                  if (
                    !context.tradeOpportunities ||
                    (Array.isArray(context.tradeOpportunities) &&
                      context.tradeOpportunities.length === 0)
                  ) {
                    missingDataHints.push(
                      'trade/borrow opportunities (save money by borrowing or swapping)'
                    );
                  }
                  if (
                    !context.subscriptions ||
                    (Array.isArray(context.subscriptions) && context.subscriptions.length === 0)
                  ) {
                    missingDataHints.push('subscriptions (budget optimization opportunities)');
                  }

                  const missingSection =
                    missingDataHints.length > 0
                      ? `\n\nMISSING DATA (use as conversation hooks when relevant):
The user skipped these during onboarding: ${missingDataHints.join(', ')}.
When naturally relevant, remind them they can add this data from the Me tab to unlock more features.
Don't nag — mention ONE missing item max per conversation, and only when it's directly useful.`
                      : '';

                  // Build jobs context section if nearby jobs data is available
                  const topJobs = context.topJobs as
                    | Array<{
                        title: string;
                        company?: string;
                        score: number;
                        salaryText?: string;
                        commuteText?: string;
                        categoryId?: string;
                      }>
                    | undefined;
                  const savedLeads = context.leads as
                    | Array<{ status: string; title: string; company?: string }>
                    | undefined;
                  const excludedCategories = context.excludedCategories as string[] | undefined;
                  const excludedJobCount = context.excludedJobCount as number | undefined;

                  let jobsSection = '';
                  if (topJobs && topJobs.length > 0) {
                    const jobLines = topJobs
                      .slice(0, 5)
                      .map(
                        (j, i) =>
                          `${i + 1}. ${j.title}${j.company ? ` at ${j.company}` : ''} (${j.commuteText || 'location unknown'}, ${j.salaryText || 'salary unknown'}, score: ${j.score.toFixed(1)}/5)`
                      )
                      .join('\n');
                    jobsSection += `\n\nNEARBY JOBS (top matches from user's search):\n${jobLines}`;
                  }
                  if (savedLeads && savedLeads.length > 0) {
                    const leadLines = savedLeads
                      .slice(0, 5)
                      .map(
                        (l) => `- [${l.status}] ${l.title}${l.company ? ` at ${l.company}` : ''}`
                      )
                      .join('\n');
                    jobsSection += `\n\nSAVED JOBS:\n${leadLines}`;
                  }
                  if (
                    (excludedCategories && excludedCategories.length > 0) ||
                    (excludedJobCount && excludedJobCount > 0)
                  ) {
                    jobsSection += `\n\nEXCLUDED: ${excludedCategories?.length || 0} categories, ${excludedJobCount || 0} individual jobs`;
                  }

                  const completion = await client.chat.completions.create({
                    model: getModel(),
                    messages: [
                      {
                        role: 'system',
                        content: `${conversationPrompt}

📊 PROFILE DATA:
${JSON.stringify(context)}
${budgetSection}${ragSection}${timeSection}${missingSection}${jobsSection}

You have access to consolidated financial data: income, expenses, savings, trades.
Use this data for personalized, concrete advice.`,
                      },
                      { role: 'user', content: message },
                    ],
                    temperature: 0.7,
                    max_tokens: 500, // B.4: Increased to avoid cut-off
                  });

                  const llmResponse =
                    completion.choices[0]?.message?.content ||
                    "I'm here to help! You can ask about your plan, update your profile, or get savings advice.";

                  // Set span attributes for LLM call
                  span.setAttributes({
                    response_length: llmResponse.length,
                    used_llm: true,
                  });

                  // Set token usage for Opik cost tracking
                  if (completion.usage) {
                    span.setUsage({
                      prompt_tokens: completion.usage.prompt_tokens || 0,
                      completion_tokens: completion.usage.completion_tokens || 0,
                      total_tokens: completion.usage.total_tokens || 0,
                    });
                  } else {
                    logger.warn(`No usage data returned from LLM for model ${getModel()}`);
                    span.setAttributes({ usage_missing: true });
                  }

                  span.setOutput({ response: llmResponse.substring(0, 200) });
                  return llmResponse;
                } catch {
                  const fallbackResponse =
                    "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **Me** for your personalized recommendations.";
                  span.setAttributes({ error: true, used_llm: false });
                  span.setOutput({ response: fallbackResponse, fallback: true });
                  return fallbackResponse;
                }
              } else {
                const fallbackResponse =
                  "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **Me** for your personalized recommendations.";
                span.setAttributes({ error: false, used_llm: false, reason: 'no_client' });
                span.setOutput({ response: fallbackResponse, fallback: true });
                return fallbackResponse;
              }
            },
            {
              type: 'llm',
              model: getModel(),
              provider: getProvider(),
              input: { message: message.substring(0, 200) },
            }
          );
        }
      }

      const traceId = getCurrentTraceId();
      const traceUrl = traceId ? getTraceUrl(traceId) : undefined;

      // Charts are now ONLY shown when explicitly requested via intent detection
      // (e.g., "show my progress", "projection chart", etc.)
      // Removed: overly aggressive auto-attach that triggered on keywords in ANY response

      // Prepend proactive prefix (goal achievement, nearly there, etc.)
      if (proactivePrefix) {
        response = proactivePrefix + response;
      }

      // Phase 4.3: Contextual follow-up suggestions for responses without their own buttons
      const followUpSuggestions = buildFollowUpSuggestions(context, intent.action || '');

      ctx.setAttributes({
        'chat.response_length': response.length,
        'chat.extracted_fields': Object.keys(extractedData).length,
        'chat.proactive_prefix': Boolean(proactivePrefix),
        'chat.has_followup': Boolean(followUpSuggestions),
      });
      ctx.setOutput({ response: response.substring(0, 300), intent });

      return {
        response,
        extractedData,
        nextStep: 'complete' as OnboardingStep,
        intent,
        traceId: traceId || undefined,
        traceUrl,
        source: 'llm' as const,
        ...(followUpSuggestions ? { uiResource: followUpSuggestions } : {}),
      };
    },
    traceOptions
  );
}
