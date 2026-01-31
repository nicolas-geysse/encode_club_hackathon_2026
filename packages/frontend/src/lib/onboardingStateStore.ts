import { createSignal, type Accessor } from 'solid-js';

// Shared onboarding state - allows Sidebar/BottomNav to react to onboarding completion
const [isComplete, setIsComplete] = createSignal(false);

// Export as accessor for reactive reads in components
export const onboardingIsComplete: Accessor<boolean> = isComplete;

export const setOnboardingComplete = (complete: boolean) => {
  setIsComplete(complete);
};

/**
 * Initialize onboarding state from localStorage.
 * Must be called on client-side only (in entry-client.tsx before mount).
 *
 * This function is hydration-safe:
 * - Server-side: does nothing (window check guards localStorage access)
 * - Client-side: syncs signal with localStorage value
 * - Idempotent: safe to call multiple times
 */
export const initOnboardingState = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('onboardingComplete');
    if (stored === 'true') {
      setIsComplete(true);
    }
  }
};

export const persistOnboardingComplete = (complete: boolean) => {
  setOnboardingComplete(complete);
  if (typeof window !== 'undefined') {
    localStorage.setItem('onboardingComplete', String(complete));
  }
};
