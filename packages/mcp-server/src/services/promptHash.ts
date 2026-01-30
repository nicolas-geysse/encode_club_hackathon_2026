/**
 * Prompt Hashing Utility
 *
 * Generates SHA256 hashes for agent prompts to enable:
 * - Prompt versioning in Opik traces
 * - Regression detection when prompts change
 * - Correlation between trace quality and specific prompt versions
 */

import { createHash } from 'crypto';
import { AGENT_CONFIGS } from '../agents/factory.js';

export interface PromptMetadata {
  name: string;
  version: string; // 8-char short hash
  hash: string; // Full SHA256
}

// Cache hashes at startup (instructions don't change at runtime)
const promptHashCache = new Map<string, PromptMetadata>();

/**
 * Generate hash from prompt content
 */
function hashPrompt(content: string): { version: string; hash: string } {
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    version: hash.slice(0, 8),
    hash,
  };
}

/**
 * Initialize prompt hashes for all agents
 * Should be called once at startup
 */
export function initPromptHashes(): void {
  // Skip if already initialized
  if (promptHashCache.size > 0) {
    return;
  }

  // Hash all factory agents
  for (const config of AGENT_CONFIGS) {
    const { version, hash } = hashPrompt(config.instructions);
    promptHashCache.set(config.id, {
      name: config.id,
      version,
      hash,
    });
  }

  // Hash onboarding agent (loaded dynamically to avoid circular imports)
  // We'll handle this lazily in getPromptMetadata
}

/**
 * Register a prompt dynamically (for agents not in AGENT_CONFIGS)
 */
export function registerPrompt(agentId: string, instructions: string): PromptMetadata {
  const { version, hash } = hashPrompt(instructions);
  const metadata: PromptMetadata = {
    name: agentId,
    version,
    hash,
  };
  promptHashCache.set(agentId, metadata);
  return metadata;
}

/**
 * Get prompt metadata for an agent by ID
 */
export function getPromptMetadata(agentId: string): PromptMetadata | undefined {
  // Initialize if not already done
  if (promptHashCache.size === 0) {
    initPromptHashes();
  }
  return promptHashCache.get(agentId);
}

/**
 * Get all registered prompt metadata
 */
export function getAllPromptMetadata(): PromptMetadata[] {
  // Initialize if not already done
  if (promptHashCache.size === 0) {
    initPromptHashes();
  }
  return Array.from(promptHashCache.values());
}

/**
 * Hash a prompt string directly (utility function)
 */
export function hashPromptString(content: string): { version: string; hash: string } {
  return hashPrompt(content);
}
