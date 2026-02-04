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

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade' | 'job';
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number; // 1-5
  flexibilityScore: number; // 1-5
  hourlyRate: number;
  isDefault?: boolean; // true for suggested/fallback scenarios
  /** Source of the scenario for badge display */
  source?: 'skill' | 'item' | 'lifestyle' | 'jobs' | 'default';
  /** Original lead ID if source is 'jobs' */
  leadId?: string;
}

export interface UserPreferences {
  effortSensitivity: number;
  hourlyRatePriority: number;
  timeFlexibility: number;
  incomeStability: number;
}

interface SwipeTabProps {
  skills?: { name: string; hourlyRate: number }[];
  items?: { name: string; estimatedValue: number }[];
  lifestyle?: { name: string; currentCost: number; pausedMonths?: number }[];
  trades?: { name: string; value: number }[];
  /** Leads marked as "interested" from Jobs tab (Phase 4: Leads → Swipe) */
  leads?: Lead[];
  currency?: Currency;
  /** Whether component is rendered in embed mode (iframe context) */
  embedMode?: boolean;
  // BUG 3 FIX: Add initialPreferences to load saved preferences from profile
  initialPreferences?: UserPreferences;
  /** Profile ID for tracing swipe preferences to Opik */
  profileId?: string;
  onPreferencesChange?: (prefs: UserPreferences) => void;
  onScenariosSelected?: (scenarios: Scenario[]) => void;
}

/**
 * Generate scenarios from leads marked as "interested" (Phase 4: Leads → Swipe)
 */
function generateLeadScenarios(leads: Lead[] | undefined): Scenario[] {
  if (!leads || leads.length === 0) return [];

  return leads
    .filter((lead) => lead.status === 'interested')
    .map((lead, index) => {
      // Calculate hourly rate from salary range (assume monthly, 160h/month)
      const avgSalary =
        lead.salaryMin && lead.salaryMax
          ? (lead.salaryMin + lead.salaryMax) / 2
          : lead.salaryMin || lead.salaryMax || 0;
      const hourlyRate = avgSalary > 0 ? Math.round(avgSalary / 160) : 15;

      // Estimate weekly hours based on job type (part-time assumption for students)
      const weeklyHours = 10; // Default for part-time student job

      return {
        id: `lead_${lead.id}_${index}`,
        title: lead.title,
        description: lead.company
          ? `${lead.title} at ${lead.company}${lead.locationRaw ? ` - ${lead.locationRaw}` : ''}`
          : `${lead.title}${lead.locationRaw ? ` in ${lead.locationRaw}` : ''}`,
        category: 'job' as const,
        weeklyHours,
        weeklyEarnings: hourlyRate * weeklyHours,
        effortLevel: lead.effortLevel || 3,
        flexibilityScore: 3, // Jobs are less flexible than freelance
        hourlyRate,
        source: 'jobs' as const,
        leadId: lead.id,
      };
    });
}

// Generate scenarios based on user data
function generateScenarios(
  skills: SwipeTabProps['skills'],
  items: SwipeTabProps['items'],
  lifestyle: SwipeTabProps['lifestyle'],
  leads?: Lead[]
): Scenario[] {
  const scenarios: Scenario[] = [];

  // Phase 4: Lead-based scenarios (jobs marked as "interested")
  // These appear first as they represent concrete opportunities
  const leadScenarios = generateLeadScenarios(leads);
  scenarios.push(...leadScenarios);

  // Skill-based scenarios
  skills?.forEach((skill, index) => {
    scenarios.push({
      id: `skill_${index}`,
      title: `Freelance ${skill.name}`,
      description: `Offer ${skill.name} services on platforms like Malt or Fiverr`,
      category: 'freelance',
      weeklyHours: 5,
      weeklyEarnings: skill.hourlyRate * 5,
      effortLevel: 4,
      flexibilityScore: 5,
      hourlyRate: skill.hourlyRate,
      source: 'skill',
    });

    scenarios.push({
      id: `tutoring_${index}`,
      title: `${skill.name} Tutoring`,
      description: `Give ${skill.name} tutoring sessions to high school or college students`,
      category: 'tutoring',
      weeklyHours: 3,
      weeklyEarnings: (skill.hourlyRate - 3) * 3,
      effortLevel: 3,
      flexibilityScore: 4,
      hourlyRate: skill.hourlyRate - 3,
      source: 'skill',
    });
  });

  // Item-based scenarios
  items?.forEach((item, index) => {
    scenarios.push({
      id: `sell_${index}`,
      title: `Sell ${item.name}`,
      description: `List ${item.name} for sale on Craigslist or eBay`,
      category: 'selling',
      weeklyHours: 1,
      weeklyEarnings: Math.round(item.estimatedValue / 2), // Half over 2 weeks
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: Math.round(item.estimatedValue / 2),
      source: 'item',
    });
  });

  // Lifestyle pause savings scenarios
  const totalPauseSavings =
    lifestyle?.reduce((sum, item) => {
      const paused = item.pausedMonths || 0;
      return sum + paused * item.currentCost;
    }, 0) || 0;

  if (totalPauseSavings > 0) {
    scenarios.push({
      id: 'lifestyle_pause',
      title: 'Pause my expenses',
      description: `Pause subscriptions to save ${totalPauseSavings} toward your goal`,
      category: 'lifestyle',
      weeklyHours: 0,
      weeklyEarnings: Math.round(totalPauseSavings / 4),
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: 0,
      source: 'lifestyle',
    });
  }

  // Default scenarios ONLY if user has no custom scenarios
  // This prevents "babysitting" showing when user has real skills
  if (scenarios.length === 0) {
    const defaults: Scenario[] = [
      {
        id: 'default_1',
        title: 'Baby-sitting',
        description: 'Watch children in the evening or on weekends',
        category: 'freelance',
        weeklyHours: 4,
        weeklyEarnings: 48,
        effortLevel: 2,
        flexibilityScore: 3,
        hourlyRate: 12,
        isDefault: true,
        source: 'default',
      },
      {
        id: 'default_2',
        title: 'Uber Eats Delivery',
        description: 'Deliver meals by bike or scooter',
        category: 'freelance',
        weeklyHours: 6,
        weeklyEarnings: 60,
        effortLevel: 3,
        flexibilityScore: 5,
        hourlyRate: 10,
        isDefault: true,
        source: 'default',
      },
      {
        id: 'default_3',
        title: 'Homework Help',
        description: 'Help middle schoolers with their homework',
        category: 'tutoring',
        weeklyHours: 3,
        weeklyEarnings: 45,
        effortLevel: 2,
        flexibilityScore: 4,
        hourlyRate: 15,
        isDefault: true,
        source: 'default',
      },
      {
        id: 'default_4',
        title: 'Sell Clothes',
        description: 'Sort and sell clothes you no longer wear',
        category: 'selling',
        weeklyHours: 2,
        weeklyEarnings: 30,
        effortLevel: 1,
        flexibilityScore: 5,
        hourlyRate: 15,
        isDefault: true,
        source: 'default',
      },
    ];

    scenarios.push(...defaults);
  }

  return scenarios.slice(0, 8); // Max 8 scenarios
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

    // Generate scenarios based on user data (Phase 4: now includes leads)
    const generated = generateScenarios(props.skills, props.items, props.lifestyle, props.leads);
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
    // If scenario has no rate, show popup to configure
    if (scenario.hourlyRate <= 0 && scenario.weeklyEarnings <= 0) {
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
                                {scenario.weeklyHours}h/wk •{' '}
                                {scenario.weeklyEarnings > 0
                                  ? formatCurrency(scenario.weeklyEarnings, currency())
                                  : 'No rate'}
                                /wk
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
                        <span class="font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(
                            rejectedScenarios().reduce((sum, s) => sum + s.weeklyEarnings, 0),
                            currency()
                          )}
                          /wk
                        </span>
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
                            {scenario.weeklyHours}h/wk •{' '}
                            {formatCurrency(scenario.weeklyEarnings, currency())}/wk
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
                    <span class="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(
                        selectedScenarios().reduce((sum, s) => sum + s.weeklyEarnings, 0),
                        currency()
                      )}
                      <span class="text-sm font-medium text-muted-foreground ml-1">/wk</span>
                    </span>
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
