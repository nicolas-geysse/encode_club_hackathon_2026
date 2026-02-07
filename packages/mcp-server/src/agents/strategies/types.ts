/**
 * Tab Agent Strategy Types
 *
 * Defines the interface for tab-specific agent strategies.
 * Each tab implements this interface to provide:
 * - Context loading (from DuckDB)
 * - Agent selection (primary + secondary)
 * - Validation rules (contextual Guardian)
 * - System prompts
 */

// Tab types supported by the system
export type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

// Context data structure per tab
export interface TabContext {
  profileId: string;
  tabType: TabType;

  // Common fields
  currentEnergy?: number;
  energyHistory?: number[];
  monthlyMargin?: number;

  // Profile-specific
  profile?: {
    name?: string;
    diploma?: string;
    field?: string;
    city?: string;
    skills?: string[];
    certifications?: string[];
    maxWorkHoursWeekly?: number;
    minHourlyRate?: number;
  };

  // Goals-specific
  goalAchieved?: boolean;
  goals?: Array<{
    id: string;
    name: string;
    amount: number;
    deadline?: string;
    progress?: number;
    status?: string;
  }>;

  // Budget-specific
  budget?: {
    monthlyIncome?: number;
    monthlyExpenses?: number;
    expenses?: Array<{ category: string; amount: number }>;
  };

  // Trade-specific
  trade?: {
    inventory?: Array<{ name: string; estimatedValue?: number }>;
    trades?: Array<{ type: string; name: string; value?: number; status: string }>;
  };

  // Jobs-specific
  jobs?: {
    skills?: Array<{
      name: string;
      hourlyRate?: number;
      arbitrageScore?: number;
      marketDemand?: number;
    }>;
    leads?: Array<{ id: string; status: string; title?: string }>;
    city?: string;
    // Skill-to-job graph matches (from DuckPGQ or SQL fallback)
    skillJobGraph?: Array<{
      skill: string;
      jobTitle: string;
      hourlyRate: number;
      relevanceScore: number;
      platform?: string;
    }>;
  };

  // Swipe-specific
  swipe?: {
    preferences?: {
      effort_sensitivity?: number;
      hourly_rate_priority?: number;
      time_flexibility?: number;
    };
    scenariosCount?: number;
    recentSwipes?: Array<{ direction: 'left' | 'right'; scenarioType: string }>;
  };
}

// Validation result from Guardian
export interface ValidationResult {
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestions?: string[];
}

// Validation rules per tab
export interface ValidationRules {
  tabType: TabType;
  checkFeasibility: boolean; // Jobs: time, skills, energy
  checkSolvency: boolean; // Budget: no risky advice if deficit
  checkRealism: boolean; // Trade: valuations are realistic
  checkTimeline: boolean; // Goals: feasibility with current margin
  minConfidence: number; // Minimum confidence to pass
  maxRiskLevel: 'low' | 'medium' | 'high';
}

// Agent configuration for a tab
export interface TabAgentConfig {
  primaryAgent: string; // Agent ID (e.g., 'budget-coach')
  secondaryAgents: string[]; // Additional agents to consult
  systemPrompt: string; // Tab-specific system prompt for LLM
  fallbackMessage: string; // Static message if all agents fail
}

// Main strategy interface
export interface TabAgentStrategy {
  readonly tabType: TabType;

  /**
   * Load context data from DuckDB for this tab
   */
  loadContext(profileId: string): Promise<TabContext>;

  /**
   * Get the primary agent for this tab
   */
  getPrimaryAgentId(): string;

  /**
   * Get secondary agents to consult
   */
  getSecondaryAgentIds(): string[];

  /**
   * Get validation rules for Guardian
   */
  getValidationRules(): ValidationRules;

  /**
   * Get the system prompt for LLM tip generation
   */
  getSystemPrompt(): string;

  /**
   * Get fallback message if all agents fail
   */
  getFallbackMessage(): string;

  /**
   * Format context for LLM prompt
   */
  formatContextForPrompt(context: TabContext): string;
}

// Factory function type
export type TabStrategyFactory = (tabType: TabType) => TabAgentStrategy;

// Orchestration input (what the API receives)
export interface TabTipsInput {
  tabType: TabType;
  profileId: string;
  contextData?: Partial<TabContext>;
  options?: {
    enableFullOrchestration?: boolean;
    timeoutMs?: number;
    experimentIds?: string[];
  };
}

// Orchestration output (what the API returns)
export interface TabTipsOutput {
  tip: {
    title: string;
    message: string;
    category: 'energy' | 'progress' | 'mission' | 'opportunity' | 'warning' | 'celebration';
    action?: { label: string; href: string };
  };
  insights: {
    tabSpecific: Record<string, unknown>;
    agentRecommendations?: Array<{
      agentId: string;
      recommendation: string;
      confidence: number;
    }>;
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'partial' | 'algorithms' | 'static';
    cached: boolean;
    cacheKey?: string;
  };
  traceId: string;
  traceUrl: string;
}
