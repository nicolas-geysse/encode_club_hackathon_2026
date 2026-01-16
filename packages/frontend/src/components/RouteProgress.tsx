/**
 * Route Progress Bar
 *
 * YouTube/NProgress-style progress bar for route transitions.
 * Uses useIsRouting() to detect navigation state.
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { useIsRouting } from '@solidjs/router';

export function RouteProgress() {
  const isRouting = useIsRouting();
  const [progress, setProgress] = createSignal(0);
  const [visible, setVisible] = createSignal(false);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  createEffect(() => {
    if (isRouting()) {
      // Start progress animation
      setVisible(true);
      setProgress(0);

      // Quickly go to 30%, then slow down
      setTimeout(() => setProgress(30), 50);
      setTimeout(() => setProgress(50), 150);
      setTimeout(() => setProgress(70), 300);

      // Slowly creep toward 90%
      intervalId = setInterval(() => {
        setProgress((p) => {
          if (p < 90) return p + 2;
          return p;
        });
      }, 200);
    } else {
      // Complete the progress
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      if (visible()) {
        setProgress(100);
        // Hide after animation completes
        setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 300);
      }
    }
  });

  return (
    <Show when={visible()}>
      <div class="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent">
        <div
          class="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-200 ease-out"
          style={{ width: `${progress()}%` }}
        />
        {/* Glow effect at the end */}
        <div
          class="absolute top-0 right-0 h-full w-24 bg-gradient-to-r from-transparent to-primary-300/50 blur-sm transition-all duration-200"
          style={{ right: `${100 - progress()}%` }}
        />
      </div>
    </Show>
  );
}

export default RouteProgress;
