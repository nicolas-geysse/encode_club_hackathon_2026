/**
 * Essential Guardian Agent
 *
 * Protects essential expenses from naive suggestions:
 * - Blocks unrealistic suggestions ("pause rent", "eat less")
 * - Suggests structural alternatives to reduce fixed costs
 * - Provides actionable resources (apps, websites, subsidies)
 *
 * Mantra: "Don't suggest the impossible. Suggest the structural."
 *
 * Part of Checkpoint H.5: Guardrail Agents
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';
import type { SwipeScenario } from './swipe-orchestrator.js';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type EssentialCategory =
  | 'housing'
  | 'food'
  | 'transport'
  | 'health'
  | 'education'
  | 'utilities';

export interface StructuralAlternative {
  expenseId: string;
  type: 'roommate' | 'downgrade' | 'switch_provider' | 'lifestyle_change' | 'subsidy';
  description: string;
  savingsPerMonth: number;
  savingsPercent: number;
  implementationEffort: 'easy' | 'medium' | 'hard';
  implementationTime: string;
  requirements?: string[];
  resources?: string[];
}

export interface BlockedScenario {
  scenarioId: string;
  scenarioTitle: string;
  reason: string;
  category: EssentialCategory;
  alternative?: StructuralAlternative;
}

export interface EssentialGuardianOutput {
  blockedScenarios: BlockedScenario[];
  filteredScenarios: SwipeScenario[];
  structuralSuggestions: StructuralAlternative[];
  totalPotentialSavings: number;
}

// ============================================================
// STRUCTURAL ALTERNATIVES DATABASE
// ============================================================

interface AlternativeTemplate {
  type: StructuralAlternative['type'];
  description: string;
  savingsPercent: number;
  implementationEffort: StructuralAlternative['implementationEffort'];
  implementationTime: string;
  requirements?: string[];
  resources?: string[];
}

export const STRUCTURAL_ALTERNATIVES: Record<EssentialCategory, AlternativeTemplate[]> = {
  housing: [
    {
      type: 'roommate',
      description: 'Prendre un colocataire',
      savingsPercent: 40,
      implementationEffort: 'hard',
      implementationTime: '1-2 mois',
      requirements: ['Accord propriétaire', 'Chambre disponible'],
      resources: ['lacartedescolocs.fr', 'appartager.com'],
    },
    {
      type: 'downgrade',
      description: 'Déménager dans plus petit',
      savingsPercent: 25,
      implementationEffort: 'hard',
      implementationTime: '2-3 mois',
    },
    {
      type: 'subsidy',
      description: 'Demander APL/ALS si pas fait',
      savingsPercent: 30,
      implementationEffort: 'easy',
      implementationTime: '2 semaines',
      resources: ['caf.fr'],
    },
  ],

  food: [
    {
      type: 'lifestyle_change',
      description: 'Cuisiner maison (batch cooking dimanche)',
      savingsPercent: 40,
      implementationEffort: 'medium',
      implementationTime: '1 semaine',
      resources: ['marmiton.org/batch-cooking'],
    },
    {
      type: 'lifestyle_change',
      description: 'Réduire viande (2x/semaine max)',
      savingsPercent: 25,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
    },
    {
      type: 'switch_provider',
      description: 'Acheter en vrac / marché fin de journée',
      savingsPercent: 20,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['Too Good To Go app'],
    },
    {
      type: 'subsidy',
      description: 'Resto U / épicerie solidaire CROUS',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['etudiant.gouv.fr'],
    },
  ],

  transport: [
    {
      type: 'lifestyle_change',
      description: 'Marcher plus (gratuit + exercice, trajets < 2km)',
      savingsPercent: 80,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
    },
    {
      type: 'lifestyle_change',
      description: 'Passer au vélo (exercice + zéro carburant, trajets < 5km)',
      savingsPercent: 80,
      implementationEffort: 'medium',
      implementationTime: '1 semaine',
      resources: ['geovelo.fr'],
    },
    {
      type: 'lifestyle_change',
      description: 'Trottinette électrique (investissement unique, zéro carburant)',
      savingsPercent: 70,
      implementationEffort: 'easy',
      implementationTime: '1 semaine',
    },
    {
      type: 'switch_provider',
      description: 'Covoiturage domicile-campus',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
      resources: ['blablacar daily', 'karos.fr'],
    },
    {
      type: 'subsidy',
      description: 'Abonnement jeune / étudiant',
      savingsPercent: 50,
      implementationEffort: 'easy',
      implementationTime: '1 semaine',
    },
  ],

  utilities: [
    {
      type: 'switch_provider',
      description: 'Changer de fournisseur énergie',
      savingsPercent: 15,
      implementationEffort: 'easy',
      implementationTime: '2 semaines',
      resources: ['energie-info.fr/comparateur'],
    },
    {
      type: 'switch_provider',
      description: 'Forfait mobile low-cost (2€ Free, 5€ Red)',
      savingsPercent: 70,
      implementationEffort: 'easy',
      implementationTime: '1 jour',
    },
    {
      type: 'lifestyle_change',
      description: 'Réduire chauffage 1°C = -7% facture',
      savingsPercent: 7,
      implementationEffort: 'easy',
      implementationTime: 'immédiat',
    },
  ],

  health: [
    {
      type: 'switch_provider',
      description: 'Mutuelle étudiante LMDE/SMERRA',
      savingsPercent: 30,
      implementationEffort: 'medium',
      implementationTime: '1 mois',
    },
    {
      type: 'subsidy',
      description: 'CSS (Complémentaire Santé Solidaire)',
      savingsPercent: 100,
      implementationEffort: 'medium',
      implementationTime: '1 mois',
      resources: ['ameli.fr/css'],
    },
  ],

  education: [
    {
      type: 'subsidy',
      description: 'Bourse CROUS si non demandée',
      savingsPercent: 100,
      implementationEffort: 'medium',
      implementationTime: '2 mois',
      resources: ['messervices.etudiant.gouv.fr'],
    },
    {
      type: 'subsidy',
      description: 'Aide au mérite, aide mobilité',
      savingsPercent: 50,
      implementationEffort: 'medium',
      implementationTime: '2 mois',
    },
  ],
};

// ============================================================
// NAIVE SUGGESTION PATTERNS
// ============================================================

interface NaivePattern {
  keywords: string[];
  category: EssentialCategory;
  reason: string;
}

const NAIVE_PATTERNS: NaivePattern[] = [
  // Housing
  {
    keywords: ['pause loyer', 'arrêter loyer', 'skip rent', 'pause rent', 'stop paying rent'],
    category: 'housing',
    reason: "Le loyer ne peut pas être pausé - risque d'expulsion",
  },
  {
    keywords: ['réduire loyer', 'lower rent', 'pay less rent'],
    category: 'housing',
    reason: 'Le loyer est fixé par contrat - mais tu peux renégocier ou chercher une coloc',
  },

  // Food
  {
    keywords: ['manger moins', 'eat less', 'skip meals', 'sauter repas', 'jeûner'],
    category: 'food',
    reason: "Manger moins n'est pas une solution - ta santé passe avant",
  },
  {
    keywords: ['arrêter manger', 'stop eating', 'no food', 'pause food', 'cancel food'],
    category: 'food',
    reason: 'Tu dois te nourrir ! On cherche des alternatives moins chères, pas la faim',
  },

  // Transport
  {
    keywords: [
      'pause transport',
      'cancel transport',
      'stop transport',
      'arrêter transport',
      'no transport',
      'skip transport',
      'supprimer transport',
    ],
    category: 'transport',
    reason:
      'Se déplacer est essentiel - mais tu peux marcher, prendre un vélo ou une trottinette électrique',
  },

  // Health
  {
    keywords: ['arrêter mutuelle', 'cancel insurance', 'stop health', 'pause assurance'],
    category: 'health',
    reason: "L'assurance santé est essentielle - regarde la CSS gratuite plutôt",
  },
  {
    keywords: ['pas de médecin', 'skip doctor', 'avoid hospital'],
    category: 'health',
    reason: "Ta santé n'est pas négociable - la CSS peut tout couvrir",
  },

  // Utilities
  {
    keywords: ['couper électricité', 'no electricity', 'cut power', 'vivre sans eau'],
    category: 'utilities',
    reason: 'Les services essentiels ne peuvent pas être coupés - mais on peut optimiser',
  },

  // Education
  {
    keywords: ['arrêter études', 'drop out', 'quitter fac', 'abandonner études'],
    category: 'education',
    reason: "Abandonner les études pour de l'argent court terme est rarement la solution",
  },
];

// ============================================================
// ANALYSIS FUNCTIONS
// ============================================================

/**
 * Check if a scenario contains naive/dangerous suggestions
 */
function isNaiveSuggestion(scenario: SwipeScenario): NaivePattern | null {
  const textToCheck =
    `${scenario.title} ${scenario.subtitle} ${scenario.description}`.toLowerCase();

  for (const pattern of NAIVE_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return pattern;
      }
    }
  }

  // Also check for lifestyle_pause on essential categories
  if (scenario.category === 'lifestyle_pause') {
    const essentialCategories = ['housing', 'food', 'transport', 'health', 'utilities'];
    const tags = scenario.tags.map((t) => t.toLowerCase());

    for (const cat of essentialCategories) {
      if (tags.includes(cat)) {
        return {
          keywords: [],
          category: cat as EssentialCategory,
          reason: `Les dépenses ${cat} sont essentielles - on cherche des alternatives structurelles`,
        };
      }
    }
  }

  return null;
}

/**
 * Get structural alternatives for a category
 */
function getAlternativesForCategory(
  category: EssentialCategory,
  monthlyAmount: number
): StructuralAlternative[] {
  const templates = STRUCTURAL_ALTERNATIVES[category] || [];

  return templates.map((template) => ({
    expenseId: `${category}_essential`,
    type: template.type,
    description: template.description,
    savingsPerMonth: Math.round((template.savingsPercent / 100) * monthlyAmount),
    savingsPercent: template.savingsPercent,
    implementationEffort: template.implementationEffort,
    implementationTime: template.implementationTime,
    requirements: template.requirements,
    resources: template.resources,
  }));
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Detect naive/dangerous suggestions
 */
export const detectNaiveSuggestionsTool = createTool({
  id: 'detect_naive_suggestions',
  description: 'Detect and block unrealistic suggestions about essential expenses',
  inputSchema: z.object({
    candidateScenarios: z.array(
      z.object({
        id: z.string(),
        category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
        sourceId: z.string(),
        title: z.string(),
        subtitle: z.string(),
        description: z.string(),
        amount: z.number(),
        goalImpact: z.number(),
        effort: z.number(),
        urgency: z.number(),
        confidence: z.number(),
        tags: z.array(z.string()),
        metadata: z.record(z.string(), z.unknown()),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.detect_naive_suggestions', async (ctx) => {
      setPromptAttributes(ctx, 'essential-guardian');

      const blocked: BlockedScenario[] = [];
      const passed: SwipeScenario[] = [];

      for (const scenario of input.candidateScenarios) {
        const naivePattern = isNaiveSuggestion(scenario);

        if (naivePattern) {
          const alternatives = getAlternativesForCategory(naivePattern.category, 100); // Default 100€
          blocked.push({
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            reason: naivePattern.reason,
            category: naivePattern.category,
            alternative: alternatives[0], // Top alternative
          });
        } else {
          passed.push(scenario);
        }
      }

      ctx.setAttributes({
        'input.scenarios_count': input.candidateScenarios.length,
        'output.blocked_count': blocked.length,
        'output.passed_count': passed.length,
      });

      return {
        blocked,
        passed,
        blockRate:
          input.candidateScenarios.length > 0
            ? blocked.length / input.candidateScenarios.length
            : 0,
      };
    });
  },
});

/**
 * Tool: Suggest structural alternatives for essential expenses
 */
export const suggestStructuralAlternativesTool = createTool({
  id: 'suggest_structural_alternatives',
  description: 'Suggest ways to reduce essential expense costs structurally',
  inputSchema: z.object({
    expenseCategory: z.enum(['housing', 'food', 'transport', 'health', 'education', 'utilities']),
    monthlyAmount: z.number().describe('Current monthly cost in euros'),
    userContext: z
      .object({
        housingType: z.enum(['alone', 'roommates', 'family']).optional(),
        transportMode: z.enum(['car', 'public', 'bike', 'walk']).optional(),
        hasAppliedForAid: z.boolean().optional(),
      })
      .optional(),
  }),
  execute: async (input) => {
    return trace('tool.suggest_structural_alternatives', async (ctx) => {
      setPromptAttributes(ctx, 'essential-guardian');

      let alternatives = getAlternativesForCategory(input.expenseCategory, input.monthlyAmount);

      // Filter based on user context
      if (input.userContext) {
        if (input.userContext.housingType === 'roommates') {
          alternatives = alternatives.filter((a) => a.type !== 'roommate');
        }
        if (input.userContext.transportMode === 'bike') {
          alternatives = alternatives.filter((a) => !a.description.toLowerCase().includes('vélo'));
        }
        if (input.userContext.hasAppliedForAid) {
          alternatives = alternatives.filter((a) => a.type !== 'subsidy');
        }
      }

      // Sort by savings/effort ratio
      alternatives.sort((a, b) => {
        const effortScore = { easy: 1, medium: 2, hard: 3 };
        const ratioA = a.savingsPerMonth / effortScore[a.implementationEffort];
        const ratioB = b.savingsPerMonth / effortScore[b.implementationEffort];
        return ratioB - ratioA;
      });

      const totalPotential = alternatives.reduce((sum, a) => sum + a.savingsPerMonth, 0);

      ctx.setAttributes({
        'input.category': input.expenseCategory,
        'input.monthly_amount': input.monthlyAmount,
        'output.alternatives_count': alternatives.length,
        'output.total_potential_savings': totalPotential,
      });

      return {
        alternatives,
        totalPotentialSavings: totalPotential,
        bestOption: alternatives[0] || null,
        implementationPlan: alternatives.slice(0, 3).map((a) => a.description),
      };
    });
  },
});

/**
 * Tool: Calculate total structural impact
 */
export const calculateStructuralImpactTool = createTool({
  id: 'calculate_structural_impact',
  description: 'Calculate the total savings from implementing structural changes',
  inputSchema: z.object({
    selectedAlternatives: z.array(
      z.object({
        expenseId: z.string(),
        type: z.enum(['roommate', 'downgrade', 'switch_provider', 'lifestyle_change', 'subsidy']),
        description: z.string(),
        savingsPerMonth: z.number(),
        savingsPercent: z.number(),
        implementationEffort: z.enum(['easy', 'medium', 'hard']),
        implementationTime: z.string(),
      })
    ),
    goalContext: z.object({
      goalAmount: z.number(),
      currentAmount: z.number(),
      remainingAmount: z.number(),
      monthsRemaining: z.number(),
    }),
  }),
  execute: async (input) => {
    return trace('tool.calculate_structural_impact', async (ctx) => {
      setPromptAttributes(ctx, 'essential-guardian');

      const { selectedAlternatives, goalContext } = input;

      // Calculate totals
      const monthlySavings = selectedAlternatives.reduce((sum, a) => sum + a.savingsPerMonth, 0);
      const totalSavingsToGoal = monthlySavings * goalContext.monthsRemaining;
      const goalImpact =
        goalContext.remainingAmount > 0 ? totalSavingsToGoal / goalContext.remainingAmount : 0;

      // Group by effort
      const byEffort = {
        easy: selectedAlternatives.filter((a) => a.implementationEffort === 'easy'),
        medium: selectedAlternatives.filter((a) => a.implementationEffort === 'medium'),
        hard: selectedAlternatives.filter((a) => a.implementationEffort === 'hard'),
      };

      // Generate timeline message
      let timeline = '';
      if (goalImpact >= 0.5) {
        timeline = `Ces optimisations structurelles couvrent ${Math.round(goalImpact * 100)}% de ton objectif !`;
      } else if (monthlySavings >= 50) {
        timeline = `${monthlySavings}€/mois d'économies = ${totalSavingsToGoal}€ sur la période`;
      } else {
        timeline = `Chaque petit changement compte : ${monthlySavings}€/mois`;
      }

      ctx.setAttributes({
        'input.alternatives_count': selectedAlternatives.length,
        'output.monthly_savings': monthlySavings,
        'output.total_savings_to_goal': totalSavingsToGoal,
        'output.goal_impact': goalImpact,
      });

      return {
        monthlySavings,
        totalSavingsToGoal,
        goalImpact: Math.round(goalImpact * 100),
        timeline,
        implementationOrder: [
          ...byEffort.easy.map((a) => `🟢 ${a.description}`),
          ...byEffort.medium.map((a) => `🟡 ${a.description}`),
          ...byEffort.hard.map((a) => `🔴 ${a.description}`),
        ],
        quickWins: byEffort.easy.slice(0, 3),
      };
    });
  },
});

/**
 * Combined guardrail tool
 */
export const essentialGuardianTool = createTool({
  id: 'essential_guardian',
  description: 'Full essential expense protection: block naive + suggest structural',
  inputSchema: z.object({
    candidateScenarios: z.array(
      z.object({
        id: z.string(),
        category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
        sourceId: z.string(),
        title: z.string(),
        subtitle: z.string(),
        description: z.string(),
        amount: z.number(),
        goalImpact: z.number(),
        effort: z.number(),
        urgency: z.number(),
        confidence: z.number(),
        tags: z.array(z.string()),
        metadata: z.record(z.string(), z.unknown()),
      })
    ),
    essentialExpenses: z
      .array(
        z.object({
          category: z.enum(['housing', 'food', 'transport', 'health', 'education', 'utilities']),
          monthlyAmount: z.number(),
        })
      )
      .optional(),
    goalContext: z
      .object({
        goalAmount: z.number(),
        currentAmount: z.number(),
        remainingAmount: z.number(),
        monthsRemaining: z.number(),
      })
      .optional(),
  }),
  execute: async (input): Promise<EssentialGuardianOutput> => {
    return trace('essential_guardian.full_check', async (ctx) => {
      setPromptAttributes(ctx, 'essential-guardian');

      // Step 1: Detect and block naive suggestions
      const blocked: BlockedScenario[] = [];
      const filtered: SwipeScenario[] = [];

      for (const scenario of input.candidateScenarios) {
        const naivePattern = isNaiveSuggestion(scenario);

        if (naivePattern) {
          const alternatives = getAlternativesForCategory(naivePattern.category, 100);
          blocked.push({
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            reason: naivePattern.reason,
            category: naivePattern.category,
            alternative: alternatives[0],
          });
        } else {
          filtered.push(scenario);
        }
      }

      // Step 2: Generate structural suggestions for all essential categories
      const structuralSuggestions: StructuralAlternative[] = [];

      if (input.essentialExpenses) {
        for (const expense of input.essentialExpenses) {
          const alternatives = getAlternativesForCategory(expense.category, expense.monthlyAmount);
          // Take top 2 per category
          structuralSuggestions.push(...alternatives.slice(0, 2));
        }
      }

      // Step 3: Calculate total potential savings
      const totalPotentialSavings = structuralSuggestions.reduce(
        (sum, a) => sum + a.savingsPerMonth,
        0
      );

      ctx.setAttributes({
        'input.scenarios_count': input.candidateScenarios.length,
        'output.blocked_count': blocked.length,
        'output.filtered_count': filtered.length,
        'output.suggestions_count': structuralSuggestions.length,
        'output.total_potential_savings': totalPotentialSavings,
      });

      ctx.setOutput({
        blocked_scenarios: blocked.length,
        filtered_scenarios: filtered.length,
        structural_suggestions: structuralSuggestions.length,
        monthly_savings_potential: totalPotentialSavings,
      });

      return {
        blockedScenarios: blocked,
        filteredScenarios: filtered,
        structuralSuggestions,
        totalPotentialSavings,
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('detect_naive_suggestions', detectNaiveSuggestionsTool);
registerTool('suggest_structural_alternatives', suggestStructuralAlternativesTool);
registerTool('calculate_structural_impact', calculateStructuralImpactTool);
registerTool('essential_guardian', essentialGuardianTool);

// ============================================================
// EXPORTS
// ============================================================

export default {
  detectNaiveSuggestionsTool,
  suggestStructuralAlternativesTool,
  calculateStructuralImpactTool,
  essentialGuardianTool,
  STRUCTURAL_ALTERNATIVES,
  NAIVE_PATTERNS,
};
