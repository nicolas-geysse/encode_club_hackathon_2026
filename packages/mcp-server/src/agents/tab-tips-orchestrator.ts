/**
 * Tab Tips Orchestrator
 *
 * Tab-agnostic multi-agent orchestration using Strategy pattern.
 * Each tab provides its own strategy defining context, agents, validation, and prompts.
 *
 * Architecture:
 * - Stage 1: Load Context (DuckDB via Strategy)
 * - Stage 2: Parallel Agent Analysis (Primary + Secondary agents)
 * - Stage 3: Contextual Guardian Validation (rules from Strategy)
 * - Stage 4: LLM Tip Generation (prompt from Strategy)
 *
 * Features:
 * - Full Opik tracing with nested spans
 * - 4-level fallback system (full → partial → algorithms → static)
 * - Tab-specific validation rules
 * - Context caching support (for warmup)
 */

import {
  conditionalTrace,
  createSpan,
  getCurrentTraceId,
  getTraceUrl,
  type Span,
  type ConditionalTraceOptions,
  type SamplingContext,
} from '../services/opik.js';
import { chat, type ChatMessage } from '../services/groq.js';
import { detectEnergyDebt, type EnergyDebt } from '../algorithms/energy-debt.js';
import { detectComebackWindow, type ComebackWindow } from '../algorithms/comeback-detection.js';
import { validateRecommendation } from './guardian.js';
import { createLogger } from '../services/logger.js';
import type {
  TabType,
  TabContext,
  TabAgentStrategy,
  TabTipsInput,
  TabTipsOutput,
  ValidationResult,
} from './strategies/types.js';
import { createTabStrategy } from './strategies/factory.js';
import { mergeContext } from '../services/tab-context.js';
import { executeAgent } from './agent-executor.js';
import { getTabPromptMetadata } from './strategies/tab-prompts.js';
import {
  getExperimentAssignments,
  buildExperimentMetadata,
  getMergedExperimentConfig,
  type ExperimentAssignment,
} from '../services/experiments.js';

const logger = createLogger('TabTipsOrchestrator');

// ============================================================================
// Types
// ============================================================================

interface Stage1Result {
  context: TabContext;
  loadDurationMs: number;
}

interface Stage2Result {
  primaryAnalysis?: {
    agentId: string;
    recommendation: string;
    confidence: number;
    data?: Record<string, unknown>;
  };
  secondaryAnalyses: Array<{
    agentId: string;
    recommendation: string;
    confidence: number;
  }>;
}

interface Stage3Result extends ValidationResult {
  rulesApplied: string[];
}

interface TipGenerationContext {
  context: TabContext;
  strategy: TabAgentStrategy;
  stage2: Stage2Result;
  energyDebt: EnergyDebt;
  comeback: ComebackWindow | null;
  topPriority: string;
  /** A/B test: LLM temperature for creativity experiment */
  llmTemperature?: number;
}

// ============================================================================
// Fallback Tips (per category)
// ============================================================================

const FALLBACK_TIPS: Record<
  string,
  { title: string; message: string; category: TabTipsOutput['tip']['category'] }
> = {
  profile: {
    title: 'Complete your profile',
    message: 'Add your skills and info to get personalized tips.',
    category: 'opportunity',
  },
  goals: {
    title: 'Set a goal',
    message: 'Define a savings target to track your progress.',
    category: 'progress',
  },
  budget: {
    title: 'Track your budget',
    message: 'Knowing your margin helps you plan better.',
    category: 'opportunity',
  },
  trade: {
    title: 'List your items',
    message: 'Add items you could sell or exchange.',
    category: 'opportunity',
  },
  jobs: {
    title: 'Explore opportunities',
    message: 'Check job matches based on your skills.',
    category: 'opportunity',
  },
  swipe: {
    title: 'Swipe to discover',
    message: "Swipe right on strategies you like - we'll learn your preferences.",
    category: 'opportunity',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run a promise with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<{ result: T; timedOut: boolean }> {
  const timeoutPromise = new Promise<{ result: T; timedOut: true }>((resolve) => {
    setTimeout(() => resolve({ result: fallback, timedOut: true }), timeoutMs);
  });

  const resultPromise = promise.then((result) => ({ result, timedOut: false as const }));

  return Promise.race([resultPromise, timeoutPromise]);
}

/**
 * Determine top priority based on context analysis
 */
function determineTopPriority(
  context: TabContext,
  energyDebt: EnergyDebt,
  comeback: ComebackWindow | null
): string {
  if (energyDebt.detected && energyDebt.severity === 'high') {
    return 'energy_debt_critical';
  }
  if (comeback?.detected) {
    return 'comeback_opportunity';
  }
  if ((context.currentEnergy ?? 100) < 25) {
    return 'energy_critical';
  }

  // Tab-specific priorities
  switch (context.tabType) {
    case 'goals': {
      const goals = context.goals || [];
      const hasGoalAtRisk = goals.some((g) => g.status !== 'completed' && (g.progress ?? 0) < 20);
      if (hasGoalAtRisk) return 'goal_at_risk';
      const hasGoalCompleted = goals.some((g) => (g.progress ?? 0) >= 100);
      if (hasGoalCompleted) return 'celebration';
      break;
    }
    case 'budget': {
      if ((context.monthlyMargin ?? 0) < -100) return 'budget_critical';
      if ((context.monthlyMargin ?? 0) < 0) return 'budget_deficit';
      break;
    }
    case 'jobs': {
      const leads = context.jobs?.leads || [];
      const activeLeads = leads.filter((l) => l.status === 'active').length;
      if (activeLeads === 0) return 'no_active_leads';
      break;
    }
    case 'trade': {
      const inventory = context.trade?.inventory || [];
      if (inventory.length === 0) return 'empty_inventory';
      break;
    }
    case 'profile': {
      const skills = context.profile?.skills || [];
      if (skills.length === 0) return 'profile_incomplete';
      break;
    }
    case 'swipe': {
      const scenariosCount = context.swipe?.scenariosCount ?? 0;
      if (scenariosCount === 0) return 'no_scenarios';
      break;
    }
  }

  return 'general_advice';
}

// ============================================================================
// Stage 1: Load Context
// ============================================================================

async function runStage1(
  strategy: TabAgentStrategy,
  input: TabTipsInput,
  _span: Span
): Promise<Stage1Result> {
  return createSpan(
    'stage1.load_context',
    async (contextSpan) => {
      const startTime = Date.now();

      contextSpan.setInput({
        profileId: input.profileId,
        tabType: input.tabType,
        hasApiContext: !!input.contextData,
      });

      // Load context from DB via strategy
      const dbContext = await strategy.loadContext(input.profileId);

      // Merge with API-provided context (API takes precedence)
      const context = input.contextData ? mergeContext(dbContext, input.contextData) : dbContext;

      const loadDurationMs = Date.now() - startTime;

      contextSpan.setOutput({
        hasProfile: !!context.profile,
        contextKeys: Object.keys(context).filter(
          (k) => context[k as keyof TabContext] !== undefined
        ),
        loadDurationMs,
      });

      return { context, loadDurationMs };
    },
    { tags: ['context', 'duckdb'] }
  );
}

// ============================================================================
// Stage 2: Parallel Agent Analysis
// ============================================================================

interface Stage2Options {
  /** A/B test: Skip secondary agents for speed */
  skipSecondary?: boolean;
}

async function runStage2(
  strategy: TabAgentStrategy,
  context: TabContext,
  _span: Span,
  options: Stage2Options = {}
): Promise<Stage2Result> {
  return createSpan(
    'stage2.agent_analysis',
    async (analysisSpan) => {
      const primaryAgentId = strategy.getPrimaryAgentId();
      // A/B test: agent-count experiment can skip secondary agents
      const secondaryAgentIds = options.skipSecondary ? [] : strategy.getSecondaryAgentIds();

      analysisSpan.setInput({
        primaryAgent: primaryAgentId,
        secondaryAgents: secondaryAgentIds,
        skipSecondary: options.skipSecondary || false,
      });

      const result: Stage2Result = {
        secondaryAnalyses: [],
      };

      // Execute PRIMARY agent with real tools
      result.primaryAnalysis = await createSpan(
        `agent.${primaryAgentId}`,
        async (agentSpan) => {
          agentSpan.setInput({
            agentId: primaryAgentId,
            tabType: context.tabType,
          });

          // Execute the actual agent via agent-executor
          const analysis = await executeAgent(primaryAgentId, context);

          agentSpan.setOutput({
            recommendation: analysis.recommendation.substring(0, 100),
            confidence: analysis.confidence,
            hasData: !!analysis.data,
          });

          return analysis;
        },
        { tags: [primaryAgentId, 'primary-agent'] }
      );

      // Execute SECONDARY agents in parallel with real tools
      if (secondaryAgentIds.length > 0) {
        const secondaryPromises = secondaryAgentIds.map((agentId) =>
          createSpan(
            `agent.${agentId}`,
            async (agentSpan) => {
              agentSpan.setInput({
                agentId,
                tabType: context.tabType,
              });

              // Execute the actual agent via agent-executor
              const analysis = await executeAgent(agentId, context);

              agentSpan.setOutput({
                recommendation: analysis.recommendation.substring(0, 100),
                confidence: analysis.confidence,
              });

              return analysis;
            },
            { tags: [agentId, 'secondary-agent'] }
          )
        );

        result.secondaryAnalyses = await Promise.all(secondaryPromises);
      }

      analysisSpan.setOutput({
        primaryConfidence: result.primaryAnalysis?.confidence,
        secondaryCount: result.secondaryAnalyses.length,
        totalConfidence:
          (result.primaryAnalysis?.confidence || 0) +
          result.secondaryAnalyses.reduce((sum, a) => sum + (a.confidence || 0), 0),
      });

      return result;
    },
    { tags: ['agents', 'parallel'] }
  );
}

// ============================================================================
// Stage 3: Contextual Guardian Validation
// ============================================================================

async function runStage3(
  strategy: TabAgentStrategy,
  context: TabContext,
  recommendation: string,
  _span: Span
): Promise<Stage3Result> {
  return createSpan(
    'stage3.guardian_validation',
    async (guardSpan) => {
      const rules = strategy.getValidationRules();

      guardSpan.setInput({
        tabType: rules.tabType,
        checkFeasibility: rules.checkFeasibility,
        checkSolvency: rules.checkSolvency,
        checkRealism: rules.checkRealism,
        checkTimeline: rules.checkTimeline,
        minConfidence: rules.minConfidence,
        maxRiskLevel: rules.maxRiskLevel,
      });

      const rulesApplied: string[] = [];

      // Apply contextual validation rules
      const issues: string[] = [];
      let passed = true;
      let confidence = 0.8;

      // Feasibility check (Jobs tab: time, skills, energy)
      if (rules.checkFeasibility) {
        rulesApplied.push('feasibility');
        const energy = context.currentEnergy ?? 100;
        const maxHours = context.profile?.maxWorkHoursWeekly ?? 40;

        if (energy < 30) {
          issues.push('Energy too low for high-effort tasks');
          confidence -= 0.2;
        }
        if (maxHours < 5) {
          issues.push('Very limited hours available');
          confidence -= 0.1;
        }
      }

      // Solvency check (Budget tab: no risky advice if deficit)
      if (rules.checkSolvency) {
        rulesApplied.push('solvency');
        const margin = context.monthlyMargin ?? 0;

        if (margin < -100) {
          // Critical deficit - block risky recommendations
          if (
            recommendation.toLowerCase().includes('invest') ||
            recommendation.toLowerCase().includes('crypto')
          ) {
            issues.push('Cannot recommend investments when in deficit');
            passed = false;
          }
          confidence -= 0.2;
        }
      }

      // Realism check (Trade tab: valuations are realistic)
      if (rules.checkRealism) {
        rulesApplied.push('realism');
        const inventory = context.trade?.inventory || [];
        const hasUnrealisticValue = inventory.some((item) => (item.estimatedValue ?? 0) > 10000);

        if (hasUnrealisticValue) {
          issues.push('Some item valuations may be unrealistic');
          confidence -= 0.15;
        }
      }

      // Timeline check (Goals tab: feasibility with current margin)
      if (rules.checkTimeline) {
        rulesApplied.push('timeline');
        const goals = context.goals || [];
        const margin = context.monthlyMargin ?? 0;

        for (const goal of goals) {
          if (goal.deadline && margin > 0) {
            const monthsRemaining = Math.max(
              1,
              Math.ceil(
                (new Date(goal.deadline).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)
              )
            );
            const remaining = goal.amount - (goal.amount * (goal.progress ?? 0)) / 100;
            const requiredMonthly = remaining / monthsRemaining;

            if (requiredMonthly > margin * 1.5) {
              issues.push(`Goal "${goal.name}" may be at risk with current margin`);
              confidence -= 0.1;
            }
          }
        }
      }

      // General risk check via Guardian
      const guardianResult = await validateRecommendation(
        { text: recommendation },
        {
          financialSituation:
            (context.monthlyMargin ?? 0) < -100
              ? 'deficit'
              : (context.monthlyMargin ?? 0) < 0
                ? 'serre'
                : 'equilibre',
        }
      );

      issues.push(...guardianResult.issues);
      if (!guardianResult.passed) {
        passed = false;
      }

      // Check against min confidence threshold
      if (confidence < rules.minConfidence) {
        passed = false;
        issues.push(
          `Confidence ${Math.round(confidence * 100)}% below threshold ${Math.round(rules.minConfidence * 100)}%`
        );
      }

      guardSpan.setOutput({
        passed,
        confidence,
        issuesCount: issues.length,
        rulesApplied,
      });

      return {
        passed,
        confidence: Math.max(0, Math.min(1, confidence)),
        issues,
        suggestions: guardianResult.suggestions,
        rulesApplied,
      };
    },
    { tags: ['guardian', 'validation'], type: 'guardrail' }
  );
}

// ============================================================================
// Stage 4: LLM Tip Generation
// ============================================================================

async function runStage4(
  tipContext: TipGenerationContext,
  _span: Span
): Promise<TabTipsOutput['tip']> {
  return createSpan(
    'stage4.llm_generation',
    async (llmSpan) => {
      const { context, strategy, stage2, energyDebt, comeback, topPriority, llmTemperature } =
        tipContext;

      llmSpan.setInput({
        tabType: context.tabType,
        topPriority,
        hasAgentAnalysis: !!stage2.primaryAnalysis,
        llmTemperature: llmTemperature || 0.5,
      });

      // Build context for LLM using strategy's format
      const formattedContext = strategy.formatContextForPrompt(context);

      // Get system prompt from strategy
      const systemPrompt = strategy.getSystemPrompt();

      // Add common context
      const contextParts: string[] = [formattedContext];

      if (energyDebt.detected) {
        contextParts.push(
          `\nAlerte Energy Debt: ${energyDebt.consecutiveLowWeeks} semaines d'énergie basse (sévérité: ${energyDebt.severity})`
        );
      }

      if (comeback?.detected) {
        contextParts.push(
          `\nComeback Mode: énergie remontée à ${context.currentEnergy}% (confiance: ${Math.round(comeback.confidenceScore * 100)}%)`
        );
      }

      if (stage2.primaryAnalysis?.recommendation) {
        contextParts.push(
          `\nAnalyse agent principal (${stage2.primaryAnalysis.agentId}): ${stage2.primaryAnalysis.recommendation}`
        );
      }

      const userPrompt = `Contexte de l'étudiant:\n${contextParts.join('\n')}\n\nPriorité principale: ${topPriority}\n\nGénère UN conseil court et actionnable. Réponds en JSON: { "title": "...", "message": "...", "category": "energy|progress|mission|opportunity|warning|celebration" }`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      try {
        const response = await chat(messages, {
          temperature: llmTemperature || 0.5, // A/B test: llm-temperature experiment
          maxTokens: 256,
          tags: ['ai', 'bruno', 'tips', context.tabType],
          metadata: {
            source: 'tab_tips_orchestrator',
            tabType: context.tabType,
            topPriority,
            'experiment.llmTemperature': llmTemperature || 0.5,
          },
        });

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          llmSpan.setOutput({
            title: parsed.title,
            category: parsed.category,
            generated: true,
          });

          return {
            title: parsed.title || 'Conseil',
            message: parsed.message || strategy.getFallbackMessage(),
            category: parsed.category || 'opportunity',
            action: parsed.action,
          };
        }
      } catch (error) {
        llmSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        logger.warn('LLM tip generation failed', { error, tabType: context.tabType });
      }

      // Fallback to strategy's fallback message
      llmSpan.setOutput({ generated: false, usedFallback: true });

      return {
        title: 'Conseil Bruno',
        message: strategy.getFallbackMessage(),
        category: 'opportunity',
      };
    },
    { tags: ['llm', 'generation'] }
  );
}

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Generate tips for a specific tab using strategy pattern
 *
 * Fallback levels:
 * - Level 0: Full orchestration (context + agents + guardian + LLM)
 * - Level 1: Partial (context + LLM, no agents)
 * - Level 2: Algorithms only (energy debt, comeback detection)
 * - Level 3: Static tip from fallbacks
 *
 * Sampling:
 * - 100% on errors or fallback > 0
 * - 100% on user feedback
 * - 100% for new users (< 7 days)
 * - 10% random for successful level-0 traces
 */
export async function orchestrateTabTips(input: TabTipsInput): Promise<TabTipsOutput> {
  const startTime = Date.now();
  const enableFull = input.options?.enableFullOrchestration !== false;
  const timeoutMs = input.options?.timeoutMs || 5000;

  // Get strategy for this tab
  const strategy = createTabStrategy(input.tabType);

  // === A/B Testing: Get experiment assignments ===
  const experimentAssignments = getExperimentAssignments(
    input.profileId,
    input.options?.experimentIds
  );
  const experimentConfig = getMergedExperimentConfig(input.profileId);
  const experimentMetadata = buildExperimentMetadata(input.profileId, input.options?.experimentIds);

  // Extract experiment-controlled settings
  const skipSecondaryAgents = experimentConfig.skipSecondary === true;
  const llmTemperature = (experimentConfig.temperature as number) || 0.5;
  const guardianMinConfidence = (experimentConfig.minConfidence as number) || 0.7;

  logger.debug('Experiment assignments', {
    profileId: input.profileId.substring(0, 8) + '...',
    experiments: experimentAssignments.map((a) => `${a.experimentId}:${a.variant}`),
    config: { skipSecondaryAgents, llmTemperature, guardianMinConfidence },
  });

  // Build sampling context for conditional tracing
  const samplingContext: SamplingContext = {
    profileId: input.profileId,
    tabType: input.tabType,
    experimentIds: experimentAssignments.map((a) => a.experimentId),
    // These will be checked post-trace for upgrade:
    // - hasKnownError (we don't know yet)
    // - estimatedFallbackLevel (we don't know yet)
    // profileCreatedAt can be passed via contextData.profileCreatedAt
    profileCreatedAt: (input.contextData as { profileCreatedAt?: string } | undefined)
      ?.profileCreatedAt,
  };

  // Get prompt metadata for versioning
  const promptMeta = getTabPromptMetadata(input.tabType);

  const traceOptions: ConditionalTraceOptions = {
    tags: ['ai', 'bruno', 'tips', input.tabType],
    metadata: {
      providers: ['groq'],
      source: 'tab_tips_orchestrator',
      tabType: input.tabType,
      // Prompt versioning for regression detection
      ...(promptMeta && {
        'prompt.name': promptMeta.name,
        'prompt.version': promptMeta.version,
        'prompt.hash': promptMeta.hash,
      }),
      // A/B experiment metadata for analysis
      ...experimentMetadata,
    },
    input: {
      profileId: input.profileId,
      tabType: input.tabType,
      enableFullOrchestration: enableFull,
      experiments: experimentAssignments.map((a) => `${a.experimentId}:${a.variant}`),
    },
    sampling: samplingContext,
  };

  const traceResult = await conditionalTrace(
    `tips.orchestrator.${input.tabType}`,
    async (rootSpan) => {
      const agentsUsed: string[] = [];
      let fallbackLevel: 0 | 1 | 2 | 3 = 0;
      let orchestrationType: TabTipsOutput['processingInfo']['orchestrationType'] = 'full';

      try {
        // === Stage 1: Load Context ===
        const stage1Result = await withTimeout(
          runStage1(strategy, input, rootSpan),
          Math.min(timeoutMs * 0.3, 1500),
          { context: { profileId: input.profileId, tabType: input.tabType }, loadDurationMs: 0 }
        );

        if (stage1Result.timedOut) {
          logger.warn('Context loading timed out', { tabType: input.tabType });
        }

        const { context } = stage1Result.result;

        // === Energy Analysis (always runs) ===
        const energyHistory = context.energyHistory || [];
        const energyEntries = energyHistory.map((level, i) => ({
          week: i + 1,
          level,
          date: new Date(
            Date.now() - (energyHistory.length - i) * 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        }));

        const energyDebt = await createSpan(
          'analysis.energy_debt',
          async (span) => {
            const result = detectEnergyDebt(energyEntries);
            span.setOutput({
              detected: result.detected,
              severity: result.severity,
              weeks: result.consecutiveLowWeeks,
            });
            return result;
          },
          { input: { historyLength: energyHistory.length } }
        );

        const comeback = await createSpan(
          'analysis.comeback',
          async (span) => {
            const result = detectComebackWindow(energyHistory, 0);
            span.setOutput({
              detected: result?.detected || false,
              confidence: result?.confidenceScore || 0,
            });
            return result;
          },
          {}
        );

        const topPriority = determineTopPriority(context, energyDebt, comeback);

        // === Stage 2: Agent Analysis (if full orchestration) ===
        let stage2: Stage2Result = { secondaryAnalyses: [] };

        if (enableFull) {
          // A/B Test: agent-count experiment can skip secondary agents
          const stage2Result = await withTimeout(
            runStage2(strategy, context, rootSpan, { skipSecondary: skipSecondaryAgents }),
            Math.min(timeoutMs * 0.4, 2000),
            { secondaryAnalyses: [] }
          );

          if (stage2Result.timedOut) {
            fallbackLevel = 1;
            orchestrationType = 'partial';
            rootSpan.setAttributes({ 'stage2.timeout': true });
          } else {
            stage2 = stage2Result.result;
            agentsUsed.push(strategy.getPrimaryAgentId());
            if (!skipSecondaryAgents) {
              agentsUsed.push(...strategy.getSecondaryAgentIds());
            }
          }
        } else {
          fallbackLevel = 2;
          orchestrationType = 'algorithms';
        }

        // === Stage 3: Guardian Validation ===
        let validation: Stage3Result = {
          passed: true,
          confidence: 0.5,
          issues: [],
          rulesApplied: [],
        };

        if (fallbackLevel < 2) {
          const recommendationText =
            stage2.primaryAnalysis?.recommendation || strategy.getFallbackMessage();

          const validationResult = await withTimeout(
            runStage3(strategy, context, recommendationText, rootSpan),
            Math.min(timeoutMs * 0.2, 1000),
            { passed: true, confidence: 0.5, issues: [], rulesApplied: [] }
          );

          if (!validationResult.timedOut) {
            validation = validationResult.result;
            agentsUsed.push('guardian');
          }
        }

        // === Stage 4: Generate Tip ===
        let tip: TabTipsOutput['tip'];

        if (fallbackLevel < 3 && validation.passed) {
          const tipContext: TipGenerationContext = {
            context,
            strategy,
            stage2,
            energyDebt,
            comeback,
            topPriority,
            llmTemperature, // A/B test: llm-temperature experiment
          };

          tip = await runStage4(tipContext, rootSpan);
        } else {
          fallbackLevel = 3;
          orchestrationType = 'static';
          const fallbackTip = FALLBACK_TIPS[input.tabType] || FALLBACK_TIPS.profile;
          tip = { ...fallbackTip };
        }

        const durationMs = Date.now() - startTime;

        rootSpan.setOutput({
          tip: { title: tip.title, category: tip.category },
          fallbackLevel,
          orchestrationType,
          agentsUsed,
          durationMs,
        });

        // Build agent recommendations for insights
        const agentRecommendations: TabTipsOutput['insights']['agentRecommendations'] = [];
        if (stage2.primaryAnalysis) {
          agentRecommendations.push({
            agentId: stage2.primaryAnalysis.agentId,
            recommendation: stage2.primaryAnalysis.recommendation,
            confidence: stage2.primaryAnalysis.confidence,
          });
        }
        for (const secondary of stage2.secondaryAnalyses) {
          agentRecommendations.push({
            agentId: secondary.agentId,
            recommendation: secondary.recommendation,
            confidence: secondary.confidence,
          });
        }

        return {
          tip,
          insights: {
            tabSpecific: {
              topPriority,
              energyDebt: {
                detected: energyDebt.detected,
                severity: energyDebt.severity,
                weeks: energyDebt.consecutiveLowWeeks,
              },
              comeback: {
                detected: comeback?.detected || false,
                confidence: comeback?.confidenceScore || 0,
              },
              validationRulesApplied: validation.rulesApplied,
            },
            agentRecommendations:
              agentRecommendations.length > 0 ? agentRecommendations : undefined,
          },
          processingInfo: {
            agentsUsed,
            fallbackLevel,
            durationMs,
            orchestrationType,
            cached: false,
          },
          traceId: getCurrentTraceId() || '',
          traceUrl: getTraceUrl(getCurrentTraceId() || ''),
        };
      } catch (error) {
        rootSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        logger.error('Tab tips orchestration failed', { tabType: input.tabType, error });

        // Level 3 fallback
        const fallbackTip = FALLBACK_TIPS[input.tabType] || FALLBACK_TIPS.profile;

        return {
          tip: { ...fallbackTip },
          insights: {
            tabSpecific: { topPriority: 'fallback', error: true },
          },
          processingInfo: {
            agentsUsed: [],
            fallbackLevel: 3 as const,
            durationMs: Date.now() - startTime,
            orchestrationType: 'static' as const,
            cached: false,
          },
          traceId: getCurrentTraceId() || '',
          traceUrl: getTraceUrl(getCurrentTraceId() || ''),
        };
      }
    },
    traceOptions
  );

  // Add sampling info to processing metadata
  const output: TabTipsOutput = traceResult.result;
  if (!traceResult.sampled) {
    // If not sampled, update processingInfo
    output.processingInfo = {
      ...output.processingInfo,
      sampled: false,
      samplingReason: traceResult.samplingDecision.reason,
    } as TabTipsOutput['processingInfo'] & { sampled: boolean; samplingReason: string };
  }

  return output;
}

/**
 * Warmup tips for multiple tabs (pre-fetch on login)
 */
export async function warmupTabTips(
  profileId: string,
  tabTypes: TabType[] = ['goals', 'budget', 'jobs']
): Promise<Map<TabType, TabTipsOutput>> {
  logger.info('Warming up tips', { profileId, tabTypes });

  const results = new Map<TabType, TabTipsOutput>();

  // Run in parallel with short timeout
  const promises = tabTypes.map(async (tabType) => {
    try {
      const result = await orchestrateTabTips({
        profileId,
        tabType,
        options: {
          enableFullOrchestration: false, // Partial for warmup
          timeoutMs: 2000,
        },
      });
      results.set(tabType, result);
    } catch (error) {
      logger.warn('Warmup failed for tab', { tabType, error });
    }
  });

  await Promise.all(promises);

  logger.info('Warmup complete', { profileId, tabsWarmed: results.size });

  return results;
}

/**
 * Prefetch tips for predicted next tabs (fire-and-forget)
 *
 * Call this after a tip is generated to prefetch likely next tabs.
 * Non-blocking - errors are swallowed.
 */
export function prefetchNextTabs(
  currentTab: TabType,
  profileId: string,
  cachedTabs: Set<TabType> = new Set()
): void {
  // Tab prediction map
  const TAB_PREDICTION: Record<TabType, TabType[]> = {
    profile: ['goals', 'jobs'],
    goals: ['budget', 'swipe'],
    budget: ['jobs', 'trade'],
    trade: ['budget'],
    jobs: ['swipe', 'budget'],
    swipe: ['goals', 'jobs'],
  };

  const predictedTabs = TAB_PREDICTION[currentTab] || [];
  const tabsToFetch = predictedTabs.filter((tab) => !cachedTabs.has(tab));

  if (tabsToFetch.length === 0) {
    logger.debug('No tabs to prefetch', { currentTab, profileId });
    return;
  }

  logger.debug('Prefetching tabs', { currentTab, profileId, tabs: tabsToFetch });

  // Fire-and-forget: run in background without blocking
  tabsToFetch.forEach((tabType) => {
    orchestrateTabTips({
      profileId,
      tabType,
      options: {
        enableFullOrchestration: false, // Partial for prefetch (faster)
        timeoutMs: 3000,
      },
    }).catch((error) => {
      logger.debug('Prefetch failed (expected)', { tabType, error: error?.message });
    });
  });
}

/**
 * Get tab prediction for a given tab
 */
export function getTabPrediction(currentTab: TabType): TabType[] {
  const TAB_PREDICTION: Record<TabType, TabType[]> = {
    profile: ['goals', 'jobs'],
    goals: ['budget', 'swipe'],
    budget: ['jobs', 'trade'],
    trade: ['budget'],
    jobs: ['swipe', 'budget'],
    swipe: ['goals', 'jobs'],
  };

  return TAB_PREDICTION[currentTab] || [];
}

export default {
  orchestrateTabTips,
  warmupTabTips,
  prefetchNextTabs,
  getTabPrediction,
};
