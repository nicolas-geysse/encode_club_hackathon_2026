/**
 * LLM-based Intent Classifier
 *
 * Fallback classifier using Groq LLM when regex patterns don't match.
 * Provides intelligent understanding of user intent for natural language variations.
 *
 * Sprint Graphiques Phase 2: Context-aware classification with Zod validation.
 */

import { z } from 'zod';
import Groq from 'groq-sdk';
import { trace, registerPrompt, type TraceOptions } from '../../opik';

// =============================================================================
// SUPPORTED ACTIONS
// =============================================================================

export const SUPPORTED_ACTIONS = [
  'show_chart_gallery',
  'show_budget_chart',
  'show_progress_chart',
  'show_projection_chart',
  'show_energy_chart',
  'show_swipe_embed',
  'whatif_work',
  'whatif_sell',
  'whatif_cut',
  'check_progress',
  'get_advice',
  'continue_onboarding',
  'conversation', // fallback for general chat
] as const;

export type SupportedAction = (typeof SUPPORTED_ACTIONS)[number];

// =============================================================================
// ZOD SCHEMA (Safe LLM Output Validation)
// =============================================================================

const LLMClassificationSchema = z.object({
  action: z.enum(SUPPORTED_ACTIONS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type LLMClassificationResult = z.infer<typeof LLMClassificationSchema>;

// =============================================================================
// CONTEXT-AWARE PROMPT
// =============================================================================

const INTENT_CLASSIFICATION_PROMPT = `Tu es un classificateur d'intentions pour Stride, une app de finances étudiantes.

CONTEXTE ACTUEL:
- Mode: {mode}
- Étape: {currentStep}
- Données utilisateur: goal={hasGoal}, budget={hasBudget}, energy={hasEnergy}

ACTIONS DISPONIBLES:
- show_chart_gallery: L'utilisateur veut voir les graphiques/visualisations disponibles (mots clés: charts, graphiques, visuels, visualisations, diagrammes)
- show_budget_chart: L'utilisateur veut voir son budget en graphique (revenus, dépenses, épargne)
- show_progress_chart: L'utilisateur veut voir sa progression vers son objectif d'épargne
- show_projection_chart: L'utilisateur veut voir des projections financières futures
- show_energy_chart: L'utilisateur veut voir son historique d'énergie/fatigue
- show_swipe_embed: L'utilisateur veut voir/utiliser les stratégies swipe, explorer ses options d'action (mots clés: swipe, actions, stratégies, que puis-je faire, quelles options)
- whatif_work: L'utilisateur pose une question "et si je travaillais X heures"
- whatif_sell: L'utilisateur veut simuler une vente d'objet
- whatif_cut: L'utilisateur veut simuler l'arrêt d'une dépense/abonnement
- check_progress: L'utilisateur veut connaître sa progression actuelle (sans graphique)
- get_advice: L'utilisateur demande des conseils financiers
- continue_onboarding: L'utilisateur veut continuer/reprendre l'onboarding (SEULEMENT si mode=onboarding)
- conversation: Conversation générale sans action spécifique (salutations, remerciements, questions générales)

RÈGLES IMPORTANTES:
1. "continue", "on continue" en mode onboarding → continue_onboarding
2. "continue" en mode conversation → conversation (pas d'action spéciale)
3. Mots simples comme "charts", "graphiques", "visuel", "visualisation" → show_chart_gallery
4. "chart please", "j'aimerais voir des visuels" → show_chart_gallery
5. Demandes visuelles sans type spécifique → show_chart_gallery
6. Salutations (bonjour, hello, merci, thanks) → conversation
7. Si incertain (< 70% confiance), retourner conversation avec confidence basse

Réponds UNIQUEMENT avec un JSON valide sans markdown:
{"action": "nom_action", "confidence": 0.0-1.0, "reasoning": "explication courte"}

Message utilisateur: "{message}"`;

// Register prompt for version tracking
const PROMPT_METADATA = registerPrompt('intent-classifier', INTENT_CLASSIFICATION_PROMPT);

// =============================================================================
// CLASSIFICATION CONTEXT
// =============================================================================

export interface ClassificationContext {
  mode: 'onboarding' | 'conversation' | 'profile-edit';
  currentStep: string;
  hasGoal: boolean;
  hasBudget: boolean;
  hasEnergy: boolean;
}

// =============================================================================
// MAIN CLASSIFICATION FUNCTION
// =============================================================================

/**
 * Classify user intent using LLM when regex patterns fail.
 *
 * @param message - User message to classify
 * @param groqClient - Groq SDK client instance
 * @param context - Current application context (mode, step, available data)
 * @returns Classification result or null if confidence too low / error
 */
export async function classifyIntentWithLLM(
  message: string,
  groqClient: Groq,
  context: ClassificationContext
): Promise<LLMClassificationResult | null> {
  // Build trace options with prompt metadata
  const traceOptions: TraceOptions = {
    source: 'intent_llm_classifier',
    metadata: {
      'prompt.name': PROMPT_METADATA.name,
      'prompt.version': PROMPT_METADATA.version,
      'prompt.hash': PROMPT_METADATA.hash,
    },
  };

  return trace(
    'intent.llm_classification',
    async (ctx) => {
      ctx.setAttributes({
        message_length: message.length,
        message_preview: message.substring(0, 100),
        mode: context.mode,
        current_step: context.currentStep,
        has_goal: context.hasGoal,
        has_budget: context.hasBudget,
        has_energy: context.hasEnergy,
      });

      try {
        // Build context-aware prompt
        const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{mode}', context.mode)
          .replace('{currentStep}', context.currentStep)
          .replace('{hasGoal}', String(context.hasGoal))
          .replace('{hasBudget}', String(context.hasBudget))
          .replace('{hasEnergy}', String(context.hasEnergy))
          .replace('{message}', message);

        const startTime = Date.now();

        const response = await groqClient.chat.completions.create({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1, // Deterministic for consistent classification
          max_tokens: 150,
        });

        const latencyMs = Date.now() - startTime;
        const rawContent = response.choices[0].message.content || '{}';

        ctx.setAttributes({
          latency_ms: latencyMs,
          raw_response: rawContent,
          model: 'llama-3.1-70b-versatile',
        });

        // Set token usage if available
        if (response.usage) {
          ctx.setUsage({
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          });
        }

        // SAFE PARSING with Zod
        let result: LLMClassificationResult;
        try {
          const jsonParsed = JSON.parse(rawContent);
          const parsed = LLMClassificationSchema.safeParse(jsonParsed);

          if (!parsed.success) {
            ctx.setAttributes({ validation_error: JSON.stringify(parsed.error) });
            ctx.setOutput({
              error: 'Schema validation failed',
              zodError: JSON.stringify(parsed.error),
            });
            return null;
          }

          result = parsed.data;
        } catch (jsonError) {
          ctx.setAttributes({ json_parse_error: String(jsonError) });
          ctx.setOutput({ error: 'Invalid JSON response' });
          return null;
        }

        ctx.setOutput({
          action: result.action,
          confidence: result.confidence,
          reasoning: result.reasoning,
        });

        // Only return if confidence threshold met (70%)
        if (result.confidence < 0.7) {
          ctx.setAttributes({ below_threshold: true });
          return null;
        }

        return result;
      } catch (error) {
        ctx.setAttributes({ error: String(error) });
        ctx.setOutput({ error: String(error) });
        return null;
      }
    },
    traceOptions
  );
}

// =============================================================================
// HELPER: Map LLM action to DetectedIntent format
// =============================================================================

/**
 * Convert LLM classification result to the DetectedIntent mode.
 * Most actions are conversation mode, except continue_onboarding.
 */
export function getIntentModeFromAction(
  action: SupportedAction
): 'onboarding' | 'conversation' | 'profile-edit' {
  if (action === 'continue_onboarding') {
    return 'onboarding';
  }
  return 'conversation';
}
