/**
 * Location Consent Component
 *
 * FERPA/GDPR-compliant consent screen for location access.
 * Shows before requesting browser geolocation.
 *
 * User choices:
 * 1. Allow location access - triggers browser geolocation API
 * 2. Enter city instead - manual city input (no GPS required)
 */

import { GlassButton } from '~/components/ui/GlassButton';

// =============================================================================
// Types
// =============================================================================

export interface LocationConsentProps {
  /** Called when user clicks "Allow location access" */
  onAllow: () => void;
  /** Called when user clicks "Enter my city instead" */
  onDecline: () => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Location consent screen for privacy-first onboarding.
 *
 * Displays a brief explanation of why location is needed,
 * privacy assurances, and two clear action buttons.
 */
export function LocationConsent(props: LocationConsentProps) {
  return (
    <div class="flex flex-col items-center justify-center p-6 text-center">
      {/* Main content card */}
      <div class="max-w-md rounded-2xl bg-white/5 p-8 backdrop-blur-lg">
        {/* Location icon */}
        <div class="mb-6 flex justify-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/20">
            <svg
              class="h-8 w-8 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        </div>

        {/* Explanation */}
        <h2 class="mb-3 text-xl font-semibold text-white">Find jobs near you</h2>
        <p class="mb-4 text-gray-300">
          We use your location to show you part-time jobs near you. You can refuse and just enter
          your city instead.
        </p>

        {/* Privacy note */}
        <p class="mb-8 text-sm text-gray-400">
          Your precise location is never stored - only your city or a fuzzy area (~1km radius).
        </p>

        {/* Action buttons */}
        <div class="flex flex-col gap-3">
          <GlassButton
            onClick={() => props.onAllow()}
            aria-label="Allow location access to find nearby jobs"
          >
            Allow location access
          </GlassButton>

          <button
            onClick={() => props.onDecline()}
            class="rounded-lg px-4 py-3 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            aria-label="Enter city manually instead of using location"
          >
            Enter my city instead
          </button>
        </div>
      </div>
    </div>
  );
}
