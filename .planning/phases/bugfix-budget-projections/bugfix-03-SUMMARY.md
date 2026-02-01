---
phase: bugfix-budget-projections
plan: 03
subsystem: ui
tags: [solidjs, progress-display, tooltip, reactive-signals, budget-tracking]

# Dependency graph
requires:
  - phase: bugfix-01
    provides: progressCalculator utility and oneTimeGains integration
provides:
  - TimelineHero breakdown tooltip showing earnings sources
  - GoalsTab progress calculation including oneTimeGains
  - Consistent progress display across Suivi and Goals pages
affects: [future-budget-features, dashboard-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional tooltip rendering based on data presence
    - Budget data resource fetching in GoalsTab
    - Progress recalculation with oneTimeGains

key-files:
  modified:
    - packages/frontend/src/components/suivi/TimelineHero.tsx
    - packages/frontend/src/components/tabs/GoalsTab.tsx

key-decisions:
  - "Show breakdown tooltip only when oneTimeGains exist (clean UI for simple cases)"
  - "Fetch budget data directly in GoalsTab rather than prop drilling"
  - "Use simple text breakdown below total amount (not popover/modal)"

patterns-established:
  - "Progress display pattern: show total prominently with breakdown below"
  - "Conditional rendering for optional data display"

# Metrics
duration: 15min
completed: 2026-02-01
---

# Bugfix-03: UI Clarity Summary

**TimelineHero breakdown tooltip and GoalsTab progress integration for consistent one-time gains display across pages**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-01T15:18:00Z
- **Completed:** 2026-02-01T15:33:26Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- TimelineHero shows breakdown text when one-time gains exist (Earned + Sold + Borrowed + Paused)
- GoalsTab fetches budget data and calculates progress including oneTimeGains
- Progress percentages now consistent between Suivi page and Goals tab
- Clean UI maintained for users with only mission earnings (no breakdown shown)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add breakdown tooltip to TimelineHero earned metric** - `5ee20c4` (feat)
2. **Task 2: Update GoalsTab progress to include oneTimeGains** - `155d6a2` (feat)
3. **Task 3: Human verification of progress integration** - Checkpoint approved

**Plan metadata:** TBD (this commit)

## Files Created/Modified
- `packages/frontend/src/components/suivi/TimelineHero.tsx` - Added hasOneTimeGains() and breakdownText() helpers, breakdown display below earned metric
- `packages/frontend/src/components/tabs/GoalsTab.tsx` - Added budget data resource fetch, adjustedProgress() calculation with oneTimeGains

## Decisions Made
- Show breakdown tooltip only when oneTimeGains exist - keeps UI clean for simple cases
- Fetch budget data directly in GoalsTab via createResource - avoids complex prop drilling from plan.tsx
- Use simple text breakdown (not a popover or modal) - quick glance without interaction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed plan specifications.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Budget projection bugfix milestone complete
- All three plans (01, 02, 03) deliver consistent oneTimeGains integration
- Ready for production testing with real user data

---
*Phase: bugfix-budget-projections*
*Completed: 2026-02-01*
