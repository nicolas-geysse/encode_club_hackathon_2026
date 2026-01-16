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
      <div class="text-center mb-8">
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Swipe Scenarios</h2>
        <p class="text-slate-500 max-w-md">
          On va te proposer des strategies basees sur ton profil. Swipe a droite pour accepter, a
          gauche pour refuser. L'app apprend tes preferences !
        </p>
      </div>

      {/* Dice Button */}
      <button
        type="button"
        class={`relative w-48 h-48 rounded-3xl transition-all duration-300 ${
          props.disabled
            ? 'bg-slate-200 cursor-not-allowed'
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
      <div class="mt-8 flex items-center gap-6 text-sm text-slate-500">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
            ←
          </span>
          <span>Pas pour moi</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-500">
            →
          </span>
          <span>Je prends !</span>
        </div>
      </div>

      {/* Features */}
      <div class="mt-12 grid grid-cols-3 gap-6 max-w-lg">
        <div class="text-center">
          <div class="text-2xl mb-2">🎯</div>
          <p class="text-sm text-slate-600">Personnalise</p>
        </div>
        <div class="text-center">
          <div class="text-2xl mb-2">🧠</div>
          <p class="text-sm text-slate-600">Apprend de toi</p>
        </div>
        <div class="text-center">
          <div class="text-2xl mb-2">⚡</div>
          <p class="text-sm text-slate-600">4 swipes max</p>
        </div>
      </div>
    </div>
  );
}
