/**
 * Swipe Tab Component
 *
 * Roll the Dice + Swipe Scenarios for preference learning.
 */

import { createSignal, Show, For } from 'solid-js';
import { RollDice } from '../swipe/RollDice';
import { SwipeSession } from '../swipe/SwipeSession';

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
  lifestyle?: { name: string; optimizedCost?: number; currentCost: number }[];
  trades?: { name: string; value: number }[];
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
      description: `Proposer des services en ${skill.name} sur des plateformes comme Malt ou Fiverr`,
      category: 'freelance',
      weeklyHours: 5,
      weeklyEarnings: skill.hourlyRate * 5,
      effortLevel: 4,
      flexibilityScore: 5,
      hourlyRate: skill.hourlyRate,
    });

    scenarios.push({
      id: `tutoring_${index}`,
      title: `Cours particuliers ${skill.name}`,
      description: `Donner des cours particuliers en ${skill.name} a des lyceens ou etudiants`,
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
      title: `Vendre ${item.name}`,
      description: `Mettre en vente ${item.name} sur Leboncoin ou Vinted`,
      category: 'selling',
      weeklyHours: 1,
      weeklyEarnings: Math.round(item.estimatedValue / 2), // Half over 2 weeks
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: Math.round(item.estimatedValue / 2),
    });
  });

  // Lifestyle optimization scenarios
  const totalSavings =
    lifestyle?.reduce((sum, item) => {
      if (item.optimizedCost !== undefined) {
        return sum + (item.currentCost - item.optimizedCost);
      }
      return sum;
    }, 0) || 0;

  if (totalSavings > 0) {
    scenarios.push({
      id: 'lifestyle_opt',
      title: 'Optimiser mes depenses',
      description: `Appliquer les optimisations lifestyle pour economiser ${totalSavings}€/mois`,
      category: 'lifestyle',
      weeklyHours: 0,
      weeklyEarnings: Math.round(totalSavings / 4),
      effortLevel: 1,
      flexibilityScore: 5,
      hourlyRate: 0,
    });
  }

  // Default scenarios if not enough data
  if (scenarios.length < 4) {
    const defaults: Scenario[] = [
      {
        id: 'default_1',
        title: 'Baby-sitting',
        description: 'Garder des enfants le soir ou le week-end',
        category: 'freelance',
        weeklyHours: 4,
        weeklyEarnings: 48,
        effortLevel: 2,
        flexibilityScore: 3,
        hourlyRate: 12,
      },
      {
        id: 'default_2',
        title: 'Livraison Uber Eats',
        description: 'Livrer des repas en velo ou scooter',
        category: 'freelance',
        weeklyHours: 6,
        weeklyEarnings: 60,
        effortLevel: 3,
        flexibilityScore: 5,
        hourlyRate: 10,
      },
      {
        id: 'default_3',
        title: 'Aide aux devoirs',
        description: 'Aider des collegiens avec leurs devoirs',
        category: 'tutoring',
        weeklyHours: 3,
        weeklyEarnings: 45,
        effortLevel: 2,
        flexibilityScore: 4,
        hourlyRate: 15,
      },
      {
        id: 'default_4',
        title: 'Vente de vetements',
        description: 'Trier et vendre les vetements que tu ne portes plus',
        category: 'selling',
        weeklyHours: 2,
        weeklyEarnings: 30,
        effortLevel: 1,
        flexibilityScore: 5,
        hourlyRate: 15,
      },
    ];

    defaults.forEach((d) => {
      if (!scenarios.find((s) => s.id === d.id)) {
        scenarios.push(d);
      }
    });
  }

  return scenarios.slice(0, 8); // Max 8 scenarios
}

export function SwipeTab(props: SwipeTabProps) {
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

  const handleSwipeComplete = (
    accepted: Scenario[],
    rejected: Scenario[],
    updatedPrefs: UserPreferences
  ) => {
    setSelectedScenarios(accepted);
    setPreferences(updatedPrefs);
    setPhase('complete');

    props.onPreferencesChange?.(updatedPrefs);
    props.onScenariosSelected?.(accepted);
  };

  const handleReset = () => {
    setPhase('idle');
    setScenarios([]);
    setSelectedScenarios([]);
  };

  return (
    <div class="p-6 max-w-3xl mx-auto">
      {/* Idle Phase - Roll the Dice */}
      <Show when={phase() === 'idle'}>
        <RollDice onRoll={handleRoll} />
      </Show>

      {/* Rolling Animation */}
      <Show when={phase() === 'rolling'}>
        <div class="flex flex-col items-center justify-center py-20">
          <div class="text-6xl animate-bounce mb-6">🎲</div>
          <p class="text-lg text-slate-600 animate-pulse">Generation des scenarios...</p>
        </div>
      </Show>

      {/* Swiping Phase */}
      <Show when={phase() === 'swiping'}>
        <SwipeSession
          scenarios={scenarios()}
          initialPreferences={preferences()}
          onComplete={handleSwipeComplete}
        />
      </Show>

      {/* Complete Phase - Results */}
      <Show when={phase() === 'complete'}>
        <div class="space-y-6">
          <div class="text-center">
            <div class="text-4xl mb-4">🎉</div>
            <h2 class="text-2xl font-bold text-slate-900">C'est fait !</h2>
            <p class="text-slate-500 mt-2">
              J'ai appris tes preferences. Voici ton plan personnalise.
            </p>
          </div>

          {/* Preference Summary */}
          <div class="card bg-gradient-to-br from-primary-50 to-primary-100">
            <h3 class="font-medium text-primary-900 mb-3">Ton profil</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-primary-600">Effort tolerance:</span>
                <div class="mt-1 h-2 bg-primary-200 rounded-full">
                  <div
                    class="h-full bg-primary-600 rounded-full"
                    style={{ width: `${(1 - preferences().effortSensitivity) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600">Priorite salaire:</span>
                <div class="mt-1 h-2 bg-primary-200 rounded-full">
                  <div
                    class="h-full bg-primary-600 rounded-full"
                    style={{ width: `${preferences().hourlyRatePriority * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600">Flexibilite horaire:</span>
                <div class="mt-1 h-2 bg-primary-200 rounded-full">
                  <div
                    class="h-full bg-primary-600 rounded-full"
                    style={{ width: `${preferences().timeFlexibility * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span class="text-primary-600">Stabilite revenus:</span>
                <div class="mt-1 h-2 bg-primary-200 rounded-full">
                  <div
                    class="h-full bg-primary-600 rounded-full"
                    style={{ width: `${preferences().incomeStability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Selected Scenarios */}
          <div class="card">
            <h3 class="font-medium text-slate-900 mb-3">
              Scenarios selectionnes ({selectedScenarios().length})
            </h3>
            <div class="space-y-2">
              <For each={selectedScenarios()}>
                {(scenario) => (
                  <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p class="font-medium text-green-900">{scenario.title}</p>
                      <p class="text-sm text-green-600">
                        {scenario.weeklyHours}h/sem • {scenario.weeklyEarnings}€/sem
                      </p>
                    </div>
                    <span class="text-green-500 text-xl">✓</span>
                  </div>
                )}
              </For>
            </div>

            <div class="mt-4 pt-4 border-t border-slate-200">
              <div class="flex justify-between text-lg font-bold">
                <span>Total potentiel:</span>
                <span class="text-green-600">
                  {selectedScenarios().reduce((sum, s) => sum + s.weeklyEarnings, 0)}€/sem
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div class="flex gap-4">
            <button type="button" class="btn-secondary flex-1" onClick={handleReset}>
              Recommencer
            </button>
            <button type="button" class="btn-primary flex-1">
              Valider mon plan
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
