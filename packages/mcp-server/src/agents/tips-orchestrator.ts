/**
 * Tips Orchestrator Agent
 *
 * Multi-agent orchestration system for generating AI-powered tips.
 * Coordinates 4 agents: Budget Coach, Job Matcher, Strategy Comparator, Guardian
 *
 * Architecture:
 * - Stage 1: Parallel Analysis (Budget Coach + Job Matcher + Local Search)
 * - Stage 2: Strategy Comparison
 * - Stage 3: Validation (Guardian)
 * - Stage 4: Tip Generation (LLM)
 *
 * Features:
 * - Full Opik tracing with nested spans per agent
 * - 4-level fallback system (full → single agent → algorithms → static)
 * - Location-aware recommendations when coordinates available
 */

import { trace, createSpan, getCurrentTraceId, getTraceUrl, type Span } from '../services/opik.js';
import { chat, type ChatMessage } from '../services/groq.js';
import { detectEnergyDebt, type EnergyDebt } from '../algorithms/energy-debt.js';
import { detectComebackWindow, type ComebackWindow } from '../algorithms/comeback-detection.js';
import {
  compareStrategies,
  createStrategyFromJob,
  createStrategyFromOptimization,
  type Strategy,
} from './strategy-comparator.js';
import { validateRecommendation } from './guardian.js';
import {
  rankSkills,
  type ArbitrageWeights,
  type Skill,
  SKILL_TEMPLATES,
} from '../algorithms/skill-arbitrage.js';
import {
  getRAGContext,
  formatRAGContextForPrompt,
  indexAdvice,
  type RAGContext,
} from '../tools/rag.js';

// Type alias for algorithm results
type EnergyDebtResult = EnergyDebt;
type ComebackResult = ComebackWindow;

// ============================================================================
// Types
// ============================================================================

export interface TipsOrchestratorInput {
  profileId: string;
  currentEnergy: number;
  energyHistory: number[];
  goalProgress: number;
  activeMissions: {
    id: string;
    title: string;
    category: string;
    weeklyHours: number;
    weeklyEarnings: number;
    progress?: number;
  }[];
  goalAmount?: number;
  currentAmount?: number;
  weeklyTarget?: number;
  // Location data (optional)
  location?: {
    city: string;
    coordinates?: { lat: number; lng: number };
    currency: 'USD' | 'EUR' | 'GBP';
    region?: 'france' | 'uk' | 'us' | 'europe';
  };
  // Profile data
  skills?: string[];
  monthlyMargin?: number;
  hoursAvailable?: number;
  // Orchestration options
  enableFullOrchestration?: boolean;
  timeoutMs?: number;
}

export interface AgentRecommendation {
  budgetCoach?: {
    advice: string[];
    topOptimization?: {
      solution: string;
      potentialSavings: number;
    };
    budgetStatus: 'positive' | 'deficit';
    severity: 'critical' | 'warning' | 'tight' | 'comfortable';
  };
  jobMatcher?: {
    topMatch?: {
      name: string;
      hourlyRate: number;
      arbitrageScore: number;
      platform: string;
    };
    matchesCount: number;
    energyAdjusted: boolean;
  };
  strategyComparator?: {
    bestStrategy: string;
    bestQuickWin: string;
    bestLongTerm: string;
    recommendation: string;
  };
}

export interface LocalOpportunity {
  jobs: { title: string; company: string; distance?: string }[];
  regionalTips: string[];
  nearbyPlaces?: { name: string; type: string; distance?: string }[];
}

export interface TipsOrchestratorOutput {
  tip: {
    title: string;
    message: string;
    category: 'energy' | 'progress' | 'mission' | 'opportunity' | 'warning' | 'celebration';
    action?: { label: string; href: string };
  };
  insights: {
    energyDebt: {
      detected: boolean;
      severity: string | null;
      weeks: number;
      targetReduction?: number;
    };
    comeback: {
      detected: boolean;
      confidence: number;
    };
    topPriority: string;
    agentRecommendations?: AgentRecommendation;
    localOpportunities?: LocalOpportunity;
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'single' | 'algorithms' | 'static';
  };
  traceId: string;
  traceUrl: string;
}

// ============================================================================
// Regional Tips Database
// ============================================================================

const REGIONAL_HINTS: Record<string, string[]> = {
  france: [
    'Check your CAF eligibility for housing assistance',
    'CROUS student jobs available on campus',
    'Student health insurance (CPAM) is free',
    'SNCF youth card for 30% off train tickets',
  ],
  uk: [
    'Student Ambassador programs at your university',
    'NHS volunteering opportunities',
    'Railcard for 1/3 off train fares',
    'Check council tax exemption status',
  ],
  us: [
    'Work-study programs on campus',
    'Federal student employment opportunities',
    'FAFSA grants and aid',
    'Campus dining jobs with free meals',
  ],
  europe: [
    'Erasmus+ grants for study abroad',
    'European Youth Card discounts',
    'Check local student associations for opportunities',
  ],
};

// ============================================================================
// Fallback Tip Templates
// ============================================================================

const STATIC_TIPS = [
  {
    title: 'Keep going!',
    message: 'Every step counts toward your goal. Stay consistent!',
    category: 'opportunity' as const,
    action: { label: 'Explore', href: '/plan?tab=swipe' },
  },
  {
    title: 'Track your progress',
    message: 'Regular check-ins help you stay on track.',
    category: 'progress' as const,
    action: { label: 'View dashboard', href: '/suivi' },
  },
  {
    title: 'Optimize your budget',
    message: 'Small savings add up. Review your expenses.',
    category: 'opportunity' as const,
    action: { label: 'Review budget', href: '/plan?tab=lifestyle' },
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run a function with timeout
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
 * Determine top priority based on analysis
 */
function determineTopPriority(
  energyDebt: EnergyDebtResult,
  comeback: ComebackResult | null,
  currentEnergy: number,
  goalProgress: number,
  goalAmount?: number
): string {
  if (energyDebt.detected && energyDebt.severity === 'high') {
    return 'energy_debt_critical';
  }
  if (comeback?.detected) {
    return 'comeback_opportunity';
  }
  if (currentEnergy < 25) {
    return 'energy_critical';
  }
  if (goalProgress < 15 && goalAmount && goalAmount > 0) {
    return 'goal_at_risk';
  }
  if (goalProgress >= 80) {
    return 'celebration';
  }
  return 'general_advice';
}

// ============================================================================
// Stage 1: Parallel Analysis
// ============================================================================

interface Stage1Result {
  budgetAnalysis?: {
    margin: number;
    status: 'positive' | 'deficit';
    severity: 'critical' | 'warning' | 'tight' | 'comfortable';
    optimizations: Array<{
      solution: string;
      potentialSavings: number;
      expense: string;
      effort: string;
    }>;
  };
  jobMatches?: {
    matches: Array<{
      id: string;
      name: string;
      hourlyRate: number;
      combinedScore: number;
      arbitrageScore: number;
      platform: string;
      effortLevel: string;
    }>;
    energyAdjusted: boolean;
  };
}

// Budget optimization templates
const OPTIMIZATION_TEMPLATES = [
  {
    expense: 'rent',
    solution: 'Consider a roommate or shared housing',
    potentialSavings: 200,
    effort: 'high',
  },
  {
    expense: 'food',
    solution: 'Meal prep and cook at home more',
    potentialSavings: 80,
    effort: 'medium',
  },
  {
    expense: 'transport',
    solution: 'Use student discounts and bike when possible',
    potentialSavings: 30,
    effort: 'low',
  },
  {
    expense: 'phone',
    solution: 'Switch to a student mobile plan',
    potentialSavings: 15,
    effort: 'low',
  },
  {
    expense: 'subscriptions',
    solution: 'Share streaming accounts or use student discounts',
    potentialSavings: 25,
    effort: 'low',
  },
];

// Job templates for matching
const JOB_TEMPLATES = [
  {
    id: 'tutoring',
    name: 'Tutoring',
    hourlyRate: 25,
    platform: 'Superprof',
    effortLevel: 'medium',
    flexibility: 0.9,
  },
  {
    id: 'freelance_dev',
    name: 'Freelance Development',
    hourlyRate: 35,
    platform: 'Upwork',
    effortLevel: 'high',
    flexibility: 0.8,
  },
  {
    id: 'content_writing',
    name: 'Content Writing',
    hourlyRate: 20,
    platform: 'Fiverr',
    effortLevel: 'medium',
    flexibility: 0.9,
  },
  {
    id: 'social_media',
    name: 'Social Media Management',
    hourlyRate: 18,
    platform: 'Indeed',
    effortLevel: 'low',
    flexibility: 0.7,
  },
  {
    id: 'data_entry',
    name: 'Data Entry',
    hourlyRate: 15,
    platform: 'FlexJobs',
    effortLevel: 'low',
    flexibility: 0.8,
  },
  {
    id: 'delivery',
    name: 'Food Delivery',
    hourlyRate: 12,
    platform: 'UberEats',
    effortLevel: 'medium',
    flexibility: 1.0,
  },
  {
    id: 'retail',
    name: 'Part-time Retail',
    hourlyRate: 12,
    platform: 'Indeed',
    effortLevel: 'medium',
    flexibility: 0.5,
  },
];

/**
 * Analyze budget and generate optimizations
 */
function analyzeBudget(monthlyMargin: number): Stage1Result['budgetAnalysis'] {
  const status = monthlyMargin >= 0 ? 'positive' : 'deficit';
  const severity: 'critical' | 'warning' | 'tight' | 'comfortable' =
    monthlyMargin < -100
      ? 'critical'
      : monthlyMargin < 0
        ? 'warning'
        : monthlyMargin < 50
          ? 'tight'
          : 'comfortable';

  // Select relevant optimizations based on budget status
  const optimizations = OPTIMIZATION_TEMPLATES.filter((opt) => {
    // Prioritize low effort if budget is tight
    if (severity === 'critical' || severity === 'warning') {
      return opt.effort !== 'high' || opt.potentialSavings > 100;
    }
    return true;
  }).slice(0, 3);

  return {
    margin: monthlyMargin,
    status,
    severity,
    optimizations,
  };
}

/**
 * Match jobs using skill arbitrage algorithm
 */
async function matchJobs(
  userSkills: string[],
  energyLevel: number,
  prioritizeLowEffort: boolean = false
): Promise<Stage1Result['jobMatches']> {
  // Convert user skills to Skill objects for the algorithm
  const skills: Skill[] = userSkills.map((name) => {
    const template = SKILL_TEMPLATES.find((t) =>
      t.name?.toLowerCase().includes(name.toLowerCase())
    );
    if (template && template.name && template.hourlyRate !== undefined) {
      return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name: template.name,
        level: 'intermediate' as const,
        hourlyRate: template.hourlyRate,
        marketDemand: template.marketDemand ?? 3,
        cognitiveEffort: template.cognitiveEffort ?? 3,
        restNeeded: template.restNeeded ?? 1,
      };
    }
    return {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      level: 'intermediate' as const,
      hourlyRate: 20, // Default $20/hr
      marketDemand: 3,
      cognitiveEffort: 3,
      restNeeded: 1,
    };
  });

  // Configure weights based on energy level
  const weights: ArbitrageWeights = prioritizeLowEffort
    ? { rate: 0.15, demand: 0.15, effort: 0.5, rest: 0.2 }
    : { rate: 0.3, demand: 0.25, effort: 0.25, rest: 0.2 };

  // Rank skills using the algorithm (async)
  const ranking = await rankSkills(skills, weights);
  const topScore = ranking.topPick?.score || 0.7;

  // Match to job templates
  const matches = JOB_TEMPLATES.filter((job) => {
    // Filter based on effort if energy is low
    if (prioritizeLowEffort && job.effortLevel === 'high') return false;
    // Filter based on skill relevance
    return userSkills.some(
      (skill) =>
        job.name.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(job.name.toLowerCase().split(' ')[0])
    );
  })
    .map((job, index) => ({
      id: job.id,
      name: job.name,
      hourlyRate: job.hourlyRate,
      combinedScore: 0.8 - index * 0.1,
      arbitrageScore: topScore,
      platform: job.platform,
      effortLevel: job.effortLevel,
    }))
    .slice(0, 5);

  // If no matches, provide general job recommendations
  if (matches.length === 0) {
    return {
      matches: JOB_TEMPLATES.slice(0, 3).map((job, index) => ({
        id: job.id,
        name: job.name,
        hourlyRate: job.hourlyRate,
        combinedScore: 0.6 - index * 0.1,
        arbitrageScore: 0.5,
        platform: job.platform,
        effortLevel: job.effortLevel,
      })),
      energyAdjusted: prioritizeLowEffort,
    };
  }

  return {
    matches,
    energyAdjusted: prioritizeLowEffort,
  };
}

async function runParallelAnalysis(
  input: TipsOrchestratorInput,
  span: Span
): Promise<Stage1Result> {
  const results: Stage1Result = {};

  // Run Budget Coach and Job Matcher in parallel
  const analysisPromises: Promise<void>[] = [];

  // Budget Coach analysis - always runs with default margin of 0 (tight budget assumption)
  {
    const effectiveMargin = input.monthlyMargin ?? 0;
    analysisPromises.push(
      createSpan(
        'agent.budget_coach',
        async (budgetSpan) => {
          budgetSpan.setInput({
            margin: effectiveMargin,
            skills: input.skills,
            marginWasDefault: input.monthlyMargin === undefined,
          });

          try {
            const analysis = analyzeBudget(effectiveMargin);
            if (analysis) {
              results.budgetAnalysis = analysis;

              budgetSpan.setOutput({
                margin: analysis.margin,
                status: analysis.status,
                optimizationsFound: analysis.optimizations.length,
              });
            }
          } catch (error) {
            budgetSpan.setAttributes({
              error: true,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },
        { tags: ['budget-coach', 'tips'], type: 'tool' }
      )
    );
  }

  // Job Matcher analysis
  if (input.skills && input.skills.length > 0) {
    analysisPromises.push(
      createSpan(
        'agent.job_matcher',
        async (jobSpan) => {
          jobSpan.setInput({
            skills: input.skills,
            energyLevel: input.currentEnergy,
          });

          try {
            const jobResult = await matchJobs(
              input.skills || [],
              input.currentEnergy,
              input.currentEnergy < 50
            );

            if (jobResult) {
              results.jobMatches = jobResult;

              jobSpan.setOutput({
                matchesCount: jobResult.matches.length,
                topMatch: jobResult.matches[0]?.name || null,
                energyAdjusted: jobResult.energyAdjusted,
              });
            }
          } catch (error) {
            jobSpan.setAttributes({
              error: true,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        },
        { tags: ['job-matcher', 'tips'], type: 'tool' }
      )
    );
  }

  await Promise.all(analysisPromises);

  span.setAttributes({
    'stage1.budget_analyzed': !!results.budgetAnalysis,
    'stage1.jobs_matched': !!results.jobMatches,
  });

  return results;
}

// ============================================================================
// Stage 2: Strategy Comparison
// ============================================================================

interface Stage2Result {
  bestOverall: string;
  bestQuickWin: string;
  bestLongTerm: string;
  recommendation: string;
  strategies: Strategy[];
}

async function runStrategyComparison(
  stage1: Stage1Result,
  input: TipsOrchestratorInput,
  _span: Span
): Promise<Stage2Result | null> {
  return createSpan(
    'agent.strategy_comparator',
    async (stratSpan) => {
      const strategies: Strategy[] = [];

      // Convert job matches to strategies
      if (stage1.jobMatches?.matches) {
        for (const job of stage1.jobMatches.matches.slice(0, 3)) {
          strategies.push(
            createStrategyFromJob(
              {
                id: job.id,
                name: job.name,
                hourlyRate: job.hourlyRate,
                flexibility: 0.7,
                skills: [],
                coBenefit: job.platform,
              },
              input.hoursAvailable || 10
            )
          );
        }
      }

      // Convert optimizations to strategies
      if (stage1.budgetAnalysis?.optimizations) {
        for (const opt of stage1.budgetAnalysis.optimizations.slice(0, 2)) {
          strategies.push(
            createStrategyFromOptimization({
              expense: opt.expense,
              solution: opt.solution,
              savingsPct: 0.2,
              currentAmount: opt.potentialSavings / 0.2,
            })
          );
        }
      }

      if (strategies.length === 0) {
        stratSpan.setAttributes({ 'comparison.no_strategies': true });
        return null;
      }

      stratSpan.setInput({ strategiesCount: strategies.length });

      try {
        const comparison = await compareStrategies(strategies, {
          monthlyMargin: input.monthlyMargin || 0,
          hoursAvailable: input.hoursAvailable || 10,
          skills: input.skills || [],
          urgency: input.monthlyMargin && input.monthlyMargin < 0 ? 'high' : 'medium',
          yearsRemaining: 2,
          goalAmount: input.goalAmount,
        });

        stratSpan.setOutput({
          bestOverall: comparison.bestOverall,
          bestQuickWin: comparison.bestQuickWin,
          strategiesCompared: strategies.length,
        });

        return {
          bestOverall: comparison.bestOverall,
          bestQuickWin: comparison.bestQuickWin,
          bestLongTerm: comparison.bestLongTerm,
          recommendation: comparison.recommendation,
          strategies,
        };
      } catch (error) {
        stratSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      }
    },
    { tags: ['strategy-comparator', 'tips'], type: 'tool' }
  );
}

// ============================================================================
// Stage 3: Guardian Validation
// ============================================================================

interface Stage3Result {
  passed: boolean;
  confidence: number;
  issues: string[];
}

async function runGuardianValidation(
  recommendation: string,
  input: TipsOrchestratorInput,
  _span: Span
): Promise<Stage3Result> {
  return createSpan(
    'agent.guardian',
    async (guardSpan) => {
      guardSpan.setInput({
        recommendationLength: recommendation.length,
        hasDeficit: (input.monthlyMargin || 0) < 0,
      });

      try {
        const validation = await validateRecommendation(
          { text: recommendation },
          {
            financialSituation:
              (input.monthlyMargin || 0) < 0
                ? 'deficit'
                : (input.monthlyMargin || 0) < 50
                  ? 'tight'
                  : 'balanced',
          }
        );

        guardSpan.setOutput({
          passed: validation.passed,
          confidence: validation.confidence,
          issuesCount: validation.issues.length,
        });

        return {
          passed: validation.passed,
          confidence: validation.confidence,
          issues: validation.issues,
        };
      } catch (error) {
        guardSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return { passed: true, confidence: 0.5, issues: [] };
      }
    },
    { tags: ['guardian', 'tips'], type: 'guardrail' }
  );
}

// ============================================================================
// Stage 4: LLM Tip Generation
// ============================================================================

interface TipGenerationContext {
  energyDebt: EnergyDebtResult;
  comeback: ComebackResult | null;
  topPriority: string;
  stage1: Stage1Result;
  stage2: Stage2Result | null;
  input: TipsOrchestratorInput;
  regionalHints?: string[];
  ragContext?: RAGContext;
}

/**
 * Sanitize LLM response to remove hallucinated platform names and action text
 * Prevents the LLM from suggesting specific external platforms like "Superprof", "Upwork", etc.
 */
function sanitizeTipResponse(tip: {
  title: string;
  message: string;
  action?: { label: string; href: string };
}): typeof tip {
  const bannedPatterns = [
    /\bSuperprof\b/gi,
    /\bUpwork\b/gi,
    /\bFiverr\b/gi,
    /\bIndeed\b/gi,
    /\bWyzant\b/gi,
    /\bCare\.com\b/gi,
    /\bRover\b/gi,
    /\bLinkedIn\b/gi,
    /\bUberEats\b/gi,
    /\bDoorDash\b/gi,
    /\bTaskRabbit\b/gi,
    /\bFreelancer\b/gi,
    /\bToptal\b/gi,
    /\bFlexJobs\b/gi,
  ];

  const actionPatterns = [
    /Find \w+ gigs/gi,
    /Start \w+ today/gi,
    /Apply to \w+ now/gi,
    /Sign up on \w+/gi,
    /Create .*profile on/gi,
    /Book your first/gi,
    /Join \w+ platform/gi,
  ];

  let { title, message } = tip;

  // Remove platform names from title and message
  for (const pattern of bannedPatterns) {
    title = title.replace(pattern, 'platforms');
    message = message.replace(pattern, 'local platforms');
  }

  // Sanitize action-oriented hallucinations in message
  for (const pattern of actionPatterns) {
    message = message.replace(pattern, 'Explore opportunities');
  }

  // Sanitize action label and href if present
  let action = tip.action;
  if (action) {
    let sanitizedLabel = action.label;
    for (const pattern of actionPatterns) {
      sanitizedLabel = sanitizedLabel.replace(pattern, 'Explore');
    }
    for (const pattern of bannedPatterns) {
      sanitizedLabel = sanitizedLabel.replace(pattern, '');
    }

    // Validate href is in allowed list
    const validRoutes = [
      '/plan?tab=swipe',
      '/plan?tab=skills',
      '/plan?tab=lifestyle',
      '/plan?tab=goals',
      '/suivi',
      '#missions',
    ];
    const isValidRoute = validRoutes.some((r) => action!.href.startsWith(r));

    if (!isValidRoute) {
      // Replace invalid routes with a safe default
      action = { label: 'Explore options', href: '/plan?tab=swipe' };
    } else {
      action = { ...action, label: sanitizedLabel.trim() || 'Explore' };
    }
  }

  return { title: title.trim(), message: message.trim(), action };
}

async function generateTipWithLLM(
  context: TipGenerationContext,
  _span: Span
): Promise<TipsOrchestratorOutput['tip']> {
  return createSpan(
    'tips.llm_generation',
    async (llmSpan) => {
      const {
        energyDebt,
        comeback,
        topPriority,
        stage1,
        stage2,
        input,
        regionalHints,
        ragContext,
      } = context;

      llmSpan.setInput({
        topPriority,
        hasAgentRecommendations: !!(stage1.budgetAnalysis || stage1.jobMatches),
        hasStrategyComparison: !!stage2,
        hasLocation: !!input.location,
        hasRAGContext: !!ragContext && ragContext.stats.profilesFound > 0,
      });

      // Build context for LLM
      const contextParts: string[] = [];

      contextParts.push(`Student Profile:
- Current energy: ${input.currentEnergy}%
- Goal progress: ${input.goalProgress}%
- Monthly margin: ${input.monthlyMargin !== undefined ? `$${input.monthlyMargin}` : 'unknown'}
- Active missions: ${input.activeMissions.length}`);

      if (energyDebt.detected) {
        contextParts.push(`Energy Debt Alert:
- ${energyDebt.consecutiveLowWeeks} weeks of low energy
- Severity: ${energyDebt.severity}
- Recommended target reduction: ${Math.round(energyDebt.targetReduction * 100)}%`);
      }

      if (comeback?.detected) {
        contextParts.push(`Comeback Mode:
- Energy recovered to ${input.currentEnergy}%
- Confidence: ${Math.round(comeback.confidenceScore * 100)}%`);
      }

      if (stage1.budgetAnalysis) {
        contextParts.push(`Budget Analysis (from Budget Coach):
- Status: ${stage1.budgetAnalysis.status}
- Severity: ${stage1.budgetAnalysis.severity}
- Top optimization: ${stage1.budgetAnalysis.optimizations[0]?.solution || 'none'}`);
      }

      if (stage1.jobMatches?.matches.length) {
        const topJob = stage1.jobMatches.matches[0];
        contextParts.push(`Job Recommendations (from Job Matcher):
- Top match: ${topJob.name} at $${topJob.hourlyRate}/hour
- Type: ${topJob.effortLevel} effort, flexible schedule
- Matches found: ${stage1.jobMatches.matches.length}`);
      }

      if (stage2) {
        contextParts.push(`Strategy Comparison:
- Best overall: ${stage2.bestOverall}
- Quick win: ${stage2.bestQuickWin}
- Recommendation: ${stage2.recommendation}`);
      }

      if (regionalHints && regionalHints.length > 0) {
        contextParts.push(`Regional Tips for ${input.location?.region || input.location?.city}:
${regionalHints.map((h) => `- ${h}`).join('\n')}`);
      }

      // Add RAG context from similar students (social proof)
      if (ragContext && ragContext.stats.profilesFound > 0) {
        const ragContextStr = formatRAGContextForPrompt(ragContext);
        if (ragContextStr) {
          contextParts.push(`Similar Students Context (Social Proof):
${ragContextStr}
Use this context to make recommendations more personalized and credible.
E.g., "${ragContext.stats.profilesFound} students with similar profiles saved an average of X€/month by..."
DO NOT make up statistics - only use data from the context above.`);
        }
      }

      const systemPrompt = `You are Bruno, a friendly and motivating financial coach for students.
Generate a single, actionable tip based on the analysis from multiple AI agents.

STYLE:
- Be encouraging but realistic
- Use simple language, no jargon
- Focus on ONE key action
- Be concise (max 2 sentences for message)
- NEVER mention external websites, platforms, or URLs
- NEVER suggest specific companies like "Superprof", "Upwork", etc. - just say "tutoring platforms" or "freelance platforms"

OUTPUT FORMAT (JSON):
{
  "title": "Short, catchy title (max 6 words)",
  "message": "Encouraging message with specific action",
  "category": "energy|progress|mission|opportunity|warning|celebration",
  "action": { "label": "Action button text", "href": "/valid-route" } // optional
}

IMPORTANT - VALID ROUTES ONLY:
You can ONLY use these routes for the "href" field:
- /plan?tab=swipe (explore scenarios, view strategies)
- /plan?tab=skills (view/add skills, find jobs)
- /plan?tab=lifestyle (budget, expenses)
- /plan?tab=goals (set/adjust targets)
- /suivi (dashboard, track progress)
- #missions (scroll to missions section)

NEVER invent routes like /jobs/xxx or any other URL. If unsure, omit the action field.

Priority: ${topPriority}`;

      const userPrompt = `Based on this analysis, generate the most relevant tip:

${contextParts.join('\n\n')}

Remember: Focus on the top priority (${topPriority}) and incorporate agent insights.`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      try {
        const response = await chat(messages, {
          temperature: 0.5,
          maxTokens: 256,
          tags: ['ai', 'bruno', 'tips', 'llm'],
          metadata: {
            source: 'tips_orchestrator',
            topPriority,
          },
        });

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Sanitize the LLM response to remove hallucinated platform names
          const sanitized = sanitizeTipResponse({
            title: parsed.title,
            message: parsed.message,
            action: parsed.action,
          });

          llmSpan.setOutput({
            title: sanitized.title,
            category: parsed.category,
            hasAction: !!sanitized.action,
            wasSanitized: sanitized.title !== parsed.title || sanitized.message !== parsed.message,
          });

          return {
            title: sanitized.title,
            message: sanitized.message,
            category: parsed.category || 'opportunity',
            action: sanitized.action,
          };
        }
      } catch (error) {
        llmSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Fallback to template-based tip
      return generateTemplateTip(context);
    },
    { tags: ['llm', 'tips'] }
  );
}

/**
 * Generate a tip from templates (fallback)
 */
function generateTemplateTip(context: TipGenerationContext): TipsOrchestratorOutput['tip'] {
  const { energyDebt, topPriority, input, stage1 } = context;

  switch (topPriority) {
    case 'energy_debt_critical':
      return {
        title: 'Energy debt detected',
        message: `You've had ${energyDebt.consecutiveLowWeeks} weeks of low energy. Consider reducing your target by ${Math.round(energyDebt.targetReduction * 100)}% to recover.`,
        category: 'warning',
        action: { label: 'Adjust targets', href: '/plan?tab=goals' },
      };

    case 'comeback_opportunity':
      return {
        title: 'Comeback Mode activated!',
        message: `Your energy bounced back to ${input.currentEnergy}%! Perfect time to catch up on your goals.`,
        category: 'celebration',
        action: { label: 'View catch-up plan', href: '/plan?tab=swipe' },
      };

    case 'energy_critical':
      return {
        title: 'Energy very low',
        message: `Your energy is at ${input.currentEnergy}%. Focus on rest and self-care first.`,
        category: 'warning',
        action: { label: 'View missions', href: '#missions' },
      };

    case 'goal_at_risk':
      return {
        title: 'Goal needs attention',
        message: `Only ${input.goalProgress}% progress. ${stage1.jobMatches?.matches[0] ? `Try ${stage1.jobMatches.matches[0].name} for extra income.` : 'Explore new scenarios.'}`,
        category: 'warning',
        action: { label: 'Find scenarios', href: '/plan?tab=swipe' },
      };

    case 'celebration':
      return {
        title: 'Excellent progress!',
        message: `${input.goalProgress}% complete! You're ahead of schedule. Keep the momentum!`,
        category: 'celebration',
      };

    default:
      if (stage1.jobMatches?.matches[0]) {
        const job = stage1.jobMatches.matches[0];
        return {
          title: `Consider ${job.name}`,
          message: `Pays $${job.hourlyRate}/hour with high flexibility. Check the skills tab for details.`,
          category: 'opportunity',
          action: { label: 'View jobs', href: '/plan?tab=skills' },
        };
      }

      if (stage1.budgetAnalysis?.optimizations[0]) {
        const opt = stage1.budgetAnalysis.optimizations[0];
        return {
          title: opt.solution,
          message: `Could save $${opt.potentialSavings}/month with minimal effort.`,
          category: 'opportunity',
          action: { label: 'Review budget', href: '/plan?tab=lifestyle' },
        };
      }

      return {
        title: 'Ready to start?',
        message: 'Explore available scenarios to find opportunities tailored to you.',
        category: 'opportunity',
        action: { label: 'Explore', href: '/plan?tab=swipe' },
      };
  }
}

// ============================================================================
// Main Orchestrator Function
// ============================================================================

/**
 * Run the full tips orchestration pipeline
 *
 * Fallback levels:
 * - Level 0: Full orchestration (4 agents, ~15s)
 * - Level 1: Single agent (Budget Coach only, ~8s)
 * - Level 2: Algorithms only (energy debt, comeback, ~2s)
 * - Level 3: Static tip (if all else fails)
 */
export async function orchestrateTips(
  input: TipsOrchestratorInput
): Promise<TipsOrchestratorOutput> {
  const startTime = Date.now();
  const enableFull = input.enableFullOrchestration !== false;
  const timeoutMs = input.timeoutMs || 5000; // v4.2: Reduced default for snappier UX

  return trace(
    'tips.orchestrator',
    async (rootSpan) => {
      rootSpan.setInput({
        profileId: input.profileId,
        energy: input.currentEnergy,
        goalProgress: input.goalProgress,
        hasLocation: !!input.location,
        enableFullOrchestration: enableFull,
      });

      const agentsUsed: string[] = [];
      let fallbackLevel: 0 | 1 | 2 | 3 = 0;
      let orchestrationType: 'full' | 'single' | 'algorithms' | 'static' = 'full';

      try {
        // === Context Analysis (always runs) ===
        const energyEntries = input.energyHistory.map((level, i) => ({
          week: i + 1,
          level,
          date: new Date(
            Date.now() - (input.energyHistory.length - i) * 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        }));

        const energyDebt = await createSpan(
          'tips.energy_debt_detection',
          async (span) => {
            const result = detectEnergyDebt(energyEntries);
            span.setOutput({
              detected: result.detected,
              severity: result.severity,
              weeks: result.consecutiveLowWeeks,
            });
            return result;
          },
          { input: { historyLength: input.energyHistory.length } }
        );

        const deficit = (input.goalAmount || 0) - (input.currentAmount || 0);
        const comeback = await createSpan(
          'tips.comeback_detection',
          async (span) => {
            const result = detectComebackWindow(input.energyHistory, deficit);
            span.setOutput({
              detected: result?.detected || false,
              confidence: result?.confidenceScore || 0,
            });
            return result;
          },
          { input: { deficit } }
        );

        const topPriority = determineTopPriority(
          energyDebt,
          comeback,
          input.currentEnergy,
          input.goalProgress,
          input.goalAmount
        );

        // === Full Orchestration (Level 0) ===
        let stage1: Stage1Result = {};
        let stage2: Stage2Result | null = null;
        let validation: Stage3Result = { passed: true, confidence: 0.5, issues: [] };

        if (enableFull) {
          const orchestrationResult = await withTimeout(
            (async () => {
              // Stage 1: Parallel Analysis
              const s1 = await createSpan(
                'tips.parallel_agents',
                async (span) => runParallelAnalysis(input, span),
                { tags: ['parallel', 'tips'] }
              );

              if (s1.budgetAnalysis) agentsUsed.push('budget-coach');
              if (s1.jobMatches) agentsUsed.push('job-matcher');

              // Stage 2: Strategy Comparison
              const s2 = await runStrategyComparison(s1, input, rootSpan);
              if (s2) agentsUsed.push('strategy-comparator');

              // Stage 3: Guardian Validation
              const recommendationText =
                s2?.recommendation ||
                s1.budgetAnalysis?.optimizations[0]?.solution ||
                s1.jobMatches?.matches[0]?.name ||
                'general financial advice';

              const v = await runGuardianValidation(recommendationText, input, rootSpan);
              agentsUsed.push('guardian');

              return { s1, s2, v };
            })(),
            timeoutMs,
            { s1: {}, s2: null, v: { passed: true, confidence: 0.5, issues: [] } }
          );

          if (orchestrationResult.timedOut) {
            fallbackLevel = 1;
            orchestrationType = 'single';
            rootSpan.setAttributes({ 'orchestration.timeout': true });
          } else {
            stage1 = orchestrationResult.result.s1;
            stage2 = orchestrationResult.result.s2;
            validation = orchestrationResult.result.v;
          }
        } else {
          fallbackLevel = 2;
          orchestrationType = 'algorithms';
        }

        // === Get Regional Hints ===
        const regionalHints = input.location?.region
          ? REGIONAL_HINTS[input.location.region] || REGIONAL_HINTS['europe']
          : undefined;

        // === Get RAG Context (similar students for social proof) ===
        let ragContext: RAGContext | undefined;
        if (enableFull && input.skills && input.skills.length > 0) {
          try {
            ragContext = await createSpan(
              'tips.rag_context',
              async (ragSpan) => {
                const queryText = [
                  `Student with skills: ${input.skills?.join(', ')}`,
                  input.goalAmount ? `Goal: save ${input.goalAmount}` : '',
                  input.monthlyMargin !== undefined ? `Monthly margin: ${input.monthlyMargin}` : '',
                ]
                  .filter(Boolean)
                  .join('. ');

                const ctx = await getRAGContext({
                  queryText,
                  currentUserId: input.profileId,
                  maxProfiles: 3,
                  maxAdvice: 3,
                  maxGoals: 2,
                  minScore: 0.5,
                });

                ragSpan.setOutput({
                  profilesFound: ctx.stats.profilesFound,
                  adviceFound: ctx.stats.adviceFound,
                  goalsFound: ctx.stats.goalsFound,
                });

                return ctx;
              },
              { tags: ['rag', 'tips'] }
            );

            if (ragContext.stats.profilesFound > 0) {
              agentsUsed.push('rag-retriever');
            }
          } catch {
            // RAG is non-critical, continue without it
            rootSpan.setAttributes({ 'rag.error': true });
          }
        }

        // === Stage 4: Generate Tip ===
        const tipContext: TipGenerationContext = {
          energyDebt,
          comeback,
          topPriority,
          stage1,
          stage2,
          input,
          regionalHints,
          ragContext,
        };

        let tip: TipsOrchestratorOutput['tip'];

        if (fallbackLevel < 3 && validation.passed) {
          tip = await generateTipWithLLM(tipContext, rootSpan);
        } else {
          fallbackLevel = 3;
          orchestrationType = 'static';
          tip = STATIC_TIPS[Math.floor(Math.random() * STATIC_TIPS.length)];
        }

        // Index generated advice for RAG feedback loop (fire-and-forget)
        if (tip && input.profileId && fallbackLevel < 3) {
          indexAdvice(`tip-${Date.now()}`, {
            text: tip.message,
            profileId: input.profileId,
            goalType: topPriority,
          }).catch(() => {}); // Non-blocking
        }

        // === Build Agent Recommendations ===
        const agentRecommendations: AgentRecommendation = {};

        if (stage1.budgetAnalysis) {
          agentRecommendations.budgetCoach = {
            advice: [],
            topOptimization: stage1.budgetAnalysis.optimizations[0]
              ? {
                  solution: stage1.budgetAnalysis.optimizations[0].solution,
                  potentialSavings: stage1.budgetAnalysis.optimizations[0].potentialSavings,
                }
              : undefined,
            budgetStatus: stage1.budgetAnalysis.status,
            severity: stage1.budgetAnalysis.severity,
          };
        }

        if (stage1.jobMatches?.matches[0]) {
          const topMatch = stage1.jobMatches.matches[0];
          agentRecommendations.jobMatcher = {
            topMatch: {
              name: topMatch.name,
              hourlyRate: topMatch.hourlyRate,
              arbitrageScore: topMatch.arbitrageScore,
              platform: topMatch.platform,
            },
            matchesCount: stage1.jobMatches.matches.length,
            energyAdjusted: stage1.jobMatches.energyAdjusted,
          };
        }

        if (stage2) {
          agentRecommendations.strategyComparator = {
            bestStrategy: stage2.bestOverall,
            bestQuickWin: stage2.bestQuickWin,
            bestLongTerm: stage2.bestLongTerm,
            recommendation: stage2.recommendation,
          };
        }

        // === Build Local Opportunities ===
        const localOpportunities: LocalOpportunity | undefined = input.location
          ? {
              jobs:
                stage1.jobMatches?.matches.slice(0, 3).map((j) => ({
                  title: j.name,
                  company: j.platform,
                })) || [],
              regionalTips: regionalHints?.slice(0, 2) || [],
            }
          : undefined;

        const durationMs = Date.now() - startTime;

        rootSpan.setOutput({
          tip: { title: tip.title, category: tip.category },
          fallbackLevel,
          orchestrationType,
          agentsUsed,
          durationMs,
        });

        return {
          tip,
          insights: {
            energyDebt: {
              detected: energyDebt.detected,
              severity: energyDebt.severity,
              weeks: energyDebt.consecutiveLowWeeks,
              targetReduction: energyDebt.targetReduction,
            },
            comeback: {
              detected: comeback?.detected || false,
              confidence: comeback?.confidenceScore || 0,
            },
            topPriority,
            agentRecommendations:
              Object.keys(agentRecommendations).length > 0 ? agentRecommendations : undefined,
            localOpportunities,
          },
          processingInfo: {
            agentsUsed,
            fallbackLevel,
            durationMs,
            orchestrationType,
          },
          traceId: getCurrentTraceId() || '',
          traceUrl: getTraceUrl(getCurrentTraceId() || ''),
        };
      } catch (error) {
        rootSpan.setAttributes({
          error: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        // Level 3 fallback
        const tip = STATIC_TIPS[Math.floor(Math.random() * STATIC_TIPS.length)];

        return {
          tip,
          insights: {
            energyDebt: { detected: false, severity: null, weeks: 0 },
            comeback: { detected: false, confidence: 0 },
            topPriority: 'fallback',
          },
          processingInfo: {
            agentsUsed: [],
            fallbackLevel: 3,
            durationMs: Date.now() - startTime,
            orchestrationType: 'static',
          },
          traceId: getCurrentTraceId() || '',
          traceUrl: getTraceUrl(getCurrentTraceId() || ''),
        };
      }
    },
    {
      tags: ['ai', 'bruno', 'tips', 'agentic'],
      metadata: {
        providers: ['groq'],
        source: 'tips_orchestrator',
      },
      input: {
        profileId: input.profileId,
        energy: input.currentEnergy,
        goalProgress: input.goalProgress,
        enableFullOrchestration: enableFull,
      },
    }
  );
}

export default {
  orchestrateTips,
};
