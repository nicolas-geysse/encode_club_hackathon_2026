/**
 * Guardrail Agents Index
 *
 * Exports all H.5 guardrail agents for scenario protection.
 *
 * These agents sit between the Swipe Orchestrator and the frontend,
 * filtering and enriching scenarios before presentation.
 *
 * Architecture:
 * ```
 * Swipe Orchestrator
 *        │
 *        ▼
 * ┌─────────────────────────────────────────┐
 * │          GUARDRAIL PIPELINE             │
 * │                                         │
 * │  1. Essential Guardian (block naive)    │
 * │  2. Ghost Observer (behavioral filter)  │
 * │  3. Asset Pivot (rent vs sell)          │
 * │  4. Cash Flow Smoother (timing)         │
 * │                                         │
 * └─────────────────────────────────────────┘
 *        │
 *        ▼
 *   SwipeScenario[] (filtered + enriched)
 * ```
 */

// H.5.4 Essential Guardian - Protects vital expenses
export {
  detectNaiveSuggestionsTool,
  suggestStructuralAlternativesTool,
  calculateStructuralImpactTool,
  essentialGuardianTool,
  STRUCTURAL_ALTERNATIVES,
  type EssentialCategory,
  type StructuralAlternative,
  type BlockedScenario,
  type EssentialGuardianOutput,
} from '../essential-guardian.js';

// H.5.1 Ghost Observer - Behavioral filter
export {
  detectRejectionPatternsTool,
  filterByPatternsTool,
  generateBehaviorInsightsTool,
  ghostObserverTool,
  GHOST_CONFIG,
  type SwipeHistory,
  type PatternType,
  type RejectionPattern,
  type GhostObserverOutput,
} from '../ghost-observer.js';

// H.5.3 Asset-to-Income Pivot - Rent vs Sell
export {
  detectProductiveAssetsTool,
  calculatePivotEconomicsTool,
  suggestMonetizationPlatformsTool,
  assetPivotTool,
  RENTAL_RATES,
  MONETIZATION_PLATFORMS,
  type ProductivityType,
  type RentalPotential,
  type ServicePotential,
  type ProductiveAsset,
  type PivotComparison,
  type PlatformSuggestion,
  type AssetPivotSuggestion,
  type AssetPivotOutput,
} from '../asset-pivot.js';

// H.5.2 Cash Flow Smoothing - Timing protection
export {
  detectTimingMismatchesTool,
  suggestTimingSolutionsTool,
  evaluateUrgencySaleTool,
  cashFlowSmootherTool,
  CASHFLOW_CONFIG,
  type UpcomingExpense,
  type UpcomingIncome,
  type PendingSale,
  type CashFlowContext,
  type TimingMismatch,
  type CashFlowSolution,
  type CashFlowOutput,
} from '../cashflow-smoother.js';

/**
 * All guardrail tools for easy registration
 */
export const GUARDRAIL_TOOLS = [
  // Essential Guardian
  'detect_naive_suggestions',
  'suggest_structural_alternatives',
  'calculate_structural_impact',
  'essential_guardian',
  // Ghost Observer
  'detect_rejection_patterns',
  'filter_by_patterns',
  'generate_behavior_insights',
  'ghost_observer',
  // Asset Pivot
  'detect_productive_assets',
  'calculate_pivot_economics',
  'suggest_monetization_platforms',
  'asset_pivot',
  // Cash Flow Smoother
  'detect_timing_mismatches',
  'suggest_timing_solutions',
  'evaluate_urgency_sale',
  'cashflow_smoother',
] as const;

/**
 * Guardrail agent IDs
 */
export const GUARDRAIL_AGENTS = [
  'essential-guardian',
  'ghost-observer',
  'asset-pivot',
  'cashflow-smoother',
] as const;
