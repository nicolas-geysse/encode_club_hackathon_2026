/**
 * Command Executor
 *
 * Parses and executes slash commands from user messages.
 */

import { SLASH_COMMANDS, type SlashCommandResult } from './definitions';

/**
 * Parse a slash command from a message
 * Returns the command name if found, null otherwise
 */
export function parseSlashCommand(message: string): string | null {
  const trimmed = message.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;

  // Extract command name (first word after /)
  const match = trimmed.match(/^\/(\w+)/);
  if (!match) return null;

  return match[1];
}

/**
 * Execute a slash command
 * Returns null if command doesn't exist
 */
export async function executeSlashCommand(
  command: string,
  context: Record<string, unknown>,
  profileId?: string
): Promise<SlashCommandResult | null> {
  const handler = SLASH_COMMANDS[command];
  if (!handler) return null;

  return await handler(context, profileId);
}

/**
 * Check if a message is a slash command
 */
export function isSlashCommand(message: string): boolean {
  return parseSlashCommand(message) !== null;
}

/**
 * Get list of available command names
 */
export function getAvailableCommands(): string[] {
  return Object.keys(SLASH_COMMANDS);
}
