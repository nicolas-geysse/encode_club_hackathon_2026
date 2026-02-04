/**
 * Tab Tips API Endpoint
 *
 * Generates personalized tips for each tab using LLM + user data.
 * Each tab type has a specialized prompt that analyzes relevant user data.
 *
 * Traces to Opik for feedback learning.
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('TabTipsAPI');

type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

interface TabTipRequest {
  tabType: TabType;
  profileId: string;
  contextData: Record<string, unknown>;
}

interface TabTipResponse {
  tip: string;
  traceId: string | null;
  cached: boolean;
}

// Simple in-memory cache to avoid hitting LLM too often
const tipCache = new Map<string, { tip: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Tab-specific system prompts
 */
const TAB_PROMPTS: Record<TabType, string> = {
  profile: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le profil de l'étudiant et donne UN conseil court et actionnable pour l'améliorer.
Focus sur: compléter les informations manquantes, optimiser les préférences de travail, ou valoriser les certifications.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,

  goals: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les objectifs financiers de l'étudiant et donne UN conseil court et actionnable.
Focus sur: faisabilité des objectifs, décomposition en étapes, ou ajustement des montants/délais.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,

  budget: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le budget de l'étudiant (revenus et dépenses) et donne UN conseil court et actionnable.
Focus sur: réduire une dépense spécifique, augmenter les revenus, ou optimiser la marge d'épargne.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,

  trade: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse l'inventaire et les échanges de l'étudiant et donne UN conseil court et actionnable.
Focus sur: identifier un objet à vendre, suggérer un emprunt plutôt qu'un achat, ou valoriser le karma d'entraide.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,

  jobs: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les compétences et la recherche d'emploi de l'étudiant et donne UN conseil court et actionnable.
Focus sur: matcher une compétence avec une opportunité, suggérer une nouvelle piste, ou optimiser le taux horaire.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,

  swipe: `Tu es Bruno, un coach financier bienveillant pour étudiants.
Donne UN conseil court sur comment utiliser le swipe de scénarios efficacement.
Focus sur: équilibrer effort et revenus, diversifier les sources de revenus, ou écouter ses préférences.
Réponds en 1-2 phrases max, de manière encourageante. En français.`,
};

/**
 * Format context data for LLM based on tab type
 */
function formatContextForTab(tabType: TabType, data: Record<string, unknown>): string {
  switch (tabType) {
    case 'profile': {
      const parts: string[] = [];
      if (data.name) parts.push(`Nom: ${data.name}`);
      if (data.diploma) parts.push(`Diplôme: ${data.diploma}`);
      if (data.field) parts.push(`Domaine: ${data.field}`);
      if (data.city) parts.push(`Ville: ${data.city}`);
      if (data.skills && Array.isArray(data.skills)) {
        parts.push(`Compétences: ${(data.skills as string[]).join(', ') || 'aucune'}`);
      }
      if (data.certifications && Array.isArray(data.certifications)) {
        parts.push(`Certifications: ${(data.certifications as string[]).join(', ') || 'aucune'}`);
      }
      if (data.maxWorkHoursWeekly) parts.push(`Heures max/semaine: ${data.maxWorkHoursWeekly}h`);
      if (data.minHourlyRate) parts.push(`Taux horaire min: ${data.minHourlyRate}€/h`);
      return parts.join('\n') || 'Profil incomplet';
    }

    case 'goals': {
      const parts: string[] = [];
      if (data.goals && Array.isArray(data.goals)) {
        const goals = data.goals as Array<{
          name: string;
          amount: number;
          deadline?: string;
          progress?: number;
        }>;
        goals.forEach((g, i) => {
          parts.push(
            `Objectif ${i + 1}: ${g.name} - ${g.amount}€${g.deadline ? ` (deadline: ${g.deadline})` : ''}${g.progress ? ` - ${g.progress}% accompli` : ''}`
          );
        });
      }
      if (data.monthlyMargin) parts.push(`Marge mensuelle: ${data.monthlyMargin}€`);
      return parts.join('\n') || 'Aucun objectif défini';
    }

    case 'budget': {
      const parts: string[] = [];
      if (data.monthlyIncome) parts.push(`Revenus mensuels: ${data.monthlyIncome}€`);
      if (data.monthlyExpenses) parts.push(`Dépenses mensuelles: ${data.monthlyExpenses}€`);
      if (data.monthlyMargin) parts.push(`Marge d'épargne: ${data.monthlyMargin}€`);
      if (data.expenses && Array.isArray(data.expenses)) {
        const expenses = data.expenses as Array<{ category: string; amount: number }>;
        const byCategory = expenses.reduce(
          (acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
          },
          {} as Record<string, number>
        );
        Object.entries(byCategory).forEach(([cat, amount]) => {
          parts.push(`- ${cat}: ${amount}€`);
        });
      }
      return parts.join('\n') || 'Budget non renseigné';
    }

    case 'trade': {
      const parts: string[] = [];
      if (data.inventory && Array.isArray(data.inventory)) {
        const inventory = data.inventory as Array<{ name: string; estimatedValue?: number }>;
        const totalValue = inventory.reduce((sum, i) => sum + (i.estimatedValue || 0), 0);
        parts.push(`Inventaire: ${inventory.length} objets (valeur estimée: ${totalValue}€)`);
        inventory.slice(0, 3).forEach((i) => {
          parts.push(`- ${i.name}: ${i.estimatedValue || '?'}€`);
        });
      }
      if (data.trades && Array.isArray(data.trades)) {
        const trades = data.trades as Array<{ type: string; status: string }>;
        const active = trades.filter((t) => t.status === 'active');
        parts.push(`Échanges actifs: ${active.length}`);
      }
      return parts.join('\n') || "Pas d'inventaire";
    }

    case 'jobs': {
      const parts: string[] = [];
      if (data.skills && Array.isArray(data.skills)) {
        const skills = data.skills as Array<{
          name: string;
          hourlyRate?: number;
          arbitrageScore?: number;
        }>;
        parts.push(`Compétences: ${skills.length}`);
        skills.slice(0, 3).forEach((s) => {
          parts.push(
            `- ${s.name}: ${s.hourlyRate || '?'}€/h${s.arbitrageScore ? ` (score: ${s.arbitrageScore}/10)` : ''}`
          );
        });
      }
      if (data.leads && Array.isArray(data.leads)) {
        const leads = data.leads as Array<{ status: string }>;
        const interested = leads.filter((l) => l.status === 'interested').length;
        parts.push(`Opportunités sauvegardées: ${interested}`);
      }
      if (data.city) parts.push(`Localisation: ${data.city}`);
      return parts.join('\n') || 'Pas de compétences déclarées';
    }

    case 'swipe': {
      const parts: string[] = [];
      if (data.preferences) {
        const prefs = data.preferences as Record<string, number>;
        if (prefs.effort_sensitivity !== undefined) {
          parts.push(`Sensibilité effort: ${prefs.effort_sensitivity > 0.5 ? 'élevée' : 'faible'}`);
        }
        if (prefs.hourly_rate_priority !== undefined) {
          parts.push(
            `Priorité taux horaire: ${prefs.hourly_rate_priority > 0.5 ? 'élevée' : 'faible'}`
          );
        }
      }
      if (data.scenariosCount) parts.push(`Scénarios disponibles: ${data.scenariosCount}`);
      return parts.join('\n') || 'Préférences par défaut';
    }

    default:
      return JSON.stringify(data).slice(0, 500);
  }
}

/**
 * Generate tip using LLM
 */
async function generateTip(
  tabType: TabType,
  contextData: Record<string, unknown>,
  profileId: string
): Promise<{ tip: string; traceId: string | null }> {
  try {
    // Dynamic import to avoid bundling issues
    const { llmChat, trace, getCurrentTraceId } = await import('@stride/mcp-server/services');

    const systemPrompt = TAB_PROMPTS[tabType];
    const userContext = formatContextForTab(tabType, contextData);

    let tip = '';
    let traceId: string | null = null;

    await trace(
      `tab-tips.${tabType}`,
      async (ctx) => {
        ctx.setAttributes({
          'tab.type': tabType,
          'profile.id': profileId,
          'context.length': userContext.length,
        });

        const response = await llmChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Contexte de l'étudiant:\n${userContext}` },
          ],
          { maxTokens: 150, temperature: 0.7 }
        );

        tip = response.trim();
        traceId = getCurrentTraceId();

        ctx.setAttributes({
          'tip.length': tip.length,
          'trace.id': traceId || 'none',
        });
      },
      {
        metadata: {
          source: 'tab-tips',
          tabType,
          profileId,
        },
      }
    );

    return { tip, traceId };
  } catch (error) {
    logger.warn('LLM tip generation failed, using fallback', { error, tabType });
    return { tip: getFallbackTip(tabType), traceId: null };
  }
}

/**
 * Fallback tips when LLM is unavailable
 */
function getFallbackTip(tabType: TabType): string {
  const fallbacks: Record<TabType, string> = {
    profile: 'Complète ton profil pour recevoir des conseils personnalisés !',
    goals:
      'Définis des objectifs SMART : Spécifiques, Mesurables, Atteignables, Réalistes et Temporels.',
    budget: 'Essaie la règle 50/30/20 : 50% besoins, 30% envies, 20% épargne.',
    trade: "Avant d'acheter, demande-toi si tu peux emprunter ou échanger.",
    jobs: 'Diversifie tes sources de revenus pour plus de stabilité.',
    swipe: "Swipe selon tes vraies préférences, l'app apprend de tes choix !",
  };
  return fallbacks[tabType];
}

/**
 * POST /api/tab-tips
 */
export async function POST({ request }: APIEvent) {
  try {
    const body = (await request.json()) as TabTipRequest;
    const { tabType, profileId, contextData } = body;

    if (!tabType || !profileId) {
      return new Response(JSON.stringify({ error: 'tabType and profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check cache
    const cacheKey = `${tabType}:${profileId}`;
    const cached = tipCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug('Returning cached tip', { tabType, profileId });
      return new Response(
        JSON.stringify({ tip: cached.tip, traceId: null, cached: true } as TabTipResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate new tip
    const { tip, traceId } = await generateTip(tabType, contextData || {}, profileId);

    // Cache the result
    tipCache.set(cacheKey, { tip, timestamp: Date.now() });

    const response: TabTipResponse = { tip, traceId, cached: false };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Tab tips request failed', { error });
    return new Response(JSON.stringify({ error: 'Failed to generate tip' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * DELETE /api/tab-tips - Clear cache for a profile
 */
export async function DELETE({ request }: APIEvent) {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (profileId) {
      // Clear cache for specific profile
      for (const key of tipCache.keys()) {
        if (key.includes(profileId)) {
          tipCache.delete(key);
        }
      }
      logger.debug('Cleared tip cache for profile', { profileId });
    } else {
      // Clear all cache
      tipCache.clear();
      logger.debug('Cleared all tip cache');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to clear cache' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
