/**
 * Roll the Dice Component
 *
 * Big button to compile all tabs data and start the swipe session.
 */

import { createSignal } from 'solid-js';
import {
  Dices,
  Target,
  BrainCircuit,
  Zap,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-solid';

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
        <h2 class="text-2xl font-bold text-foreground mb-2">Swipe Scenarios</h2>
        <p class="text-muted-foreground max-w-md">
          We'll suggest strategies based on your profile.
          <br />
          The app learns your preferences!
        </p>
      </div>

      {/* Features - above the dice */}
      <div class="grid grid-cols-3 gap-6 max-w-lg mb-8">
        <div class="flex flex-col items-center text-center">
          <Target class="h-8 w-8 text-primary mb-1" />
          <p class="text-sm text-muted-foreground">Personalized</p>
        </div>
        <div class="flex flex-col items-center text-center">
          <BrainCircuit class="h-8 w-8 text-primary mb-1" />
          <p class="text-sm text-muted-foreground">Learns from you</p>
        </div>
        <div class="flex flex-col items-center text-center">
          <Zap class="h-8 w-8 text-primary mb-1" />
          <p class="text-sm text-muted-foreground">Quick & Easy</p>
        </div>
      </div>

      {/* Dice Button */}
      <button
        type="button"
        class={`relative w-48 h-48 rounded-3xl transition-all duration-300 border-0 outline-none ${
          props.disabled
            ? 'bg-muted cursor-not-allowed'
            : 'bg-gradient-to-br from-primary to-primary/80 shadow-xl hover:shadow-2xl hover:scale-105 cursor-pointer'
        }`}
        onClick={() => !props.disabled && props.onRoll()}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        disabled={props.disabled}
      >
        {/* Glow effect */}
        <div
          class={`absolute inset-0 rounded-3xl bg-primary/50 blur-xl transition-opacity duration-300 ${
            isHovering() && !props.disabled ? 'opacity-50' : 'opacity-0'
          }`}
        />

        {/* Dice icon */}
        <div class="relative flex flex-col items-center justify-center h-full text-primary-foreground">
          <Dices
            class={`h-16 w-16 transition-transform duration-300 ${
              isHovering() && !props.disabled ? 'animate-bounce' : ''
            }`}
          />
          <span class="font-bold text-lg mt-4">Roll the Dice</span>
        </div>

        {/* Shimmer effect */}
        <div class="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div
            class={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full transition-transform duration-1000 ${
              isHovering() && !props.disabled ? 'translate-x-full' : ''
            }`}
          />
        </div>
      </button>

      {/* Instructions */}
      <div class="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-muted-foreground">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
            <ArrowLeft class="h-4 w-4" />
          </span>
          <span>Not for me</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
            <ArrowRight class="h-4 w-4" />
          </span>
          <span>I'll take it!</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
            <ArrowUp class="h-4 w-4" />
          </span>
          <span>Super like</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
            <ArrowDown class="h-4 w-4" />
          </span>
          <span>Meh</span>
        </div>
      </div>
    </div>
  );
}
