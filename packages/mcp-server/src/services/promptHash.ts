/**
 * Prompt Hashing Utility (Enhanced for Quick Win #6)
 *
 * Generates SHA256 hashes for agent prompts to enable:
 * - Prompt versioning in Opik traces
 * - Regression detection when prompts change
 * - Correlation between trace quality and specific prompt versions
 *
 * Quick Win #6: Now integrates with prompts.yaml:
 * - Uses explicit `version` from YAML if available (e.g., "1.0.0")
 * - Falls back to 8-char hash if no YAML version
 * - Tracks both semantic version and content hash
 */

import { createHash } from 'crypto';
import { AGENT_CONFIGS } from '../agents/factory.js';
import { promptsService } from './prompts.js';

export interface PromptMetadata {
  name: string;
  version: string; // Semantic version from YAML or 8-char hash
  hash: string; // Full SHA256 (always content-based)
  source: 'yaml' | 'hardcoded'; // Where the prompt came from
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
 *
 * Quick Win #6: Now checks prompts.yaml first for:
 * - Explicit version string (e.g., "1.0.0")
 * - Instructions content (for hashing)
 */
export function initPromptHashes(): void {
  // Skip if already initialized
  if (promptHashCache.size > 0) {
    return;
  }

  // Hash all factory agents
  for (const config of AGENT_CONFIGS) {
    // Try to get from YAML first (Quick Win #6)
    const yamlInstructions = promptsService.getAgentInstructions(config.id);
    const yamlVersion = promptsService.getAgentVersion(config.id);

    // Use YAML instructions if available, otherwise hardcoded
    const instructions = yamlInstructions || config.instructions;
    const { hash } = hashPrompt(instructions);

    // Use YAML version if available, otherwise use hash prefix
    const version = yamlVersion || hash.slice(0, 8);
    const source = yamlInstructions ? 'yaml' : 'hardcoded';

    promptHashCache.set(config.id, {
      name: config.id,
      version,
      hash,
      source,
    });
  }

  // Hash onboarding agent (loaded dynamically to avoid circular imports)
  // We'll handle this lazily in getPromptMetadata
}

/**
 * Register a prompt dynamically (for agents not in AGENT_CONFIGS)
 * Optionally accepts an explicit version string (from YAML or config)
 */
export function registerPrompt(
  agentId: string,
  instructions: string,
  explicitVersion?: string
): PromptMetadata {
  const { hash } = hashPrompt(instructions);
  const metadata: PromptMetadata = {
    name: agentId,
    version: explicitVersion || hash.slice(0, 8),
    hash,
    source: explicitVersion ? 'yaml' : 'hardcoded',
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

/**
 * Get a summary of all registered prompts for logging/debugging
 */
export function getPromptSummary(): Record<string, { version: string; source: string }> {
  if (promptHashCache.size === 0) {
    initPromptHashes();
  }

  const summary: Record<string, { version: string; source: string }> = {};
  for (const [id, meta] of promptHashCache) {
    summary[id] = { version: meta.version, source: meta.source };
  }
  return summary;
}

/**
 * Check if a prompt has changed (by comparing content hash)
 * Useful for detecting runtime changes when using hot-reload
 */
export function hasPromptChanged(agentId: string, currentInstructions: string): boolean {
  const cached = getPromptMetadata(agentId);
  if (!cached) return true; // New prompt

  const currentHash = createHash('sha256').update(currentInstructions).digest('hex');
  return currentHash !== cached.hash;
}

/**
 * Force refresh of prompt cache (useful after prompts.yaml changes)
 */
export function refreshPromptHashes(): void {
  promptHashCache.clear();
  initPromptHashes();
}
