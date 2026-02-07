import { createSignal, type Accessor } from 'solid-js';

/**
 * Shared goal-achievement state.
 *
 * When the active goal is achieved (progress >= 100%), this store
 * is set to `true`. Consumers (BrunoHintV2, tabs, chat input)
 * read from it to hide non-essential UI and save LLM tokens.
 *
 * Set from:
 *  - me.tsx (on profile/goals load)
 *  - OnboardingChat.tsx (on conversation init)
 *  - swipe.tsx (on profile load)
 *  - progress.tsx (on profile load)
 */
const [achieved, setAchieved] = createSignal(false);
const [victoryDays, setVictoryDays] = createSignal<number | null>(null);

export const goalAchieved: Accessor<boolean> = achieved;
export const goalVictoryDays: Accessor<number | null> = victoryDays;

export function setGoalAchieved(value: boolean, daysToReach?: number | null) {
  setAchieved(value);
  if (daysToReach !== undefined) setVictoryDays(daysToReach ?? null);
}
