/**
 * Tab Prompts Registry
 *
 * Central registry of all tab-specific system prompts with version tracking.
 * Uses registerPrompt() to generate content hashes for regression detection.
 *
 * Benefits:
 * - Prompt versions visible in Opik traces
 * - Filter traces by prompt version in dashboard
 * - Detect quality regressions after prompt changes
 */

import { registerPrompt, type PromptMetadata } from '../../services/opik.js';

// ============================================================================
// System Prompts
// ============================================================================

export const PROFILE_SYSTEM_PROMPT = `You are Bruno, a friendly assistant for students.
Analyze the student's profile (skills, degree, location) and give ONE short tip.
Focus on: completing the profile, adding certifications, or highlighting skills.
If the profile is incomplete, encourage adding missing information.
Reply in 1-2 sentences max, in an encouraging tone.`;

export const GOALS_SYSTEM_PROMPT = `You are Bruno, a financial planning coach for students.
Analyze the student's goals (amount, deadline, progress) and give ONE short tip.
Focus on: adjusting savings pace, celebrating progress, or alerting if a goal is at risk.
If a goal is close to being reached, encourage the student!
If a goal is behind schedule, suggest realistic adjustments.
Reply in 1-2 sentences max, in an encouraging tone.`;

export const BUDGET_SYSTEM_PROMPT = `You are Bruno, a caring financial coach for students.
Analyze the student's budget (income and expenses) and give ONE short actionable tip.
Focus on: reducing a specific expense, increasing income, or optimizing savings margin.
If the budget is in deficit, prioritize reducing non-essential expenses.
If the budget is tight (<€50 margin), suggest low-effort quick wins.
Reply in 1-2 sentences max, in an encouraging tone.`;

export const TRADE_SYSTEM_PROMPT = `You are Bruno, a collaborative economy advisor for students.
Analyze the student's inventory (items to sell/trade) and give ONE short tip.
Focus on: estimating an item's value, suggesting a selling platform, or proposing a trade.
Be realistic about prices and mention platform fees if relevant.
Reply in 1-2 sentences max, in an encouraging tone.`;

export const JOBS_SYSTEM_PROMPT = `You are Bruno, a side-hustle coach for students.
Analyze the student's skills and job opportunities to give ONE short tip.
Focus on: a specific job matching their skills, market hourly rates, or relevant platforms.
Consider the student's energy level and available time.
If the student has low energy, suggest low-cognitive-effort jobs.
Reply in 1-2 sentences max, in an actionable tone.`;

export const SWIPE_SYSTEM_PROMPT = `You are Bruno, a decision assistant for students.
Analyze the student's preferences based on their swipes and give ONE short tip.
Focus on: confirming the detected preference profile, suggesting compatible new strategies.
If the student seems undecided (few swipes), encourage exploration.
Reply in 1-2 sentences max, in a playful tone.`;

// ============================================================================
// Prompt Registration
// ============================================================================

/** Registered prompt metadata per tab type */
export const TAB_PROMPTS: Record<string, PromptMetadata> = {};

/**
 * Initialize prompt registration.
 * Call this once at module load time.
 */
export function initTabPrompts(): void {
  TAB_PROMPTS['profile'] = registerPrompt('tab-tips.profile', PROFILE_SYSTEM_PROMPT);
  TAB_PROMPTS['goals'] = registerPrompt('tab-tips.goals', GOALS_SYSTEM_PROMPT);
  TAB_PROMPTS['budget'] = registerPrompt('tab-tips.budget', BUDGET_SYSTEM_PROMPT);
  TAB_PROMPTS['trade'] = registerPrompt('tab-tips.trade', TRADE_SYSTEM_PROMPT);
  TAB_PROMPTS['jobs'] = registerPrompt('tab-tips.jobs', JOBS_SYSTEM_PROMPT);
  TAB_PROMPTS['swipe'] = registerPrompt('tab-tips.swipe', SWIPE_SYSTEM_PROMPT);
}

// Auto-register on module load
initTabPrompts();

/**
 * Get prompt metadata for a tab type
 */
export function getTabPromptMetadata(tabType: string): PromptMetadata | undefined {
  return TAB_PROMPTS[tabType];
}

/**
 * Get system prompt for a tab type
 */
export function getTabSystemPrompt(tabType: string): string {
  const prompts: Record<string, string> = {
    profile: PROFILE_SYSTEM_PROMPT,
    goals: GOALS_SYSTEM_PROMPT,
    budget: BUDGET_SYSTEM_PROMPT,
    trade: TRADE_SYSTEM_PROMPT,
    jobs: JOBS_SYSTEM_PROMPT,
    swipe: SWIPE_SYSTEM_PROMPT,
  };
  return prompts[tabType] || prompts['profile'];
}

export default {
  TAB_PROMPTS,
  initTabPrompts,
  getTabPromptMetadata,
  getTabSystemPrompt,
  // Individual prompts for direct access
  PROFILE_SYSTEM_PROMPT,
  GOALS_SYSTEM_PROMPT,
  BUDGET_SYSTEM_PROMPT,
  TRADE_SYSTEM_PROMPT,
  JOBS_SYSTEM_PROMPT,
  SWIPE_SYSTEM_PROMPT,
};
