/**
 * AchievementBadge Component
 *
 * Displays a gamification achievement badge.
 */

import { Show } from 'solid-js';

interface AchievementBadgeProps {
  icon: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AchievementBadge(props: AchievementBadgeProps) {
  const sizeClasses = () => {
    switch (props.size) {
      case 'sm':
        return 'w-12 h-12 text-xl';
      case 'lg':
        return 'w-20 h-20 text-4xl';
      default:
        return 'w-16 h-16 text-2xl';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      class={`
        flex flex-col items-center p-3 rounded-lg transition-all
        ${
          props.unlocked
            ? 'bg-gradient-to-br from-amber-50 to-yellow-100 border-2 border-amber-300'
            : 'bg-slate-100 border-2 border-slate-200 opacity-50'
        }
      `}
      title={props.description}
    >
      <div
        class={`
          flex items-center justify-center rounded-full mb-2
          ${sizeClasses()}
          ${props.unlocked ? 'bg-gradient-to-br from-amber-200 to-yellow-300 shadow-lg' : 'bg-slate-200'}
        `}
      >
        <span class={props.unlocked ? '' : 'grayscale opacity-50'}>{props.icon}</span>
      </div>

      <span
        class={`
          text-sm font-semibold text-center
          ${props.unlocked ? 'text-amber-800' : 'text-slate-500'}
        `}
      >
        {props.name}
      </span>

      <span class="text-xs text-center text-slate-500 mt-1">{props.description}</span>

      <Show when={props.unlocked && props.unlockedAt}>
        <span class="text-xs text-amber-600 mt-1">Debloque le {formatDate(props.unlockedAt!)}</span>
      </Show>

      <Show when={!props.unlocked}>
        <span class="text-xs text-slate-400 mt-1">Verrouille</span>
      </Show>
    </div>
  );
}

export default AchievementBadge;
