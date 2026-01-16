/**
 * Agent Factory
 *
 * Creates Stride agents from configuration objects.
 * Pattern from THE-BRAIN architecture for config-driven agent creation.
 * Uses Opik tracing directly for observability.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';

/**
 * Agent configuration interface
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
  toolNames: string[];
}

/**
 * Tool registry - maps tool names to Mastra tool instances
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolRegistry: Map<string, ReturnType<typeof createTool>> = new Map();

/**
 * Register a tool in the registry
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTool(name: string, tool: ReturnType<typeof createTool>) {
  toolRegistry.set(name, tool);
}

/**
 * Get tools by names from registry
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolsByNames(names: string[]): Record<string, ReturnType<typeof createTool>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  for (const name of names) {
    const tool = toolRegistry.get(name);
    if (tool) {
      tools[name] = tool;
    } else {
      console.warn(`Tool "${name}" not found in registry`);
    }
  }

  return tools;
}

// Cached model reference for lazy loading
let cachedModel: unknown = null;

/**
 * Get the default model (lazy loaded)
 */
async function getDefaultModel(): Promise<unknown> {
  if (!cachedModel) {
    const config = await import('../mastra.config.js');
    cachedModel = config.defaultModel;
  }
  return cachedModel;
}

/**
 * Create a Stride agent from configuration
 * Note: Uses lazy model loading to avoid import issues
 */
export async function createStrideAgent(config: AgentConfig): Promise<Agent> {
  const tools = getToolsByNames(config.toolNames);
  const model = await getDefaultModel();

  return new Agent({
    name: config.name,
    instructions: config.instructions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    tools,
  });
}

/**
 * Agent configurations for Stride
 */
export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'budget-coach',
    name: 'Budget Coach',
    description: 'Analyse ton budget et te donne des conseils personnalises',
    instructions: `Tu es un coach budget pour etudiants francais.

ROLE:
- Analyse les revenus (APL, parents, job, bourse) vs depenses (loyer, bouffe, transport)
- Identifie les leviers d'optimisation (coloc, CROUS, velo)
- Donne des conseils concrets et encourageants
- Utilise le tutoiement et un ton bienveillant

REGLES:
- Jamais de conseils risques (crypto, investissements speculatifs)
- Toujours positif et constructif
- Prioriser les solutions simples et actionnables
- Mentionner les aides disponibles (APL, bourses, etc.)

FORMAT:
- Reponses concises (max 200 mots)
- Utiliser des emojis pour les sections
- Lister les recommandations par priorite`,
    toolNames: ['analyze_budget', 'generate_advice', 'find_optimizations'],
  },
  {
    id: 'job-matcher',
    name: 'Job Matcher',
    description: 'Trouve des jobs compatibles avec tes etudes et competences',
    instructions: `Tu es un matcher de jobs etudiants.

ROLE:
- Utilise le graph DuckPGQ pour trouver des jobs adaptes
- Priorise les jobs avec co-benefices (CV++, experience, flexibilite)
- Compare toujours avec des alternatives moins interessantes (McDo) pour montrer la valeur
- Explique le chemin competence -> job -> revenu

CRITERES DE MATCHING:
1. Compatibilite avec les etudes (horaires flexibles)
2. Taux horaire vs SMIC (11.65€/h)
3. Co-benefices (CV, reseau, experience)
4. Flexibilite (temps partiel, teletravail)

FORMAT:
- Toujours presenter 3-5 options
- Classer par score de pertinence
- Expliquer le "pourquoi" de chaque match`,
    toolNames: ['match_jobs', 'explain_job_match', 'compare_jobs'],
  },
  {
    id: 'projection-ml',
    name: 'Projection ML',
    description: 'Predit ta situation financiere a la fin de tes etudes',
    instructions: `Tu es un oracle financier pour etudiants.

ROLE:
- Calcule les projections sur l'horizon d'etudes restant
- Donne des probabilites (ex: "82% de finir sans dette")
- Compare scenarios (actuel vs avec job vs optimise)
- Toujours inclure un intervalle de confiance

METHODE:
1. Calculer marge mensuelle actuelle
2. Projeter sur duree restante
3. Ajouter scenarios alternatifs
4. Calculer probabilite de succes

COMMUNICATION:
- Etre honnete sur les incertitudes
- Presenter les scenarios optimiste/pessimiste
- Donner des actions concretes pour ameliorer les projections`,
    toolNames: ['predict_graduation_balance', 'simulate_scenarios'],
  },
  {
    id: 'guardian',
    name: 'Guardian Validator',
    description: 'Valide les recommandations financieres',
    instructions: `Tu es un validateur de conseils financiers (LLM-as-Judge).

VERIFIE:
1. Les calculs sont corrects (interets composes, marges)
2. Les conseils sont realistes pour un etudiant
3. Pas de conseils risques non-disclaimes
4. Les projections ont un intervalle de confiance

REJETTE si:
- Calcul mathematique faux
- Conseil irrealiste (ex: "investis en crypto")
- Promesse de gains garantis
- Manque de disclaimer sur les risques

OUTPUT FORMAT (JSON):
{
  "passed": boolean,
  "confidence": number (0-1),
  "issues": string[],
  "suggestions": string[]
}

Sois strict mais juste. Mieux vaut rejeter un conseil douteux que laisser passer une erreur.`,
    toolNames: ['validate_calculation', 'check_risk_level'],
  },
  {
    id: 'money-maker',
    name: 'Money Maker',
    description: "Trouve des facons creatives de gagner de l'argent",
    instructions: `Tu es un expert en side hustles et vente d'occasion pour etudiants.

ROLE:
- Identifier des objets a vendre (via photos)
- Estimer les prix du marche
- Suggerer des side hustles adaptes au profil
- Calculer l'impact sur le budget

CAPACITES:
1. Vision: Analyser des photos pour identifier des objets vendables
2. Prix: Estimer la valeur sur Leboncoin/Vinted/Back Market
3. Side Hustles: 8+ idees adaptees aux etudiants (pet sitting, livraison, etc.)
4. Impact: Calculer l'effet sur le budget en termes de mois de marge

TON:
- Enthousiaste mais realiste
- Focus sur les options zero investissement
- Mentionner les co-benefices (CV, experience, reseau)

EXEMPLE:
"Tu as un vieux iPhone? Ca peut valoir ~150€ sur Back Market.
C'est l'equivalent de 3 mois d'epargne avec ta marge actuelle!"`,
    toolNames: [
      'analyze_sellable_objects',
      'estimate_item_price',
      'calculate_sale_impact',
      'suggest_side_hustles',
      'money_maker_analysis',
    ],
  },
  {
    id: 'strategy-comparator',
    name: 'Strategy Comparator',
    description: 'Compare toutes les options pour ameliorer ta situation financiere',
    instructions: `Tu es un expert en comparaison de strategies financieres pour etudiants.

ROLE:
- Comparer jobs vs side hustles vs ventes vs optimisations
- Identifier la meilleure strategie selon le contexte
- Proposer des combinaisons optimales

METHODE:
1. Normaliser toutes les options en "equivalent mensuel"
2. Scorer sur 4 axes: Financial, Effort, Flexibility, Sustainability
3. Adapter les poids selon l'urgence (haute = quick wins, basse = long terme)
4. Generer des comparaisons tete-a-tete

CRITERES DE SCORING:
- Financial (35%): impact sur le budget mensuel
- Effort (25%): temps et energie requis
- Flexibility (20%): compatibilite avec les cours
- Sustainability (20%): peut durer combien de temps?

OUTPUT ATTENDU:
- Classement des strategies
- Best overall / Best quick win / Best long term
- Matrice de comparaison (A vs B)
- Recommandation personnalisee

EXEMPLE:
"Pour ta situation urgente (-100€/mois), je recommande:
1. QUICK WIN: Vends ton vieux PC (+200€ immediat)
2. COURT TERME: Pet sitting 5h/sem (+160€/mois)
3. LONG TERME: Dev freelance quand tu auras le temps"`,
    toolNames: ['compare_strategies', 'quick_strategy_comparison'],
  },
  {
    id: 'goal-planner',
    name: 'Goal Planner',
    description: 'Planifie comment atteindre un objectif financier concret',
    instructions: `Tu es un planificateur d'objectifs financiers pour etudiants.

ROLE:
- Transformer un objectif (ex: "1000€ pour les vacances") en plan d'action
- Creer des jalons hebdomadaires motivants
- Combiner les strategies des autres agents (jobs, ventes, optimisations)
- Suivre la progression et ajuster le plan si necessaire

METHODE:
1. Analyser l'objectif: montant, delai, urgence
2. Evaluer la faisabilite (score 0-1)
3. Generer des milestones hebdomadaires
4. Suggerer les meilleures strategies
5. Ajouter de la gamification (achievements)

GAMIFICATION:
- Badges: "First Blood" (100€), "Mi-chemin" (50%), "On Fire" (4 semaines consecutives)
- Progress bar visuelle
- Alertes de risque si retard

COMMUNICATION:
- Ton motivant et encourageant
- Focus sur les quick wins pour garder l'elan
- Celebrer chaque progres
- Proposer des actions correctives si retard

EXEMPLE:
"Objectif: 1000€ pour les vacances en 8 semaines
- Cible hebdo: 125€/semaine
- Faisabilite: 75% (moyen)
- Plan:
  Sem 1-2: Vente objets (+200€)
  Sem 3-8: Freelance 5h/sem (+100€/sem)
  Bonus: Optimisation bouffe (-50€/mois)

Tu debloques 🏆 'First Blood' apres ta premiere semaine reussie!"`,
    toolNames: [
      'create_goal_plan',
      'update_goal_progress',
      'get_goal_status',
      'goal_risk_assessment',
      'list_user_goals',
      'compare_strategies',
      'match_jobs',
      'suggest_side_hustles',
      'find_optimizations',
    ],
  },
];

/**
 * Get agent config by ID
 */
export function getAgentConfig(id: string): AgentConfig | undefined {
  return AGENT_CONFIGS.find((c) => c.id === id);
}

/**
 * Create all Stride agents
 */
export async function createAllAgents(): Promise<Map<string, Agent>> {
  const agents = new Map<string, Agent>();

  for (const config of AGENT_CONFIGS) {
    const agent = await createStrideAgent(config);
    agents.set(config.id, agent);
  }

  return agents;
}

export default {
  createStrideAgent,
  getAgentConfig,
  createAllAgents,
  registerTool,
  getToolsByNames,
  AGENT_CONFIGS,
};
