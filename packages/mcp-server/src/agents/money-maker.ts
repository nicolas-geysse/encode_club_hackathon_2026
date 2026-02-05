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
import { registerTool, createStrideAgent } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';

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
    platforms: ['eBay', 'Back Market', 'Facebook Marketplace'],
  },
  clothing: {
    minPrice: 5,
    maxPrice: 100,
    platforms: ['Poshmark', 'ThredUp', 'Depop'],
  },
  books: {
    minPrice: 2,
    maxPrice: 30,
    platforms: ['Amazon', 'eBay', 'ThriftBooks'],
  },
  furniture: {
    minPrice: 10,
    maxPrice: 200,
    platforms: ['Craigslist', 'Facebook Marketplace', 'OfferUp'],
  },
  sports: {
    minPrice: 10,
    maxPrice: 150,
    platforms: ['eBay', 'SidelineSwap', 'Facebook Marketplace'],
  },
  games: {
    minPrice: 5,
    maxPrice: 60,
    platforms: ['eBay', 'GameStop', 'Facebook Marketplace'],
  },
  instruments: {
    minPrice: 30,
    maxPrice: 300,
    platforms: ['Reverb', 'Guitar Center Used', 'eBay'],
  },
  collectibles: {
    minPrice: 10,
    maxPrice: 500,
    platforms: ['eBay', 'Etsy', 'Mercari'],
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
    name: 'Reselling / Flipping',
    description: 'Buy low, sell high on eBay/Poshmark',
    hourlyRate: { min: 10, max: 30 },
    skills: ['negotiation', 'photography', 'patience'],
    effort: 'medium',
    flexibility: 0.9,
    startupCost: 50,
    coBenefit: 'Learn business skills',
  },
  {
    id: 'pet_sitting',
    name: 'Pet Sitting',
    description: 'Pet care via Rover/Wag',
    hourlyRate: { min: 8, max: 15 },
    skills: ['animals', 'responsibility'],
    effort: 'low',
    flexibility: 0.7,
    startupCost: 0,
    coBenefit: 'Companionship + exercise',
  },
  {
    id: 'delivery',
    name: 'Bike Delivery',
    description: 'DoorDash, Uber Eats by bike',
    hourlyRate: { min: 10, max: 18 },
    skills: ['cycling', 'navigation'],
    effort: 'high',
    flexibility: 0.95,
    startupCost: 0,
    coBenefit: 'Free workout',
  },
  {
    id: 'transcription',
    name: 'Audio Transcription',
    description: 'Transcribe audio/video files',
    hourlyRate: { min: 12, max: 25 },
    skills: ['fast_typing', 'concentration'],
    effort: 'medium',
    flexibility: 1.0,
    startupCost: 0,
    coBenefit: 'Improves typing speed',
  },
  {
    id: 'mystery_shopping',
    name: 'Mystery Shopping',
    description: 'Evaluate stores/restaurants',
    hourlyRate: { min: 10, max: 20 },
    skills: ['observation', 'writing'],
    effort: 'low',
    flexibility: 0.6,
    startupCost: 0,
    coBenefit: 'Free meals/products',
  },
  {
    id: 'plasma_donation',
    name: 'Plasma Donation',
    description: 'Paid plasma donation',
    hourlyRate: { min: 20, max: 40 },
    skills: [],
    effort: 'low',
    flexibility: 0.5,
    startupCost: 0,
    coBenefit: 'Help medical research',
  },
  {
    id: 'focus_groups',
    name: 'Focus Groups',
    description: 'Participate in marketing studies',
    hourlyRate: { min: 30, max: 80 },
    skills: ['communication'],
    effort: 'low',
    flexibility: 0.4,
    startupCost: 0,
    coBenefit: 'Discover new products',
  },
  {
    id: 'moving_help',
    name: 'Moving Help',
    description: 'Via TaskRabbit, Dolly',
    hourlyRate: { min: 12, max: 20 },
    skills: ['physical_strength'],
    effort: 'high',
    flexibility: 0.7,
    startupCost: 0,
    coBenefit: 'Free workout',
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
    condition: 'new' | 'good' | 'fair' | 'used';
    confidence: number;
  }>;
  analysisMethod: string;
}> {
  return trace('vision_object_identification', async (ctx) => {
    setPromptAttributes(ctx, 'money-maker');
    ctx.setAttributes({
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
        condition: 'good' as const,
        confidence: 0.85,
      },
    ];

    ctx.setAttributes({
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
  return trace('price_estimation', async (ctx) => {
    setPromptAttributes(ctx, 'money-maker');
    ctx.setAttributes({
      'price.item_name': itemName,
      'price.category': category,
      'price.condition': condition,
    });

    const categoryInfo = ITEM_CATEGORIES[category] || ITEM_CATEGORIES.electronics;

    // Adjust price based on condition
    const conditionMultiplier: Record<string, number> = {
      new: 1.0,
      good: 0.7,
      fair: 0.5,
      used: 0.3,
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

    ctx.setAttributes({
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
        `Category: ${category}`,
        'Current market price',
        'Seasonal demand',
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
    recommendation = `Selling these items would cover ${Math.round(equivalentMonths)} months of deficit!`;
  } else if (itemsValue > currentMonthlyMargin * 3) {
    recommendation = `That's equivalent to ${Math.round(equivalentMonths)} months of savings - worth it!`;
  } else {
    recommendation = `A nice $${itemsValue} boost for your budget.`;
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
      whyGoodFit.push(`Uses your skills: ${matchingSkills.join(', ')}`);
    }
    if (hustle.flexibility > 0.8) {
      whyGoodFit.push('Very flexible, compatible with classes');
    }
    if (hustle.startupCost === 0) {
      whyGoodFit.push('No upfront investment');
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
  description: 'Analyze a photo to identify sellable objects (AI vision)',
  inputSchema: z.object({
    imageData: z.string().describe('Image as base64 or URL'),
    imageType: z.enum(['base64', 'url']).describe('Image data type'),
  }),
  execute: async (input) => {
    return analyzeImageForSale(input.imageData, input.imageType);
  },
});

/**
 * Estimate price tool
 */
export const estimatePriceTool = createTool({
  id: 'estimate_item_price',
  description: 'Estimate the selling price of an item via web search',
  inputSchema: z.object({
    itemName: z.string().describe('Item name'),
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
      .describe('Category'),
    condition: z.enum(['new', 'good', 'fair', 'used']).describe('Item condition'),
  }),
  execute: async (input) => {
    return estimateItemPrice(input.itemName, input.category, input.condition);
  },
});

/**
 * Calculate budget impact tool
 */
export const budgetImpactTool = createTool({
  id: 'calculate_sale_impact',
  description: 'Calculate the impact of selling on student budget',
  inputSchema: z.object({
    itemsValue: z.number().describe('Total value of items to sell ($)'),
    currentMonthlyMargin: z.number().describe('Current monthly margin ($)'),
    monthsRemaining: z.number().describe('Months of study remaining'),
  }),
  execute: async (input) => {
    return trace('tool.calculate_sale_impact', async (ctx) => {
      setPromptAttributes(ctx, 'money-maker');
      ctx.setAttributes({
        'input.items_value': input.itemsValue,
        'input.current_monthly_margin': input.currentMonthlyMargin,
        'input.months_remaining': input.monthsRemaining,
      });

      const result = calculateBudgetImpact(
        input.itemsValue,
        input.currentMonthlyMargin,
        input.monthsRemaining
      );

      ctx.setAttributes({
        'output.immediate_impact': result.immediateImpact,
        'output.equivalent_months': result.equivalentMonthsOfMargin,
        'output.projection_with_sale': result.projectionWithSale,
      });

      return result;
    });
  },
});

/**
 * Suggest side hustles tool
 */
export const suggestHustlesTool = createTool({
  id: 'suggest_side_hustles',
  description: 'Suggest additional income sources suited to the profile',
  inputSchema: z.object({
    skills: z.array(z.string()).describe("Student's skills"),
    maxHoursWeekly: z.number().describe('Max hours per week'),
    preferLowEffort: z.boolean().default(false).describe('Prefer low-effort options'),
  }),
  execute: async (input) => {
    return trace('tool.suggest_side_hustles', async (ctx) => {
      setPromptAttributes(ctx, 'money-maker');
      ctx.setAttributes({
        'input.skills_count': input.skills.length,
        'input.max_hours_weekly': input.maxHoursWeekly,
        'input.prefer_low_effort': input.preferLowEffort,
      });

      const result = suggestSideHustles(
        input.skills,
        input.maxHoursWeekly,
        input.preferLowEffort ?? false
      );

      ctx.setAttributes({
        'output.hustles_count': result.length,
        'output.top_hustle': result[0]?.hustle.name ?? null,
        'output.top_match_score': result[0]?.matchScore ?? 0,
      });

      return result;
    });
  },
});

/**
 * Full money maker analysis tool
 */
export const moneyMakerAnalysisTool = createTool({
  id: 'money_maker_analysis',
  description: 'Complete analysis: items to sell + side hustles + budget impact',
  inputSchema: z.object({
    // Optional image analysis
    image: z
      .object({
        data: z.string(),
        type: z.enum(['base64', 'url']),
      })
      .optional()
      .describe('Image of items to sell (optional)'),
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
          condition: z.enum(['new', 'good', 'fair', 'used']),
        })
      )
      .optional()
      .describe('Manual list of items'),
    // Profile for side hustles
    profile: z.object({
      skills: z.array(z.string()),
      maxHoursWeekly: z.number(),
      currentMonthlyMargin: z.number(),
      monthsRemaining: z.number(),
      preferLowEffort: z.boolean().default(false),
    }),
  }),
  execute: async (input) => {
    return trace('money_maker_full_analysis', async (ctx) => {
      setPromptAttributes(ctx, 'money-maker');
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

      if (input.image) {
        const imageAnalysis = await analyzeImageForSale(input.image.data, input.image.type);
        itemsToAnalyze = imageAnalysis.objects.map((o) => ({
          name: o.name,
          category: o.category,
          condition: o.condition,
        }));
      }

      if (input.items) {
        itemsToAnalyze = [...itemsToAnalyze, ...input.items];
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
          input.profile.currentMonthlyMargin,
          input.profile.monthsRemaining
        );

        ctx.setAttributes({
          'items.count': itemsToAnalyze.length,
          'items.total_value': totalAvg,
        });
      }

      // Suggest side hustles
      results.sideHustles = suggestSideHustles(
        input.profile.skills,
        input.profile.maxHoursWeekly,
        input.profile.preferLowEffort ?? false
      );

      ctx.setAttributes({
        'hustles.suggested': results.sideHustles.length,
      });

      // Generate summary
      const parts: string[] = [];

      if (results.itemsAnalysis) {
        parts.push(
          `**Items to sell**: ${results.itemsAnalysis.items.length} items, estimated value ~$${results.itemsAnalysis.totalEstimatedValue.average}`
        );
        if (results.budgetImpact) {
          parts.push(`**Impact**: ${results.budgetImpact.recommendation}`);
        }
      }

      if (results.sideHustles.length > 0) {
        const topHustle = results.sideHustles[0];
        parts.push(
          `**Top side hustle**: ${topHustle.hustle.name} ($${topHustle.estimatedMonthlyEarnings.min}-${topHustle.estimatedMonthlyEarnings.max}/month)`
        );
      }

      results.summary = parts.join('\n');

      return results;
    });
  },
});

// ============================================================
// H.2: SELLING PLATFORM DATABASE AND TOOLS
// ============================================================

/**
 * Platform information for selling items
 */
interface PlatformInfo {
  name: string;
  fees: string;
  speed: 'fast' | 'medium' | 'slow';
  bestFor: string;
  url: string;
  tips: string[];
}

/**
 * Selling platforms organized by item category (French market focus)
 */
export const SELLING_PLATFORMS: Record<string, PlatformInfo[]> = {
  electronics: [
    {
      name: 'Back Market',
      fees: '10-15%',
      speed: 'fast',
      bestFor: 'Smartphones, laptops, tablets',
      url: 'https://www.backmarket.fr',
      tips: ['Reconditionnement pro', 'Prix fixe garanti', 'Paiement rapide'],
    },
    {
      name: 'Leboncoin',
      fees: '0-8%',
      speed: 'medium',
      bestFor: 'Tout électronique',
      url: 'https://www.leboncoin.fr',
      tips: ['Photos de qualité', 'Description détaillée', 'Négociation possible'],
    },
    {
      name: 'Facebook Marketplace',
      fees: '0%',
      speed: 'fast',
      bestFor: 'Vente locale rapide',
      url: 'https://www.facebook.com/marketplace',
      tips: ['Remise en main propre', 'Pas de frais', 'Large audience'],
    },
    {
      name: 'eBay',
      fees: '10-13%',
      speed: 'medium',
      bestFor: 'Pièces rares, collectibles tech',
      url: 'https://www.ebay.fr',
      tips: ['Enchères pour objets rares', 'Expédition internationale'],
    },
  ],
  clothing: [
    {
      name: 'Vinted',
      fees: '0% vendeur',
      speed: 'medium',
      bestFor: 'Mode, chaussures, accessoires',
      url: 'https://www.vinted.fr',
      tips: ['Photos portées = +30% vues', 'Boost les weekends', 'Répondre vite aux messages'],
    },
    {
      name: 'Vestiaire Collective',
      fees: '15-25%',
      speed: 'slow',
      bestFor: 'Luxe et marques premium',
      url: 'https://www.vestiairecollective.com',
      tips: ['Authentification garantie', 'Prix plus élevés', 'Clientèle internationale'],
    },
    {
      name: 'Depop',
      fees: '10%',
      speed: 'medium',
      bestFor: 'Vintage, streetwear, Y2K',
      url: 'https://www.depop.com',
      tips: ['Style photos Instagram', 'Hashtags tendance', 'Communauté jeune'],
    },
  ],
  furniture: [
    {
      name: 'Facebook Marketplace',
      fees: '0%',
      speed: 'fast',
      bestFor: 'Meubles volumineux',
      url: 'https://www.facebook.com/marketplace',
      tips: ['Vente locale obligatoire', 'Photos en situation', 'Dimensions précises'],
    },
    {
      name: 'Leboncoin',
      fees: '0-8%',
      speed: 'medium',
      bestFor: 'Tout ameublement',
      url: 'https://www.leboncoin.fr',
      tips: ['Livraison Mondial Relay possible', 'Négociation attendue'],
    },
    {
      name: 'Selency',
      fees: '20%',
      speed: 'slow',
      bestFor: 'Vintage, design, mid-century',
      url: 'https://www.selency.com',
      tips: ['Curé par des experts', 'Prix premium', 'Photos pro recommandées'],
    },
  ],
  books: [
    {
      name: 'Momox',
      fees: 'Prix fixe',
      speed: 'fast',
      bestFor: 'Lot de livres, vidage rapide',
      url: 'https://www.momox.fr',
      tips: ['Scan ISBN rapide', 'Envoi gratuit', 'Paiement immédiat'],
    },
    {
      name: 'RecycLivre',
      fees: '0%',
      speed: 'fast',
      bestFor: 'Don avec réduction impôts',
      url: 'https://www.recyclivre.com',
      tips: ['Attestation fiscale', 'Impact écologique', 'Enlèvement gratuit'],
    },
    {
      name: 'Leboncoin',
      fees: '0%',
      speed: 'slow',
      bestFor: 'Livres rares, manuels scolaires',
      url: 'https://www.leboncoin.fr',
      tips: ['Photos de la couverture', 'État précis', 'Lot possible'],
    },
  ],
  games: [
    {
      name: 'Leboncoin',
      fees: '0-8%',
      speed: 'medium',
      bestFor: 'Jeux vidéo, consoles',
      url: 'https://www.leboncoin.fr',
      tips: ['Photo de la boîte', 'Mention de létat des CD'],
    },
    {
      name: 'Micromania',
      fees: 'Reprise magasin',
      speed: 'fast',
      bestFor: 'Reprise immédiate en magasin',
      url: 'https://www.micromania.fr',
      tips: ['Estimation en ligne', 'Crédit ou espèces', 'Pas de négociation'],
    },
    {
      name: 'eBay',
      fees: '10-13%',
      speed: 'medium',
      bestFor: 'Jeux collectors, rétro',
      url: 'https://www.ebay.fr',
      tips: ['Enchères pour jeux rares', 'Marché international'],
    },
  ],
  sports: [
    {
      name: 'Leboncoin',
      fees: '0-8%',
      speed: 'medium',
      bestFor: 'Équipement sport général',
      url: 'https://www.leboncoin.fr',
      tips: ['Taille et marque en titre', 'Photos de lusure'],
    },
    {
      name: 'Troc Vélo',
      fees: '8%',
      speed: 'medium',
      bestFor: 'Vélos et accessoires cyclisme',
      url: 'https://www.troc-velo.com',
      tips: ['Spécialisé vélo', 'Communauté active', 'Estimation automatique'],
    },
    {
      name: 'Decathlon Seconde Vie',
      fees: 'Reprise magasin',
      speed: 'fast',
      bestFor: 'Matériel Decathlon',
      url: 'https://www.decathlon.fr/services/seconde-vie',
      tips: ['Reprise en magasin', 'Bon achat en échange'],
    },
  ],
};

/**
 * Base selling times by category (in days)
 */
const BASE_SELLING_DAYS: Record<string, number> = {
  electronics: 7,
  clothing: 14,
  furniture: 21,
  books: 10,
  games: 10,
  sports: 14,
  instruments: 21,
  collectibles: 30,
};

/**
 * Suggest best selling platform for an item
 */
export const suggestSellingPlatformTool = createTool({
  id: 'suggest_selling_platform',
  description: 'Recommend the best platform to sell an item based on category and urgency',
  inputSchema: z.object({
    itemName: z.string().describe('Name of the item'),
    category: z.enum([
      'electronics',
      'clothing',
      'furniture',
      'books',
      'games',
      'sports',
      'instruments',
      'collectibles',
    ]),
    estimatedValue: z.number().describe('Estimated value in euros'),
    condition: z.enum(['new', 'like_new', 'good', 'fair']),
    urgency: z.enum(['asap', 'normal', 'flexible']).describe('How quickly you need to sell'),
  }),
  execute: async (input) => {
    return trace('tool.suggest_selling_platform', async (ctx) => {
      setPromptAttributes(ctx, 'money-maker');
      ctx.setAttributes({
        'input.item_name': input.itemName,
        'input.category': input.category,
        'input.estimated_value': input.estimatedValue,
        'input.urgency': input.urgency,
      });

      const platforms = SELLING_PLATFORMS[input.category] || SELLING_PLATFORMS.electronics;

      // Sort by speed if urgent
      const sortedPlatforms = [...platforms];
      if (input.urgency === 'asap') {
        sortedPlatforms.sort((a, b) => {
          const speedOrder = { fast: 0, medium: 1, slow: 2 };
          return speedOrder[a.speed] - speedOrder[b.speed];
        });
      } else if (input.urgency === 'flexible') {
        // Prefer platforms with higher fees but better prices (luxury platforms)
        sortedPlatforms.sort((a, b) => {
          const luxuryScore = (p: PlatformInfo) =>
            p.bestFor.toLowerCase().includes('luxe') || p.bestFor.toLowerCase().includes('premium')
              ? 1
              : 0;
          return luxuryScore(b) - luxuryScore(a);
        });
      }

      const primary = sortedPlatforms[0];
      const alternatives = sortedPlatforms.slice(1, 3);

      ctx.setAttributes({
        'output.primary_platform': primary.name,
        'output.alternatives_count': alternatives.length,
      });

      return {
        primaryPlatform: {
          ...primary,
          estimatedDaysToSell: BASE_SELLING_DAYS[input.category] || 14,
        },
        alternatives: alternatives.map((p) => ({
          name: p.name,
          bestFor: p.bestFor,
          fees: p.fees,
        })),
        tips: [
          'Prends 5+ photos sous différents angles',
          'Prix 10% en-dessous du marché pour vente rapide',
          'Publie le weekend (2x plus de vues)',
          ...primary.tips.slice(0, 2),
        ],
      };
    });
  },
});

/**
 * Estimate days to sell an item
 */
export const estimateDaysToSellTool = createTool({
  id: 'estimate_days_to_sell',
  description: 'Estimate how many days it will take to sell an item',
  inputSchema: z.object({
    category: z.enum([
      'electronics',
      'clothing',
      'furniture',
      'books',
      'games',
      'sports',
      'instruments',
      'collectibles',
    ]),
    pricePoint: z.enum(['low', 'medium', 'high']).describe('Price relative to market average'),
    condition: z.enum(['new', 'like_new', 'good', 'fair']),
    platform: z.string().describe('Platform name'),
    seasonality: z.boolean().optional().describe('Consider seasonal factors'),
  }),
  execute: async (input) => {
    return trace('tool.estimate_days_to_sell', async (ctx) => {
      setPromptAttributes(ctx, 'money-maker');

      const baseDays = BASE_SELLING_DAYS[input.category] || 14;

      // Price point modifier
      const priceModifier = {
        low: 0.5, // 50% faster if priced low
        medium: 1.0,
        high: 1.5, // 50% slower if priced high
      }[input.pricePoint];

      // Condition modifier
      const conditionModifier = {
        new: 0.8,
        like_new: 0.9,
        good: 1.0,
        fair: 1.3,
      }[input.condition];

      // Platform speed
      const allPlatforms = Object.values(SELLING_PLATFORMS).flat();
      const platform = allPlatforms.find(
        (p) => p.name.toLowerCase() === input.platform.toLowerCase()
      );
      const platformModifier = platform
        ? { fast: 0.7, medium: 1.0, slow: 1.4 }[platform.speed]
        : 1.0;

      // Seasonality (simplified)
      let seasonalModifier = 1.0;
      if (input.seasonality) {
        const month = new Date().getMonth();
        // Electronics sell faster before holidays (Nov-Dec)
        if (input.category === 'electronics' && (month === 10 || month === 11)) {
          seasonalModifier = 0.7;
        }
        // Clothing depends on season
        if (input.category === 'clothing' && month >= 2 && month <= 4) {
          seasonalModifier = 0.8; // Spring cleaning
        }
      }

      const estimatedDays = Math.round(
        baseDays * priceModifier * conditionModifier * platformModifier * seasonalModifier
      );
      const minDays = Math.max(1, Math.round(estimatedDays * 0.5));
      const maxDays = Math.round(estimatedDays * 1.5);

      const factors: string[] = [];
      if (priceModifier < 1) factors.push('Prix attractif');
      if (priceModifier > 1) factors.push('Prix premium');
      if (conditionModifier < 1) factors.push('Excellent état');
      if (conditionModifier > 1) factors.push('État moyen');
      if (platformModifier < 1) factors.push('Plateforme rapide');
      if (seasonalModifier < 1) factors.push('Haute saison');

      ctx.setAttributes({
        'input.category': input.category,
        'input.price_point': input.pricePoint,
        'output.estimated_days': estimatedDays,
        'output.factors_count': factors.length,
      });

      return {
        estimatedDays: {
          min: minDays,
          max: maxDays,
          average: estimatedDays,
        },
        confidence: factors.length > 2 ? 0.8 : 0.6,
        factors,
        tip:
          priceModifier > 1
            ? 'Baisse le prix de 10% pour accélérer la vente'
            : 'Prix bien positionné, la vente devrait être rapide',
      };
    });
  },
});

// Register tools
registerTool('analyze_sellable_objects', analyzeImageTool);
registerTool('estimate_item_price', estimatePriceTool);
registerTool('calculate_sale_impact', budgetImpactTool);
registerTool('suggest_side_hustles', suggestHustlesTool);
registerTool('money_maker_analysis', moneyMakerAnalysisTool);
registerTool('suggest_selling_platform', suggestSellingPlatformTool);
registerTool('estimate_days_to_sell', estimateDaysToSellTool);

/**
 * Create Money Maker agent instance
 */
export async function createMoneyMakerAgent(): Promise<Agent> {
  // Add config to factory if not exists
  const config = {
    id: 'money-maker',
    name: 'Money Maker',
    description: 'Find creative ways to make money',
    instructions: `You are an expert in side hustles and reselling for students.

ROLE:
- Identify objects to sell (via photos)
- Estimate market prices
- Suggest side hustles adapted to the profile
- Calculate the budget impact

METHOD:
1. If photo provided: identify sellable objects
2. Estimate prices on eBay/Poshmark/etc.
3. Propose unexplored side hustles
4. Always show budget impact

TONE:
- Enthusiastic but realistic
- Focus on zero investment options
- Mention co-benefits (resume, experience, network)`,
    toolNames: [
      'analyze_sellable_objects',
      'estimate_item_price',
      'calculate_sale_impact',
      'suggest_side_hustles',
      'money_maker_analysis',
      'suggest_selling_platform',
      'estimate_days_to_sell',
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
  suggestSellingPlatformTool,
  estimateDaysToSellTool,
  createMoneyMakerAgent,
  ITEM_CATEGORIES,
  SIDE_HUSTLES,
  SELLING_PLATFORMS,
};
