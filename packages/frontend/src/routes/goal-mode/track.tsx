/**
 * Goal Tracking Page
 *
 * Track progress towards the goal with weekly updates.
 * Now supports capacity-aware retroplanning with:
 * - Dynamic weekly targets based on capacity
 * - Energy tracking widget
 * - Relative achievements
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { GoalProgress } from '~/components/GoalProgress';
import { MilestoneCard } from '~/components/MilestoneCard';
import { AchievementBadge } from '~/components/AchievementBadge';
import { VoiceInput } from '~/components/VoiceInput';
import { EnergyTracker } from '~/components/EnergyTracker';

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

// Retroplan types
interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
}

interface DynamicMilestone {
  weekNumber: number;
  baseTarget: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: WeekCapacity;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'protected';
}

interface Retroplan {
  id: string;
  goalId: string;
  milestones: DynamicMilestone[];
  totalWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
}

interface Goal {
  id: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  status: 'active' | 'completed' | 'abandoned';
  feasibilityScore: number;
  weeklyTarget: number;
  plan: {
    strategies: { id: string; name: string; monthlyImpact: number }[];
    milestones: Milestone[];
    achievements: Achievement[];
  };
  retroplan?: Retroplan;
}

export default function GoalTrack() {
  const navigate = useNavigate();

  const [goal, setGoal] = createSignal<Goal | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [updating, setUpdating] = createSignal(false);
  const [currentWeek, setCurrentWeek] = createSignal(1);
  const [weeklyAmount, setWeeklyAmount] = createSignal<number>(0);
  const [successMessage, setSuccessMessage] = createSignal<string | null>(null);
  const [newAchievements, setNewAchievements] = createSignal<Achievement[]>([]);

  onMount(() => {
    const stored = sessionStorage.getItem('currentGoal');
    if (stored) {
      const g = JSON.parse(stored) as Goal;
      setGoal(g);

      // Find current week (first in_progress or pending)
      const activeWeek = g.plan.milestones.find(
        (m) => m.status === 'in_progress' || m.status === 'pending'
      );
      if (activeWeek) {
        setCurrentWeek(activeWeek.weekNumber);
      }
    } else {
      navigate('/goal-mode/setup');
    }
    setLoading(false);
  });

  const totalEarned = () => {
    if (!goal()) return 0;
    return goal()!.plan.milestones.reduce((sum, m) => sum + (m.earnedAmount || 0), 0);
  };

  const progressPercent = () => {
    if (!goal()) return 0;
    return Math.round((totalEarned() / goal()!.goalAmount) * 100);
  };

  const handleVoiceAmount = (text: string) => {
    // Parse amount from voice
    const amountMatch = text.match(/(\d+)/);
    if (amountMatch) {
      setWeeklyAmount(parseInt(amountMatch[1]));
    }
  };

  const handleUpdateProgress = async () => {
    if (!goal() || weeklyAmount() <= 0) return;

    setUpdating(true);
    setSuccessMessage(null);
    setNewAchievements([]);

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_progress',
          goalId: goal()!.id,
          weekNumber: currentWeek(),
          earnedAmount: weeklyAmount(),
          actionsCompleted: [],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update progress');
      }

      const data = await response.json();

      // Check for new achievements
      const previousAchievements = goal()!.plan.achievements.filter((a) => a.unlocked);
      const newUnlocked = data.goal.plan.achievements.filter(
        (a: Achievement) => a.unlocked && !previousAchievements.find((p) => p.id === a.id)
      );

      if (newUnlocked.length > 0) {
        setNewAchievements(newUnlocked);
      }

      // Update goal in state and storage
      setGoal(data.goal);
      sessionStorage.setItem('currentGoal', JSON.stringify(data.goal));

      // Show success message
      setSuccessMessage(
        data.goal.status === 'completed'
          ? '🎉 Felicitations ! Tu as atteint ton objectif !'
          : `Super ! +${weeklyAmount()}€ enregistre pour la semaine ${currentWeek()}`
      );

      // Reset weekly amount and move to next week
      setWeeklyAmount(0);
      if (currentWeek() < (goal()?.plan.milestones.length || 0)) {
        setCurrentWeek(currentWeek() + 1);
      }
    } catch (error) {
      console.error('Update error:', error);
    } finally {
      setUpdating(false);
    }
  };

  const getCurrentMilestone = () => {
    return goal()?.plan.milestones.find((m) => m.weekNumber === currentWeek());
  };

  // Get dynamic milestone from retroplan if available
  const getDynamicMilestone = () => {
    return goal()?.retroplan?.milestones.find((m) => m.weekNumber === currentWeek());
  };

  // Get current week's target (use retroplan's adjusted target if available)
  const getCurrentTarget = () => {
    const dynamic = getDynamicMilestone();
    if (dynamic) {
      return Math.round(dynamic.adjustedTarget);
    }
    return getCurrentMilestone()?.targetAmount || goal()?.weeklyTarget || 0;
  };

  // Get capacity color class
  const getCapacityColor = (category?: string) => {
    switch (category) {
      case 'high':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-orange-100 text-orange-700';
      case 'protected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  // Handle energy check-in callback
  const handleEnergyCheckin = (data: { compositeScore: number }) => {
    console.log('Energy check-in:', data);
    // Could trigger a recalculation of weekly targets here
  };

  return (
    <div class="max-w-4xl mx-auto">
      <Show when={loading()}>
        <div class="text-center py-12">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p class="text-slate-600">Chargement...</p>
        </div>
      </Show>

      <Show when={!loading() && goal()}>
        {/* Header */}
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-slate-900 mb-2">
            📊 Suivi: {goal()?.goalName}
          </h2>
          <p class="text-slate-600">
            Continue tes efforts, tu es sur la bonne voie !
          </p>
        </div>

        {/* Progress overview */}
        <div class="card mb-6 bg-gradient-to-r from-primary-50 to-green-50">
          <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="text-center">
              <div class="text-3xl font-bold text-green-600">{totalEarned().toLocaleString()}€</div>
              <div class="text-sm text-slate-600">Gagne</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-primary-600">
                {(goal()!.goalAmount - totalEarned()).toLocaleString()}€
              </div>
              <div class="text-sm text-slate-600">Restant</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-blue-600">{progressPercent()}%</div>
              <div class="text-sm text-slate-600">Progres</div>
            </div>
          </div>

          <GoalProgress
            current={totalEarned()}
            target={goal()!.goalAmount}
            showAmount
            size="lg"
          />
        </div>

        {/* Energy check-in widget (compact) */}
        <Show when={goal()?.status === 'active' && goal()?.retroplan}>
          <div class="mb-6">
            <EnergyTracker compact onSubmit={handleEnergyCheckin} />
          </div>
        </Show>

        {/* New achievements celebration */}
        <Show when={newAchievements().length > 0}>
          <div class="card mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300 animate-pulse">
            <div class="text-center">
              <h3 class="text-xl font-bold text-amber-800 mb-4">
                🎉 Nouvel achievement debloque !
              </h3>
              <div class="flex justify-center gap-4">
                <For each={newAchievements()}>
                  {(achievement) => (
                    <AchievementBadge
                      icon={achievement.icon}
                      name={achievement.name}
                      description={achievement.description}
                      unlocked={true}
                      size="lg"
                    />
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Success message */}
        <Show when={successMessage()}>
          <div class="card mb-6 bg-green-50 border-green-300 text-green-800 text-center">
            {successMessage()}
          </div>
        </Show>

        {/* Goal completed */}
        <Show when={goal()?.status === 'completed'}>
          <div class="card mb-6 bg-gradient-to-r from-green-100 to-emerald-100 border-green-400 text-center">
            <div class="text-4xl mb-4">🏆</div>
            <h3 class="text-2xl font-bold text-green-800 mb-2">
              Objectif atteint !
            </h3>
            <p class="text-green-700">
              Felicitations ! Tu as economise {goal()?.goalAmount.toLocaleString()}€ pour {goal()?.goalName}.
            </p>
            <a href="/goal-mode/setup" class="btn-primary mt-4 inline-block">
              Definir un nouvel objectif →
            </a>
          </div>
        </Show>

        {/* Weekly update form */}
        <Show when={goal()?.status === 'active'}>
          <div class="card mb-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
              <span class="mr-2">✏️</span> Mise a jour - Semaine {currentWeek()}
            </h3>

            <div class="bg-slate-50 rounded-lg p-4 mb-4">
              <div class="flex items-center justify-between">
                <span class="text-slate-700">Objectif cette semaine:</span>
                <span class="font-bold text-primary-600">{getCurrentTarget()}€</span>
              </div>
              <Show when={getDynamicMilestone()}>
                <div class="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
                  <span class={`px-2 py-0.5 rounded ${getCapacityColor(getDynamicMilestone()?.capacity.capacityCategory)}`}>
                    Capacité: {getDynamicMilestone()?.capacity.capacityScore}%
                  </span>
                  <span class="text-slate-500">
                    {getDynamicMilestone()?.difficulty === 'easy' ? '🟢 Facile' :
                     getDynamicMilestone()?.difficulty === 'moderate' ? '🟡 Modéré' :
                     getDynamicMilestone()?.difficulty === 'challenging' ? '🟠 Difficile' :
                     '🔴 Protégé'}
                  </span>
                </div>
              </Show>
            </div>

            <div class="flex items-center gap-4">
              <div class="flex-1">
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  Combien as-tu gagne cette semaine ?
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    class="input-field"
                    min="0"
                    placeholder="Ex: 125"
                    value={weeklyAmount() || ''}
                    onInput={(e) => setWeeklyAmount(parseInt(e.currentTarget.value) || 0)}
                  />
                  <span class="text-slate-500">€</span>
                  <VoiceInput onTranscript={handleVoiceAmount} />
                </div>
              </div>
              <button
                class="btn-primary self-end"
                onClick={handleUpdateProgress}
                disabled={updating() || weeklyAmount() <= 0}
              >
                {updating() ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Show>

        {/* Milestones timeline */}
        <div class="card mb-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">📅</span> Historique des semaines
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={goal()?.plan.milestones}>
              {(milestone) => (
                <MilestoneCard
                  weekNumber={milestone.weekNumber}
                  targetAmount={milestone.targetAmount}
                  earnedAmount={milestone.earnedAmount}
                  cumulativeTarget={milestone.cumulativeTarget}
                  status={milestone.status}
                  actions={milestone.actions}
                  isCurrentWeek={milestone.weekNumber === currentWeek() && goal()?.status === 'active'}
                />
              )}
            </For>
          </div>
        </div>

        {/* Achievements */}
        <div class="card mb-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="mr-2">🏆</span> Achievements
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
                />
              )}
            </For>
          </div>
        </div>

        {/* Navigation */}
        <div class="flex flex-wrap justify-center gap-4">
          <a href="/goal-mode/plan" class="btn-secondary">
            ← Voir le plan
          </a>
          <Show when={goal()?.retroplan}>
            <a href="/goal-mode/calendar" class="btn-secondary">
              📅 Voir le calendrier
            </a>
          </Show>
          <a href="/chat" class="btn-secondary">
            💬 Discuter avec l'assistant
          </a>
        </div>
      </Show>
    </div>
  );
}
