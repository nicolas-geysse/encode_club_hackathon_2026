---
phase: 16-privacy-consent
plan: 02
subsystem: privacy
tags: [geolocation, consent, FERPA, GDPR, PII, opik, tracing]

# Dependency graph
requires:
  - phase: 16-01
    provides: locationPrivacy utilities (fuzzyCoordinates, sanitizeLocationPII), LocationConsent component
provides:
  - Integrated consent flow in onboarding
  - Privacy-enforced API layer
  - Sanitized observability traces
affects: [17-job-search-api, 18-background-prefetch, 19-commute-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Consent-before-permission pattern for browser APIs
    - Defense-in-depth coordinate fuzzing (frontend + API)
    - PII sanitization in observability

key-files:
  modified:
    - packages/frontend/src/components/chat/OnboardingChat.tsx
    - packages/frontend/src/routes/api/profiles.ts
    - packages/mcp-server/src/services/opik.ts

key-decisions:
  - "Consent screen shown as modal overlay before chat starts"
  - "API enforces fuzzy coordinates regardless of frontend behavior (defense-in-depth)"
  - "Opik sanitization duplicated in mcp-server with dual-maintenance warning for hackathon speed"

patterns-established:
  - "Privacy-first onboarding: consent before permission request"
  - "Defense-in-depth: privacy enforcement at both frontend and API layers"
  - "Observability sanitization: all trace inputs/outputs cleaned of PII"

# Metrics
duration: 6min
completed: 2026-02-01
---

# Phase 16 Plan 02: Geolocation Integration Summary

**Privacy-compliant location consent flow integrated into onboarding with defense-in-depth coordinate fuzzing at API and trace sanitization in Opik**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-01T16:44:04Z
- **Completed:** 2026-02-01T16:50:11Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- LocationConsent component integrated as modal overlay in OnboardingChat
- GPS results and forwardGeocode results both apply fuzzyCoordinates (~1.1km precision)
- Profiles API enforces fuzzy coordinates on all writes (defense-in-depth)
- Opik traces sanitize all inputs/outputs to redact location PII

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate consent flow in OnboardingChat** - `9b60315` (feat)
2. **Task 2: Enforce fuzzy coordinates in profiles API** - `6ea1711` (feat)
3. **Task 3: Add PII sanitization to Opik traces** - `046ef78` (feat)

## Files Created/Modified
- `packages/frontend/src/components/chat/OnboardingChat.tsx` - Consent flow, consent handlers, fuzzyCoordinates on GPS and geocode results
- `packages/frontend/src/routes/api/profiles.ts` - fuzzyCoordinates enforcement on POST
- `packages/mcp-server/src/services/opik.ts` - sanitizeLocationPII on trace/span inputs and outputs

## Decisions Made
- **Consent overlay approach:** Modal overlay (not route) to keep user in onboarding flow
- **Empty messages until consent:** Chat messages are empty until user makes consent choice, then greeting appears
- **API defense-in-depth:** Even if frontend sends raw coordinates, API always applies fuzzyCoordinates
- **Duplicate sanitization function:** PII sanitizer duplicated in opik.ts with explicit dual-maintenance warning (acceptable for hackathon; production should extract to shared package)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Privacy foundation complete with consent flow and enforcement
- Location data now flows through privacy-compliant pipeline
- Ready for Phase 17: Real Job Search API (can use coordinates safely)
- Ready for Phase 18: Background Prefetch (location available early in onboarding)

---
*Phase: 16-privacy-consent*
*Completed: 2026-02-01*
