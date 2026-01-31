/**
 * Chat Module Types
 *
 * Shared type definitions for the chat system.
 */

// =============================================================================
// Onboarding Steps
// =============================================================================

/**
 * Onboarding step types (extended for full tab population)
 * OPTIMIZED: City asked first (greeting) to enable early background data fetching
 */
export type OnboardingStep =
  | 'greeting' // Now asks for city first (enables background fetching early)
  | 'currency_confirm' // Only shown if currency not auto-detected from city
  | 'name'
  | 'studies'
  | 'skills'
  | 'certifications' // Professional certifications (BAFA, lifeguard, etc.)
  | 'budget'
  | 'income_timing' // When income arrives (day of month)
  | 'work_preferences'
  | 'goal' // Savings goal
  | 'academic_events' // Exams, vacations
  | 'inventory' // Items to sell
  | 'trade' // Trade opportunities (borrow, lend, swap)
  | 'lifestyle' // Subscriptions
  | 'complete';

/**
 * Chat modes:
 * - onboarding: Initial guided flow for new users
 * - conversation: Free-form chat after onboarding is complete
 * - profile-edit: User wants to update their profile
 */
export type ChatMode = 'onboarding' | 'conversation' | 'profile-edit';

// =============================================================================
// Profile Data
// =============================================================================

export interface AcademicEvent {
  name: string;
  type: 'exam' | 'vacation' | 'busy';
  startDate?: string;
  endDate?: string;
  duration?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
}

export interface InventoryItem {
  name: string;
  category: string;
  estimatedValue?: number;
}

export interface Subscription {
  name: string;
  currentCost: number;
}

export interface TradeOpportunity {
  type: 'borrow' | 'lend' | 'trade' | 'sell' | 'cut';
  description: string;
  withPerson?: string;
  forWhat?: string;
  estimatedValue?: number;
}

export interface ProfileData {
  name?: string;
  diploma?: string;
  field?: string;
  city?: string;
  currency?: 'USD' | 'EUR' | 'GBP';
  skills?: string[];
  certifications?: string[];
  income?: number;
  expenses?: number;
  incomeDay?: number; // Day of month when income arrives (1-31)
  maxWorkHours?: number;
  minHourlyRate?: number;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: AcademicEvent[];
  inventoryItems?: InventoryItem[];
  tradeOpportunities?: TradeOpportunity[];
  subscriptions?: Subscription[];
  missingInfo?: string[];
  /** Fields that were mentioned but don't match the current step context (HITL candidates) */
  ambiguousFields?: Record<string, unknown>;
  /** General facts extracted for Working Memory (Scratchpad) */
  workingMemoryUpdates?: string[];
}

// =============================================================================
// Intent Detection
// =============================================================================

/**
 * Detected intent from user message
 */
export interface DetectedIntent {
  mode: ChatMode;
  action?: string;
  field?: string;
  extractedValue?: unknown;
  extractedGoal?: {
    name?: string;
    amount?: number;
    deadline?: string;
  };
  /** What-if scenario parameters (for budget projections) */
  extractedScenario?: {
    /** Additional work hours per week */
    hours?: number;
    /** Hourly rate */
    rate?: number;
    /** One-time sale amount */
    amount?: number;
    /** Item to sell */
    item?: string;
    /** Subscription/service to cut */
    service?: string;
  };
  /** Mission title/partial match for suivi commands */
  extractedMission?: string;
  /** Energy level (0-100) for suivi commands */
  extractedEnergy?: number;
  /** Internal: which pattern matched (for observability) */
  _matchedPattern?: string;
  /** Internal: LLM classification confidence (0-1) when using LLM fallback */
  _llmConfidence?: number;
  /** Internal: LLM reasoning when using LLM fallback */
  _llmReasoning?: string;
}

// =============================================================================
// Chat Request/Response
// =============================================================================

export interface ChatRequest {
  message: string;
  step: OnboardingStep;
  mode?: ChatMode;
  context?: Record<string, unknown>;
  threadId?: string;
  profileId?: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export interface ChatResponse {
  response: string;
  extractedData: Record<string, unknown>;
  nextStep: OnboardingStep;
  intent?: DetectedIntent;
  traceId?: string;
  traceUrl?: string;
  source?: 'groq' | 'groq_legacy' | 'fallback' | 'command';
  uiResource?: unknown;
}

// =============================================================================
// Onboarding Input/Output (for extractor)
// =============================================================================

export interface OnboardingInput {
  message: string;
  currentStep: string;
  existingProfile: ProfileData;
  threadId?: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  workingMemory?: string[];
  /** Time context for simulation support (deadline normalization) */
  timeContext?: {
    simulatedDate?: string;
    isSimulating?: boolean;
    offsetDays?: number;
  };
}

export interface OnboardingOutput {
  response: string;
  extractedData: ProfileData;
  nextStep: string;
  isComplete: boolean;
  profileData: ProfileData;
  source: 'groq' | 'fallback';
  uiResource?: unknown;
}

// =============================================================================
// Token Usage (for cost tracking)
// =============================================================================

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// =============================================================================
// Step Metadata
// =============================================================================

/**
 * Mapping from onboarding steps to the tabs they populate
 */
export const STEP_TO_TAB: Record<string, string> = {
  greeting: 'profile',
  currency_confirm: 'profile',
  name: 'profile',
  studies: 'profile',
  skills: 'skills',
  certifications: 'skills',
  budget: 'profile',
  income_timing: 'budget',
  work_preferences: 'profile',
  goal: 'setup',
  academic_events: 'setup',
  inventory: 'inventory',
  trade: 'trade',
  lifestyle: 'lifestyle',
  complete: 'setup',
};

/**
 * Flow order for onboarding steps
 */
export const ONBOARDING_FLOW: OnboardingStep[] = [
  'greeting',
  'currency_confirm',
  'name',
  'studies',
  'skills',
  'certifications',
  'budget',
  'income_timing',
  'work_preferences',
  'goal',
  'academic_events',
  'inventory',
  'trade',
  'lifestyle',
  'complete',
];

/**
 * Required fields for each step to advance
 */
export const REQUIRED_FIELDS: Record<OnboardingStep, string[]> = {
  greeting: ['city'],
  currency_confirm: ['currency'],
  name: ['name'],
  studies: ['diploma', 'field'],
  skills: ['skills'],
  certifications: ['certifications'],
  budget: ['income', 'expenses'],
  income_timing: [], // optional - defaults to 15
  work_preferences: ['maxWorkHours', 'minHourlyRate'],
  goal: ['goalName', 'goalAmount', 'goalDeadline'],
  academic_events: [], // optional
  inventory: [], // optional
  trade: [], // optional
  lifestyle: [], // optional
  complete: [],
};
