---
phase: bugfix-budget-projections
plan: 01
subsystem: ui
tags: [solidjs, progress-tracking, budget, trades]

# Dependency graph
requires:
  - phase: none (standalone bugfix)
    provides: existing Budget API with oneTimeGains structure
provides:
  - progressCalculator utility for unified progress calculation
  - TimelineHero integration with oneTimeGains prop
  - suivi.tsx budget fetch and progress calculation
affects: [bugfix-02, bugfix-03, any future progress tracking features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic progress calculation separating stored (missions) from calculated (trades)"
    - "OneTimeGains interface for trade sales, borrow savings, paused subscriptions"

key-files:
  created:
    - packages/frontend/src/lib/progressCalculator.ts
  modified:
    - packages/frontend/src/routes/suivi.tsx
    - packages/frontend/src/components/suivi/TimelineHero.tsx

key-decisions:
  - "Option 2 (Dynamic Calculation) chosen over Option 1 (Merge into currentAmount) to prevent double-counting"
  - "Keep 'earned' metric card showing mission earnings only while progress bar shows total"

patterns-established:
  - "calculateTotalProgress(currentAmount, oneTimeGains) for consistent progress calculation"
  - "Fetch Budget API data alongside profile data to get latest oneTimeGains"

# Metrics
duration: 8min
completed: 2026-02-01
---

# Phase bugfix-budget-projections Plan 01: Suivi Progress Integration Summary

**Dynamic progress calculation utility integrating trade sales, borrow savings, and paused subscriptions into Suivi page progress bar**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-01T14:54:38Z
- **Completed:** 2026-02-01T15:02:57Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created progressCalculator.ts utility with OneTimeGains interface and calculateTotalProgress function
- Integrated budget API fetch into suivi.tsx loadData() for one-time gains retrieval
- Updated TimelineHero to use totalAmount() for progress bar, goal achievement detection, and animation
- Progress percentage now correctly reflects mission earnings + trade sales + borrow savings + paused subscriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create progressCalculator utility** - `3330fe6` (feat)
2. **Task 2: Integrate budget fetch and calculator into suivi.tsx** - `ad05572` (feat, committed as part of bugfix-02 parallel execution)
3. **Task 3: Update TimelineHero to use oneTimeGains** - `38835e4` (feat)

## Files Created/Modified

- `packages/frontend/src/lib/progressCalculator.ts` - New utility with OneTimeGains interface, calculateTotalProgress(), getEmptyOneTimeGains()
- `packages/frontend/src/routes/suivi.tsx` - Added oneTimeGains signal, budget API fetch in loadData(), progress calculation with calculateTotalProgress()
- `packages/frontend/src/components/suivi/TimelineHero.tsx` - Added oneTimeGains prop, totalAmount() helper, updated amountProgress() and goalAchieved()

## Decisions Made

1. **Dynamic calculation over stored merge**: Option 2 from the analysis was chosen. One-time gains are fetched from Budget API and calculated at display time rather than merged into followupData.currentAmount. This prevents double-counting when page is refreshed.

2. **Keep 'earned' card showing missions only**: The "earned" metric card in TimelineHero continues to show `props.currentAmount` (mission earnings only) while the main progress display shows `totalAmount()` (missions + trades). This provides users visibility into both values.

3. **Parallel fetch pattern**: Budget API is fetched immediately after profile is loaded, keeping the data fresh for each page load rather than caching it in profile state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Parallel execution overlap**: Task 2 changes to suivi.tsx were committed in commit `ad05572` by a parallel bugfix-02 execution that picked up the working directory changes. The changes are identical and correct - this was a timing coordination issue, not a code problem.
- **Linter reverting changes**: The lint-staged pre-commit hook occasionally reverted file edits when multiple files were staged together. Resolved by committing files individually and using Write tool for complete file rewrites.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- progressCalculator utility is ready for use in bugfix-02 (chat charts) and bugfix-03 (GoalsTab)
- TimelineHero properly accepts and uses oneTimeGains prop
- Budget API fetch pattern established for other components needing one-time gains data

---
*Phase: bugfix-budget-projections*
*Completed: 2026-02-01*
