/**
 * Stride Logo Component
 *
 * SVG logo that adapts to light/dark mode using CSS currentColor.
 * Light mode: #0F2A44 (dark blue)
 * Dark mode: #FFFFFF (white)
 */

import { Show } from 'solid-js';

interface LogoProps {
  class?: string;
  compact?: boolean; // Show only icon, no text
  height?: number;
}

export function Logo(props: LogoProps) {
  return (
    <Show
      when={!props.compact}
      fallback={
        // Compact mode - just "S" with the bar
        <svg
          width={props.height || 40}
          height={props.height || 40}
          viewBox="0 0 60 120"
          xmlns="http://www.w3.org/2000/svg"
          class={`text-[#0F2A44] dark:text-white ${props.class || ''}`}
        >
          <text
            x="0"
            y="82"
            font-family="Inter, Helvetica, Arial, sans-serif"
            font-size="72"
            font-weight="600"
            letter-spacing="-2"
            fill="currentColor"
          >
            S
          </text>
          {/* Diagonal cut through the S */}
          <rect x="20" y="20" width="6" height="60" fill="currentColor" />
        </svg>
      }
    >
      {/* Full logo with text */}
      <svg
        width={(props.height || 40) * 2.5}
        height={props.height || 40}
        viewBox="0 0 300 120"
        xmlns="http://www.w3.org/2000/svg"
        class={`text-[#0F2A44] dark:text-white ${props.class || ''}`}
      >
        <text
          x="0"
          y="82"
          font-family="Inter, Helvetica, Arial, sans-serif"
          font-size="72"
          font-weight="600"
          letter-spacing="-2"
          fill="currentColor"
        >
          Stride
        </text>
        {/* Vertical bar cutting through the i */}
        <rect x="142" y="20" width="6" height="60" fill="currentColor" />
      </svg>
    </Show>
  );
}
