/**
 * Chat Module
 *
 * Main entry point for all chat-related functionality.
 * Consolidates extraction, prompts, flow control, intent detection,
 * commands, and evaluation into a single importable module.
 *
 * @example
 * import {
 *   extractWithRegex,
 *   SYSTEM_PROMPTS,
 *   getNextStep,
 *   detectIntent,
 *   executeSlashCommand,
 *   runResponseEvaluation
 * } from '../lib/chat';
 */

// Types
export * from './types';

// Extraction - regex patterns and extractors
export * from './extraction';

// Prompts - system prompts and interpolation
export * from './prompts';

// Flow - onboarding progression
export * from './flow';

// Intent - conversation intent detection
export * from './intent';

// Commands - slash commands
export * from './commands';

// Evaluation - response quality scoring
export * from './evaluation';
