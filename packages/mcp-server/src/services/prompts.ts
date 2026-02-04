/**
 * Prompts Service
 *
 * Loads and manages prompts from prompts.yaml file.
 * Supports variable interpolation and caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// Get directory of current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prompts file path (relative to this service)
const PROMPTS_PATH = path.join(__dirname, '../../prompts.yaml');

// Type definitions for prompts structure
interface PromptStep {
  prompt: string;
  max_tokens?: number;
}

interface AgentPrompt {
  version: string;
  instructions: string;
}

interface AgentsPrompts {
  [agentId: string]: AgentPrompt;
}

interface OnboardingPrompts {
  system: string;
  greeting: string;
  extraction: string;
  step_name: PromptStep;
  step_studies: PromptStep;
  step_skills: PromptStep;
  step_location: PromptStep;
  step_budget: PromptStep;
  step_work: PromptStep;
}

interface BudgetAnalysisPrompts {
  system: string;
  analyze: string;
}

interface JobSuggestionsPrompts {
  system: string;
  suggest: string;
}

interface GoalPlanningPrompts {
  system: string;
  create_plan: string;
}

interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number;
}

interface EvaluationPrompts {
  criteria: EvaluationCriteria[];
  guardrails: {
    forbidden_topics: string[];
    required_disclaimers: Record<string, string>;
  };
}

interface PromptsConfig {
  agents?: AgentsPrompts;
  onboarding: OnboardingPrompts;
  budget_analysis: BudgetAnalysisPrompts;
  job_suggestions: JobSuggestionsPrompts;
  goal_planning: GoalPlanningPrompts;
  evaluation: EvaluationPrompts;
}

// Cached prompts
let cachedPrompts: PromptsConfig | null = null;
let lastLoadTime: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Load prompts from YAML file
 */
export function loadPrompts(): PromptsConfig {
  const now = Date.now();

  // Return cached if still valid
  if (cachedPrompts && now - lastLoadTime < CACHE_TTL_MS) {
    return cachedPrompts;
  }

  try {
    const fileContents = fs.readFileSync(PROMPTS_PATH, 'utf8');
    cachedPrompts = yaml.load(fileContents) as PromptsConfig;
    lastLoadTime = now;
    console.error(`Prompts loaded from ${PROMPTS_PATH}`);
    return cachedPrompts;
  } catch (error) {
    console.error('Error loading prompts:', error);
    // Return minimal default prompts
    return getDefaultPrompts();
  }
}

/**
 * Get a specific prompt by path (e.g., "onboarding.system")
 */
export function getPrompt(path: string): string {
  const prompts = loadPrompts();
  const parts = path.split('.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = prompts;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      console.error(`Prompt not found: ${path}`);
      return '';
    }
  }

  // Handle PromptStep objects
  if (typeof current === 'object' && 'prompt' in current) {
    return current.prompt;
  }

  return typeof current === 'string' ? current : '';
}

/**
 * Get a prompt with variables interpolated
 * Variables use {variable_name} syntax
 */
export function getPromptWithVars(path: string, vars: Record<string, string | number>): string {
  let prompt = getPrompt(path);

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{${key}}`;
    prompt = prompt.split(placeholder).join(String(value));
  }

  return prompt;
}

/**
 * Get max_tokens for a step prompt
 */
export function getMaxTokens(path: string): number {
  const prompts = loadPrompts();
  const parts = path.split('.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = prompts;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return 256; // Default
    }
  }

  if (typeof current === 'object' && 'max_tokens' in current) {
    return current.max_tokens;
  }

  return 256;
}

/**
 * Get agent instructions from YAML
 * Returns undefined if agent not found in YAML
 */
export function getAgentInstructions(agentId: string): string | undefined {
  const prompts = loadPrompts();
  return prompts.agents?.[agentId]?.instructions;
}

/**
 * Get agent prompt version from YAML
 * Returns undefined if agent not found in YAML
 */
export function getAgentVersion(agentId: string): string | undefined {
  const prompts = loadPrompts();
  return prompts.agents?.[agentId]?.version;
}

/**
 * Get all agent IDs defined in YAML
 */
export function getAgentIds(): string[] {
  const prompts = loadPrompts();
  return prompts.agents ? Object.keys(prompts.agents) : [];
}

/**
 * Get evaluation criteria
 */
export function getEvaluationCriteria(): EvaluationCriteria[] {
  const prompts = loadPrompts();
  return prompts.evaluation?.criteria || [];
}

/**
 * Get guardrails (forbidden topics, disclaimers)
 */
export function getGuardrails(): {
  forbiddenTopics: string[];
  requiredDisclaimers: Record<string, string>;
} {
  const prompts = loadPrompts();
  const guardrails = prompts.evaluation?.guardrails || {
    forbidden_topics: [],
    required_disclaimers: {},
  };

  return {
    forbiddenTopics: guardrails.forbidden_topics,
    requiredDisclaimers: guardrails.required_disclaimers,
  };
}

/**
 * Check if content contains forbidden topics
 */
export function containsForbiddenTopics(content: string): string[] {
  const { forbiddenTopics } = getGuardrails();
  const lower = content.toLowerCase();
  return forbiddenTopics.filter((topic) => lower.includes(topic.toLowerCase()));
}

/**
 * Reload prompts (clear cache)
 */
export function reloadPrompts(): void {
  cachedPrompts = null;
  lastLoadTime = 0;
  loadPrompts();
}

/**
 * Default prompts if file fails to load
 */
function getDefaultPrompts(): PromptsConfig {
  return {
    onboarding: {
      system: 'You are Bruno, a caring financial coach for students. Always respond in English.',
      greeting: "Hey there! I'm Bruno, your financial coach. To get started, what's your name?",
      extraction:
        'Extract user information as JSON: name, diploma, field, city, income, expenses, skills, maxWorkHours, minHourlyRate',
      step_name: { prompt: 'Respond to {name} and ask about their studies.', max_tokens: 150 },
      step_studies: { prompt: 'Respond and ask about skills.', max_tokens: 150 },
      step_skills: { prompt: 'Respond and ask about their city.', max_tokens: 150 },
      step_location: { prompt: 'Respond and ask about budget.', max_tokens: 150 },
      step_budget: { prompt: 'Respond and ask about work preferences.', max_tokens: 200 },
      step_work: { prompt: 'Finalize the onboarding.', max_tokens: 250 },
    },
    budget_analysis: {
      system: 'You are a financial advisor for students. No risky advice.',
      analyze: 'Analyze this budget: Income ${total_income}, Expenses ${total_expenses}',
    },
    job_suggestions: {
      system: 'You suggest suitable jobs for students.',
      suggest: 'Suggest jobs for: {field}, {skills}, {city}',
    },
    goal_planning: {
      system: 'You help students plan their financial goals.',
      create_plan: 'Create a plan for {goal_name}: ${goal_amount} by {deadline}',
    },
    evaluation: {
      criteria: [
        { name: 'relevance', description: 'Response is appropriate', weight: 0.3 },
        { name: 'safety', description: 'No dangerous advice', weight: 0.3 },
        { name: 'actionability', description: 'Concrete actions proposed', weight: 0.2 },
        { name: 'tone', description: 'Friendly and encouraging tone', weight: 0.2 },
      ],
      guardrails: {
        forbidden_topics: ['crypto', 'sports betting', 'MLM'],
        required_disclaimers: {
          financial_advice: 'This is not professional financial advice',
        },
      },
    },
  };
}

// Export service
export const promptsService = {
  load: loadPrompts,
  get: getPrompt,
  getWithVars: getPromptWithVars,
  getMaxTokens,
  getAgentInstructions,
  getAgentVersion,
  getAgentIds,
  getEvaluationCriteria,
  getGuardrails,
  containsForbiddenTopics,
  reload: reloadPrompts,
};

export default promptsService;
