/**
 * Prompt Interpolator
 *
 * Utilities for interpolating context variables into prompt templates.
 */

import type { ProfileData } from '../types';

/**
 * Interpolate context values into a prompt template
 *
 * @example
 * const prompt = interpolatePrompt(
 *   "Hello {name}, you're studying {diploma} in {field}",
 *   { name: "Alex", diploma: "Bachelor", field: "CS" }
 * );
 * // "Hello Alex, you're studying Bachelor in CS"
 */
export function interpolatePrompt(template: string, context: Record<string, unknown>): string {
  let result = template;

  // Add currencySymbol based on currency if not already present
  const currencySymbol = getCurrencySymbol(context.currency as string | undefined);
  const enrichedContext = { ...context, currencySymbol };

  // Replace all {key} placeholders with context values
  for (const [key, value] of Object.entries(enrichedContext)) {
    const placeholder = `{${key}}`;
    const stringValue = formatValue(value);
    result = result.split(placeholder).join(stringValue);
  }

  // Calculate derived values
  if (context.income !== undefined && context.expenses !== undefined) {
    const margin = Number(context.income) - Number(context.expenses);
    result = result.split('{margin}').join(String(margin));
  }

  // Clean up any remaining placeholders with sensible defaults
  result = cleanupPlaceholders(result);

  return result;
}

/**
 * Format a value for display in a prompt
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'some items';
  }
  return String(value);
}

/**
 * Replace any remaining unresolved placeholders with sensible defaults
 */
function cleanupPlaceholders(text: string): string {
  return text
    .replace(/\{goalName\}/g, 'your goal')
    .replace(/\{goalAmount\}/g, 'your target amount')
    .replace(/\{goalDeadline\}/g, 'your deadline')
    .replace(/\{academicEvents\}/g, 'your academic schedule')
    .replace(/\{inventoryItems\}/g, 'some items')
    .replace(/\{subscriptions\}/g, 'your subscriptions')
    .replace(/\{tradeOpportunities\}/g, 'your trade opportunities')
    .replace(/\{name\}/g, 'there')
    .replace(/\{diploma\}/g, '')
    .replace(/\{field\}/g, 'your field')
    .replace(/\{skills\}/g, 'your skills')
    .replace(/\{certifications\}/g, 'your certifications')
    .replace(/\{city\}/g, 'your city')
    .replace(/\{currency\}/g, 'your currency')
    .replace(/\{currencySymbol\}/g, '$')
    .replace(/\{income\}/g, 'your income')
    .replace(/\{expenses\}/g, 'your expenses')
    .replace(/\{margin\}/g, 'your margin')
    .replace(/\{maxWorkHours\}/g, '15')
    .replace(/\{minHourlyRate\}/g, '15')
    .replace(/\{[a-zA-Z_]+\}/g, ''); // Remove any remaining placeholders
}

/**
 * Build an extraction prompt for a specific step
 */
export function buildExtractionPrompt(
  step: string,
  message: string,
  existingProfile: ProfileData,
  stepContext?: string
): string {
  return `Current step: ${step}
Context: ${stepContext || 'Collecting profile information.'}

User message: "${message}"

Already collected: ${JSON.stringify(existingProfile, null, 2)}

Extract the relevant information and return as JSON.`;
}

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currency?: string): string {
  switch (currency) {
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'USD':
    default:
      return '$';
  }
}
