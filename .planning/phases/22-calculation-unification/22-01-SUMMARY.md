---
phase: 22-calculation-unification
plan: 01
subsystem: ui
tags: [solidjs, goal-tracking, status-calculation, hooks, chart]

# Dependency graph
requires:
  - phase: 21-integration
    provides: useGoalData hook, EarningsChart milestones prop, GoalsTab rewiring
provides:
  - Unified goal status calculation via goalStatus.ts
  - Configurable GOAL_STATUS_THRESHOLDS constant
  - cumulativeTarget field in GoalStats interface
  - EarningsChart stats prop integration with useGoalData
affects: [23-ux-polish, future goal components]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-status-calculation, threshold-configuration, hook-to-component-stats-flow]

key-files:
  created:
    - packages/frontend/src/lib/goalStatus.ts
  modified:
    - packages/frontend/src/hooks/useGoalData.ts
    - packages/frontend/src/components/EarningsChart.tsx
    - packages/frontend/src/components/tabs/GoalsTab.tsx

key-decisions:
  - "Configurable thresholds: AHEAD=1.05, ON_TRACK=0.90, BEHIND=0.40 matching WeeklyProgressCards"
  - "cumulativeTarget computed once in stats memo and reused for status/onPace/return"
  - "EarningsChart stats prop is optional with backward-compatible fallback"

patterns-established:
  - "Unified status calculation: all components use calculateGoalStatus from goalStatus.ts"
  - "Stats prop pattern: hook computes stats, parent passes to display components"

# Metrics
duration: 5min
completed: 2026-02-02
---

# Phase 22 Plan 01: Calculation Unification Summary

**Unified goal status calculation via configurable thresholds in goalStatus.ts, eliminating dual calculation systems between EarningsChart and WeeklyProgressCards**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-02T17:16:48Z
- **Completed:** 2026-02-02T17:22:07Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created `goalStatus.ts` with GOAL_STATUS_THRESHOLDS constant (1.05, 0.90, 0.40)
- Updated useGoalData hook to use `calculateGoalStatus` function with cumulativeTarget
- Wired unified stats from useGoalData to EarningsChart via new stats prop
- EarningsChart now displays 4-level status (ahead/on-track/behind/critical) matching WeeklyProgressCards

## Task Commits

Each task was committed atomically:

1. **Task 1: Create goalStatus.ts with configurable thresholds** - `22891c9` (feat)
2. **Task 2: Update useGoalData stats computation to use goalStatus** - `05216df` (feat)
3. **Task 3: Update EarningsChart to use stats from props and wire it in GoalsTab** - `a5ccb30` (feat)

## Files Created/Modified
- `packages/frontend/src/lib/goalStatus.ts` - Configurable thresholds and calculateGoalStatus function
- `packages/frontend/src/hooks/useGoalData.ts` - Import goalStatus helpers, add cumulativeTarget to stats
- `packages/frontend/src/components/EarningsChart.tsx` - Accept optional stats prop, prefer unified stats
- `packages/frontend/src/components/tabs/GoalsTab.tsx` - Pass stats={goalData.stats()} to EarningsChart

## Decisions Made
- Thresholds match WeeklyProgressCards exactly (ahead: 105%, on-track: 90%, behind: 40%)
- cumulativeTarget is computed from retroplan milestones with linear fallback
- EarningsChart maintains backward compatibility with fallback to internal calculation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Unified status calculation complete
- Both EarningsChart and WeeklyProgressCards now use same thresholds
- Ready for Phase 23 UX polish (loading states, error handling, visual feedback)

---
*Phase: 22-calculation-unification*
*Completed: 2026-02-02*
