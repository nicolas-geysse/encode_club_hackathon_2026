// @refresh reload
import { mount, StartClient } from '@solidjs/start/client';
import { initOnboardingState } from '~/lib/onboardingStateStore';

// Apply theme immediately to prevent flash
(function () {
  const saved = localStorage.getItem('stride-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (saved === 'dark' || (saved === 'system' && prefersDark) || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();

// Initialize onboarding state from localStorage (must run before app hydrates)
initOnboardingState();

mount(() => <StartClient />, document.getElementById('app')!);
