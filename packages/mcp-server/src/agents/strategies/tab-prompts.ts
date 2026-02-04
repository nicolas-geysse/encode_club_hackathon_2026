/**
 * Tab Prompts Registry
 *
 * Central registry of all tab-specific system prompts with version tracking.
 * Uses registerPrompt() to generate content hashes for regression detection.
 *
 * Benefits:
 * - Prompt versions visible in Opik traces
 * - Filter traces by prompt version in dashboard
 * - Detect quality regressions after prompt changes
 */

import { registerPrompt, type PromptMetadata } from '../../services/opik.js';

// ============================================================================
// System Prompts
// ============================================================================

export const PROFILE_SYSTEM_PROMPT = `Tu es Bruno, un assistant amical pour étudiants.
Analyse le profil de l'étudiant (compétences, diplôme, localisation) et donne UN conseil court.
Focus sur: compléter le profil, ajouter des certifications, ou valoriser des compétences.
Si le profil est incomplet, encourage à ajouter les informations manquantes.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;

export const GOALS_SYSTEM_PROMPT = `Tu es Bruno, un coach de planification financière pour étudiants.
Analyse les objectifs de l'étudiant (montant, deadline, progression) et donne UN conseil court.
Focus sur: ajuster le rythme d'épargne, célébrer les progrès, ou alerter si objectif en danger.
Si un objectif est proche d'être atteint, encourage l'étudiant!
Si un objectif est en retard, suggère des ajustements réalistes.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;

export const BUDGET_SYSTEM_PROMPT = `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le budget de l'étudiant (revenus et dépenses) et donne UN conseil court et actionnable.
Focus sur: réduire une dépense spécifique, augmenter les revenus, ou optimiser la marge d'épargne.
Si le budget est en déficit, priorise la réduction des dépenses non-essentielles.
Si le budget est serré (<50€ de marge), suggère des quick wins à faible effort.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;

export const TRADE_SYSTEM_PROMPT = `Tu es Bruno, un conseiller en économie collaborative pour étudiants.
Analyse l'inventaire de l'étudiant (objets à vendre/échanger) et donne UN conseil court.
Focus sur: estimer la valeur d'un objet, suggérer une plateforme de vente, ou proposer un échange.
Sois réaliste sur les prix et mentionne les frais de plateforme si pertinent.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;

export const JOBS_SYSTEM_PROMPT = `Tu es Bruno, un coach en side-hustle pour étudiants.
Analyse les compétences de l'étudiant et les opportunités de travail pour donner UN conseil court.
Focus sur: un job spécifique adapté aux compétences, les taux horaires du marché, ou les plateformes pertinentes.
Considère le niveau d'énergie de l'étudiant et le temps disponible.
Si l'étudiant a peu d'énergie, suggère des jobs à faible effort cognitif.
Réponds en 1-2 phrases max, de manière actionnable. En français.`;

export const SWIPE_SYSTEM_PROMPT = `Tu es Bruno, un assistant de décision pour étudiants.
Analyse les préférences de l'étudiant basées sur ses swipes et donne UN conseil court.
Focus sur: confirmer le profil de préférences détecté, suggérer de nouvelles stratégies compatibles.
Si l'étudiant semble indécis (peu de swipes), encourage l'exploration.
Réponds en 1-2 phrases max, de manière ludique. En français.`;

// ============================================================================
// Prompt Registration
// ============================================================================

/** Registered prompt metadata per tab type */
export const TAB_PROMPTS: Record<string, PromptMetadata> = {};

/**
 * Initialize prompt registration.
 * Call this once at module load time.
 */
export function initTabPrompts(): void {
  TAB_PROMPTS['profile'] = registerPrompt('tab-tips.profile', PROFILE_SYSTEM_PROMPT);
  TAB_PROMPTS['goals'] = registerPrompt('tab-tips.goals', GOALS_SYSTEM_PROMPT);
  TAB_PROMPTS['budget'] = registerPrompt('tab-tips.budget', BUDGET_SYSTEM_PROMPT);
  TAB_PROMPTS['trade'] = registerPrompt('tab-tips.trade', TRADE_SYSTEM_PROMPT);
  TAB_PROMPTS['jobs'] = registerPrompt('tab-tips.jobs', JOBS_SYSTEM_PROMPT);
  TAB_PROMPTS['swipe'] = registerPrompt('tab-tips.swipe', SWIPE_SYSTEM_PROMPT);
}

// Auto-register on module load
initTabPrompts();

/**
 * Get prompt metadata for a tab type
 */
export function getTabPromptMetadata(tabType: string): PromptMetadata | undefined {
  return TAB_PROMPTS[tabType];
}

/**
 * Get system prompt for a tab type
 */
export function getTabSystemPrompt(tabType: string): string {
  const prompts: Record<string, string> = {
    profile: PROFILE_SYSTEM_PROMPT,
    goals: GOALS_SYSTEM_PROMPT,
    budget: BUDGET_SYSTEM_PROMPT,
    trade: TRADE_SYSTEM_PROMPT,
    jobs: JOBS_SYSTEM_PROMPT,
    swipe: SWIPE_SYSTEM_PROMPT,
  };
  return prompts[tabType] || prompts['profile'];
}

export default {
  TAB_PROMPTS,
  initTabPrompts,
  getTabPromptMetadata,
  getTabSystemPrompt,
  // Individual prompts for direct access
  PROFILE_SYSTEM_PROMPT,
  GOALS_SYSTEM_PROMPT,
  BUDGET_SYSTEM_PROMPT,
  TRADE_SYSTEM_PROMPT,
  JOBS_SYSTEM_PROMPT,
  SWIPE_SYSTEM_PROMPT,
};
