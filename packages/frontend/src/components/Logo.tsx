/**
 * Stride Logo Component
 *
 * Designed for a premium, clean look.
 * - Bold typography (Inter)
 * - Subtle vertical gradient for depth
 * - Accent color on the geometric cut
 */

import { Show } from 'solid-js';
import { cn } from '~/lib/cn';

interface LogoProps {
  class?: string;
  compact?: boolean;
  height?: number;
}

export function Logo(props: LogoProps) {
  // Increased default height
  const height = () => props.height || 48;

  return (
    <div class={cn('select-none flex items-center justify-center', props.class)}>
      <Show
        when={!props.compact}
        fallback={
          // Compact Icon
          <svg
            width={height()}
            height={height()}
            viewBox="0 0 60 120"
            xmlns="http://www.w3.org/2000/svg"
            class="fill-foreground"
          >
            <defs>
              <linearGradient id="iconGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="currentColor" stop-opacity="1" />
                <stop offset="100%" stop-color="currentColor" stop-opacity="0.85" />
              </linearGradient>
            </defs>
            <text
              x="0"
              y="82"
              font-family="Inter, sans-serif"
              font-size="72"
              font-weight="800"
              letter-spacing="-2"
              fill="url(#iconGradient)"
            >
              S
            </text>
            <rect
              x="20"
              y="22"
              width="8"
              height="58"
              rx="1"
              fill="currentColor"
              class="text-primary"
            />
          </svg>
        }
      >
        {/* Full Logo */}
        <div class="relative flex items-center">
          <svg
            width={height() * 2.8}
            height={height()}
            viewBox="0 0 300 120"
            xmlns="http://www.w3.org/2000/svg"
            class="fill-foreground"
          >
            <defs>
              <linearGradient id="textGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="currentColor" stop-opacity="1" />
                <stop offset="100%" stop-color="currentColor" stop-opacity="0.8" />
              </linearGradient>
              {/* Soft glow filter for the accent */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <text
              x="0"
              y="84"
              font-family="Inter, sans-serif"
              font-size="82"
              font-weight="800"
              letter-spacing="-3"
              fill="url(#textGradient)"
            >
              Stride
            </text>

            {/* Accented 'cut' with subtle rounded corners and primary color */}
            <rect
              x="146"
              y="22"
              width="9"
              height="60"
              rx="1"
              fill="currentColor"
              class="text-primary"
            />
          </svg>
        </div>
      </Show>
    </div>
  );
}
