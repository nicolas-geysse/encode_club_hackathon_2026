---
phase: 23-ux-polish
plan: 02
subsystem: ui
tags: [chart.js, tooltips, legend, status-colors, accessibility]

# Dependency graph
requires:
  - phase: 22-calculation-unification
    provides: GOAL_STATUS_THRESHOLDS constant and unified status calculation
provides:
  - Clear stat labels with descriptive tooltips
  - Visible chart legend with color-coded line samples
  - Consistent status colors aligned with WeeklyProgressCards
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native HTML title attributes for accessible tooltips"
    - "Dynamic threshold display from GOAL_STATUS_THRESHOLDS constants"

key-files:
  created: []
  modified:
    - packages/frontend/src/components/EarningsChart.tsx

key-decisions:
  - "Use native HTML title attributes for tooltips (simple, no dependencies)"
  - "Legend uses line samples instead of boxes to match actual chart visualization"
  - "on-track status uses text-primary to match WeeklyProgressCards design"

patterns-established:
  - "Status tooltip shows threshold percentages dynamically from GOAL_STATUS_THRESHOLDS"
  - "Chart legend conditionally shows Actual line only when data exists"

# Metrics
duration: 4min
completed: 2026-02-02
---

# Phase 23 Plan 02: EarningsChart Label Clarity Summary

**Clearer stat labels (Total Earned, This Week's Target), native tooltips, visible legend, and status color alignment with WeeklyProgressCards**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-02T17:56:45Z
- **Completed:** 2026-02-02T18:01:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Renamed confusing stat labels to clearer names with explanatory tooltips
- Added visible chart legend showing all line types with matching colors
- Aligned status colors with WeeklyProgressCards (on-track uses text-primary)
- Connected status tooltip to GOAL_STATUS_THRESHOLDS for dynamic threshold display

## Task Commits

Each task was committed atomically:

1. **Task 1: Update stat labels and add title tooltips** - `ff4d5cf` (feat)
2. **Task 2: Add explicit chart legend below the chart** - included in docs commit due to concurrent execution
3. **Task 3: Ensure consistent status colors with WeeklyProgressCards** - `38bfad3` (feat)

**Note:** Task 2 changes were committed alongside the 23-01 plan's docs commit (8005b27) due to parallel execution timing. The code changes are correct and complete.

## Files Created/Modified

- `packages/frontend/src/components/EarningsChart.tsx` - Updated labels, tooltips, legend, and status colors

### Key Changes

**Labels renamed:**
- "Saved" -> "Total Earned" (clearer that it includes all income sources)
- "Weekly Need" -> "This Week's Target" (emphasizes capacity-aware calculation)
- "~Xw remaining" -> "Est. X weeks" (clearer estimate format)

**Tooltips added:**
- Total Earned: "Sum of all your income sources toward this goal (missions, savings, sales)"
- This Week's Target: "Amount adjusted based on your availability this week (capacity-aware calculation)"
- Status: Dynamic display of threshold percentages from GOAL_STATUS_THRESHOLDS
- Est. weeks: "Estimate based on your current earning rate"

**Legend added:**
- Goal target (dashed red line)
- Required pace (yellow line)
- Projected (green line)
- Actual (blue line, conditionally shown when data exists)

**Status colors aligned:**
- ahead: text-green-600 dark:text-green-400
- on-track: text-primary (was green, now matches WeeklyProgressCards)
- behind: text-amber-600 dark:text-amber-400
- critical: text-red-600 dark:text-red-400
- stats().onPace fallback: text-primary (for backward compatibility)

## Decisions Made

1. **Native HTML title attributes** - Simple tooltip solution without additional dependencies
2. **Line samples in legend** - Better represent actual chart visualization than Chart.js boxes
3. **on-track uses text-primary** - Matches WeeklyProgressCards design system
4. **Dynamic threshold display** - Status tooltip uses GOAL_STATUS_THRESHOLDS values directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Concurrent execution with 23-01 plan caused Task 2 changes to be included in wrong commit (8005b27)
- Resolution: Changes are functionally correct, documented in summary

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EarningsChart label clarity complete
- v4.0 Goals Tab Fix milestone: 9/8 plans (over-delivered with this UX polish)
- Phase 23 has one more plan (23-03 if it exists) or is complete

---
*Phase: 23-ux-polish*
*Completed: 2026-02-02*
