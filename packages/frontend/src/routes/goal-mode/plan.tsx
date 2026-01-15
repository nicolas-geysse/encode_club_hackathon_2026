/**
 * Goal Plan Page
 *
 * Displays the generated plan with strategies and milestones.
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { GoalProgress } from '~/components/GoalProgress';
import { MilestoneCard } from '~/components/MilestoneCard';
import { AchievementBadge } from '~/components/AchievementBadge';

interface Strategy {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  name: string;
  monthlyImpact: number;
  effort: 'low' | 'medium' | 'high';
  description: string;
}

interface Milestone {
  weekNumber: number;
  targetAmount: number;
  cumulativeTarget: number;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  actions: string[];
  earnedAmount?: number;
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

interface Goal {
  id: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  feasibilityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  weeklyTarget: number;
  plan: {
    strategies: Strategy[];
    milestones: Milestone[];
    achievements: Achievement[];
  };
}

export default function GoalPlan() {
  const navigate = useNavigate();

  const [goal, setGoal] = createSignal<Goal | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(() => {
    const stored = sessionStorage.getItem('currentGoal');
    if (stored) {
      setGoal(JSON.parse(stored));
    } else {
      // Redirect to setup if no goal
      navigate('/goal-mode/setup');
    }
    setLoading(false);
  });

  const getWeeksRemaining = () => {
    if (!goal()) return 0;
    const deadline = new Date(goal()!.goalDeadline);
    const now = new Date();
    return Math.ceil((deadline.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
  };

  const getRiskColor = () => {
    switch (goal()?.riskLevel) {
      case 'low':
        return 'text-green-600 bg-green-100';
      case 'medium':
        return 'text-amber-600 bg-amber-100';
      case 'high':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-slate-600 bg-slate-100';
    }
  };

  const getEffortLabel = (effort: string) => {
    switch (effort) {
      case 'low':
        return 'Facile';
      case 'medium':
        return 'Moyen';
      case 'high':
        return 'Intense';
      default:
        return effort;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'job':
        return '💼';
      case 'hustle':
        return '🚀';
      case 'selling':
        return '💰';
      case 'optimization':
        return '✂️';
      default:
        return '📋';
    }
  };

  return (
    <div class="max-w-4xl mx-auto">
      <Show when={loading()}>
        <div class="text-center py-12">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p class="text-slate-600">Chargement du plan...</p>
        </div>
      </Show>

      <Show when={!loading() && goal()}>
        {/* Header */}
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-slate-900 mb-2">
            🎯 Plan: {goal()?.goalName}
          </h2>
          <p class="text-slate-600">
            {goal()?.goalAmount.toLocaleString()}€ en {getWeeksRemaining()} semaines
          </p>
        </div>

        {/* Summary card */}
        <div class="card mb-6 bg-gradient-to-r from-primary-50 to-blue-50">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-primary-700">
                {goal()?.goalAmount.toLocaleString()}€
              </div>
              <div class="text-sm text-slate-600">Objectif total</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-primary-700">{goal()?.weeklyTarget}€</div>
              <div class="text-sm text-slate-600">Par semaine</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-primary-700">
                {Math.round((goal()?.feasibilityScore || 0) * 100)}%
              </div>
              <div class="text-sm text-slate-600">Faisabilite</div>
            </div>
            <div class="text-center">
              <span class={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor()}`}>
                Risque {goal()?.riskLevel === 'low' ? 'faible' : goal()?.riskLevel === 'medium' ? 'moyen' : 'eleve'}
              </span>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-primary-200">
            <GoalProgress current={0} target={goal()!.goalAmount} showAmount size="lg" />
          </div>
        </div>

        {/* Strategies */}
        <div class="card mb-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">💡</span> Strategies recommandees
          </h3>

          <div class="space-y-3">
            <For each={goal()?.plan.strategies}>
              {(strategy) => (
                <div class="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">{getTypeIcon(strategy.type)}</span>
                    <div>
                      <div class="font-medium text-slate-900">{strategy.name}</div>
                      <div class="text-sm text-slate-600">{strategy.description}</div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold text-green-600">+{strategy.monthlyImpact}€/mois</div>
                    <div class="text-xs text-slate-500">Effort: {getEffortLabel(strategy.effort)}</div>
                  </div>
                </div>
              )}
            </For>
          </div>

          <div class="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <div class="flex items-center justify-between">
              <span class="font-medium text-green-800">Potentiel total</span>
              <span class="font-bold text-green-700">
                +
                {goal()
                  ?.plan.strategies.reduce((sum, s) => sum + s.monthlyImpact, 0)
                  .toLocaleString()}
                €/mois
              </span>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div class="card mb-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">📅</span> Jalons hebdomadaires
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={goal()?.plan.milestones.slice(0, 6)}>
              {(milestone) => (
                <MilestoneCard
                  weekNumber={milestone.weekNumber}
                  targetAmount={milestone.targetAmount}
                  earnedAmount={milestone.earnedAmount}
                  cumulativeTarget={milestone.cumulativeTarget}
                  status={milestone.status}
                  actions={milestone.actions}
                  isCurrentWeek={milestone.weekNumber === 1}
                />
              )}
            </For>
          </div>

          <Show when={(goal()?.plan.milestones.length || 0) > 6}>
            <p class="text-center text-slate-500 mt-4">
              + {(goal()?.plan.milestones.length || 0) - 6} autres semaines
            </p>
          </Show>
        </div>

        {/* Achievements */}
        <div class="card mb-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">🏆</span> Achievements a debloquer
          </h3>

          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <For each={goal()?.plan.achievements}>
              {(achievement) => (
                <AchievementBadge
                  icon={achievement.icon}
                  name={achievement.name}
                  description={achievement.description}
                  unlocked={achievement.unlocked}
                  unlockedAt={achievement.unlockedAt}
                  size="md"
                />
              )}
            </For>
          </div>
        </div>

        {/* CTA */}
        <div class="flex justify-center gap-4">
          <a href="/goal-mode/track" class="btn-primary text-lg px-8 py-3">
            Commencer le suivi →
          </a>
          <a href="/goal-mode/setup" class="btn-secondary text-lg px-8 py-3">
            Modifier l'objectif
          </a>
        </div>
      </Show>

      <Show when={!loading() && !goal()}>
        <div class="card text-center py-12">
          <p class="text-slate-600 mb-4">Aucun objectif defini.</p>
          <a href="/goal-mode/setup" class="btn-primary">
            Definir un objectif →
          </a>
        </div>
      </Show>
    </div>
  );
}
