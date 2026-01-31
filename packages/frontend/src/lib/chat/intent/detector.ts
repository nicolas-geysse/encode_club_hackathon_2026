/**
 * Intent Detector
 *
 * Detects user intent from messages in conversation mode.
 * Patterns match profile edits, goal creation, onboarding continuation, etc.
 */

import type { DetectedIntent } from '../types';
import { SERVICE_NAMES, SUBSCRIPTION_PATTERNS } from '../extraction/patterns';

/**
 * Detect user intent from message
 */
export function detectIntent(message: string, _context: Record<string, unknown>): DetectedIntent {
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
