/**
 * Chat API Route
 *
 * Handles LLM-powered chat for onboarding and general conversation.
 * Uses Mastra agent for intelligent extraction (with Groq fallback).
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
import Groq from 'groq-sdk';
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
  type EnergyLogEntry,
} from '../../lib/chatChartBuilder';

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
  adjustedMargin: number;
  goalProgress: number;
  monthsUntilDeadline: number;
}

/**
 * Fetch consolidated budget context for a profile
 * Returns null on failure (non-blocking)
 */
async function fetchBudgetContext(profileId?: string): Promise<BudgetContext | null> {
  if (!profileId) return null;

  try {
    const url = `${process.env.INTERNAL_API_URL || 'http://localhost:3000'}/api/budget?profileId=${profileId}`;
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
      adjustedMargin: b.adjustedMargin || 0,
      goalProgress: b.goalProgress || 0,
      monthsUntilDeadline: b.monthsUntilDeadline || 0,
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
      `${process.env.INTERNAL_API_URL || 'http://localhost:3000'}/api/rag`,
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

// Feature flag for Groq extractor (set to false to use legacy Groq-only approach without JSON mode)
const USE_GROQ_EXTRACTOR = process.env.USE_GROQ_EXTRACTOR !== 'false';

// Groq configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

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
      console.error('[Chat] Opik evaluators auto-initialized for project:', projectName);
    }
  } catch (error) {
    // Non-fatal: evaluators are optional enhancement
    console.error('[Chat] Opik setup skipped (non-fatal):', error);
    opikInitialized = true; // Mark as done to avoid retrying every request
  }
}

// Initialize Groq client
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!groqClient && GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
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
  /** Source of the response: 'groq' (JSON mode), 'groq_legacy' (text mode), or 'fallback' (regex) */
  source?: 'groq' | 'groq_legacy' | 'fallback';
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
              label: 'Go to My Plan',
              variant: 'primary',
              action: 'navigate',
              params: { to: '/plan' },
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
        console.error('Failed to load working memory:', e);
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
    // CHART REQUESTS - Handle in ANY mode (Sprint Graphiques)
    // Phase 2: Now uses async detectIntent with LLM fallback
    // =========================================================================
    const chartIntent = await detectIntent(message, context, {
      groqClient: getGroqClient() || undefined,
      mode: mode || 'conversation',
      currentStep: step,
    });
    if (chartIntent.action?.startsWith('show_') && chartIntent.action?.includes('chart')) {
      // Redirect to conversation mode handler for chart intents
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
              console.error(`[WorkingMemory] Updated for ${profileId}:`, workingMemoryUpdates);
            })
            .catch((err) => {
              console.error('[WorkingMemory] Failed to save updates:', err);
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
          source: groqResult.source === 'groq' ? 'groq' : 'fallback',
          uiResource,
        };

        console.error(`[Chat] Response source: ${groqResult.source}`);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (groqError) {
        console.error('[Chat] Groq extractor failed, falling back to legacy:', groqError);
        // Fall through to legacy Groq approach
      }
    }

    // Legacy Groq-only approach (fallback)
    const client = getGroqClient();
    if (!client) {
      // Fallback: return simple response without LLM
      console.error('[Chat] Response from fallback (no LLM)');
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
          source: 'groq_legacy',
          uiResource: legacyUiResource,
        } as ChatResponse;
      },
      traceOptions // Use full trace options with threadId
    );

    console.error('[Chat] Response from Groq (legacy path)');
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chat API error:', error);
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
  client: Groq,
  message: string,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return trace('chat.extraction', async (span) => {
    span.setAttributes({
      'extraction.message_length': message.length,
      'extraction.model': GROQ_MODEL,
    });

    // First try regex extraction for common patterns (faster and more reliable)
    // Determine current step from context for regex extraction
    const currentStep = (context.step as OnboardingStep) || 'greeting';
    const regexData = extractWithRegex(message, currentStep, context);

    try {
      const prompt = EXTRACTION_PROMPT.replace('{message}', message);

      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
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
          console.error('JSON parse error:', parseError, 'Content:', content);
        }
      }

      // LLM didn't return valid JSON, use regex only
      span.setAttributes({
        'extraction.fields_found': Object.keys(regexData).length,
        'extraction.method': 'regex_only',
      });
      return regexData;
    } catch (error) {
      console.error('Extraction error:', error);
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
  client: Groq,
  step: OnboardingStep,
  context: Record<string, unknown>
): Promise<string> {
  return trace('chat.generation', async (span) => {
    span.setAttributes({
      'generation.step': step,
      'generation.model': GROQ_MODEL,
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
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.onboarding },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400, // Increased for fuller responses
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
      console.error('Response generation error:', error);
      span.setAttributes({ 'generation.method': 'fallback' });
      return getFallbackStepResponse(step, context);
    }
  });
}

// Generate clarification message when user input wasn't understood
async function generateClarificationResponse(
  client: Groq,
  step: OnboardingStep,
  _context: Record<string, unknown>
): Promise<string> {
  const clarificationText = getClarificationMessage(step);

  // Try LLM for a more natural response, fall back to static
  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.onboarding },
        {
          role: 'user',
          content: `The user's message wasn't clear enough. Politely ask again for: ${clarificationText}
Keep it short and friendly (1-2 sentences).`,
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
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
      groqClient: getGroqClient() || undefined,
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
      let response: string;
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
              source: 'groq' as const,
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
              source: 'groq' as const,
            };
          }
        } catch (err) {
          console.error('[ActionDispatcher] Error:', err);
        }
      }
      // -----------------------------------------------------------------------

      switch (intent.action) {
        case 'restart_new_profile': {
          // Signal frontend to reset ALL state and create a new profile
          response = `No problem! Let's start with a brand new profile. 🆕\n\n**What's your name?**`;
          const newProfileTraceId = ctx.getTraceId();
          const result = {
            response,
            extractedData: { _restartNewProfile: true },
            nextStep: 'greeting' as OnboardingStep, // Start at greeting to collect name
            source: 'groq' as const,
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
            source: 'groq' as const,
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
            response = `Your profile is already complete! 🎉 You can:\n\n- **View your plan** - Go to "My Plan"\n- **Update something** - "Change my city to Paris"\n- **Set a new goal** - "I want to save for a laptop"`;
            const result = {
              response,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              source: 'groq' as const,
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
            source: 'groq' as const,
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

            const deadline = deadlineDate.toISOString().split('T')[0];

            // Store goal data in extractedData for the frontend to save
            extractedData.newGoal = {
              name: goalName,
              amount: goalAmount,
              deadline,
              status: 'active',
              priority: 1,
            };

            const currencySymbol = getCurrencySymbol(context.currency as string);
            response = `I've created a new goal for you!\n\n🎯 **${goalName}**\n💰 Target: ${currencySymbol}${goalAmount}\n📅 Deadline: ${deadline}\n\nYou can view and manage this goal in the **Goals** tab of My Plan!`;
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
            source: 'groq' as const,
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
              fallbackUrl: '/plan?tab=swipe',
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
            source: 'groq' as const,
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
          ctx.setOutput({ action: 'show_chart_gallery', chartCount: 4 });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: chartGalleryTraceId || undefined,
            traceUrl: chartGalleryTraceId ? getTraceUrl(chartGalleryTraceId) : undefined,
            source: 'groq' as const,
            uiResource: galleryResource,
          };
        }

        case 'show_budget_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);

          // Handle both number and array formats for income/expenses
          let income = 0;
          let expenses = 0;

          // Income can be a number or array of {source, amount}
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

          // Expenses can be a number or array of {category, amount}
          if (typeof context.expenses === 'number') {
            expenses = context.expenses;
          } else if (Array.isArray(context.expenses)) {
            expenses = (context.expenses as Array<{ amount: number }>).reduce(
              (sum, e) => sum + (e.amount || 0),
              0
            );
          }

          // Also try to get from budget context if available
          if (income === 0 && budgetContext) {
            income = budgetContext.totalIncome || 0;
          }
          if (expenses === 0 && budgetContext) {
            expenses = budgetContext.activeExpenses || 0;
          }

          const savings = income - expenses;

          if (income === 0 && expenses === 0) {
            response = `I don't have enough budget information yet. Tell me your income and expenses first!`;
            break;
          }

          response = `📊 **Your Monthly Budget**\n\nIncome: **${currSymbol}${income}** | Expenses: **${currSymbol}${expenses}** | Savings: **${currSymbol}${savings}**`;
          const budgetChartResource = buildBudgetBreakdownChart(
            income,
            expenses,
            savings,
            currSymbol
          );
          const budgetChartTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_budget_chart', income, expenses, savings });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: budgetChartTraceId || undefined,
            traceUrl: budgetChartTraceId ? getTraceUrl(budgetChartTraceId) : undefined,
            source: 'groq' as const,
            uiResource: budgetChartResource,
          };
        }

        case 'show_progress_chart': {
          const currSymbol = getCurrencySymbol(context.currency as string);
          const goalAmount = (context.goalAmount as number) || 0;
          const currentSaved = (context.currentSaved as number) || 0;

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

          if (goalAmount === 0) {
            response = `You haven't set a savings goal yet. Create a goal first!`;
            break;
          }

          const weeksRemaining =
            weeklySavings > 0 ? Math.ceil((goalAmount - currentSaved) / weeklySavings) : 52;
          response = `📈 **Progress Towards Your Goal**\n\nAlready saved: **${currSymbol}${currentSaved}** of **${currSymbol}${goalAmount}**`;
          const progressChartResource = buildProgressChart(
            currentSaved,
            goalAmount,
            weeksRemaining,
            weeklySavings,
            currSymbol
          );
          const progressChartTraceId = ctx.getTraceId();
          ctx.setOutput({
            action: 'show_progress_chart',
            currentSaved,
            goalAmount,
            weeksRemaining,
          });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: progressChartTraceId || undefined,
            traceUrl: progressChartTraceId ? getTraceUrl(progressChartTraceId) : undefined,
            source: 'groq' as const,
            uiResource: progressChartResource,
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
          const projectionChartResource = buildProjectionChart(projectionForChart, currSymbol);
          const summaryText = buildProjectionSummary(projectionForChart, currSymbol);
          response = `🎯 **Projection Towards Your Goal**\n\n${summaryText}`;
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
            source: 'groq' as const,
            uiResource: projectionChartResource,
          };
        }

        case 'show_energy_chart': {
          // Try three sources for energy data:
          // 1. context.energyHistory (from Suivi page, stored in profile.followupData)
          // 2. Direct profile API call to get followupData (in case context is stale)
          // 3. energy_logs table via API (detailed logs with mood/stress/sleep)
          let energyLogs: EnergyLogEntry[] = [];

          // Source 1: Check context.energyHistory (from Suivi page)
          const contextEnergyHistory = context.energyHistory as
            | Array<{ week: number; level: number; date: string }>
            | undefined;
          if (contextEnergyHistory && contextEnergyHistory.length > 0) {
            logger.debug('[show_energy_chart] Using context.energyHistory', {
              count: contextEnergyHistory.length,
            });
            // Convert Suivi format to chart format (already 0-100 scale)
            energyLogs = contextEnergyHistory.map((entry) => ({
              date: entry.date || `Week ${entry.week}`,
              level: entry.level,
            }));
          }

          // Source 2: If no context data, try direct profile API (context might be stale)
          if (energyLogs.length === 0 && profileId) {
            try {
              const profileUrl = `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/profiles?id=${profileId}`;
              const profileResponse = await fetch(profileUrl);
              if (profileResponse.ok) {
                const profileData = await profileResponse.json();
                const followupEnergy = profileData?.followupData?.energyHistory;
                if (Array.isArray(followupEnergy) && followupEnergy.length > 0) {
                  logger.debug('[show_energy_chart] Using profile API followupData', {
                    count: followupEnergy.length,
                  });
                  energyLogs = followupEnergy.map(
                    (entry: { week: number; level: number; date?: string }) => ({
                      date: entry.date || `Week ${entry.week}`,
                      level: entry.level,
                    })
                  );
                }
              }
            } catch (err) {
              logger.error('[show_energy_chart] Failed to fetch profile', { error: String(err) });
            }
          }

          // Source 3: If still no data, try energy_logs API
          if (energyLogs.length === 0) {
            try {
              const energyUrl = `${process.env.INTERNAL_API_URL || 'http://localhost:3006'}/api/energy-logs?profileId=${profileId}`;
              const energyResponse = await fetch(energyUrl);
              if (energyResponse.ok) {
                const energyData = await energyResponse.json();
                energyLogs = energyData.logs || [];
                if (energyLogs.length > 0) {
                  logger.debug('[show_energy_chart] Using energy_logs API', {
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

          logger.debug('[show_energy_chart] Final energyLogs', { count: energyLogs.length });

          if (energyLogs.length === 0) {
            response = `⚡ I don't have energy data yet. Start by logging your energy on the Tracking page!`;
            break;
          }

          response = `⚡ **Your Energy History**\n\nDashed lines indicate thresholds: red (40%) = fatigue, green (80%) = recovery.`;
          const energyChartResource = buildEnergyChart(energyLogs);
          const energyChartTraceId = ctx.getTraceId();
          ctx.setOutput({ action: 'show_energy_chart', logCount: energyLogs.length });
          return {
            response,
            extractedData: {},
            nextStep: 'complete' as OnboardingStep,
            intent,
            traceId: energyChartTraceId || undefined,
            traceUrl: energyChartTraceId ? getTraceUrl(energyChartTraceId) : undefined,
            source: 'groq' as const,
            uiResource: energyChartResource,
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
            source: 'groq' as const,
            uiResource: comparisonGalleryResource,
          };
        }

        case 'check_progress': {
          const goalName = context.goalName || 'your goal';
          const goalAmount = context.goalAmount || 'your target';
          const currencySymbol = getCurrencySymbol(context.currency as string);
          const goalDeadline = context.goalDeadline as string;

          // Time-aware progress check
          if (goalDeadline) {
            const deadlinePassed = isDeadlinePassed(goalDeadline, timeCtx);
            const timeRemaining = formatTimeRemaining(goalDeadline, timeCtx);

            if (deadlinePassed) {
              response = `Your deadline for **${goalName}** (${currencySymbol}${goalAmount}) has **passed**. Consider setting a new timeline or adjusting your goal in **My Plan**!`;
            } else {
              response = `You're working towards **${goalName}** with a target of **${currencySymbol}${goalAmount}**.\n\n**${timeRemaining}** remaining until your deadline.\n\nHead to **My Plan** for detailed progress!`;
            }
          } else {
            response = `You're working towards **${goalName}** with a target of **${currencySymbol}${goalAmount}**.\n\nHead to **My Plan** to see your detailed progress, timeline, and weekly targets!`;
          }
          break;
        }

        case 'get_advice':
          response = `Here are some tips to save more:\n\n- **Track expenses** - Small purchases add up\n- **Cook at home** - Campus cafeteria is cheaper than restaurants\n- **Sell unused items** - Textbooks, electronics, clothes\n- **Freelance your skills** - Even a few hours/week helps\n\nWant me to analyze your specific situation?`;
          break;

        case 'view_plan':
          response = `Your plan is ready in **My Plan**! There you can:\n\n- View your savings timeline\n- Track weekly progress\n- See job recommendations\n- Explore "what if" scenarios\n\nClick on "My Plan" to get started!`;
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
            source: 'groq' as const,
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
              const client = getGroqClient();
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
                    timeSection = `\nCurrent simulated date: ${simDate.toLocaleDateString()}.`;
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

                  const completion = await client.chat.completions.create({
                    model: GROQ_MODEL,
                    messages: [
                      {
                        role: 'system',
                        content: `${SYSTEM_PROMPTS.onboarding}

The user has already completed onboarding. Their profile: ${JSON.stringify(context)}.
${budgetSection}${ragSection}${timeSection}
You have access to their consolidated financial data including income, expenses, savings from paused items, and trade values.
Use this data to provide personalized, specific financial advice.
Keep responses concise (2-3 sentences). Suggest going to "My Plan" for detailed information.`,
                      },
                      { role: 'user', content: message },
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
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
                    console.warn(
                      `[chat.llm_generation] No usage data returned from Groq for model ${GROQ_MODEL}`
                    );
                    span.setAttributes({ usage_missing: true });
                  }

                  span.setOutput({ response: llmResponse.substring(0, 200) });
                  return llmResponse;
                } catch {
                  const fallbackResponse =
                    "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **My Plan** for your personalized recommendations.";
                  span.setAttributes({ error: true, used_llm: false });
                  span.setOutput({ response: fallbackResponse, fallback: true });
                  return fallbackResponse;
                }
              } else {
                const fallbackResponse =
                  "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **My Plan** for your personalized recommendations.";
                span.setAttributes({ error: false, used_llm: false, reason: 'no_client' });
                span.setOutput({ response: fallbackResponse, fallback: true });
                return fallbackResponse;
              }
            },
            {
              type: 'llm',
              model: GROQ_MODEL,
              provider: 'groq',
              input: { message: message.substring(0, 200) },
            }
          );
        }
      }

      const traceId = getCurrentTraceId();
      const traceUrl = traceId ? getTraceUrl(traceId) : undefined;
      ctx.setAttributes({
        'chat.response_length': response.length,
        'chat.extracted_fields': Object.keys(extractedData).length,
      });
      ctx.setOutput({ response: response.substring(0, 300), intent });

      return {
        response,
        extractedData,
        nextStep: 'complete' as OnboardingStep,
        intent,
        traceId: traceId || undefined,
        traceUrl,
        source: 'groq' as const,
      };
    },
    traceOptions
  );
}
