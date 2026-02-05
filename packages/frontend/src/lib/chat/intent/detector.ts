/**
 * Intent Detector
 *
 * Detects user intent from messages in conversation mode.
 * Patterns match profile edits, goal creation, onboarding continuation, etc.
 *
 * Sprint Graphiques Phase 2: Hybrid detection with LLM fallback.
 * - Fast path: Regex patterns (~1ms, $0)
 * - Slow path: LLM classification (~500-800ms, ~$0.0001) when regex fails
 */

import type OpenAI from 'openai';
import type { DetectedIntent, ChatMode } from '../types';
import { SERVICE_NAMES, SUBSCRIPTION_PATTERNS } from '../extraction/patterns';
import {
  classifyIntentWithLLM,
  getIntentModeFromAction,
  type ClassificationContext,
} from './llmClassifier';

// =============================================================================
// SWIPE-RELATED PATTERNS (Swipe-in-Chat)
// =============================================================================

/**
 * Patterns for requesting swipe strategies
 * Matches: "swipe", "actions", "strategies", "que puis-je faire", "quelles options"
 */
const SWIPE_PATTERNS = [
  // SIMPLE: Single word triggers (EN + FR)
  /^(?:swipe|actions?|stratég?ies?|strategies?)[\s?!.]*$/i,
  // FR: "que puis-je faire", "quelles options", "quelles actions"
  /\b(?:que\s+puis[- ]?je\s+faire|quelles?\s+(?:options?|actions?|stratégies?))\b/i,
  // FR: "qu'est-ce que je peux faire", "que faire"
  /\b(?:qu['']?est[- ]?ce\s+que\s+je\s+(?:peux|pourrais?)\s+faire|que\s+faire)\b/i,
  // EN: "what can I do", "what options", "what actions"
  /\b(?:what\s+(?:can\s+i\s+do|options?|actions?|strategies?))\b/i,
  // Direct requests: "show swipe", "open swipe", "montre les swipes"
  /\b(?:show|open|montre[rz]?|affiche[rz]?|ouvre?)\s+(?:le\s+|les?\s+)?(?:swipe|options?|stratégies?)\b/i,
];

// =============================================================================
// CHART-RELATED PATTERNS (Sprint Graphiques)
// =============================================================================

/**
 * Patterns for asking what charts are available (gallery request)
 * Matches: "quels graphiques", "what charts", "show me charts", "available visualizations"
 */
const CHART_GALLERY_PATTERNS = [
  // SIMPLE: Single word triggers for chart gallery
  /^(?:charts?|graphs?|graphiques?|visualisations?|visuels?|diagrammes?)[\s?!.]*$/i,
  // FR: List/discovery patterns
  /\b(?:quels?|liste|montre[rz]?|affiche[rz]?|voir)\s+(?:les?\s+)?(?:graphiques?|courbes?|visualisations?|charts?|diagrammes?)/i,
  /\b(?:disponibles?|available)\s+(?:graphiques?|charts?|visualisations?)/i,
  // FR: "qu'as-tu comme visualisations", "as-tu des graphiques"
  /\b(?:qu['']?as[- ]?tu|as[- ]?tu)\s+(?:comme\s+)?(?:des?\s+)?(?:graphiques?|visualisations?|charts?)/i,
  // FR: "montres moi des charts" (with or without 's', with or without hyphen)
  /\b(?:montre[sz]?)(?:[- ]?moi)?\s+(?:des\s+)?(?:graphiques?|visualisations?|charts?)\b/i,
  // EN: List/discovery patterns
  /\b(?:what|which|list|show)\s+(?:charts?|graphs?|visualizations?)\s+(?:do you have|can you|are available)/i,
  /\b(?:show|display|see)\s+(?:me\s+)?(?:available|all|your)\s+(?:charts?|graphs?|visualizations?)/i,
  // Direct requests for chart gallery
  /\b(?:charts?|graphs?|graphiques?)\s+(?:disponibles?|available)/i,
];

/**
 * Patterns for specific chart types
 */
const CHART_SPECIFIC_PATTERNS = {
  // Budget breakdown chart
  budget: [
    // "budget en graphique", "budget chart", "dépenses graphique"
    /\b(?:budget|income|expense|dépenses?|revenus?|finances?)\s+(?:en\s+)?(?:chart|graph|graphique|breakdown|répartition|vue)/i,
    // "chart of budget", "graphique du budget"
    /\b(?:chart|graph|graphique)\s+(?:of\s+|du\s+|de\s+)?(?:my\s+|mon\s+)?(?:budget|income|expense|dépenses?|revenus?)/i,
    // "montre mon budget en graphique", "show my budget"
    /\b(?:montre|show|affiche|display)(?:-moi)?\s+(?:my\s+|mon\s+|ma\s+)?(?:budget|dépenses?|revenus?)(?:\s+en\s+graphique|\s+chart|\s+graph)?/i,
    // "mon budget" followed eventually by "graphique" - covers "montre-moi mon budget en graphique"
    /\b(?:mon\s+|ma\s+|my\s+)(?:budget|dépenses?|revenus?)\b.*\b(?:graphique|chart|graph)\b/i,
  ],
  // Progress/savings timeline chart
  progress: [
    /\b(?:progress|progression|timeline|évolution|savings?|épargne)\s+(?:en\s+)?(?:chart|graph|graphique|courbe)/i,
    /\b(?:chart|graph|graphique|courbe)\s+(?:of\s+|de\s+)?(?:my\s+|ma\s+)?(?:progress|progression|savings?|épargne)/i,
    // SIMPLE: "montre ma progression" without requiring "graphique"
    /\b(?:montre|show|affiche)(?:-moi)?\s+(?:my\s+|ma\s+)?(?:progress|progression)\b/i,
    // "ma progression" followed by "graphique"
    /\b(?:mon\s+|ma\s+|my\s+)(?:progress|progression|épargne)\b.*\b(?:graphique|chart|graph)\b/i,
  ],
  // Goal projection chart
  projection: [
    /\b(?:projection|forecast|prévision|objectif|goal)\s+(?:en\s+)?(?:chart|graph|graphique)/i,
    /\b(?:chart|graph|graphique)\s+(?:of\s+|de\s+)?(?:my\s+|mes\s+)?(?:projection|forecast|prévision|goal|objectif)/i,
    // SIMPLE: "montre mes projections" without requiring "graphique"
    /\b(?:montre|show|affiche)(?:-moi)?\s+(?:my\s+|mes\s+)?(?:projection|prévision)s?\b/i,
  ],
  // Scenario comparison chart
  comparison: [
    /\b(?:compar|versus|vs|scénarios?)\s+(?:en\s+)?(?:chart|graph|graphique)/i,
    /\b(?:chart|graph|graphique)\s+(?:to\s+|de\s+)?(?:compar|versus|scénarios?)/i,
  ],
  // Energy timeline chart
  energy: [
    /\b(?:energy|énergie|fatigue)\s+(?:en\s+)?(?:chart|graph|graphique|timeline|history|historique)/i,
    /\b(?:chart|graph|graphique|timeline|historique)\s+(?:of\s+|de\s+)?(?:my\s+|mon\s+)?(?:energy|énergie)/i,
    // SIMPLE: "montre mon énergie/historique" without requiring "graphique"
    /\b(?:montre|show|affiche)(?:-moi)?\s+(?:my\s+|mon\s+)?(?:energy|énergie)\b/i,
    /\b(?:montre|show|affiche)(?:-moi)?\s+(?:my\s+|mon\s+)?historique\s+d['']?énergie\b/i,
    // "mon énergie/historique" followed by "graphique"
    /\b(?:mon\s+|my\s+)(?:energy|énergie|historique\s+d['']?énergie)\b.*\b(?:graphique|chart|graph)\b/i,
  ],
};

/**
 * Generic chart request patterns (user wants "a chart" without specifying type)
 * Matches: "montre-moi un graphique", "show me a chart", "tu as des graphiques?"
 */
const GENERIC_CHART_PATTERNS = [
  /\b(?:tu\s+(?:aurais?|as|peux)|(?:do\s+)?you\s+have|can\s+you\s+show)\s+(?:un\s+|a\s+)?(?:graphique|chart|graph)/i,
  /\b(?:montre|show|affiche|display|dessine|draw|visualise)\s+(?:-?moi\s+)?(?:un\s+|a\s+)?(?:graphique|chart|graph|courbe|visualization)/i,
  /\b(?:graphique|chart|graph|visualisation)\s*\??$/i, // Just "graphique?" or "chart?"
];

// =============================================================================

/**
 * Options for intent detection with optional LLM fallback
 */
export interface DetectIntentOptions {
  /** LLM client for fallback (optional - no LLM if not provided). Supports any OpenAI-compatible client. */
  llmClient?: OpenAI;
  /** @deprecated Use llmClient instead */
  groqClient?: OpenAI;
  /** Current chat mode for context-aware classification */
  mode?: ChatMode;
  /** Current onboarding step for context-aware classification */
  currentStep?: string;
}

/**
 * Detect user intent from message
 *
 * Uses hybrid approach:
 * 1. Fast path: Regex patterns (~1ms)
 * 2. Slow path: LLM classification if regex fails and groqClient is provided
 *
 * @param message - User message to analyze
 * @param context - Profile/conversation context for extraction
 * @param options - Optional LLM fallback configuration
 * @returns DetectedIntent with mode, action, and matched pattern info
 */
export async function detectIntent(
  message: string,
  context: Record<string, unknown>,
  options?: DetectIntentOptions
): Promise<DetectedIntent> {
  const lower = message.toLowerCase();

  // ==========================================================================
  // CONTINUE/COMPLETE ONBOARDING
  // ==========================================================================
  if (
    lower.match(/\b(continue|continuer|poursuivre|compléter?|complete|finish|finir|terminer)\b/i) &&
    lower.match(/\b(onboarding|setup|profil|profile|inscription)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'continue_onboarding',
      _matchedPattern: 'continue_onboarding_explicit',
    };
  }

  // Direct phrases: "ok on complète", "let's continue", "on continue"
  if (
    lower.match(/\b(ok\s+)?on\s+(continue|complète|termine)\b/i) ||
    lower.match(/\blet'?s?\s+(continue|finish|complete)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'continue_onboarding',
      _matchedPattern: 'continue_phrase',
    };
  }

  // ==========================================================================
  // RESTART ONBOARDING (new profile)
  // ==========================================================================
  if (
    lower.match(/\b(new profile|nouveau profil|fresh start|from scratch)\b/i) ||
    lower.match(/\b(reset|effacer|supprimer).*\b(profile?|profil|data|données)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'restart_new_profile',
      _matchedPattern: 'new_profile_explicit',
    };
  }

  // ==========================================================================
  // RE-ONBOARDING (update profile)
  // ==========================================================================
  if (lower.match(/\b(restart|recommencer|start over|start again)\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'restart_keyword',
    };
  }

  if (lower.match(/\bredo\b.*\bonboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'redo_onboarding',
    };
  }

  if (lower.match(/\bje (veux|voudrais|souhaite) recommencer\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'french_recommencer',
    };
  }

  if (lower.match(/\b(update|mettre à jour).*\b(all|tout|profile?|profil)\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'update_all_profile',
    };
  }

  if (lower.match(/\b(full|complete|new|whole)\s+(new\s+)?onboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'full_onboarding',
    };
  }

  if (lower.match(/\b(refaire|reprendre)\s+(l[''])?onboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'french_refaire_onboarding',
    };
  }

  // ==========================================================================
  // SHORT NAME MESSAGE (profile edit)
  // ==========================================================================
  const isShortNameMessage =
    message.length < 30 &&
    lower.match(/^(?:je (?:suis|m'appelle)|my name is|i'm|i am|call me)?\s*([a-zA-ZÀ-ÿ]+)$/i);

  if (isShortNameMessage) {
    const nameMatch = message.match(
      /(?:je (?:suis|m'appelle)|my name is|i'm|i am|call me)?\s*([a-zA-ZÀ-ÿ]+)$/i
    );
    const extractedName = nameMatch ? nameMatch[1].trim() : message.trim();

    // Check if name is actually a service (e.g. "Netflix") or invalid
    const isService = SERVICE_NAMES.includes(extractedName.toLowerCase());
    const isValidName = extractedName.match(/^[A-ZÀ-ÿ][a-zà-ÿ]+$/) && !isService;

    if (isValidName) {
      return {
        mode: 'profile-edit',
        action: 'update_name',
        field: 'name',
        extractedValue: extractedName,
        _matchedPattern: 'short_name_message',
      };
    }
  }

  // ==========================================================================
  // PAUSE SUBSCRIPTION (Specific Intent)
  // ==========================================================================
  // "Pause Spotify", "Stop Netflix", "Cancel subscription"
  if (lower.match(/\b(pause|stop|cancel|end|terminate)\b/i)) {
    // Check for specific service name
    const serviceMatch =
      SERVICE_NAMES.find((s) => lower.includes(s)) ||
      SUBSCRIPTION_PATTERNS.find((p) => p[0].test(lower))?.[1].name;

    if (serviceMatch) {
      // serviceMatch is already a string (name) because of the .name access above
      const serviceName = typeof serviceMatch === 'string' ? serviceMatch : String(serviceMatch);
      return {
        mode: 'conversation',
        action: 'pause_subscription',
        field: 'subscription',
        extractedValue: serviceName,
        _matchedPattern: 'pause_subscription_explicit',
      };
    }

    // Generic pause intent if "subscription" is mentioned
    if (lower.match(/\b(subscription|sub)\b/i)) {
      return {
        mode: 'conversation',
        action: 'pause_subscription',
        _matchedPattern: 'pause_subscription_generic',
      };
    }
  }

  // ==========================================================================
  // ADD RESOURCE (Proactive Subscription/Item detection)
  // ==========================================================================
  // Check if message is JUST a service name (e.g. "Netflix", "Spotify") to propose adding it
  const lowerTrimmed = lower.trim();
  const matchedService =
    SERVICE_NAMES.find((s) => s === lowerTrimmed) ||
    SUBSCRIPTION_PATTERNS.find((p) => p[0].test(lowerTrimmed))?.[1].name;

  if (matchedService) {
    const serviceName = typeof matchedService === 'string' ? matchedService : matchedService;
    return {
      mode: 'conversation',
      action: 'add_resource',
      field: 'subscriptions',
      extractedValue: serviceName, // Normalized name if possible
      _matchedPattern: 'service_name_only',
    };
  }

  // ==========================================================================
  // PROFILE EDIT INTENTS
  // ==========================================================================
  if (lower.match(/\b(change|update|edit|modify)\b.*\b(my|the)\b/i)) {
    if (lower.match(/\b(city|location|live|move)\b/i)) {
      const cityMatch = lower.match(/(?:to|in)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'city',
        extractedValue: cityMatch ? cityMatch[1] : undefined,
        _matchedPattern: 'edit_city',
      };
    }
    if (lower.match(/\b(name)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'name',
        _matchedPattern: 'edit_name',
      };
    }
    if (lower.match(/\b(skills?)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'skills',
        _matchedPattern: 'edit_skills',
      };
    }
    if (lower.match(/\b(work|hours|rate)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'work_preferences',
        _matchedPattern: 'edit_work_prefs',
      };
    }
    if (lower.match(/\b(budget|income|expense|spend)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'budget',
        _matchedPattern: 'edit_budget',
      };
    }
    return { mode: 'profile-edit', action: 'update', _matchedPattern: 'edit_generic' };
  }

  // ==========================================================================
  // IMPLICIT BUDGET UPDATE
  // ==========================================================================
  const budgetKeywords =
    /\b(income|revenu|salaire|salary|earn|gagne|expense|dépense|loyer|rent|spend)\b/i;
  const hasAmount = /[$€£]?\s*\d+/;
  if (budgetKeywords.test(lower) && hasAmount.test(message)) {
    return {
      mode: 'profile-edit',
      action: 'update',
      field: 'budget',
      _matchedPattern: 'implicit_budget_update',
    };
  }

  // ==========================================================================
  // NEW GOAL INTENT
  // ==========================================================================
  if (lower.match(/\b(new goal|add goal|save for|want to buy|saving for|save \$|save €)\b/i)) {
    const amountMatch = message.match(
      /[$€]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:[$€]|dollars?|euros?)?/i
    );
    const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : undefined;

    const nameMatch = message.match(
      /(?:for\s+(?:a\s+)?|to\s+buy\s+(?:a\s+)?|saving\s+for\s+(?:a\s+)?)([a-zA-Z0-9\s]+?)(?:\s+by|\s+until|\s+before|\s*$)/i
    );
    const goalName = nameMatch ? nameMatch[1].trim() : undefined;

    const deadlineMatch = message.match(
      /(?:by|until|before)\s+([a-zA-Z]+(?:\s+\d{1,2})?(?:,?\s*\d{4})?)/i
    );
    const deadline = deadlineMatch ? deadlineMatch[1].trim() : undefined;

    return {
      mode: 'conversation',
      action: 'new_goal',
      extractedGoal: {
        name: goalName,
        amount,
        deadline,
      },
      _matchedPattern: 'new_goal',
    };
  }

  // ==========================================================================
  // WHAT-IF SCENARIOS (Budget Projections)
  // ==========================================================================

  // What-if work: "what if I work 10 hours", "si je travaille 5h/semaine"
  const whatifWorkMatch = lower.match(
    /\b(?:what\s*if|si\s*je|imagine|et\s*si|if\s*i)\b.*\b(?:work|travail|hours?|heures?|job|boulot)\b/i
  );
  if (whatifWorkMatch) {
    const hoursMatch = message.match(/(\d+)\s*(?:h(?:ours?)?|heures?)/i);
    const rateMatch = message.match(
      /[$€£]?\s*(\d+)\s*(?:\/h|per\s*h(?:our)?|de\s*l['']?heure|€\/h|\$\/h)/i
    );
    return {
      mode: 'conversation',
      action: 'whatif_work',
      extractedScenario: {
        hours: hoursMatch ? parseInt(hoursMatch[1], 10) : undefined,
        rate: rateMatch ? parseInt(rateMatch[1], 10) : undefined,
      },
      _matchedPattern: 'whatif_work',
    };
  }

  // What-if sell: "what if I sell my guitar", "si je vends mon vélo"
  const whatifSellMatch = lower.match(
    /\b(?:what\s*if|si\s*je|imagine|et\s*si|if\s*i)\b.*\b(?:sell|vend[s]?|sold)\b/i
  );
  if (whatifSellMatch) {
    const amountMatch = message.match(/[$€£]?\s*(\d+)/);
    const itemMatch = message.match(
      /(?:sell|vend[s]?)\s+(?:my\s+|mon\s+|ma\s+)?([a-zA-ZÀ-ÿ\s]+?)(?:\s+for|\s+à|\s*$)/i
    );
    return {
      mode: 'conversation',
      action: 'whatif_sell',
      extractedScenario: {
        amount: amountMatch ? parseInt(amountMatch[1], 10) : undefined,
        item: itemMatch ? itemMatch[1].trim() : undefined,
      },
      _matchedPattern: 'whatif_sell',
    };
  }

  // What-if cut: "what if I stop Netflix", "si j'arrête spotify"
  const whatifCutMatch = lower.match(
    /\b(?:what\s*if|si\s*je|imagine|et\s*si|if\s*i)\b.*\b(?:cut|stop|cancel|pause|arrête|annule|coupe)\b/i
  );
  if (whatifCutMatch) {
    const amountMatch = message.match(/[$€£]?\s*(\d+)/);
    const serviceMatch = SERVICE_NAMES.find((s) => lower.includes(s));
    return {
      mode: 'conversation',
      action: 'whatif_cut',
      extractedScenario: {
        amount: amountMatch ? parseInt(amountMatch[1], 10) : undefined,
        service: serviceMatch,
      },
      _matchedPattern: 'whatif_cut',
    };
  }

  // Generic scenario/projection request: "show projection", "compare scenarios"
  if (lower.match(/\b(show|compare|projection|simulate|scenario|visualize|chart)\b/i)) {
    return {
      mode: 'conversation',
      action: 'show_projection',
      _matchedPattern: 'show_projection',
    };
  }

  // ==========================================================================
  // PROGRESS CHECK
  // ==========================================================================
  if (lower.match(/\b(progress|how.*(doing|going)|status|where.*am)\b/i)) {
    return { mode: 'conversation', action: 'check_progress', _matchedPattern: 'check_progress' };
  }

  // ==========================================================================
  // ADVICE REQUEST
  // ==========================================================================
  if (lower.match(/\b(advice|help|suggest|recommend|how can i|tips?)\b/i)) {
    return { mode: 'conversation', action: 'get_advice', _matchedPattern: 'get_advice' };
  }

  // ==========================================================================
  // PLAN/GOAL VIEW
  // ==========================================================================
  if (lower.match(/\b(my plan|my goal|current goal)\b/i)) {
    return { mode: 'conversation', action: 'view_plan', _matchedPattern: 'view_plan' };
  }

  // ==========================================================================
  // SUIVI-SPECIFIC INTENTS (for voice commands on tracking page)
  // ==========================================================================

  // Mission completion: "J'ai termine/fini la mission X", "Mission X completed"
  const missionCompleteMatch = lower.match(
    /\b(j['']?ai\s+)?(termine|fini|complete|complété|finished?)\b.*\b(mission|tâche|task)?\s*(.+)?$/i
  );
  if (missionCompleteMatch) {
    const missionTitle = missionCompleteMatch[4]?.trim() || undefined;
    return {
      mode: 'conversation',
      action: 'complete_mission',
      extractedMission: missionTitle,
      _matchedPattern: 'suivi_complete_mission',
    };
  }

  // Direct mission name completion: "termine le tutorat", "fini le freelance"
  const directMissionComplete = lower.match(
    /\b(termine|fini|complete|complété)\s+(le|la|l['']?)?\s*(\w+(?:\s+\w+)?)\b/i
  );
  if (directMissionComplete) {
    return {
      mode: 'conversation',
      action: 'complete_mission',
      extractedMission: directMissionComplete[3]?.trim(),
      _matchedPattern: 'suivi_complete_mission_direct',
    };
  }

  // Mission skip: "passer la mission X", "skip X"
  const missionSkipMatch = lower.match(
    /\b(passer?|skip|sauter?|ignorer?)\b.*\b(mission|tâche|task)?\s*(.+)?$/i
  );
  if (missionSkipMatch) {
    const missionTitle = missionSkipMatch[3]?.trim() || undefined;
    return {
      mode: 'conversation',
      action: 'skip_mission',
      extractedMission: missionTitle,
      _matchedPattern: 'suivi_skip_mission',
    };
  }

  // Energy update - low: "je suis fatigue", "energie basse", "epuise"
  if (lower.match(/\b(fatigue|epuise|crevé?|tired|exhausted|low\s*energy|energie\s*basse)\b/i)) {
    return {
      mode: 'conversation',
      action: 'update_energy',
      extractedEnergy: 30, // Low energy default
      _matchedPattern: 'suivi_energy_low',
    };
  }

  // Energy update - high: "super forme", "plein d'energie", "en forme"
  if (
    lower.match(/\b(super\s*forme|plein\s*d['']?energie|en\s*forme|energized|high\s*energy)\b/i)
  ) {
    return {
      mode: 'conversation',
      action: 'update_energy',
      extractedEnergy: 85, // High energy default
      _matchedPattern: 'suivi_energy_high',
    };
  }

  // Energy update - explicit value: "mon energie est a 70", "energie 50%"
  const energyValueMatch = lower.match(/\b(energie|energy)\s*(est\s*[àa]|is|:)?\s*(\d+)\s*%?\b/i);
  if (energyValueMatch) {
    const level = parseInt(energyValueMatch[3], 10);
    return {
      mode: 'conversation',
      action: 'update_energy',
      extractedEnergy: Math.min(100, Math.max(0, level)),
      _matchedPattern: 'suivi_energy_explicit',
    };
  }

  // Focus recommendation: "sur quoi me concentrer", "what should I focus on"
  if (lower.match(/\b(sur\s*quoi|what\s*should\s*i|quoi\s*faire|focus|concentrer|priorite)\b/i)) {
    return {
      mode: 'conversation',
      action: 'recommend_focus',
      _matchedPattern: 'suivi_recommend_focus',
    };
  }

  // Progress summary: "comment ca avance", "ou j'en suis", "my progress"
  if (
    lower.match(
      /\b(comment\s*(ça|ca)\s*avance|où\s*(j['']?)?en\s*suis|résumé|summary|recap|bilan)\b/i
    )
  ) {
    return {
      mode: 'conversation',
      action: 'progress_summary',
      _matchedPattern: 'suivi_progress_summary',
    };
  }

  // ==========================================================================
  // SWIPE INTENT (Swipe-in-Chat)
  // ==========================================================================
  for (const pattern of SWIPE_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        mode: 'conversation',
        action: 'show_swipe_embed',
        _matchedPattern: 'swipe_intent',
      };
    }
  }

  // ==========================================================================
  // CHART REQUESTS (Sprint Graphiques)
  // ==========================================================================
  // Order matters: check SPECIFIC chart types FIRST, then gallery, then generic

  // Check for specific chart type requests FIRST (most specific)
  for (const [chartType, patterns] of Object.entries(CHART_SPECIFIC_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return {
          mode: 'conversation',
          action: `show_${chartType}_chart`,
          _matchedPattern: `chart_${chartType}`,
        };
      }
    }
  }

  // Check for chart gallery request (list available charts)
  for (const pattern of CHART_GALLERY_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        mode: 'conversation',
        action: 'show_chart_gallery',
        _matchedPattern: 'chart_gallery',
      };
    }
  }

  // Check for generic chart request (show gallery as fallback)
  for (const pattern of GENERIC_CHART_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        mode: 'conversation',
        action: 'show_chart_gallery',
        _matchedPattern: 'chart_generic',
      };
    }
  }

  // ==========================================================================
  // LLM FALLBACK (Sprint Graphiques Phase 2)
  // ==========================================================================
  // If no regex pattern matched and LLM client is provided, use LLM classification
  const llmClient = options?.llmClient || options?.groqClient;
  if (llmClient) {
    const classificationContext: ClassificationContext = {
      mode: options?.mode || 'conversation',
      currentStep: options?.currentStep || 'unknown',
      hasGoal: Boolean(context.goalAmount),
      hasBudget: Boolean(context.income || context.expenses),
      hasEnergy:
        Array.isArray(context.energyHistory) && (context.energyHistory as unknown[]).length > 0,
    };

    const llmResult = await classifyIntentWithLLM(message, llmClient, classificationContext);

    if (llmResult) {
      return {
        mode: getIntentModeFromAction(llmResult.action),
        action: llmResult.action,
        _matchedPattern: 'llm_classification',
        _llmConfidence: llmResult.confidence,
        _llmReasoning: llmResult.reasoning,
      };
    }
  }

  // ==========================================================================
  // DEFAULT FALLBACK
  // ==========================================================================
  return { mode: 'conversation', _matchedPattern: 'default_fallback' };
}

/**
 * Check if intent detection fell back to default
 */
export function isIntentFallback(intent: DetectedIntent): boolean {
  return intent._matchedPattern === 'default_fallback' || !intent.action;
}
