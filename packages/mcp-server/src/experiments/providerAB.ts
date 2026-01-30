/**
 * Provider A/B Testing (Quick Win #7)
 *
 * Enables comparing different LLM providers/models:
 * - Deterministic user bucketing (same user always gets same variant)
 * - Metadata injection for Opik tracing
 * - Configurable traffic splits
 *
 * Usage:
 * ```typescript
 * const { model, metadata } = getModelForUser(userId, 'model-comparison-v1');
 * // Use model for LLM calls
 * // Include metadata in Opik traces
 * ```
 */

import { createHash } from 'crypto';
import { createGroq } from '@ai-sdk/groq';

// Available model variants
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const groqClient = createGroq({ apiKey: GROQ_API_KEY });

/**
 * Model variant configuration
 */
export interface ModelVariant {
  id: string;
  name: string;
  model: ReturnType<typeof groqClient>;
  description: string;
}

/**
 * Available model variants for A/B testing
 */
export const MODEL_VARIANTS: Record<string, ModelVariant> = {
  'groq-70b': {
    id: 'groq-70b',
    name: 'Llama 3.1 70B',
    model: groqClient('llama-3.1-70b-versatile'),
    description: 'Stable production model',
  },
  'groq-70b-preview': {
    id: 'groq-70b-preview',
    name: 'Llama 3.3 70B Preview',
    model: groqClient('llama-3.3-70b-versatile'),
    description: 'Newer model, potentially better performance',
  },
  'groq-8b': {
    id: 'groq-8b',
    name: 'Llama 3.1 8B',
    model: groqClient('llama-3.1-8b-instant'),
    description: 'Fast, cheaper model for simple tasks',
  },
};

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  name: string;
  variants: string[];
  trafficSplit: number[]; // e.g., [0.5, 0.5] for 50/50
  enabled: boolean;
}

/**
 * Predefined A/B test configurations
 */
export const AB_TESTS: Record<string, ABTestConfig> = {
  'model-comparison-v1': {
    name: 'model-comparison-v1',
    variants: ['groq-70b', 'groq-70b-preview'],
    trafficSplit: [0.5, 0.5],
    enabled: true,
  },
  'cost-optimization': {
    name: 'cost-optimization',
    variants: ['groq-70b', 'groq-8b'],
    trafficSplit: [0.7, 0.3],
    enabled: false, // Enable when ready to test
  },
};

/**
 * Result from selecting a model variant
 */
export interface ABTestResult {
  model: ReturnType<typeof groqClient>;
  metadata: {
    ab_experiment: string;
    ab_variant: string;
    ab_variant_name: string;
  };
  variant: ModelVariant;
}

/**
 * Select a variant deterministically based on user ID
 * Same user always gets the same variant for a given experiment
 */
function selectVariant(config: ABTestConfig, userId: string): string {
  // Deterministic selection based on user ID + experiment name
  const hash = createHash('md5')
    .update(userId + config.name)
    .digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) / 0xffffffff;

  let cumulative = 0;
  for (let i = 0; i < config.variants.length; i++) {
    cumulative += config.trafficSplit[i];
    if (bucket < cumulative) {
      return config.variants[i];
    }
  }

  return config.variants[0];
}

/**
 * Get model and metadata for a user in an A/B test
 *
 * @param userId - User identifier (stable across sessions)
 * @param experimentName - Name of the A/B test configuration
 * @returns Model instance and metadata for tracing
 */
export function getModelForUser(userId: string, experimentName: string): ABTestResult {
  const config = AB_TESTS[experimentName];

  if (!config || !config.enabled) {
    // Default to stable model if experiment not found or disabled
    const defaultVariant = MODEL_VARIANTS['groq-70b'];
    return {
      model: defaultVariant.model,
      metadata: {
        ab_experiment: 'none',
        ab_variant: 'groq-70b',
        ab_variant_name: defaultVariant.name,
      },
      variant: defaultVariant,
    };
  }

  const variantId = selectVariant(config, userId);
  const variant = MODEL_VARIANTS[variantId] || MODEL_VARIANTS['groq-70b'];

  return {
    model: variant.model,
    metadata: {
      ab_experiment: experimentName,
      ab_variant: variantId,
      ab_variant_name: variant.name,
    },
    variant,
  };
}

/**
 * Get the default model (no A/B testing)
 */
export function getDefaultModel(): ReturnType<typeof groqClient> {
  return MODEL_VARIANTS['groq-70b'].model;
}

/**
 * List all available A/B tests
 */
export function listABTests(): ABTestConfig[] {
  return Object.values(AB_TESTS);
}

/**
 * List all available model variants
 */
export function listModelVariants(): ModelVariant[] {
  return Object.values(MODEL_VARIANTS);
}

/**
 * Manually set a user's variant for testing purposes
 * This is useful for debugging or forcing a specific variant
 */
const variantOverrides = new Map<string, string>();

export function setVariantOverride(
  userId: string,
  experimentName: string,
  variantId: string
): void {
  variantOverrides.set(`${userId}:${experimentName}`, variantId);
}

export function clearVariantOverride(userId: string, experimentName: string): void {
  variantOverrides.delete(`${userId}:${experimentName}`);
}

/**
 * Get model with override support
 */
export function getModelForUserWithOverride(userId: string, experimentName: string): ABTestResult {
  const overrideKey = `${userId}:${experimentName}`;
  const override = variantOverrides.get(overrideKey);

  if (override && MODEL_VARIANTS[override]) {
    const variant = MODEL_VARIANTS[override];
    return {
      model: variant.model,
      metadata: {
        ab_experiment: experimentName,
        ab_variant: override,
        ab_variant_name: variant.name + ' (override)',
      },
      variant,
    };
  }

  return getModelForUser(userId, experimentName);
}
