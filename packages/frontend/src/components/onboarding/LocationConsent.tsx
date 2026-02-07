/**
 * Location Consent Component
 *
 * FERPA/GDPR-compliant consent screen for location access.
 * Shows before requesting browser geolocation.
 * Includes a Stride teaser to introduce the app.
 *
 * User choices:
 * 1. Allow location access - triggers browser geolocation API
 * 2. Enter city instead - manual city input (no GPS required)
 */

import { GlassButton } from '~/components/ui/GlassButton';
import { MapPin, Shield } from 'lucide-solid';

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
 * Displays a Stride introduction teaser, explains why location is needed,
 * privacy assurances, and two clear action buttons.
 */
export function LocationConsent(props: LocationConsentProps) {
  return (
    <div class="flex flex-col items-center justify-center p-4 md:p-6">
      <div class="max-w-md w-full space-y-6">
        {/* Stride teaser */}
        <div class="text-center space-y-3">
          <h1 class="text-3xl font-extrabold tracking-tight">
            Stri<span class="text-primary">d</span>e
          </h1>
          <p class="text-lg font-medium text-foreground/90">
            Navigate student life, one smart step at a time.
          </p>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Tell Bruno your goal, and he'll find the right jobs, protect your energy, and adapt your
            plan when life gets tough.
          </p>
        </div>

        {/* Divider */}
        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-border" />
          <span class="text-xs text-muted-foreground/60 uppercase tracking-wider">
            Before we start
          </span>
          <div class="flex-1 h-px bg-border" />
        </div>

        {/* Location card */}
        <div class="rounded-2xl border border-border/50 bg-card/50 p-6 backdrop-blur-lg space-y-4">
          {/* Icon + title */}
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <MapPin class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-foreground">Find jobs near you</h2>
              <p class="text-sm text-muted-foreground">
                We use your location to match part-time jobs nearby.
              </p>
            </div>
          </div>

          {/* Privacy note */}
          <div class="flex items-start gap-2 rounded-lg bg-muted/40 p-3">
            <Shield class="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              Only neighborhood-level precision is stored for commute estimates. You can skip this
              and type your city instead.
            </p>
          </div>

          {/* Action buttons */}
          <div class="flex flex-col gap-2 pt-1">
            <GlassButton
              onClick={() => props.onAllow()}
              class="w-full"
              aria-label="Allow location access to find nearby jobs"
            >
              Allow location access
            </GlassButton>

            <button
              onClick={() => props.onDecline()}
              class="w-full rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="Enter city manually instead of using location"
            >
              Enter my city instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
