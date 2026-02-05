/**
 * Swipe Tab Component
 *
 * Roll the Dice + Swipe Scenarios for preference learning.
 */

import { createSignal, Show, For } from 'solid-js';
import { RollDice } from '../swipe/RollDice';
import { SwipeSession, updatePreferences } from '../swipe/SwipeSession';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { celebrateBig } from '~/lib/confetti';
import { updateAchievements, onAchievementUnlock } from '~/lib/achievements';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { ClipboardList, RotateCcw, Check, Dices, Trash2, Bot, Plus, X } from 'lucide-solid';
import { toastPopup } from '~/components/ui/Toast';
import type { Lead } from '~/lib/prospectionTypes';
import { matchSkillsToCategory } from '~/lib/jobScoring';
import { KARMA_POINTS } from '~/hooks/useKarma';

/**
 * Scenario categories (Pull Architecture)
 * - sell_item: Sell an object (Trade type='sell')
 * - job_lead: Apply to a job (Prospection lead)
 * - pause_expense: Pause a subscription (Lifestyle)
 * - karma_trade: Trade an object (Trade type='trade')
 * - karma_lend: Lend an object (Trade type='lend')
 * - karma_borrow: Borrow an object (Trade type='borrow')
 */
export type ScenarioCategory =
  | 'sell_item'
  | 'job_lead'
  | 'pause_expense'
  | 'karma_trade'
  | 'karma_lend'
  | 'karma_borrow';

export interface ScenarioUrgency {
  score: number; // 0-100
  reason?: string; // "⚡ Expires in 3 days!"
  daysUntilAction?: number;
}

export interface ScenarioMetadata {
  nextBillingDate?: string; // ISO date for lifestyle
  applicationDeadline?: string; // ISO date for jobs
  isHot?: boolean; // Job is trending
  goalImpactPercent?: number; // Impact on goal %
  matchScore?: number; // Skill match for jobs
  matchingSkills?: string[]; // Skills that matched
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: ScenarioCategory;

  // Financial data
  weeklyHours?: number; // Hours required (jobs only)
  oneTimeAmount?: number; // One-time amount (sales)
  monthlyAmount?: number; // Monthly amount (pauses)
  pauseMonths?: number; // Number of months to pause (lifestyle)
  weeklyEarnings?: number; // Weekly earnings (compatibility)
  effortLevel: number; // 1-5
  flexibilityScore: number; // 1-5
  hourlyRate?: number;

  // Source tracking
  source: 'trade' | 'prospection' | 'lifestyle';
  sourceId: string; // ID of the source item

  // Urgency (for intelligent sorting)
  urgency: ScenarioUrgency;

  // Metadata for contextual calculations
  metadata?: ScenarioMetadata;

  // Karma
  karmaPoints?: number;
  socialBenefit?: string;

  // Legacy compatibility
  isDefault?: boolean;
  /** Original lead ID if source is 'prospection' */
  leadId?: string;
}

export interface UserPreferences {
  effortSensitivity: number;
  hourlyRatePriority: number;
  timeFlexibility: number;
  incomeStability: number;
}

/** Trade item with type for filtering (Pull Architecture) */
export interface SwipeTradeItem {
  id: string;
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  value: number;
  status: 'pending' | 'active' | 'completed';
}

/** Lifestyle item for swipe with pause info */
export interface SwipeLifestyleItem {
  id: string;
  name: string;
  currentCost: number;
  pausedMonths?: number;
  category?: string;
}

/** Context for urgency calculations */
export interface SwipeContext {
  goalAmount?: number;
  currentAmount?: number;
  remainingAmount?: number;
  daysToGoal?: number;
  weeksRemaining?: number; // For goal impact calculations
  today: Date;
}

interface SwipeTabProps {
  // NOTE: skills are NOT used for scenario generation anymore
  // They are kept for skill matching on jobs (Phase 5)
  skills?: { name: string; hourlyRate: number }[];

  // Trade items with type/status for filtering (Pull Architecture)
  trades?: SwipeTradeItem[];

  // Lifestyle items for pause scenarios
  lifestyle?: SwipeLifestyleItem[];

  /** Leads marked as "interested" from Jobs tab */
  leads?: Lead[];

  /** Goal context for urgency calculations */
  goalContext?: SwipeContext;

  currency?: Currency;
  /** Whether component is rendered in embed mode (iframe context) */
  embedMode?: boolean;
  initialPreferences?: UserPreferences;
  /** Profile ID for tracing swipe preferences to Opik */
  profileId?: string;
  onPreferencesChange?: (prefs: UserPreferences) => void;
  onScenariosSelected?: (scenarios: Scenario[]) => void;
}

// =============================================================================
// URGENCY CALCULATIONS (Phase 3)
// =============================================================================

/**
 * Calculate urgency for sell items based on goal impact
 */
function calculateSellUrgency(
  value: number,
  remainingAmount: number,
  daysToGoal: number
): ScenarioUrgency {
  const goalImpact = remainingAmount > 0 ? (value / remainingAmount) * 100 : 0;

  // High impact + close deadline = high urgency
  if (daysToGoal < 14 && goalImpact >= 10) {
    return {
      score: 85,
      reason: `💰 ${goalImpact.toFixed(0)}% of your goal!`,
      daysUntilAction: undefined,
    };
  }

  if (goalImpact >= 20) {
    return {
      score: 75,
      reason: `💰 ${goalImpact.toFixed(0)}% of your goal`,
      daysUntilAction: undefined,
    };
  }

  // Base urgency for sell items (always easy)
  return { score: 60, reason: undefined };
}

/**
 * Calculate urgency for job leads
 */
function calculateJobUrgency(lead: Lead): ScenarioUrgency {
  // For now, base urgency - can be enhanced with deadline/hot detection
  // TODO: Add applicationDeadline and isHot fields to Lead
  return {
    score: 55,
    reason: undefined,
  };
}

/**
 * Calculate urgency for lifestyle pause
 */
function calculateLifestyleUrgency(item: SwipeLifestyleItem): ScenarioUrgency {
  // For now, base urgency - can be enhanced with nextBillingDate
  // TODO: Add nextBillingDate to lifestyle items
  return {
    score: 50,
    reason: undefined,
  };
}

/**
 * Suggest platform for selling items
 */
function suggestPlatform(name: string): string {
  const nameLower = name.toLowerCase();
  if (
    nameLower.includes('phone') ||
    nameLower.includes('laptop') ||
    nameLower.includes('console')
  ) {
    return 'Back Market or eBay';
  }
  if (nameLower.includes('clothes') || nameLower.includes('shoes') || nameLower.includes('bag')) {
    return 'Vinted or Depop';
  }
  if (nameLower.includes('book')) {
    return 'Momox or Amazon';
  }
  return 'LeBonCoin or Facebook Marketplace';
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Get the display value for a scenario (for totals)
 * - sell_item: one-time amount
 * - job_lead: weekly earnings
 * - pause_expense: monthly savings
 * - karma_borrow: one-time savings (borrow = not buying)
 * - karma_trade/karma_lend: 0 (no monetary value)
 */
function getScenarioValue(scenario: Scenario): number {
  if (scenario.category === 'sell_item') {
    return scenario.oneTimeAmount ?? 0;
  }
  if (scenario.category === 'job_lead') {
    return scenario.weeklyEarnings ?? 0;
  }
  if (scenario.category === 'pause_expense') {
    return scenario.monthlyAmount ?? 0;
  }
  if (scenario.category === 'karma_borrow') {
    return scenario.oneTimeAmount ?? 0; // Borrow saves money
  }
  // Trade/lend karma actions have no monetary value
  return 0;
}

/**
 * Get the karma value for a scenario (for totals)
 */
function getScenarioKarma(scenario: Scenario): number {
  if (
    scenario.category === 'karma_lend' ||
    scenario.category === 'karma_trade' ||
    scenario.category === 'karma_borrow'
  ) {
    return scenario.karmaPoints ?? 0;
  }
  return 0;
}

/**
 * Get the subtitle text for a scenario (for list items)
 */
function getScenarioSubtitle(scenario: Scenario, currency: Currency): string {
  if (scenario.category === 'sell_item') {
    return `One-time: ${formatCurrency(scenario.oneTimeAmount ?? 0, currency)}`;
  }
  if (scenario.category === 'job_lead') {
    const hours = scenario.weeklyHours ?? 0;
    const earnings = scenario.weeklyEarnings ?? 0;
    return `${hours}h/wk • ${formatCurrency(earnings, currency)}/wk`;
  }
  if (scenario.category === 'pause_expense') {
    return `Save ${formatCurrency(scenario.monthlyAmount ?? 0, currency)}/month`;
  }
  if (
    scenario.category === 'karma_lend' ||
    scenario.category === 'karma_trade' ||
    scenario.category === 'karma_borrow'
  ) {
    return `+${scenario.karmaPoints ?? 0} karma points`;
  }
  return '';
}

// =============================================================================
// SCENARIO GENERATION (Pull Architecture)
// =============================================================================

/**
 * Generate scenarios using Pull Architecture
 *
 * Sources:
 * 1. Trade items with type='sell' → sell_item scenarios
 * 2. Leads with status='interested' → job_lead scenarios
 * 3. Lifestyle items not paused → pause_expense scenarios
 * 4. Trade items with type='trade'/'lend' → karma scenarios
 *
 * NO more skill-based scenarios! Skills are for job matching, not missions.
 */
function generateScenarios(
  trades: SwipeTabProps['trades'],
  lifestyle: SwipeTabProps['lifestyle'],
  leads: SwipeTabProps['leads'],
  context: SwipeContext,
  skills?: SwipeTabProps['skills']
): Scenario[] {
  const scenarios: Scenario[] = [];
  const { remainingAmount = 0, daysToGoal = 30 } = context;

  // 1. Sellable items (Trade type='sell', status not completed)
  trades
    ?.filter((t) => t.type === 'sell' && t.status !== 'completed')
    .forEach((item) => {
      const urgency = calculateSellUrgency(item.value, remainingAmount, daysToGoal);
      const platform = suggestPlatform(item.name);
      const goalImpact = remainingAmount > 0 ? (item.value / remainingAmount) * 100 : 0;

      scenarios.push({
        id: `sell_${item.id}`,
        title: `Sell ${item.name}`,
        description: `List on ${platform} for ${item.value}€`,
        category: 'sell_item',
        oneTimeAmount: item.value,
        effortLevel: 1,
        flexibilityScore: 5,
        source: 'trade',
        sourceId: item.id,
        urgency,
        metadata: { goalImpactPercent: goalImpact },
      });
    });

  // 2. Job leads (status='interested')
  const weeksRemaining = context.weeksRemaining ?? Math.ceil(daysToGoal / 7);
  // Prepare skill names for matching
  const skillNames = skills?.map((s) => s.name) || [];

  leads
    ?.filter((l) => l.status === 'interested')
    .forEach((lead) => {
      const avgSalary =
        lead.salaryMin && lead.salaryMax
          ? (lead.salaryMin + lead.salaryMax) / 2
          : lead.salaryMin || lead.salaryMax || 0;
      // salaryMin/salaryMax are already hourly rates, no need to divide
      const hourlyRate = avgSalary > 0 ? Math.round(avgSalary) : 15;
      const weeklyHours = 10; // Part-time student default
      const weeklyEarnings = hourlyRate * weeklyHours;
      const urgency = calculateJobUrgency(lead);

      // Calculate goal impact: total earnings over remaining weeks / remaining amount
      const totalEarnings = weeklyEarnings * weeksRemaining;
      const goalImpact = remainingAmount > 0 ? (totalEarnings / remainingAmount) * 100 : 0;

      // Calculate skill match for this job category
      const skillMatch =
        skillNames.length > 0 ? matchSkillsToCategory(skillNames, lead.category) : 0;

      scenarios.push({
        id: `job_${lead.id}`,
        title: lead.title,
        description: lead.company
          ? `Apply at ${lead.company}${lead.locationRaw ? ` - ${lead.locationRaw}` : ''}`
          : `${lead.title}${lead.locationRaw ? ` in ${lead.locationRaw}` : ''}`,
        category: 'job_lead',
        weeklyHours,
        weeklyEarnings,
        hourlyRate,
        effortLevel: lead.effortLevel || 3,
        flexibilityScore: 3,
        source: 'prospection',
        sourceId: lead.id,
        leadId: lead.id,
        urgency,
        metadata: {
          goalImpactPercent: goalImpact,
          matchScore: skillMatch,
        },
      });
    });

  // 3. Lifestyle items that can be paused (not already paused)
  // Calculate months remaining (for goal impact calculation)
  const monthsRemaining = Math.ceil(daysToGoal / 30);
  lifestyle
    ?.filter((l) => l.currentCost > 0 && !l.pausedMonths)
    .forEach((item) => {
      const urgency = calculateLifestyleUrgency(item);

      // Default pause: 1 month (can be adjusted in Checkpoint B)
      const defaultPauseMonths = 1;
      // Calculate goal impact: savings over pause period / remaining amount
      const totalSavings = item.currentCost * Math.min(defaultPauseMonths, monthsRemaining);
      const goalImpact = remainingAmount > 0 ? (totalSavings / remainingAmount) * 100 : 0;

      scenarios.push({
        id: `pause_${item.id}`,
        title: `Pause ${item.name}`,
        description: `Save ${item.currentCost}€/month by pausing`,
        category: 'pause_expense',
        monthlyAmount: item.currentCost,
        effortLevel: 1,
        flexibilityScore: 5,
        source: 'lifestyle',
        sourceId: item.id,
        urgency,
        metadata: { goalImpactPercent: goalImpact },
      });
    });

  // 4. Karma actions (Trade type='trade', 'lend', or 'borrow')
  trades
    ?.filter(
      (t) =>
        (t.type === 'trade' || t.type === 'lend' || t.type === 'borrow') && t.status !== 'completed'
    )
    .forEach((item) => {
      const isLend = item.type === 'lend';
      const isBorrow = item.type === 'borrow';

      // Determine title, description, category based on type
      let title: string;
      let description: string;
      let category: ScenarioCategory;
      let karmaPoints: number;
      let socialBenefit: string;

      if (isLend) {
        title = `Lend ${item.name}`;
        description = `Help someone by lending your ${item.name}`;
        category = 'karma_lend';
        karmaPoints = KARMA_POINTS.lend;
        socialBenefit = 'Build trust in your community';
      } else if (isBorrow) {
        title = `Borrow ${item.name}`;
        description = `Ask to borrow ${item.name} from someone`;
        category = 'karma_borrow';
        karmaPoints = KARMA_POINTS.borrow;
        socialBenefit = 'Save money by borrowing instead of buying';
      } else {
        // trade
        title = `Trade ${item.name}`;
        description = `Find someone to trade ${item.name} with`;
        category = 'karma_trade';
        karmaPoints = KARMA_POINTS.trade;
        socialBenefit = 'Get something you need without spending';
      }

      scenarios.push({
        id: `karma_${item.id}`,
        title,
        description,
        category,
        karmaPoints,
        socialBenefit,
        // Borrow has monetary value (savings), others don't
        oneTimeAmount: isBorrow ? item.value : undefined,
        effortLevel: 2,
        flexibilityScore: 4,
        source: 'trade',
        sourceId: item.id,
        urgency: { score: 30, reason: '✨ Good karma' }, // Lower priority
      });
    });

  // Sort by urgency score DESC (highest first)
  return scenarios.sort((a, b) => b.urgency.score - a.urgency.score).slice(0, 10);
}

export function SwipeTab(props: SwipeTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';

  const [phase, setPhase] = createSignal<'idle' | 'rolling' | 'swiping' | 'complete'>('idle');
  const [scenarios, setScenarios] = createSignal<Scenario[]>([]);
  const [selectedScenarios, setSelectedScenarios] = createSignal<Scenario[]>([]);
  const [rejectedScenarios, setRejectedScenarios] = createSignal<Scenario[]>([]);
  // BUG 3 FIX: Use initialPreferences from profile if available
  const [preferences, setPreferences] = createSignal<UserPreferences>(
    props.initialPreferences || {
      effortSensitivity: 0.5,
      hourlyRatePriority: 0.5,
      timeFlexibility: 0.5,
      incomeStability: 0.5,
    }
  );

  // Popup state for configuring rate on scenarios without pricing
  const [rateConfigPopup, setRateConfigPopup] = createSignal<{
    scenario: Scenario;
    weeklyHours: number;
    hourlyRate: number;
  } | null>(null);

  const handleRoll = () => {
    setPhase('rolling');

    // Build context for urgency calculations
    const context: SwipeContext = {
      goalAmount: props.goalContext?.goalAmount,
      currentAmount: props.goalContext?.currentAmount,
      remainingAmount: props.goalContext?.remainingAmount,
      daysToGoal: props.goalContext?.daysToGoal,
      today: new Date(),
    };

    // Generate scenarios using Pull Architecture (trades, lifestyle, leads)
    // Skills are passed for skill match display on job_lead scenarios
    const generated = generateScenarios(
      props.trades,
      props.lifestyle,
      props.leads,
      context,
      props.skills
    );
    setScenarios(generated);

    // Simulate rolling animation
    setTimeout(() => {
      setPhase('swiping');
    }, 1500);
  };

  // Track "meh" (strong dislike) items for future coloring in skills/inventory/lifestyle/trade tabs
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mehScenarioIds, setMehScenarioIds] = createSignal<Set<string>>(new Set());

  const handleSwipeComplete = (
    accepted: Scenario[],
    rejected: Scenario[],
    updatedPrefs: UserPreferences,
    mehIds?: Set<string>
  ) => {
    setSelectedScenarios(accepted);
    setRejectedScenarios(rejected);
    setPreferences(updatedPrefs);
    if (mehIds) {
      setMehScenarioIds(mehIds);
    }
    setPhase('complete');
    // Don't call callbacks yet - wait for user to click "Validate"
  };

  const handleValidate = () => {
    // Trigger celebration
    celebrateBig();

    // Check for swipe_master achievement
    const { newlyUnlocked } = updateAchievements({ swipeSessionCompleted: true });
    for (const achievement of newlyUnlocked) {
      onAchievementUnlock(achievement, {
        showToast: (type, title, message) => {
          if (type === 'success') {
            toastPopup.success(title, message);
          } else {
            toastPopup.info(title, message);
          }
        },
      });
    }

    // Show toast feedback
    const prefs = preferences();
    const scenarioCount = selectedScenarios().length;
    toastPopup.success(
      'Preferences saved!',
      `${scenarioCount} scenario${scenarioCount > 1 ? 's' : ''} added to your plan`
    );

    // Sprint 13.5: Debug log for swipe preference tracking
    // eslint-disable-next-line no-console
    console.debug('[SwipeTab] Calling onPreferencesChange:', prefs);

    // Call the callbacks after a short delay to let celebration start
    setTimeout(() => {
      props.onPreferencesChange?.(prefs);
      props.onScenariosSelected?.(selectedScenarios());
    }, 500);
  };

  const handleReset = () => {
    setPhase('idle');
    setScenarios([]);
    setSelectedScenarios([]);
    setRejectedScenarios([]);
  };

  // Feature J: Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = createSignal<{
    id: string;
    title: string;
  } | null>(null);

  // Handle scenario deletion from review phase - moves to rejected list
  const handleScenarioDelete = (scenarioId: string) => {
    const scenario = selectedScenarios().find((s) => s.id === scenarioId);
    if (scenario) {
      // Update AI profile (treat deletion as a rejection)
      const updatedPrefs = updatePreferences(preferences(), scenario, 'left');
      setPreferences(updatedPrefs);
      // Move to rejected list
      setRejectedScenarios((prev) => [...prev, scenario]);
    }

    setSelectedScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
    setDeleteConfirm(null);
  };

  // Handle adding a rejected scenario back to selected
  const handleAddFromRejected = (scenario: Scenario) => {
    // If scenario has no rate and is a job, show popup to configure
    // Sell/pause/karma scenarios don't need hourly rate
    const needsRateConfig =
      scenario.category === 'job_lead' &&
      (scenario.hourlyRate ?? 0) <= 0 &&
      (scenario.weeklyEarnings ?? 0) <= 0;
    if (needsRateConfig) {
      setRateConfigPopup({
        scenario,
        weeklyHours: scenario.weeklyHours || 5,
        hourlyRate: 15, // Default rate
      });
      return;
    }

    // Move from rejected to selected
    setRejectedScenarios((prev) => prev.filter((s) => s.id !== scenario.id));
    setSelectedScenarios((prev) => [...prev, scenario]);

    // Update AI profile (treat as acceptance)
    const updatedPrefs = updatePreferences(preferences(), scenario, 'right');
    setPreferences(updatedPrefs);
  };

  // Confirm adding scenario with configured rate
  const handleConfirmRateConfig = () => {
    const config = rateConfigPopup();
    if (!config) return;

    const { scenario, weeklyHours, hourlyRate } = config;

    // Create updated scenario with new rate
    const updatedScenario: Scenario = {
      ...scenario,
      weeklyHours,
      hourlyRate,
      weeklyEarnings: weeklyHours * hourlyRate,
    };

    // Move from rejected to selected
    setRejectedScenarios((prev) => prev.filter((s) => s.id !== scenario.id));
    setSelectedScenarios((prev) => [...prev, updatedScenario]);

    // Update AI profile
    const updatedPrefs = updatePreferences(preferences(), updatedScenario, 'right');
    setPreferences(updatedPrefs);

    setRateConfigPopup(null);
  };

  return (
    <div class={props.embedMode ? 'p-2' : 'p-6'}>
      {/* Idle Phase - Roll the Dice */}
      <Show when={phase() === 'idle'}>
        <div class="space-y-2">
          <RollDice onRoll={handleRoll} />
        </div>
      </Show>

      {/* Rolling Animation */}
      <Show when={phase() === 'rolling'}>
        <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Dices class="h-16 w-16 animate-bounce mb-6 text-primary" />
          <p class="text-lg animate-pulse">Generating scenarios...</p>
        </div>
      </Show>

      {/* Swiping Phase */}
      <Show when={phase() === 'swiping'}>
        <SwipeSession
          scenarios={scenarios()}
          initialPreferences={preferences()}
          currency={currency()}
          profileId={props.profileId}
          embedMode={props.embedMode}
          monthsRemaining={Math.ceil((props.goalContext?.daysToGoal ?? 30) / 30)}
          onComplete={handleSwipeComplete}
        />
      </Show>

      {/* Complete Phase - Summary before validation */}
      <Show when={phase() === 'complete'}>
        <div class="space-y-6 pb-24">
          {/* Header */}
          <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList class="h-6 w-6 text-primary" /> Review Your Plan
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Left Column: AI Profile + Rejected Scenarios */}
            <div class="space-y-4">
              {/* Preference Summary - Vertical Bars Layout (AI Context) */}
              <Card>
                <CardContent class="p-4">
                  <div class="flex items-center gap-2 mb-4">
                    <div class="p-1.5 bg-purple-500/10 rounded-lg">
                      <Bot class="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 class="font-bold text-sm text-foreground">AI Profile Analysis</h3>
                  </div>

                  {/* Pillars Container - Reduced height */}
                  <div class="flex items-end justify-around h-32 pt-2 px-2 sm:px-6 gap-3">
                    {/* Effort Pillar */}
                    <Tooltip>
                      <TooltipTrigger class="flex flex-col items-center gap-2 group w-12 sm:w-14 h-full cursor-default">
                        <div class="text-[9px] sm:text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                          {Math.round((1 - (preferences().effortSensitivity ?? 0.5)) * 100)}%
                        </div>
                        <div class="w-2.5 sm:w-3 bg-blue-100 dark:bg-blue-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-blue-500/20 transition-colors">
                          <div
                            class="absolute bottom-0 w-full bg-blue-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                            style={{
                              height: `${(1 - (preferences().effortSensitivity ?? 0.5)) * 100}%`,
                            }}
                          />
                        </div>
                        <span class="text-[9px] sm:text-[10px] font-bold text-muted-foreground group-hover:text-blue-500 transition-colors uppercase tracking-tight">
                          Effort
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Higher effort tolerance</TooltipContent>
                    </Tooltip>

                    {/* Pay Pillar */}
                    <Tooltip>
                      <TooltipTrigger class="flex flex-col items-center gap-2 group w-12 sm:w-14 h-full cursor-default">
                        <div class="text-[9px] sm:text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                          {Math.round((preferences().hourlyRatePriority ?? 0.5) * 100)}%
                        </div>
                        <div class="w-2.5 sm:w-3 bg-green-100 dark:bg-green-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-green-500/20 transition-colors">
                          <div
                            class="absolute bottom-0 w-full bg-green-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                            style={{
                              height: `${(preferences().hourlyRatePriority ?? 0.5) * 100}%`,
                            }}
                          />
                        </div>
                        <span class="text-[9px] sm:text-[10px] font-bold text-muted-foreground group-hover:text-green-500 transition-colors uppercase tracking-tight">
                          Pay
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Importance of high pay</TooltipContent>
                    </Tooltip>

                    {/* Flex Pillar */}
                    <Tooltip>
                      <TooltipTrigger class="flex flex-col items-center gap-2 group w-12 sm:w-14 h-full cursor-default">
                        <div class="text-[9px] sm:text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                          {Math.round((preferences().timeFlexibility ?? 0.5) * 100)}%
                        </div>
                        <div class="w-2.5 sm:w-3 bg-purple-100 dark:bg-purple-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-purple-500/20 transition-colors">
                          <div
                            class="absolute bottom-0 w-full bg-purple-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                            style={{ height: `${(preferences().timeFlexibility ?? 0.5) * 100}%` }}
                          />
                        </div>
                        <span class="text-[9px] sm:text-[10px] font-bold text-muted-foreground group-hover:text-purple-500 transition-colors uppercase tracking-tight">
                          Flex
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Need for flexibility</TooltipContent>
                    </Tooltip>

                    {/* Stability Pillar */}
                    <Tooltip>
                      <TooltipTrigger class="flex flex-col items-center gap-2 group w-12 sm:w-14 h-full cursor-default">
                        <div class="text-[9px] sm:text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                          {Math.round((preferences().incomeStability ?? 0.5) * 100)}%
                        </div>
                        <div class="w-2.5 sm:w-3 bg-amber-100 dark:bg-amber-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-amber-500/20 transition-colors">
                          <div
                            class="absolute bottom-0 w-full bg-amber-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                            style={{ height: `${(preferences().incomeStability ?? 0.5) * 100}%` }}
                          />
                        </div>
                        <span class="text-[9px] sm:text-[10px] font-bold text-muted-foreground group-hover:text-amber-500 transition-colors uppercase tracking-tight">
                          Stable
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Income stability priority</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>

              {/* Rejected Scenarios - Below AI Profile */}
              <Show when={rejectedScenarios().length > 0}>
                <Card class="border-red-200 dark:border-red-900/50">
                  <CardContent class="p-4">
                    <h3 class="font-medium text-sm text-muted-foreground mb-3">
                      Skipped ({rejectedScenarios().length})
                    </h3>
                    <div class="space-y-1.5 max-h-48 overflow-y-auto">
                      <For each={rejectedScenarios()}>
                        {(scenario) => (
                          <div class="group flex items-center justify-between p-2 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/30 hover:border-red-200 dark:hover:border-red-800/50 transition-colors">
                            <div class="flex-1 min-w-0">
                              <p class="text-sm font-medium text-foreground truncate">
                                {scenario.title}
                              </p>
                              <p class="text-xs text-muted-foreground">
                                {getScenarioSubtitle(scenario, currency())}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddFromRejected(scenario)}
                              class="p-1.5 rounded-md text-muted-foreground hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all"
                              title="Add to plan"
                            >
                              <Plus class="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>

                    <div class="mt-3 pt-3 border-t border-red-100 dark:border-red-900/30">
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">Missed potential</span>
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(
                              rejectedScenarios().reduce((sum, s) => sum + getScenarioValue(s), 0),
                              currency()
                            )}
                          </span>
                          <Show
                            when={
                              rejectedScenarios().reduce((sum, s) => sum + getScenarioKarma(s), 0) >
                              0
                            }
                          >
                            <span class="font-bold text-purple-600 dark:text-purple-400">
                              +
                              {rejectedScenarios().reduce((sum, s) => sum + getScenarioKarma(s), 0)}{' '}
                              karma
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Show>
            </div>

            {/* Selected Scenarios */}
            <Card class="h-full">
              <CardContent class="p-6">
                <h3 class="font-medium text-foreground mb-4">
                  Selected scenarios ({selectedScenarios().length})
                </h3>
                <div class="space-y-2">
                  <For each={selectedScenarios()}>
                    {(scenario) => (
                      <div class="group flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border hover:border-border/80 transition-colors">
                        <div class="flex-1 min-w-0">
                          <p class="font-medium text-foreground">{scenario.title}</p>
                          <p class="text-sm text-muted-foreground">
                            {getScenarioSubtitle(scenario, currency())}
                          </p>
                        </div>
                        <div class="flex items-center gap-2">
                          <Check class="h-5 w-5 text-green-600 dark:text-green-400" />
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({ id: scenario.id, title: scenario.title })
                            }
                            class="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                            title="Remove scenario"
                          >
                            <Trash2 class="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>

                <div class="mt-4 pt-4 border-t border-border">
                  <div class="flex flex-col items-center justify-center text-center">
                    <span class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Total potential
                    </span>
                    <div class="flex items-center gap-4">
                      <span class="text-3xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(
                          selectedScenarios().reduce((sum, s) => sum + getScenarioValue(s), 0),
                          currency()
                        )}
                      </span>
                      <Show
                        when={
                          selectedScenarios().reduce((sum, s) => sum + getScenarioKarma(s), 0) > 0
                        }
                      >
                        <span class="text-2xl font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                          +{selectedScenarios().reduce((sum, s) => sum + getScenarioKarma(s), 0)}
                          <span class="text-base">karma</span>
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions - Sticky Footer */}
          <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-50 bg-background/95 backdrop-blur border border-border rounded-lg p-4 shadow-lg flex gap-3">
            <Button variant="outline" class="flex-1" onClick={handleReset}>
              <RotateCcw class="h-4 w-4 mr-2" />
              Start over
            </Button>
            <Button class="flex-1" onClick={handleValidate}>
              <Check class="h-4 w-4 mr-2" />
              Validate plan
            </Button>
          </div>
        </div>
      </Show>

      {/* Feature J: Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm()}
        title="Remove scenario?"
        message={`Remove "${deleteConfirm()?.title}" from your plan?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => handleScenarioDelete(deleteConfirm()!.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Rate configuration popup for scenarios without pricing */}
      <Show when={rateConfigPopup()}>
        {(config) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Card class="w-full max-w-sm mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
              <CardContent class="p-6">
                {/* Header */}
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-bold text-lg text-foreground">Set Rate</h3>
                  <button
                    type="button"
                    onClick={() => setRateConfigPopup(null)}
                    class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X class="h-5 w-5" />
                  </button>
                </div>

                {/* Scenario info */}
                <div class="mb-6 p-3 bg-muted/50 rounded-lg">
                  <p class="font-medium text-foreground">{config().scenario.title}</p>
                  <p class="text-sm text-muted-foreground">{config().scenario.description}</p>
                </div>

                {/* Form fields */}
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-foreground mb-1.5">
                      Hours per week
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="40"
                      value={config().weeklyHours}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setRateConfigPopup({
                          ...config(),
                          weeklyHours: parseInt(e.currentTarget.value) || 1,
                        })
                      }
                      class="w-full"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-foreground mb-1.5">
                      Hourly rate ({getCurrencySymbol(currency())})
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="200"
                      value={config().hourlyRate}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setRateConfigPopup({
                          ...config(),
                          hourlyRate: parseInt(e.currentTarget.value) || 1,
                        })
                      }
                      class="w-full"
                    />
                  </div>

                  {/* Preview */}
                  <div class="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900/50">
                    <div class="flex items-center justify-between">
                      <span class="text-sm text-muted-foreground">Weekly earnings</span>
                      <span class="font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(config().weeklyHours * config().hourlyRate, currency())}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div class="flex gap-3 mt-6">
                  <Button variant="outline" class="flex-1" onClick={() => setRateConfigPopup(null)}>
                    Cancel
                  </Button>
                  <Button class="flex-1" onClick={handleConfirmRateConfig}>
                    <Plus class="h-4 w-4 mr-2" />
                    Add to plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </Show>
    </div>
  );
}
