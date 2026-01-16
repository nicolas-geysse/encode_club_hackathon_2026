/**
 * Money Maker Agent
 *
 * Helps students find creative ways to make money:
 * - Identify objects to sell from photos (vision)
 * - Estimate prices via web search
 * - Calculate budget impact
 * - Suggest unexplored side hustles
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import { trace } from '../services/opik.js';

/**
 * Common sellable items categories with typical price ranges
 */
export const ITEM_CATEGORIES: Record<
  string,
  { minPrice: number; maxPrice: number; platforms: string[] }
> = {
  electronics: {
    minPrice: 20,
    maxPrice: 500,
    platforms: ['Leboncoin', 'Back Market', 'Facebook Marketplace'],
  },
  clothing: {
    minPrice: 5,
    maxPrice: 100,
    platforms: ['Vinted', 'Vestiaire Collective', 'Depop'],
  },
  books: {
    minPrice: 2,
    maxPrice: 30,
    platforms: ['Leboncoin', 'Momox', 'RecycLivre'],
  },
  furniture: {
    minPrice: 10,
    maxPrice: 200,
    platforms: ['Leboncoin', 'Facebook Marketplace', 'Geev'],
  },
  sports: {
    minPrice: 10,
    maxPrice: 150,
    platforms: ['Leboncoin', 'Troc-Velo', 'Decathlon Occasion'],
  },
  games: {
    minPrice: 5,
    maxPrice: 60,
    platforms: ['Leboncoin', 'Okkazeo', 'CDiscount Occasion'],
  },
  instruments: {
    minPrice: 30,
    maxPrice: 300,
    platforms: ['Leboncoin', 'Audiofanzine', 'Reverb'],
  },
  collectibles: {
    minPrice: 10,
    maxPrice: 500,
    platforms: ['eBay', 'Catawiki', 'Delcampe'],
  },
};

/**
 * Side hustle ideas for students
 */
export const SIDE_HUSTLES: Array<{
  id: string;
  name: string;
  description: string;
  hourlyRate: { min: number; max: number };
  skills: string[];
  effort: 'low' | 'medium' | 'high';
  flexibility: number; // 0-1
  startupCost: number;
  coBenefit: string;
}> = [
  {
    id: 'reselling',
    name: 'Revente / Flipping',
    description: 'Acheter bas, vendre haut sur Vinted/Leboncoin',
    hourlyRate: { min: 10, max: 30 },
    skills: ['negociation', 'photo', 'patience'],
    effort: 'medium',
    flexibility: 0.9,
    startupCost: 50,
    coBenefit: 'Apprends le commerce',
  },
  {
    id: 'pet_sitting',
    name: 'Pet Sitting',
    description: "Garde d'animaux via Animaute/Rover",
    hourlyRate: { min: 8, max: 15 },
    skills: ['animaux', 'responsabilite'],
    effort: 'low',
    flexibility: 0.7,
    startupCost: 0,
    coBenefit: 'Compagnie + exercice',
  },
  {
    id: 'delivery',
    name: 'Livraison velo',
    description: 'Uber Eats, Deliveroo en velo',
    hourlyRate: { min: 10, max: 18 },
    skills: ['velo', 'orientation'],
    effort: 'high',
    flexibility: 0.95,
    startupCost: 0,
    coBenefit: 'Sport gratuit',
  },
  {
    id: 'transcription',
    name: 'Transcription audio',
    description: 'Transcrire des audios/videos',
    hourlyRate: { min: 12, max: 25 },
    skills: ['frappe_rapide', 'concentration'],
    effort: 'medium',
    flexibility: 1.0,
    startupCost: 0,
    coBenefit: 'Ameliore la frappe',
  },
  {
    id: 'mystery_shopping',
    name: 'Client mystere',
    description: 'Evaluer des magasins/restaurants',
    hourlyRate: { min: 10, max: 20 },
    skills: ['observation', 'redaction'],
    effort: 'low',
    flexibility: 0.6,
    startupCost: 0,
    coBenefit: 'Repas/produits gratuits',
  },
  {
    id: 'plasma_donation',
    name: 'Don de plasma',
    description: 'Don remunere dans certains pays (pas FR)',
    hourlyRate: { min: 20, max: 40 },
    skills: [],
    effort: 'low',
    flexibility: 0.5,
    startupCost: 0,
    coBenefit: 'Aide medicale',
  },
  {
    id: 'focus_groups',
    name: 'Groupes de discussion',
    description: 'Participer a des etudes marketing',
    hourlyRate: { min: 30, max: 80 },
    skills: ['communication'],
    effort: 'low',
    flexibility: 0.4,
    startupCost: 0,
    coBenefit: 'Decouvre des produits',
  },
  {
    id: 'moving_help',
    name: 'Aide demenagement',
    description: 'Via Youpijob, StarOfService',
    hourlyRate: { min: 12, max: 20 },
    skills: ['force_physique'],
    effort: 'high',
    flexibility: 0.7,
    startupCost: 0,
    coBenefit: 'Musculation gratuite',
  },
];

/**
 * Analyze an image to identify sellable objects
 * In production, this would call a vision LLM (GPT-4V, Claude Vision)
 */
async function analyzeImageForSale(
  imageData: string, // base64 or URL
  imageType: 'base64' | 'url'
): Promise<{
  objects: Array<{
    name: string;
    category: string;
    condition: 'neuf' | 'bon' | 'correct' | 'use';
    confidence: number;
  }>;
  analysisMethod: string;
}> {
  return trace('vision_object_identification', async (span) => {
    span.setAttributes({
      'vision.image_type': imageType,
      'vision.has_data': !!imageData,
    });

    // Mock implementation - in production, call vision LLM
    // For hackathon demo, we'll simulate based on common items

    // Simulate vision analysis
    const mockObjects = [
      {
        name: 'iPhone',
        category: 'electronics',
        condition: 'bon' as const,
        confidence: 0.85,
      },
    ];

    span.setAttributes({
      'vision.objects_found': mockObjects.length,
      'vision.method': 'mock_simulation',
    });

    return {
      objects: mockObjects,
      analysisMethod: 'mock_simulation', // Would be 'gpt-4-vision' or 'claude-3-vision' in production
    };
  });
}

/**
 * Estimate price for an item via web search simulation
 */
async function estimateItemPrice(
  itemName: string,
  category: string,
  condition: string
): Promise<{
  estimatedPrice: { min: number; max: number; average: number };
  platforms: Array<{ name: string; typicalPrice: number; url: string }>;
  priceFactors: string[];
}> {
  return trace('price_estimation', async (span) => {
    span.setAttributes({
      'price.item_name': itemName,
      'price.category': category,
      'price.condition': condition,
    });

    const categoryInfo = ITEM_CATEGORIES[category] || ITEM_CATEGORIES.electronics;

    // Adjust price based on condition
    const conditionMultiplier: Record<string, number> = {
      neuf: 1.0,
      bon: 0.7,
      correct: 0.5,
      use: 0.3,
    };
    const multiplier = conditionMultiplier[condition] || 0.5;

    const minPrice = Math.round(categoryInfo.minPrice * multiplier);
    const maxPrice = Math.round(categoryInfo.maxPrice * multiplier);
    const avgPrice = Math.round((minPrice + maxPrice) / 2);

    const platforms = categoryInfo.platforms.map((name) => ({
      name,
      typicalPrice: avgPrice + Math.round((Math.random() - 0.5) * avgPrice * 0.2),
      url: `https://${name.toLowerCase().replace(/\s/g, '')}.fr`,
    }));

    span.setAttributes({
      'price.estimated_min': minPrice,
      'price.estimated_max': maxPrice,
      'price.estimated_avg': avgPrice,
      'price.platforms_count': platforms.length,
    });

    return {
      estimatedPrice: { min: minPrice, max: maxPrice, average: avgPrice },
      platforms,
      priceFactors: [
        `Condition: ${condition}`,
        `Categorie: ${category}`,
        'Prix du marche actuel',
        'Demande saisonniere',
      ],
    };
  });
}

/**
 * Calculate budget impact of selling items
 */
function calculateBudgetImpact(
  itemsValue: number,
  currentMonthlyMargin: number,
  monthsRemaining: number
): {
  immediateImpact: number;
  equivalentMonthsOfMargin: number;
  projectionWithSale: number;
  projectionWithoutSale: number;
  recommendation: string;
} {
  const equivalentMonths =
    currentMonthlyMargin !== 0 ? itemsValue / Math.abs(currentMonthlyMargin) : Infinity;

  const projectionWithoutSale = currentMonthlyMargin * monthsRemaining;
  const projectionWithSale = projectionWithoutSale + itemsValue;

  let recommendation: string;
  if (currentMonthlyMargin < 0) {
    recommendation = `Vendre ces objets couvrirait ${Math.round(equivalentMonths)} mois de deficit!`;
  } else if (itemsValue > currentMonthlyMargin * 3) {
    recommendation = `C'est l'equivalent de ${Math.round(equivalentMonths)} mois d'epargne - ca vaut le coup!`;
  } else {
    recommendation = `Un petit boost de ${itemsValue}€ pour ton budget.`;
  }

  return {
    immediateImpact: itemsValue,
    equivalentMonthsOfMargin: Math.round(equivalentMonths * 10) / 10,
    projectionWithSale,
    projectionWithoutSale,
    recommendation,
  };
}

/**
 * Suggest side hustles based on profile
 */
function suggestSideHustles(
  skills: string[],
  maxHoursWeekly: number,
  preferLowEffort: boolean
): Array<{
  hustle: (typeof SIDE_HUSTLES)[0];
  matchScore: number;
  estimatedMonthlyEarnings: { min: number; max: number };
  whyGoodFit: string[];
}> {
  const skillsLower = skills.map((s) => s.toLowerCase());

  return SIDE_HUSTLES.map((hustle) => {
    // Calculate match score
    let score = 0.5; // Base score

    // Skill match
    const matchingSkills = hustle.skills.filter((s) =>
      skillsLower.some((us) => us.includes(s) || s.includes(us))
    );
    score += matchingSkills.length * 0.15;

    // Effort preference
    if (preferLowEffort && hustle.effort === 'low') score += 0.2;
    if (!preferLowEffort && hustle.effort === 'high') score += 0.1;

    // Flexibility bonus
    score += hustle.flexibility * 0.2;

    // Zero startup cost bonus for students
    if (hustle.startupCost === 0) score += 0.1;

    score = Math.min(1, score);

    // Calculate earnings
    const hoursPerMonth = maxHoursWeekly * 4;
    const minEarnings = Math.round(hustle.hourlyRate.min * hoursPerMonth);
    const maxEarnings = Math.round(hustle.hourlyRate.max * hoursPerMonth);

    // Why it's a good fit
    const whyGoodFit: string[] = [];
    if (matchingSkills.length > 0) {
      whyGoodFit.push(`Utilise tes competences: ${matchingSkills.join(', ')}`);
    }
    if (hustle.flexibility > 0.8) {
      whyGoodFit.push('Tres flexible, compatible avec les cours');
    }
    if (hustle.startupCost === 0) {
      whyGoodFit.push('Aucun investissement initial');
    }
    if (hustle.coBenefit) {
      whyGoodFit.push(`Bonus: ${hustle.coBenefit}`);
    }

    return {
      hustle,
      matchScore: Math.round(score * 100) / 100,
      estimatedMonthlyEarnings: { min: minEarnings, max: maxEarnings },
      whyGoodFit,
    };
  })
    .filter((h) => h.matchScore > 0.4)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

// === Tool Definitions ===

/**
 * Analyze image for sellable objects tool
 */
export const analyzeImageTool = createTool({
  id: 'analyze_sellable_objects',
  description: 'Analyse une photo pour identifier des objets a vendre (vision IA)',
  inputSchema: z.object({
    imageData: z.string().describe('Image en base64 ou URL'),
    imageType: z.enum(['base64', 'url']).describe('Type de donnee image'),
  }),
  execute: async ({ context }) => {
    return analyzeImageForSale(context.imageData, context.imageType);
  },
});

/**
 * Estimate price tool
 */
export const estimatePriceTool = createTool({
  id: 'estimate_item_price',
  description: "Estime le prix de vente d'un objet via recherche web",
  inputSchema: z.object({
    itemName: z.string().describe("Nom de l'objet"),
    category: z
      .enum([
        'electronics',
        'clothing',
        'books',
        'furniture',
        'sports',
        'games',
        'instruments',
        'collectibles',
      ])
      .describe('Categorie'),
    condition: z.enum(['neuf', 'bon', 'correct', 'use']).describe("Etat de l'objet"),
  }),
  execute: async ({ context }) => {
    return estimateItemPrice(context.itemName, context.category, context.condition);
  },
});

/**
 * Calculate budget impact tool
 */
export const budgetImpactTool = createTool({
  id: 'calculate_sale_impact',
  description: "Calcule l'impact de la vente sur le budget etudiant",
  inputSchema: z.object({
    itemsValue: z.number().describe('Valeur totale des objets a vendre (€)'),
    currentMonthlyMargin: z.number().describe('Marge mensuelle actuelle (€)'),
    monthsRemaining: z.number().describe("Mois d'etudes restants"),
  }),
  execute: async ({ context }) => {
    return calculateBudgetImpact(
      context.itemsValue,
      context.currentMonthlyMargin,
      context.monthsRemaining
    );
  },
});

/**
 * Suggest side hustles tool
 */
export const suggestHustlesTool = createTool({
  id: 'suggest_side_hustles',
  description: 'Suggere des sources de revenus complementaires adaptees au profil',
  inputSchema: z.object({
    skills: z.array(z.string()).describe("Competences de l'etudiant"),
    maxHoursWeekly: z.number().describe('Heures max par semaine'),
    preferLowEffort: z.boolean().default(false).describe('Prefere les options peu fatigantes'),
  }),
  execute: async ({ context }) => {
    return suggestSideHustles(context.skills, context.maxHoursWeekly, context.preferLowEffort);
  },
});

/**
 * Full money maker analysis tool
 */
export const moneyMakerAnalysisTool = createTool({
  id: 'money_maker_analysis',
  description: 'Analyse complete: objets a vendre + side hustles + impact budget',
  inputSchema: z.object({
    // Optional image analysis
    image: z
      .object({
        data: z.string(),
        type: z.enum(['base64', 'url']),
      })
      .optional()
      .describe("Image d'objets a vendre (optionnel)"),
    // Manual items list
    items: z
      .array(
        z.object({
          name: z.string(),
          category: z.enum([
            'electronics',
            'clothing',
            'books',
            'furniture',
            'sports',
            'games',
            'instruments',
            'collectibles',
          ]),
          condition: z.enum(['neuf', 'bon', 'correct', 'use']),
        })
      )
      .optional()
      .describe("Liste manuelle d'objets"),
    // Profile for side hustles
    profile: z.object({
      skills: z.array(z.string()),
      maxHoursWeekly: z.number(),
      currentMonthlyMargin: z.number(),
      monthsRemaining: z.number(),
      preferLowEffort: z.boolean().default(false),
    }),
  }),
  execute: async ({ context }) => {
    return trace('money_maker_full_analysis', async (span) => {
      const results: {
        itemsAnalysis?: {
          items: Array<{
            name: string;
            category: string;
            condition: string;
            estimatedPrice: { min: number; max: number; average: number };
            bestPlatform: string;
          }>;
          totalEstimatedValue: { min: number; max: number; average: number };
        };
        budgetImpact?: ReturnType<typeof calculateBudgetImpact>;
        sideHustles: ReturnType<typeof suggestSideHustles>;
        summary: string;
      } = {
        sideHustles: [],
        summary: '',
      };

      // Analyze items (from image or manual list)
      let itemsToAnalyze: Array<{ name: string; category: string; condition: string }> = [];

      if (context.image) {
        const imageAnalysis = await analyzeImageForSale(context.image.data, context.image.type);
        itemsToAnalyze = imageAnalysis.objects.map((o) => ({
          name: o.name,
          category: o.category,
          condition: o.condition,
        }));
      }

      if (context.items) {
        itemsToAnalyze = [...itemsToAnalyze, ...context.items];
      }

      if (itemsToAnalyze.length > 0) {
        const itemsWithPrices = await Promise.all(
          itemsToAnalyze.map(async (item) => {
            const priceInfo = await estimateItemPrice(item.name, item.category, item.condition);
            return {
              name: item.name,
              category: item.category,
              condition: item.condition,
              estimatedPrice: priceInfo.estimatedPrice,
              bestPlatform: priceInfo.platforms[0]?.name || 'Leboncoin',
            };
          })
        );

        const totalMin = itemsWithPrices.reduce((sum, i) => sum + i.estimatedPrice.min, 0);
        const totalMax = itemsWithPrices.reduce((sum, i) => sum + i.estimatedPrice.max, 0);
        const totalAvg = itemsWithPrices.reduce((sum, i) => sum + i.estimatedPrice.average, 0);

        results.itemsAnalysis = {
          items: itemsWithPrices,
          totalEstimatedValue: { min: totalMin, max: totalMax, average: totalAvg },
        };

        // Calculate budget impact
        results.budgetImpact = calculateBudgetImpact(
          totalAvg,
          context.profile.currentMonthlyMargin,
          context.profile.monthsRemaining
        );

        span.setAttributes({
          'items.count': itemsToAnalyze.length,
          'items.total_value': totalAvg,
        });
      }

      // Suggest side hustles
      results.sideHustles = suggestSideHustles(
        context.profile.skills,
        context.profile.maxHoursWeekly,
        context.profile.preferLowEffort
      );

      span.setAttributes({
        'hustles.suggested': results.sideHustles.length,
      });

      // Generate summary
      const parts: string[] = [];

      if (results.itemsAnalysis) {
        parts.push(
          `**Objets a vendre**: ${results.itemsAnalysis.items.length} objets, valeur estimee ~${results.itemsAnalysis.totalEstimatedValue.average}€`
        );
        if (results.budgetImpact) {
          parts.push(`**Impact**: ${results.budgetImpact.recommendation}`);
        }
      }

      if (results.sideHustles.length > 0) {
        const topHustle = results.sideHustles[0];
        parts.push(
          `**Top side hustle**: ${topHustle.hustle.name} (${topHustle.estimatedMonthlyEarnings.min}-${topHustle.estimatedMonthlyEarnings.max}€/mois)`
        );
      }

      results.summary = parts.join('\n');

      return results;
    });
  },
});

// Register tools
registerTool('analyze_sellable_objects', analyzeImageTool);
registerTool('estimate_item_price', estimatePriceTool);
registerTool('calculate_sale_impact', budgetImpactTool);
registerTool('suggest_side_hustles', suggestHustlesTool);
registerTool('money_maker_analysis', moneyMakerAnalysisTool);

/**
 * Create Money Maker agent instance
 */
export async function createMoneyMakerAgent(): Promise<Agent> {
  // Add config to factory if not exists
  const config = {
    id: 'money-maker',
    name: 'Money Maker',
    description: "Trouve des facons creatives de gagner de l'argent",
    instructions: `Tu es un expert en side hustles et vente d'occasion pour etudiants.

ROLE:
- Identifier des objets a vendre (via photos)
- Estimer les prix du marche
- Suggerer des side hustles adaptes au profil
- Calculer l'impact sur le budget

METHODE:
1. Si photo fournie: identifier les objets vendables
2. Estimer les prix sur Leboncoin/Vinted/etc.
3. Proposer des side hustles non explores
4. Toujours montrer l'impact budget

TON:
- Enthousiaste mais realiste
- Focus sur les options zero investissement
- Mentionner les co-benefices (CV, experience, reseau)`,
    toolNames: [
      'analyze_sellable_objects',
      'estimate_item_price',
      'calculate_sale_impact',
      'suggest_side_hustles',
      'money_maker_analysis',
    ],
  };

  return createStrideAgent(config);
}

export default {
  analyzeImageTool,
  estimatePriceTool,
  budgetImpactTool,
  suggestHustlesTool,
  moneyMakerAnalysisTool,
  createMoneyMakerAgent,
  ITEM_CATEGORIES,
  SIDE_HUSTLES,
};
