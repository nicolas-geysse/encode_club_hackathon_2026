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
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Progress } from '~/components/ui/Progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { ClipboardList, RotateCcw, Check, Dices, Trash2, Bot } from 'lucide-solid';

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade';
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number; // 1-5
  flexibilityScore: number; // 1-5
  hourlyRate: number;
  isDefault?: boolean; // true for suggested/fallback scenarios
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
  currency?: Currency;
  // BUG 3 FIX: Add initialPreferences to load saved preferences from profile
  initialPreferences?: UserPreferences;
  onPreferencesChange?: (prefs: UserPreferences) => void;
  onScenariosSelected?: (scenarios: Scenario[]) => void;
}

// Generate scenarios based on user data
function generateScenarios(
  skills: SwipeTabProps['skills'],
  items: SwipeTabProps['items'],
  lifestyle: SwipeTabProps['lifestyle']
): Scenario[] {
  const scenarios: Scenario[] = [];

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
  // BUG 3 FIX: Use initialPreferences from profile if available
  const [preferences, setPreferences] = createSignal<UserPreferences>(
    props.initialPreferences || {
      effortSensitivity: 0.5,
      hourlyRatePriority: 0.5,
      timeFlexibility: 0.5,
      incomeStability: 0.5,
    }
  );

  const handleRoll = () => {
    setPhase('rolling');

    // Generate scenarios based on user data
    const generated = generateScenarios(props.skills, props.items, props.lifestyle);
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

    // Call the callbacks after a short delay to let celebration start
    setTimeout(() => {
      props.onPreferencesChange?.(preferences());
      props.onScenariosSelected?.(selectedScenarios());
    }, 500);
  };

  const handleReset = () => {
    setPhase('idle');
    setScenarios([]);
    setSelectedScenarios([]);
  };

  // Feature J: Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = createSignal<{
    id: string;
    title: string;
  } | null>(null);

  // Handle scenario deletion from review phase
  const handleScenarioDelete = (scenarioId: string) => {
    // Reactivity: Update AI profile (treat deletion as a rejection)
    const scenario = selectedScenarios().find((s) => s.id === scenarioId);
    if (scenario) {
      const updatedPrefs = updatePreferences(preferences(), scenario, 'left');
      setPreferences(updatedPrefs);
    }

    setSelectedScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
    setDeleteConfirm(null);
  };

  return (
    <div class="p-6">
      {/* Idle Phase - Roll the Dice */}
      <Show when={phase() === 'idle'}>
        <RollDice onRoll={handleRoll} />
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
          onComplete={handleSwipeComplete}
        />
      </Show>

      {/* Complete Phase - Summary before validation */}
      <Show when={phase() === 'complete'}>
        <div class="space-y-6">
          <div class="text-center">
            <ClipboardList class="h-12 w-12 mx-auto mb-4 text-primary" />
            <h2 class="text-2xl font-bold text-foreground">Review Your Plan</h2>
            <p class="text-muted-foreground mt-2">
              I've learned your preferences. Review your selections before validating.
            </p>
          </div>

          {/* Preference Summary - Vertical Bars Layout (AI Context) */}
          <Card>
            <CardContent class="p-6">
              <div class="flex items-center gap-2 mb-6">
                <div class="p-1.5 bg-purple-500/10 rounded-lg">
                  <Bot class="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 class="font-bold text-foreground">AI Profile Analysis</h3>
              </div>

              {/* Pillars Container */}
              <div class="flex items-end justify-around h-48 pt-4 px-2 sm:px-8 gap-4">
                {/* Effort Pillar */}
                <Tooltip>
                  <TooltipTrigger class="flex flex-col items-center gap-3 group w-14 sm:w-16 h-full cursor-default">
                    <div class="text-[10px] sm:text-xs font-mono text-muted-foreground mb-1 group-hover:text-foreground transition-colors">
                      {Math.round((1 - (preferences().effortSensitivity ?? 0.5)) * 100)}%
                    </div>
                    <div class="w-3 sm:w-4 bg-blue-100 dark:bg-blue-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-blue-500/20 transition-colors">
                      <div
                        class="absolute bottom-0 w-full bg-blue-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                        style={{
                          height: `${(1 - (preferences().effortSensitivity ?? 0.5)) * 100}%`,
                        }}
                      />
                    </div>
                    <span class="text-[10px] sm:text-xs font-bold text-muted-foreground group-hover:text-blue-500 transition-colors uppercase tracking-tight">
                      Effort
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Higher effort tolerance</TooltipContent>
                </Tooltip>

                {/* Pay Pillar */}
                <Tooltip>
                  <TooltipTrigger class="flex flex-col items-center gap-3 group w-14 sm:w-16 h-full cursor-default">
                    <div class="text-[10px] sm:text-xs font-mono text-muted-foreground mb-1 group-hover:text-foreground transition-colors">
                      {Math.round((preferences().hourlyRatePriority ?? 0.5) * 100)}%
                    </div>
                    <div class="w-3 sm:w-4 bg-green-100 dark:bg-green-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-green-500/20 transition-colors">
                      <div
                        class="absolute bottom-0 w-full bg-green-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                        style={{ height: `${(preferences().hourlyRatePriority ?? 0.5) * 100}%` }}
                      />
                    </div>
                    <span class="text-[10px] sm:text-xs font-bold text-muted-foreground group-hover:text-green-500 transition-colors uppercase tracking-tight">
                      Pay
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Importance of high pay</TooltipContent>
                </Tooltip>

                {/* Flex Pillar */}
                <Tooltip>
                  <TooltipTrigger class="flex flex-col items-center gap-3 group w-14 sm:w-16 h-full cursor-default">
                    <div class="text-[10px] sm:text-xs font-mono text-muted-foreground mb-1 group-hover:text-foreground transition-colors">
                      {Math.round((preferences().timeFlexibility ?? 0.5) * 100)}%
                    </div>
                    <div class="w-3 sm:w-4 bg-purple-100 dark:bg-purple-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-purple-500/20 transition-colors">
                      <div
                        class="absolute bottom-0 w-full bg-purple-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                        style={{ height: `${(preferences().timeFlexibility ?? 0.5) * 100}%` }}
                      />
                    </div>
                    <span class="text-[10px] sm:text-xs font-bold text-muted-foreground group-hover:text-purple-500 transition-colors uppercase tracking-tight">
                      Flex
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Need for flexibility</TooltipContent>
                </Tooltip>

                {/* Stability Pillar */}
                <Tooltip>
                  <TooltipTrigger class="flex flex-col items-center gap-3 group w-14 sm:w-16 h-full cursor-default">
                    <div class="text-[10px] sm:text-xs font-mono text-muted-foreground mb-1 group-hover:text-foreground transition-colors">
                      {Math.round((preferences().incomeStability ?? 0.5) * 100)}%
                    </div>
                    <div class="w-3 sm:w-4 bg-amber-100 dark:bg-amber-950/30 rounded-full relative flex-grow overflow-hidden border border-transparent group-hover:border-amber-500/20 transition-colors">
                      <div
                        class="absolute bottom-0 w-full bg-amber-500 rounded-full transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                        style={{ height: `${(preferences().incomeStability ?? 0.5) * 100}%` }}
                      />
                    </div>
                    <span class="text-[10px] sm:text-xs font-bold text-muted-foreground group-hover:text-amber-500 transition-colors uppercase tracking-tight">
                      Stable
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Income stability priority</TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* Selected Scenarios */}
          <Card>
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
                <div class="flex justify-between text-lg font-bold text-foreground">
                  <span>Total potential:</span>
                  <span class="text-green-600 dark:text-green-400">
                    {formatCurrency(
                      selectedScenarios().reduce((sum, s) => sum + s.weeklyEarnings, 0),
                      currency()
                    )}
                    /wk
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div class="flex gap-4">
            <Button variant="outline" class="flex-1" onClick={handleReset}>
              <RotateCcw class="h-4 w-4 mr-2" />
              Start over
            </Button>
            <Button class="flex-1" onClick={handleValidate}>
              <Check class="h-4 w-4 mr-2" />
              Validate my plan
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
    </div>
  );
}
