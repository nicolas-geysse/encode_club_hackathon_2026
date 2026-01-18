/**
 * Swipe Tab Component
 *
 * Roll the Dice + Swipe Scenarios for preference learning.
 */

import { createSignal, Show, For } from 'solid-js';
import { RollDice } from '../swipe/RollDice';
import { SwipeSession } from '../swipe/SwipeSession';
import { celebrateBig } from '~/lib/confetti';
import { formatCurrency, type Currency } from '~/lib/dateUtils';

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
  const [preferences, setPreferences] = createSignal<UserPreferences>({
    effortSensitivity: 0.5,
    hourlyRatePriority: 0.5,
    timeFlexibility: 0.5,
    incomeStability: 0.5,
  });

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

  return (
    <div class="p-6 max-w-5xl mx-auto">
      {/* Idle Phase - Roll the Dice */}
      <Show when={phase() === 'idle'}>
        <RollDice onRoll={handleRoll} />
      </Show>

      {/* Rolling Animation */}
      <Show when={phase() === 'rolling'}>
        <div class="flex flex-col items-center justify-center py-20">
          <div class="text-6xl animate-bounce mb-6">🎲</div>
          <p class="text-lg text-slate-600 animate-pulse">Generating scenarios...</p>
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
            <div class="text-4xl mb-4">📋</div>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Review Your Plan</h2>
            <p class="text-slate-500 dark:text-slate-400 mt-2">
              I've learned your preferences. Review your selections before validating.
            </p>
          </div>

          {/* Preference Summary */}
          <div class="card bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30">
            <h3 class="font-medium text-primary-900 dark:text-primary-100 mb-3">Your profile</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-primary-600 dark:text-primary-400">💪 Effort tolerance:</span>
                <div class="mt-1 h-2 bg-primary-200 dark:bg-primary-700 rounded-full">
                  <div
                    class="h-full bg-primary-600 dark:bg-primary-400 rounded-full"
                    style={{ width: `${(1 - preferences().effortSensitivity) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600 dark:text-primary-400">💰 Pay priority:</span>
                <div class="mt-1 h-2 bg-primary-200 dark:bg-primary-700 rounded-full">
                  <div
                    class="h-full bg-primary-600 dark:bg-primary-400 rounded-full"
                    style={{ width: `${preferences().hourlyRatePriority * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600 dark:text-primary-400">📅 Schedule flexibility:</span>
                <div class="mt-1 h-2 bg-primary-200 dark:bg-primary-700 rounded-full">
                  <div
                    class="h-full bg-primary-600 dark:bg-primary-400 rounded-full"
                    style={{ width: `${preferences().timeFlexibility * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600 dark:text-primary-400">🛡️ Income stability:</span>
                <div class="mt-1 h-2 bg-primary-200 dark:bg-primary-700 rounded-full">
                  <div
                    class="h-full bg-primary-600 dark:bg-primary-400 rounded-full"
                    style={{ width: `${preferences().incomeStability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Selected Scenarios */}
          <div class="card bg-white dark:bg-slate-800">
            <h3 class="font-medium text-slate-900 dark:text-slate-100 mb-3">
              Selected scenarios ({selectedScenarios().length})
            </h3>
            <div class="space-y-2">
              <For each={selectedScenarios()}>
                {(scenario) => (
                  <div class="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div>
                      <p class="font-medium text-green-900 dark:text-green-100">{scenario.title}</p>
                      <p class="text-sm text-green-600 dark:text-green-400">
                        {scenario.weeklyHours}h/wk •{' '}
                        {formatCurrency(scenario.weeklyEarnings, currency())}/wk
                      </p>
                    </div>
                    <span class="text-green-500 dark:text-green-400 text-xl">✓</span>
                  </div>
                )}
              </For>
            </div>

            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div class="flex justify-between text-lg font-bold text-slate-900 dark:text-slate-100">
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
          </div>

          {/* Actions */}
          <div class="flex gap-4">
            <button type="button" class="btn-secondary flex-1" onClick={handleReset}>
              Start over
            </button>
            <button type="button" class="btn-primary flex-1" onClick={handleValidate}>
              Validate my plan
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
