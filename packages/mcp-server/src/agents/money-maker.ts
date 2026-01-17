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
        condition: 'good' as const,
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
  execute: async ({ context }) => {
    return analyzeImageForSale(context.imageData, context.imageType);
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
  execute: async ({ context }) => {
    return estimateItemPrice(context.itemName, context.category, context.condition);
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
  execute: async ({ context }) => {
    return trace('tool.calculate_sale_impact', async (span) => {
      span.setAttributes({
        'input.items_value': context.itemsValue,
        'input.current_monthly_margin': context.currentMonthlyMargin,
        'input.months_remaining': context.monthsRemaining,
      });

      const result = calculateBudgetImpact(
        context.itemsValue,
        context.currentMonthlyMargin,
        context.monthsRemaining
      );

      span.setAttributes({
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
  execute: async ({ context }) => {
    return trace('tool.suggest_side_hustles', async (span) => {
      span.setAttributes({
        'input.skills_count': context.skills.length,
        'input.max_hours_weekly': context.maxHoursWeekly,
        'input.prefer_low_effort': context.preferLowEffort,
      });

      const result = suggestSideHustles(
        context.skills,
        context.maxHoursWeekly,
        context.preferLowEffort
      );

      span.setAttributes({
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
