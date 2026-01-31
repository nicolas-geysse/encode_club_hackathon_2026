---
phase: 06-critical-fixes
plan: 01
subsystem: ui
tags: [solidjs, onboarding, ux, scroll-area]

# Dependency graph
requires:
  - phase: 05-communication
    provides: postMessage bridge for swipe acknowledgments
provides:
  - Stable Start My Plan button positioning outside message scroll area
affects: [06-critical-fixes, 07-ux-improvements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CTA buttons outside ScrollArea for position stability"

key-files:
  created: []
  modified:
    - packages/frontend/src/components/chat/OnboardingChat.tsx

key-decisions:
  - "Removed in-chat-area button, kept sidebar (desktop) and bottom (mobile) CTAs"

# Metrics
duration: 1min
completed: 2026-01-31
---

# Phase 6 Plan 1: Remove In-Chat Start My Plan Button Summary

**Fixed Start My Plan button instability by removing the CTA that was inside the ScrollArea message list**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-31T16:33:07Z
- **Completed:** 2026-01-31T16:34:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed the problematic "Start My Plan" button that was inside the ScrollArea (moved with new messages)
- Desktop users now see stable sidebar button when `isComplete()` is true
- Mobile users now see stable bottom CTA button when `isComplete()` is true
- Button count reduced from 3 to 2 (plus 1 comment mentioning the text)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove the in-chat-area Start My Plan button** - `a9b8a71` (fix)

**Plan metadata:** (see below)

## Files Created/Modified

- `packages/frontend/src/components/chat/OnboardingChat.tsx` - Removed 22 lines (the in-chat-area button block inside ScrollArea)

## Decisions Made

- Removed only the in-chat button (lines 2586-2608); kept sidebar button (line 2491-2515) and mobile CTA (line 2646-2665) as they are already outside the ScrollArea

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Button positioning fix complete
- Ready for 06-02-PLAN.md (English localization)
- No blockers

---
*Phase: 06-critical-fixes*
*Completed: 2026-01-31*
