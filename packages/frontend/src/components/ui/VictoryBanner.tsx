import { Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Trophy, Plus } from 'lucide-solid';
import { goalAchieved, goalVictoryDays } from '~/lib/goalAchievementStore';

/**
 * Reusable victory banner shown across tabs when the active goal is achieved.
 * Reads from the shared goalAchievementStore — no props needed.
 */
export function VictoryBanner() {
  const navigate = useNavigate();
  const days = () => goalVictoryDays();

  return (
    <Show when={goalAchieved()}>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-3 px-5 py-4 rounded-xl bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-orange-500/15 border border-yellow-400/30">
        <div class="flex items-center gap-2">
          <Trophy class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <span class="font-bold text-yellow-700 dark:text-yellow-300 text-sm">
            {days()
              ? `Reached in ${days()} day${days()! > 1 ? 's' : ''}! Congrats!`
              : 'Goal Achieved! Congrats!'}
          </span>
          <Trophy class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
        </div>
        <button
          onClick={() => navigate('/me?tab=goals&action=new')}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
        >
          <Plus class="h-3.5 w-3.5" />
          New Goal
        </button>
      </div>
    </Show>
  );
}
