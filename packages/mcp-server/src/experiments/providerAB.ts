/**
 * Provider A/B Testing (Quick Win #7)
 *
 * Enables comparing different LLM providers/models:
 * - Deterministic user bucketing (same user always gets same variant)
 * - Metadata injection for Opik tracing
 * - Configurable traffic splits
 *
 * Uses @ai-sdk/openai with configurable baseURL for provider-agnostic model creation.
 * Note: Env vars are read lazily (not at module load) for Vite SSR compatibility.
 *
 * Usage:
 * ```typescript
 * const { model, metadata } = getModelForUser(userId, 'model-comparison-v1');
 * // Use model for LLM calls
 * // Include metadata in Opik traces
 * ```
 */

import { createHash } from 'crypto';
import { createOpenAI } from '@ai-sdk/openai';

// Provider-agnostic configuration - read lazily
const getLLMApiKey = () => process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
const getLLMBaseUrl = () => process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const getProductionModel = () =>
  process.env.LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Lazy provider singleton
let _llmProvider: ReturnType<typeof createOpenAI> | null = null;

function getLLMProvider() {
  if (!_llmProvider) {
    _llmProvider = createOpenAI({
      apiKey: getLLMApiKey(),
      baseURL: getLLMBaseUrl(),
    });
  }
  return _llmProvider;
}

/**
 * Model variant configuration
 */
export interface ModelVariant {
  id: string;
  name: string;
  model: unknown;
  description: string;
}

// Lazy model variants cache
let _modelVariants: Record<string, ModelVariant> | null = null;

function getModelVariants(): Record<string, ModelVariant> {
  if (!_modelVariants) {
    const provider = getLLMProvider();
    const model = getProductionModel();
    _modelVariants = {
      production: {
        id: 'production',
        name: `Production (${model})`,
        model: provider(model),
        description: 'Model from LLM_MODEL env variable',
      },
    };
  }
  return _modelVariants;
}

/**
 * Available model variants for A/B testing (lazy getter)
 */
export const MODEL_VARIANTS: Record<string, ModelVariant> = new Proxy(
  {} as Record<string, ModelVariant>,
  {
    get(_target, prop: string) {
      return getModelVariants()[prop];
    },
    ownKeys() {
      return Object.keys(getModelVariants());
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      const variants = getModelVariants();
      if (prop in variants) {
        return { configurable: true, enumerable: true, value: variants[prop] };
      }
      return undefined;
    },
  }
);

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
 * Note: Add variants dynamically based on your provider's available models.
 */
export const AB_TESTS: Record<string, ABTestConfig> = {
  'model-comparison-v1': {
    name: 'model-comparison-v1',
    variants: ['production'],
    trafficSplit: [1.0],
    enabled: false, // Enable and add variants when ready to test
  },
};

/**
 * Result from selecting a model variant
 */
export interface ABTestResult {
  model: unknown;
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
 */
export function getModelForUser(userId: string, experimentName: string): ABTestResult {
  const config = AB_TESTS[experimentName];

  if (!config || !config.enabled) {
    const defaultVariant = getModelVariants()['production'];
    return {
      model: defaultVariant.model,
      metadata: {
        ab_experiment: 'none',
        ab_variant: 'production',
        ab_variant_name: defaultVariant.name,
      },
      variant: defaultVariant,
    };
  }

  const variantId = selectVariant(config, userId);
  const variants = getModelVariants();
  const variant = variants[variantId] || variants['production'];

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
export function getDefaultModel(): unknown {
  return getModelVariants()['production'].model;
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
  return Object.values(getModelVariants());
}

/**
 * Manually set a user's variant for testing purposes
 */
const variantOverrides = new Map<string, string>();

export function setVariantOverride(
  userId: string,
  experimentName: string,
  variantId: string
): void {
  variantOverrides.set(`${userId}:${experimentName}`, variantId);
}
