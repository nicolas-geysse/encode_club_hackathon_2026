/**
 * Energy Tracker Widget
 *
 * A compact widget for daily energy, mood, and stress tracking.
 * Used to predict capacity and adjust weekly targets.
 */

import { createSignal, Show, For } from 'solid-js';
import { toast } from '~/lib/notificationStore';
import { showProactiveAlert } from '~/lib/eventBus';

interface EnergyTrackerProps {
  onSubmit?: (data: {
    energyLevel: number;
    moodScore: number;
    stressLevel: number;
    hoursSlept?: number;
    compositeScore: number;
  }) => void;
  compact?: boolean;
}

export function EnergyTracker(props: EnergyTrackerProps) {
  const [energyLevel, setEnergyLevel] = createSignal(3);
  const [moodScore, setMoodScore] = createSignal(3);
  const [stressLevel, setStressLevel] = createSignal(3);
  const [hoursSlept, setHoursSlept] = createSignal<number | undefined>(undefined);
  const [submitted, setSubmitted] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  // Calculate composite score
  const compositeScore = () => {
    return Math.round(((energyLevel() + moodScore() + (6 - stressLevel())) / 15) * 100);
  };

  // Get color based on composite score
  const getScoreColor = () => {
    const score = compositeScore();
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Emoji scales
  const energyEmojis = ['😴', '😫', '😐', '🙂', '😀'];
  const moodEmojis = ['😢', '😕', '😐', '🙂', '😊'];
  const stressEmojis = ['😌', '🙂', '😐', '😰', '🤯'];

  // Handle submission
  const handleSubmit = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_energy',
          energyLevel: energyLevel(),
          moodScore: moodScore(),
          stressLevel: stressLevel(),
          hoursSlept: hoursSlept(),
        }),
      });

      if (response.ok) {
        setSubmitted(true);
        const score = compositeScore();
        props.onSubmit?.({
          energyLevel: energyLevel(),
          moodScore: moodScore(),
          stressLevel: stressLevel(),
          hoursSlept: hoursSlept(),
          compositeScore: score,
        });

        // v4.2: Proactive trigger for low/recovered energy
        if (score < 40) {
          showProactiveAlert({
            id: `energy_low_${Date.now()}`,
            type: 'energy_low',
            title: 'Low energy detected',
            message:
              'Consider reducing work hours this week. Rest is important for sustainable progress.',
            action: { label: 'Adjust goals', href: '/plan?tab=goals' },
          });
        } else if (score > 80) {
          showProactiveAlert({
            id: `energy_high_${Date.now()}`,
            type: 'energy_recovered',
            title: 'Great energy!',
            message:
              "You're feeling energized - perfect time to tackle higher-paying opportunities!",
            action: { label: 'Find gigs', href: '/plan?tab=swipe' },
          });
        }
      }
    } catch {
      toast.error('Log failed', 'Could not save energy.');
    } finally {
      setLoading(false);
    }
  };

  // Reactive accessor for compact prop (SolidJS pattern)
  const isCompact = () => props.compact;

  // Compact view component
  const CompactView = () => (
    <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4">
      <Show when={!submitted()}>
        <p class="text-sm font-medium text-slate-700 mb-3">How are you feeling today?</p>
        <div class="flex items-center justify-between gap-2">
          <div class="flex flex-col items-center">
            <span class="text-xs text-slate-500 mb-1">Energy</span>
            <div class="flex gap-1">
              <For each={[1, 2, 3, 4, 5]}>
                {(level) => (
                  <button
                    class={`w-8 h-8 rounded-full transition-all ${
                      energyLevel() === level
                        ? 'bg-blue-500 scale-110'
                        : 'bg-slate-200 hover:bg-slate-300'
                    }`}
                    onClick={() => setEnergyLevel(level)}
                    title={energyEmojis[level - 1]}
                  >
                    <span class="text-sm">{energyEmojis[level - 1]}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
          <button
            class="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={loading()}
          >
            {loading() ? '...' : 'OK'}
          </button>
        </div>
      </Show>
      <Show when={submitted()}>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-green-700">Check-in recorded!</p>
            <p class="text-xs text-slate-500">
              Capacity score: <span class={getScoreColor()}>{compositeScore()}%</span>
            </p>
          </div>
          <button
            class="text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setSubmitted(false)}
          >
            Edit
          </button>
        </div>
      </Show>
    </div>
  );

  // Full view component
  const FullView = () => (
    <div class="card">
      <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <span>📊</span> Daily Check-in
      </h3>

      <Show when={!submitted()}>
        <div class="space-y-6">
          {/* Energy Level */}
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium text-slate-700">Energy</label>
              <span class="text-2xl">{energyEmojis[energyLevel() - 1]}</span>
            </div>
            <div class="flex justify-between gap-2">
              <For each={[1, 2, 3, 4, 5]}>
                {(level) => (
                  <button
                    class={`flex-1 py-3 rounded-lg transition-all border-2 ${
                      energyLevel() === level
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setEnergyLevel(level)}
                  >
                    <span class="text-lg">{energyEmojis[level - 1]}</span>
                  </button>
                )}
              </For>
            </div>
            <div class="flex justify-between text-xs text-slate-400 mt-1">
              <span>Exhausted</span>
              <span>Energized</span>
            </div>
          </div>

          {/* Mood Score */}
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium text-slate-700">Mood</label>
              <span class="text-2xl">{moodEmojis[moodScore() - 1]}</span>
            </div>
            <div class="flex justify-between gap-2">
              <For each={[1, 2, 3, 4, 5]}>
                {(level) => (
                  <button
                    class={`flex-1 py-3 rounded-lg transition-all border-2 ${
                      moodScore() === level
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setMoodScore(level)}
                  >
                    <span class="text-lg">{moodEmojis[level - 1]}</span>
                  </button>
                )}
              </For>
            </div>
            <div class="flex justify-between text-xs text-slate-400 mt-1">
              <span>Negative</span>
              <span>Positive</span>
            </div>
          </div>

          {/* Stress Level */}
          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium text-slate-700">Stress</label>
              <span class="text-2xl">{stressEmojis[stressLevel() - 1]}</span>
            </div>
            <div class="flex justify-between gap-2">
              <For each={[1, 2, 3, 4, 5]}>
                {(level) => (
                  <button
                    class={`flex-1 py-3 rounded-lg transition-all border-2 ${
                      stressLevel() === level
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setStressLevel(level)}
                  >
                    <span class="text-lg">{stressEmojis[level - 1]}</span>
                  </button>
                )}
              </For>
            </div>
            <div class="flex justify-between text-xs text-slate-400 mt-1">
              <span>Calm</span>
              <span>Stressed</span>
            </div>
          </div>

          {/* Hours Slept (optional) */}
          <div>
            <label class="text-sm font-medium text-slate-700 block mb-2">
              Hours of sleep (optional)
            </label>
            <div class="flex items-center gap-3">
              <input
                type="range"
                min="4"
                max="12"
                step="0.5"
                value={hoursSlept() || 7}
                onInput={(e) => setHoursSlept(parseFloat(e.currentTarget.value))}
                class="flex-1"
              />
              <span class="text-lg font-medium text-slate-700 w-12">
                {hoursSlept() ? `${hoursSlept()}h` : '-'}
              </span>
            </div>
          </div>

          {/* Composite Score Preview */}
          <div class="bg-slate-50 rounded-lg p-4 text-center">
            <p class="text-sm text-slate-500 mb-1">Estimated capacity score</p>
            <p class={`text-3xl font-bold ${getScoreColor()}`}>{compositeScore()}%</p>
            <p class="text-xs text-slate-400 mt-1">
              {compositeScore() >= 70
                ? 'Good capacity to reach your goals'
                : compositeScore() >= 50
                  ? 'Average capacity, adjust your efforts'
                  : 'Take care of yourself, reduce your goals if needed'}
            </p>
          </div>

          {/* Submit Button */}
          <button class="w-full btn-primary" onClick={handleSubmit} disabled={loading()}>
            {loading() ? 'Saving...' : 'Save my check-in'}
          </button>
        </div>
      </Show>

      <Show when={submitted()}>
        <div class="text-center py-6">
          <div class="text-5xl mb-4">✅</div>
          <p class="text-lg font-medium text-green-700 mb-2">Check-in recorded!</p>
          <p class="text-slate-500 mb-4">
            Capacity score: <span class={`font-bold ${getScoreColor()}`}>{compositeScore()}%</span>
          </p>
          <button
            class="text-sm text-primary-600 hover:text-primary-700"
            onClick={() => setSubmitted(false)}
          >
            Edit my check-in
          </button>
        </div>
      </Show>
    </div>
  );

  return (
    <Show when={isCompact()} fallback={<FullView />}>
      <CompactView />
    </Show>
  );
}

export default EnergyTracker;
