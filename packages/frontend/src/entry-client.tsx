// @refresh reload
import { mount, StartClient } from '@solidjs/start/client';

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

// NOTE: Do NOT call initOnboardingState() here!
// Calling it before mount() changes signals before hydration,
// causing SSR mismatch ("template2 is not a function" error).
// Components should call initOnboardingState() in their onMount() instead.

mount(() => <StartClient />, document.getElementById('app')!);
