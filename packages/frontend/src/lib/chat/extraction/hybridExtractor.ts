/**
 * Hybrid Extractor
 *
 * Main orchestrator that combines Groq LLM extraction with regex fallback.
 * Includes Opik tracing for observability.
 *
 * This module replaces the old onboardingExtractor.ts
 */

import { trace, type TraceOptions } from '../../opik';
import type { ProfileData, OnboardingInput, OnboardingOutput, OnboardingStep } from '../types';
import { extractWithGroq, getGroqModel } from './groqExtractor';
import { extractWithRegex } from './regexExtractor';
import { getNextStep, getAdvanceMessage, getClarificationMessage } from '../flow';

// Re-export types for convenience (backward compatibility with old import paths)
export type {
  ProfileData,
  OnboardingInput,
  OnboardingOutput,
  AcademicEvent,
  InventoryItem,
  Subscription,
  TradeOpportunity,
} from '../types';

/**
 * Mapping from onboarding steps to the tabs they populate
 * Used for tracing and debugging
 */
const STEP_TAB_MAP: Record<string, string> = {
  greeting: 'profile',
  currency_confirm: 'profile',
  name: 'profile',
  studies: 'profile',
  skills: 'skills',
  certifications: 'skills',
  budget: 'profile',
  work_preferences: 'profile',
  goal: 'setup',
  academic_events: 'setup',
  inventory: 'inventory',
  trade: 'trade',
  lifestyle: 'lifestyle',
  complete: 'setup',
};

/**
 * Process an onboarding message using Groq JSON mode
 * Falls back to regex extraction if Groq fails
 *
 * Trace hierarchy (for Opik agentic tracing):
 * - agent.onboarding (parent trace)
 *   ├── agent.llm_extraction (child span, type: llm)
 *   ├── agent.data_merge (child span, type: tool)
 *   └── agent.response_generation (child span, type: general)
 */
export async function processWithGroqExtractor(input: OnboardingInput): Promise<OnboardingOutput> {
  const targetTab = STEP_TAB_MAP[input.currentStep] || 'unknown';

  const traceOptions: TraceOptions = {
    source: 'groq_json_mode',
    threadId: input.threadId,
    input: {
      message: input.message,
      currentStep: input.currentStep,
      existingProfile: input.existingProfile,
      historyLength: input.conversationHistory?.length || 0,
    },
    tags: ['onboarding', 'agent', input.currentStep, `tab:${targetTab}`],
  };

  return trace(
    'agent.onboarding',
    async (ctx) => {
      ctx.setAttributes({
        'agent.step': input.currentStep,
        'agent.message_length': input.message.length,
        'agent.has_history': (input.conversationHistory?.length || 0) > 0,
        'agent.target_tab': targetTab,
      });

      // Child span 1: LLM Extraction (type: llm)
      const extractionResult = await ctx.createChildSpan(
        'agent.llm_extraction',
        async (span) => {
          span.setAttributes({
            'extraction.step': input.currentStep,
            'extraction.message_preview': input.message.substring(0, 100),
            'extraction.history_length': input.conversationHistory?.length || 0,
          });

          // Try Groq JSON mode first (with conversation history for context)
          const groqResult = await extractWithGroq(
            input.message,
            input.currentStep,
            input.existingProfile,
            input.conversationHistory
          );

          if (groqResult && Object.keys(groqResult.data).length > 0) {
            // Groq succeeded with data
            span.setUsage({
              prompt_tokens: groqResult.usage.promptTokens,
              completion_tokens: groqResult.usage.completionTokens,
              total_tokens: groqResult.usage.totalTokens,
            });
            span.setCost(groqResult.usage.estimatedCost);
            span.setOutput({
              method: 'groq_json_mode',
              extracted_fields: Object.keys(groqResult.data).length,
              extracted_keys: Object.keys(groqResult.data).join(','),
            });
            return { data: groqResult.data, usage: groqResult.usage, source: 'groq' as const };
          } else if (groqResult) {
            // Groq returned but no data extracted - fall back to regex
            span.setUsage({
              prompt_tokens: groqResult.usage.promptTokens,
              completion_tokens: groqResult.usage.completionTokens,
              total_tokens: groqResult.usage.totalTokens,
            });
            span.setCost(groqResult.usage.estimatedCost);
            const regexData = extractWithRegex(
              input.message,
              input.currentStep as OnboardingStep,
              input.existingProfile as Record<string, unknown>
            );
            span.setOutput({
              method: 'regex_fallback',
              reason: 'groq_empty',
              extracted_fields: Object.keys(regexData).length,
            });
            return { data: regexData, usage: groqResult.usage, source: 'fallback' as const };
          } else {
            // Groq failed completely - use regex only
            const regexData = extractWithRegex(
              input.message,
              input.currentStep as OnboardingStep,
              input.existingProfile as Record<string, unknown>
            );
            span.setOutput({
              method: 'regex_fallback',
              reason: 'groq_failed',
              extracted_fields: Object.keys(regexData).length,
            });
            return { data: regexData, usage: null, source: 'fallback' as const };
          }
        },
        {
          type: 'llm',
          model: getGroqModel(),
          provider: 'groq',
          input: { message: input.message.substring(0, 200), step: input.currentStep },
        }
      );

      const extractedData = extractionResult.data;
      const tokenUsage = extractionResult.usage;
      const source = extractionResult.source;
      const hasExtracted = Object.keys(extractedData).length > 0;

      // Child span 2: Data Merge (type: tool)
      const { nextStep, mergedProfile } = await ctx.createChildSpan(
        'agent.data_merge',
        async (span) => {
          span.setAttributes({
            'merge.extracted_fields': Object.keys(extractedData).length,
            'merge.has_data': hasExtracted,
          });

          // Merge profile data first (so we can check combined state)
          const mergedProfile = { ...input.existingProfile, ...extractedData };

          // Determine next step using the flow controller
          // ALWAYS call getNextStep - it handles optional steps (empty REQUIRED_FIELDS)
          // that should advance even without extracted data
          let nextStep = getNextStep(
            input.currentStep as OnboardingStep,
            extractedData as Record<string, unknown>
          );

          // BUG FIX: Skip 'currency_confirm' if currency was auto-detected from city
          if (nextStep === 'currency_confirm' && mergedProfile.currency) {
            nextStep = 'name';
          }

          const didAdvance = nextStep !== input.currentStep;

          span.setOutput({
            next_step: nextStep,
            did_advance: didAdvance,
            merged_fields: Object.keys(mergedProfile).filter(
              (k) => mergedProfile[k as keyof ProfileData] !== undefined
            ).length,
            currency_skipped: nextStep === 'name' && input.currentStep === 'greeting',
          });

          return { nextStep, didAdvance, mergedProfile };
        },
        {
          type: 'tool',
          input: { extracted_keys: Object.keys(extractedData).join(',') },
        }
      );

      // HITL CHECK: If ambiguous fields are detected, block progress and ask for confirmation
      if (extractedData.ambiguousFields && Object.keys(extractedData.ambiguousFields).length > 0) {
        // We found something out of context (e.g. Netflix during 'name' step)
        // Create a confirmation UI resource
        const ambiguous = extractedData.ambiguousFields;
        let confirmMessage = 'I noticed you mentioned something else. Did you mean to add this?';
        let dataToConfirm = {};

        // Tailored message for common cases
        if (ambiguous.subscriptions) {
          const subs = ambiguous.subscriptions as { name: string }[];
          confirmMessage = `Did you mean to add "${subs[0].name}" as a subscription?`;
          dataToConfirm = { subscriptions: subs };
        } else if (ambiguous.inventoryItems) {
          const items = ambiguous.inventoryItems as { name: string }[];
          confirmMessage = `Did you mean to add "${items[0].name}" to your inventory?`;
          dataToConfirm = { inventoryItems: items };
        }

        const confirmationResource = {
          type: 'confirmation',
          params: {
            message: confirmMessage,
            confirmLabel: 'Yes, add it',
            cancelLabel: 'No, ignore',
            data: dataToConfirm,
          },
        };

        const result: OnboardingOutput = {
          response: confirmMessage, // Fallback text
          extractedData: {}, // Don't misuse extracted data yet
          nextStep: input.currentStep, // Stay on same step
          isComplete: false,
          profileData: input.existingProfile, // No changes yet
          source: source,
          uiResource: confirmationResource,
        };

        ctx.setOutput({
          hitl_triggered: true,
          ambiguous_fields: JSON.stringify(ambiguous),
        });

        return result;
      }

      // Child span 3: Response Generation (type: general)
      const response = await ctx.createChildSpan(
        'agent.response_generation',
        async (span) => {
          span.setAttributes({
            'response.has_extracted': hasExtracted,
            'response.next_step': nextStep,
          });

          let response = hasExtracted
            ? getAdvanceMessage(nextStep, mergedProfile)
            : getClarificationMessage(input.currentStep as OnboardingStep);

          // Check for missing info and append clarifying question
          const missingInfo = extractedData.missingInfo as string[] | undefined;
          if (missingInfo && missingInfo.length > 0) {
            const missingText = missingInfo.join(' and ');
            response += `\n\nCould you also tell me your ${missingText}?`;
            span.setAttributes({ 'response.has_missing_info': true });
          }

          span.setOutput({
            response_length: response.length,
            response_preview: response.substring(0, 100),
          });

          return response;
        },
        { type: 'general' }
      );

      // Set parent trace attributes and output
      ctx.setAttributes({
        'agent.source': source,
        'agent.next_step': nextStep,
        'agent.extracted_fields': Object.keys(extractedData).length,
      });

      if (tokenUsage) {
        ctx.setUsage({
          prompt_tokens: tokenUsage.promptTokens,
          completion_tokens: tokenUsage.completionTokens,
          total_tokens: tokenUsage.totalTokens,
        });
        ctx.setCost(tokenUsage.estimatedCost);
      }

      const result: OnboardingOutput = {
        response,
        extractedData,
        nextStep,
        isComplete: nextStep === 'complete',
        profileData: mergedProfile,
        source,
      };

      // Set output for Opik UI
      ctx.setOutput({
        response: result.response.substring(0, 300),
        extractedData: result.extractedData,
        nextStep: result.nextStep,
        isComplete: result.isComplete,
        source: result.source,
        ...(tokenUsage && {
          usage: {
            prompt_tokens: tokenUsage.promptTokens,
            completion_tokens: tokenUsage.completionTokens,
            total_tokens: tokenUsage.totalTokens,
            estimated_cost_usd: tokenUsage.estimatedCost,
          },
        }),
      });

      return result;
    },
    traceOptions
  );
}
