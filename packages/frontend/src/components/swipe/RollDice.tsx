/**
 * Roll the Dice Component
 *
 * Big button to compile all tabs data and start the swipe session.
 */

import { createSignal } from 'solid-js';

interface RollDiceProps {
  onRoll: () => void;
  disabled?: boolean;
}

export function RollDice(props: RollDiceProps) {
  const [isHovering, setIsHovering] = createSignal(false);

  return (
    <div class="flex flex-col items-center justify-center py-12">
      {/* Header */}
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Swipe Scenarios</h2>
        <p class="text-slate-500 dark:text-slate-400 max-w-md">
          We'll suggest strategies based on your profile. Swipe right to accept, left to decline.
          The app learns your preferences!
        </p>
      </div>

      {/* Features - above the dice */}
      <div class="grid grid-cols-3 gap-6 max-w-lg mb-8">
        <div class="text-center">
          <div class="text-2xl mb-1">🎯</div>
          <p class="text-sm text-slate-600 dark:text-slate-400">Personalized</p>
        </div>
        <div class="text-center">
          <div class="text-2xl mb-1">🧠</div>
          <p class="text-sm text-slate-600 dark:text-slate-400">Learns from you</p>
        </div>
        <div class="text-center">
          <div class="text-2xl mb-1">⚡</div>
          <p class="text-sm text-slate-600 dark:text-slate-400">4 swipes max</p>
        </div>
      </div>

      {/* Dice Button */}
      <button
        type="button"
        class={`relative w-48 h-48 rounded-3xl transition-all duration-300 ${
          props.disabled
            ? 'bg-slate-200 dark:bg-slate-700 cursor-not-allowed'
            : 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-xl hover:shadow-2xl hover:scale-105 cursor-pointer'
        }`}
        onClick={() => !props.disabled && props.onRoll()}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        disabled={props.disabled}
      >
        {/* Glow effect */}
        <div
          class={`absolute inset-0 rounded-3xl bg-primary-400 blur-xl transition-opacity duration-300 ${
            isHovering() && !props.disabled ? 'opacity-50' : 'opacity-0'
          }`}
        />

        {/* Dice icon */}
        <div class="relative flex flex-col items-center justify-center h-full">
          <span
            class={`text-6xl transition-transform duration-300 ${
              isHovering() && !props.disabled ? 'animate-bounce' : ''
            }`}
          >
            🎲
          </span>
          <span class="text-white font-bold text-lg mt-4">Roll the Dice</span>
        </div>

        {/* Shimmer effect */}
        <div class="absolute inset-0 rounded-3xl overflow-hidden">
          <div
            class={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full transition-transform duration-1000 ${
              isHovering() && !props.disabled ? 'translate-x-full' : ''
            }`}
          />
        </div>
      </button>

      {/* Instructions */}
      <div class="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-slate-500 dark:text-slate-400">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-500">
            ←
          </span>
          <span>Not for me</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-500">
            →
          </span>
          <span>I'll take it!</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-500">
            ↑
          </span>
          <span>Super like</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-500">
            ↓
          </span>
          <span>Meh</span>
        </div>
      </div>
    </div>
  );
}
