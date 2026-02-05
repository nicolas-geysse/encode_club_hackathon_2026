/**
 * Asset-to-Income Pivot Agent
 *
 * Detects productive assets being sold and suggests monetization:
 * - Identifies items that can generate recurring income
 * - Calculates break-even: sell once vs rent/earn monthly
 * - Suggests platforms for rental or service monetization
 *
 * Mantra: "Don't sell the goose that lays golden eggs."
 *
 * Part of Checkpoint H.5: Guardrail Agents
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type ProductivityType = 'rental' | 'service' | 'teaching' | 'content' | 'none';

export interface RentalPotential {
  dailyRate: number;
  monthlyRate: number;
  demandLevel: 'low' | 'medium' | 'high';
  platforms: string[];
}

export interface ServicePotential {
  hourlyRate: number;
  serviceType: string;
  marketDemand: 'low' | 'medium' | 'high';
  requirements?: string[];
}

export interface ProductiveAsset {
  itemId: string;
  name: string;
  category: string;
  estimatedSaleValue: number;
  isProductive: boolean;
  productivityType: ProductivityType;
  rentalPotential?: RentalPotential;
  servicePotential?: ServicePotential;
}

export interface PivotComparison {
  sellOnce: number;
  earnPerMonth: number;
  breakEvenMonths: number;
  yearlyEarning: number;
  recommendation: 'sell' | 'rent' | 'monetize';
  reason: string;
}

export interface PlatformSuggestion {
  name: string;
  url: string;
  typicalEarnings: string;
  setup: string;
  fees?: string;
}

export interface AssetPivotSuggestion {
  itemId: string;
  itemName: string;
  originalAction: 'sell';
  suggestedAction: 'rent' | 'monetize' | 'keep_and_earn';
  comparison: PivotComparison;
  platforms: PlatformSuggestion[];
  confidence: number;
}

export interface AssetPivotOutput {
  analyzedItems: ProductiveAsset[];
  pivotSuggestions: AssetPivotSuggestion[];
  totalPreservedValue: number;
  potentialMonthlyIncome: number;
}

// ============================================================
// RENTAL RATES DATABASE
// ============================================================

export const RENTAL_RATES: Record<
  string,
  { daily: number; monthly: number; demand: 'low' | 'medium' | 'high' }
> = {
  // Instruments
  guitar_acoustic: { daily: 10, monthly: 80, demand: 'medium' },
  guitar_electric: { daily: 15, monthly: 120, demand: 'medium' },
  piano_keyboard: { daily: 20, monthly: 150, demand: 'high' },
  violin: { daily: 12, monthly: 100, demand: 'low' },
  drums: { daily: 25, monthly: 200, demand: 'low' },
  ukulele: { daily: 5, monthly: 40, demand: 'medium' },

  // Transport
  bike_city: { daily: 8, monthly: 60, demand: 'high' },
  bike_electric: { daily: 20, monthly: 150, demand: 'high' },
  scooter_electric: { daily: 15, monthly: 100, demand: 'medium' },
  skateboard: { daily: 5, monthly: 30, demand: 'low' },

  // Photo/Video
  camera_dslr: { daily: 30, monthly: 250, demand: 'medium' },
  camera_mirrorless: { daily: 40, monthly: 300, demand: 'high' },
  lens_pro: { daily: 20, monthly: 150, demand: 'medium' },
  drone: { daily: 50, monthly: 400, demand: 'high' },
  gopro: { daily: 15, monthly: 100, demand: 'medium' },
  tripod_pro: { daily: 8, monthly: 50, demand: 'low' },

  // Tools
  drill: { daily: 5, monthly: 30, demand: 'high' },
  pressure_washer: { daily: 15, monthly: 80, demand: 'medium' },
  lawnmower: { daily: 20, monthly: 100, demand: 'medium' },
  sander: { daily: 8, monthly: 50, demand: 'medium' },
  saw_circular: { daily: 10, monthly: 60, demand: 'medium' },

  // Gaming
  console_ps5: { daily: 15, monthly: 100, demand: 'high' },
  console_xbox: { daily: 15, monthly: 100, demand: 'medium' },
  console_switch: { daily: 10, monthly: 70, demand: 'high' },
  vr_headset: { daily: 20, monthly: 150, demand: 'medium' },

  // Camping/Outdoor
  tent_4person: { daily: 12, monthly: 80, demand: 'medium' },
  camping_gear_set: { daily: 25, monthly: 150, demand: 'medium' },
  hiking_backpack: { daily: 5, monthly: 30, demand: 'low' },
  ski_set: { daily: 20, monthly: 120, demand: 'high' },
  snowboard_set: { daily: 18, monthly: 100, demand: 'high' },

  // Sports
  surfboard: { daily: 15, monthly: 100, demand: 'medium' },
  kayak: { daily: 25, monthly: 150, demand: 'low' },
  tennis_racket: { daily: 5, monthly: 30, demand: 'low' },
  golf_clubs: { daily: 20, monthly: 120, demand: 'low' },
};

// ============================================================
// MONETIZATION PLATFORMS DATABASE
// ============================================================

export const MONETIZATION_PLATFORMS: Record<string, PlatformSuggestion[]> = {
  instruments: [
    {
      name: 'Zilok',
      url: 'https://www.zilok.com',
      typicalEarnings: '50-150€/mois',
      setup: '10 min pour créer annonce',
      fees: '15% commission',
    },
    {
      name: 'Superprof (cours)',
      url: 'https://www.superprof.fr',
      typicalEarnings: '15-30€/h de cours',
      setup: '30 min profil complet',
      fees: 'Abonnement 39€/mois ou commission',
    },
    {
      name: 'Kelprof',
      url: 'https://www.kelprof.com',
      typicalEarnings: '15-25€/h',
      setup: '15 min',
      fees: 'Gratuit',
    },
  ],

  bikes: [
    {
      name: 'Uber Eats (livraison)',
      url: 'https://www.ubereats.com/fr/deliver',
      typicalEarnings: '8-15€/h',
      setup: '1 jour vérification',
      fees: 'Pas de frais',
    },
    {
      name: 'Deliveroo',
      url: 'https://riders.deliveroo.fr',
      typicalEarnings: '8-15€/h',
      setup: '1 jour vérification',
      fees: 'Pas de frais',
    },
    {
      name: 'Getaround (location)',
      url: 'https://www.getaround.com',
      typicalEarnings: '5-10€/jour',
      setup: '15 min',
      fees: '25% commission',
    },
  ],

  photo_video: [
    {
      name: 'Meero (événements)',
      url: 'https://www.meero.com',
      typicalEarnings: '50-150€/événement',
      setup: 'Portfolio + test',
      fees: 'Plateforme gère clients',
    },
    {
      name: 'Shutterstock (stock)',
      url: 'https://submit.shutterstock.com',
      typicalEarnings: '0.25-2€/téléchargement',
      setup: '30 min',
      fees: '70% reversés',
    },
    {
      name: 'Fat Llama (location)',
      url: 'https://fatllama.com',
      typicalEarnings: '20-50€/jour',
      setup: '10 min',
      fees: '15% commission',
    },
  ],

  tools: [
    {
      name: 'AlloVoisins',
      url: 'https://www.allovoisins.com',
      typicalEarnings: '10-20€/h service',
      setup: '15 min',
      fees: '15% commission',
    },
    {
      name: 'Bricolib',
      url: 'https://www.bricolib.net',
      typicalEarnings: '5-15€/jour location',
      setup: '10 min',
      fees: '20% commission',
    },
    {
      name: 'TaskRabbit',
      url: 'https://www.taskrabbit.fr',
      typicalEarnings: '15-30€/h',
      setup: '1h (vérification)',
      fees: '15% commission',
    },
  ],

  gaming: [
    {
      name: 'Location entre particuliers',
      url: 'https://www.leboncoin.fr',
      typicalEarnings: '10-15€/jour',
      setup: '5 min annonce',
      fees: 'Gratuit',
    },
    {
      name: 'Fat Llama',
      url: 'https://fatllama.com',
      typicalEarnings: '15-20€/jour',
      setup: '10 min',
      fees: '15% commission',
    },
  ],

  outdoor: [
    {
      name: 'Zilok',
      url: 'https://www.zilok.com',
      typicalEarnings: '10-25€/jour',
      setup: '10 min',
      fees: '15% commission',
    },
    {
      name: 'SkiLoc',
      url: 'https://www.skiloc.com',
      typicalEarnings: '15-25€/jour',
      setup: '10 min',
      fees: '20% commission',
    },
  ],
};

// ============================================================
// CATEGORY MAPPING
// ============================================================

const PRODUCTIVE_CATEGORIES: Record<string, { type: ProductivityType; rentalKey?: string }> = {
  // Instruments
  guitar: { type: 'rental', rentalKey: 'guitar_acoustic' },
  guitare: { type: 'rental', rentalKey: 'guitar_acoustic' },
  piano: { type: 'rental', rentalKey: 'piano_keyboard' },
  keyboard: { type: 'rental', rentalKey: 'piano_keyboard' },
  violin: { type: 'rental', rentalKey: 'violin' },
  violon: { type: 'rental', rentalKey: 'violin' },
  drums: { type: 'rental', rentalKey: 'drums' },
  batterie: { type: 'rental', rentalKey: 'drums' },
  ukulele: { type: 'rental', rentalKey: 'ukulele' },

  // Bikes
  bike: { type: 'service', rentalKey: 'bike_city' },
  vélo: { type: 'service', rentalKey: 'bike_city' },
  bicycle: { type: 'service', rentalKey: 'bike_city' },
  ebike: { type: 'service', rentalKey: 'bike_electric' },
  scooter: { type: 'rental', rentalKey: 'scooter_electric' },
  trottinette: { type: 'rental', rentalKey: 'scooter_electric' },

  // Photo/Video
  camera: { type: 'rental', rentalKey: 'camera_dslr' },
  appareil: { type: 'rental', rentalKey: 'camera_dslr' },
  reflex: { type: 'rental', rentalKey: 'camera_dslr' },
  drone: { type: 'rental', rentalKey: 'drone' },
  gopro: { type: 'rental', rentalKey: 'gopro' },
  lens: { type: 'rental', rentalKey: 'lens_pro' },
  objectif: { type: 'rental', rentalKey: 'lens_pro' },

  // Tools
  drill: { type: 'rental', rentalKey: 'drill' },
  perceuse: { type: 'rental', rentalKey: 'drill' },
  scie: { type: 'rental', rentalKey: 'saw_circular' },
  saw: { type: 'rental', rentalKey: 'saw_circular' },
  tondeuse: { type: 'rental', rentalKey: 'lawnmower' },
  lawnmower: { type: 'rental', rentalKey: 'lawnmower' },
  karcher: { type: 'rental', rentalKey: 'pressure_washer' },
  nettoyeur: { type: 'rental', rentalKey: 'pressure_washer' },

  // Gaming
  ps5: { type: 'rental', rentalKey: 'console_ps5' },
  playstation: { type: 'rental', rentalKey: 'console_ps5' },
  xbox: { type: 'rental', rentalKey: 'console_xbox' },
  switch: { type: 'rental', rentalKey: 'console_switch' },
  nintendo: { type: 'rental', rentalKey: 'console_switch' },
  vr: { type: 'rental', rentalKey: 'vr_headset' },
  oculus: { type: 'rental', rentalKey: 'vr_headset' },

  // Outdoor
  tent: { type: 'rental', rentalKey: 'tent_4person' },
  tente: { type: 'rental', rentalKey: 'tent_4person' },
  camping: { type: 'rental', rentalKey: 'camping_gear_set' },
  ski: { type: 'rental', rentalKey: 'ski_set' },
  snowboard: { type: 'rental', rentalKey: 'snowboard_set' },
  surf: { type: 'rental', rentalKey: 'surfboard' },
  kayak: { type: 'rental', rentalKey: 'kayak' },
};

// ============================================================
// ANALYSIS FUNCTIONS
// ============================================================

/**
 * Detect if an item is a productive asset
 */
function detectProductiveAsset(itemName: string, itemCategory: string): ProductiveAsset | null {
  const nameLower = itemName.toLowerCase();
  const categoryLower = itemCategory.toLowerCase();

  for (const [keyword, config] of Object.entries(PRODUCTIVE_CATEGORIES)) {
    if (nameLower.includes(keyword) || categoryLower.includes(keyword)) {
      const rentalRate = config.rentalKey ? RENTAL_RATES[config.rentalKey] : null;

      return {
        itemId: '',
        name: itemName,
        category: itemCategory,
        estimatedSaleValue: 0,
        isProductive: true,
        productivityType: config.type,
        rentalPotential: rentalRate
          ? {
              dailyRate: rentalRate.daily,
              monthlyRate: rentalRate.monthly,
              demandLevel: rentalRate.demand,
              platforms: getPlatformsForCategory(itemCategory),
            }
          : undefined,
      };
    }
  }

  return null;
}

/**
 * Get platforms for a category
 */
function getPlatformsForCategory(category: string): string[] {
  const categoryLower = category.toLowerCase();

  if (
    categoryLower.includes('guitar') ||
    categoryLower.includes('piano') ||
    categoryLower.includes('instrument')
  ) {
    return ['Zilok', 'Superprof', 'Kelprof'];
  }
  if (categoryLower.includes('bike') || categoryLower.includes('vélo')) {
    return ['Uber Eats', 'Deliveroo', 'Getaround'];
  }
  if (
    categoryLower.includes('camera') ||
    categoryLower.includes('photo') ||
    categoryLower.includes('drone')
  ) {
    return ['Fat Llama', 'Meero', 'Shutterstock'];
  }
  if (categoryLower.includes('tool') || categoryLower.includes('outil')) {
    return ['AlloVoisins', 'Bricolib', 'TaskRabbit'];
  }
  if (categoryLower.includes('game') || categoryLower.includes('console')) {
    return ['Fat Llama', 'Leboncoin'];
  }
  if (
    categoryLower.includes('outdoor') ||
    categoryLower.includes('camping') ||
    categoryLower.includes('ski')
  ) {
    return ['Zilok', 'SkiLoc'];
  }

  return ['Zilok', 'Fat Llama'];
}

/**
 * Get platform details
 */
function getPlatformDetails(category: string): PlatformSuggestion[] {
  const categoryLower = category.toLowerCase();

  if (
    categoryLower.includes('guitar') ||
    categoryLower.includes('piano') ||
    categoryLower.includes('instrument')
  ) {
    return MONETIZATION_PLATFORMS.instruments || [];
  }
  if (categoryLower.includes('bike') || categoryLower.includes('vélo')) {
    return MONETIZATION_PLATFORMS.bikes || [];
  }
  if (
    categoryLower.includes('camera') ||
    categoryLower.includes('photo') ||
    categoryLower.includes('drone')
  ) {
    return MONETIZATION_PLATFORMS.photo_video || [];
  }
  if (categoryLower.includes('tool') || categoryLower.includes('outil')) {
    return MONETIZATION_PLATFORMS.tools || [];
  }
  if (categoryLower.includes('game') || categoryLower.includes('console')) {
    return MONETIZATION_PLATFORMS.gaming || [];
  }

  return MONETIZATION_PLATFORMS.outdoor || [];
}

/**
 * Calculate pivot economics
 */
function calculatePivotEconomics(
  saleValue: number,
  monthlyRate: number,
  monthsToGoal: number
): PivotComparison {
  const breakEven = monthlyRate > 0 ? Math.ceil(saleValue / monthlyRate) : Infinity;
  const yearlyEarning = monthlyRate * 12;

  let recommendation: 'sell' | 'rent' | 'monetize';
  let reason: string;

  if (breakEven <= 3) {
    recommendation = 'rent';
    reason = `En ${breakEven} mois tu récupères la valeur de vente, puis c'est du bonus !`;
  } else if (breakEven <= monthsToGoal) {
    recommendation = 'monetize';
    reason = `Break-even avant ton objectif (${breakEven} mois) - rentable à long terme`;
  } else if (monthlyRate >= saleValue * 0.1) {
    recommendation = 'rent';
    reason = `10%+ de la valeur chaque mois - mieux que de vendre`;
  } else {
    recommendation = 'sell';
    reason = `Vendre fait plus de sens ici - break-even trop long (${breakEven} mois)`;
  }

  return {
    sellOnce: saleValue,
    earnPerMonth: monthlyRate,
    breakEvenMonths: breakEven,
    yearlyEarning,
    recommendation,
    reason,
  };
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Detect productive assets in sell items
 */
export const detectProductiveAssetsTool = createTool({
  id: 'detect_productive_assets',
  description: 'Identify items that can generate recurring income instead of one-time sale',
  inputSchema: z.object({
    sellItems: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        estimatedValue: z.number(),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.detect_productive_assets', async (ctx) => {
      setPromptAttributes(ctx, 'asset-pivot');

      const productiveAssets: ProductiveAsset[] = [];
      const nonProductiveItems: string[] = [];

      for (const item of input.sellItems) {
        const asset = detectProductiveAsset(item.name, item.category);

        if (asset) {
          productiveAssets.push({
            ...asset,
            itemId: item.id,
            estimatedSaleValue: item.estimatedValue,
          });
        } else {
          nonProductiveItems.push(item.id);
        }
      }

      ctx.setAttributes({
        'input.items_count': input.sellItems.length,
        'output.productive_count': productiveAssets.length,
        'output.non_productive_count': nonProductiveItems.length,
      });

      return {
        productiveAssets,
        nonProductiveItems,
        productiveRate:
          input.sellItems.length > 0 ? productiveAssets.length / input.sellItems.length : 0,
      };
    });
  },
});

/**
 * Tool: Calculate pivot economics
 */
export const calculatePivotEconomicsTool = createTool({
  id: 'calculate_pivot_economics',
  description: 'Compare selling once vs monetizing over time',
  inputSchema: z.object({
    asset: z.object({
      itemId: z.string(),
      name: z.string(),
      estimatedSaleValue: z.number(),
      rentalPotential: z
        .object({
          dailyRate: z.number(),
          monthlyRate: z.number(),
          demandLevel: z.enum(['low', 'medium', 'high']),
        })
        .optional(),
    }),
    goalContext: z.object({
      monthsRemaining: z.number(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
    }),
  }),
  execute: async (input) => {
    return trace('tool.calculate_pivot_economics', async (ctx) => {
      setPromptAttributes(ctx, 'asset-pivot');

      const monthlyRate = input.asset.rentalPotential?.monthlyRate || 0;
      const comparison = calculatePivotEconomics(
        input.asset.estimatedSaleValue,
        monthlyRate,
        input.goalContext.monthsRemaining
      );

      // Adjust for urgency
      if (input.goalContext.urgency === 'high' && comparison.recommendation !== 'sell') {
        comparison.recommendation = 'sell';
        comparison.reason = `Urgence cash immédiat - vends maintenant, tu pourras en racheter un après`;
      }

      ctx.setAttributes({
        'input.sale_value': input.asset.estimatedSaleValue,
        'input.monthly_rate': monthlyRate,
        'input.months_remaining': input.goalContext.monthsRemaining,
        'output.recommendation': comparison.recommendation,
        'output.break_even_months': comparison.breakEvenMonths,
      });

      return {
        itemId: input.asset.itemId,
        itemName: input.asset.name,
        comparison,
        platforms: getPlatformDetails(input.asset.name),
      };
    });
  },
});

/**
 * Tool: Suggest monetization platforms
 */
export const suggestMonetizationPlatformsTool = createTool({
  id: 'suggest_monetization_platforms',
  description: 'Get platform recommendations for monetizing an asset',
  inputSchema: z.object({
    assetCategory: z.string().describe('Category of the asset'),
    assetName: z.string().describe('Name of the asset'),
  }),
  execute: async (input) => {
    return trace('tool.suggest_monetization_platforms', async (ctx) => {
      setPromptAttributes(ctx, 'asset-pivot');

      const platforms = getPlatformDetails(input.assetCategory);

      ctx.setAttributes({
        'input.category': input.assetCategory,
        'input.name': input.assetName,
        'output.platforms_count': platforms.length,
      });

      return {
        platforms,
        bestPlatform: platforms[0] || null,
        totalPlatforms: platforms.length,
      };
    });
  },
});

/**
 * Combined asset pivot tool
 */
export const assetPivotTool = createTool({
  id: 'asset_pivot',
  description: 'Full asset analysis: detect productive + calculate economics + suggest platforms',
  inputSchema: z.object({
    sellItems: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        estimatedValue: z.number(),
      })
    ),
    goalContext: z.object({
      monthsRemaining: z.number(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
    }),
  }),
  execute: async (input): Promise<AssetPivotOutput> => {
    return trace('asset_pivot.full_analysis', async (ctx) => {
      setPromptAttributes(ctx, 'asset-pivot');

      const analyzedItems: ProductiveAsset[] = [];
      const pivotSuggestions: AssetPivotSuggestion[] = [];
      let totalPreservedValue = 0;
      let potentialMonthlyIncome = 0;

      for (const item of input.sellItems) {
        const asset = detectProductiveAsset(item.name, item.category);

        if (asset) {
          const fullAsset: ProductiveAsset = {
            ...asset,
            itemId: item.id,
            estimatedSaleValue: item.estimatedValue,
          };
          analyzedItems.push(fullAsset);

          const monthlyRate = fullAsset.rentalPotential?.monthlyRate || 0;
          const comparison = calculatePivotEconomics(
            item.estimatedValue,
            monthlyRate,
            input.goalContext.monthsRemaining
          );

          if (comparison.recommendation !== 'sell') {
            pivotSuggestions.push({
              itemId: item.id,
              itemName: item.name,
              originalAction: 'sell',
              suggestedAction: comparison.recommendation === 'rent' ? 'rent' : 'monetize',
              comparison,
              platforms: getPlatformDetails(item.category),
              confidence: fullAsset.rentalPotential?.demandLevel === 'high' ? 0.9 : 0.7,
            });

            totalPreservedValue += item.estimatedValue;
            potentialMonthlyIncome += monthlyRate;
          }
        }
      }

      ctx.setAttributes({
        'input.items_count': input.sellItems.length,
        'output.productive_count': analyzedItems.length,
        'output.pivot_suggestions': pivotSuggestions.length,
        'output.preserved_value': totalPreservedValue,
        'output.monthly_income': potentialMonthlyIncome,
      });

      ctx.setOutput({
        productive_assets: analyzedItems.length,
        pivot_suggestions: pivotSuggestions.length,
        preserved_value: totalPreservedValue,
        potential_monthly_income: potentialMonthlyIncome,
      });

      return {
        analyzedItems,
        pivotSuggestions,
        totalPreservedValue,
        potentialMonthlyIncome,
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('detect_productive_assets', detectProductiveAssetsTool);
registerTool('calculate_pivot_economics', calculatePivotEconomicsTool);
registerTool('suggest_monetization_platforms', suggestMonetizationPlatformsTool);
registerTool('asset_pivot', assetPivotTool);

// ============================================================
// EXPORTS
// ============================================================

export default {
  detectProductiveAssetsTool,
  calculatePivotEconomicsTool,
  suggestMonetizationPlatformsTool,
  assetPivotTool,
  RENTAL_RATES,
  MONETIZATION_PLATFORMS,
};
