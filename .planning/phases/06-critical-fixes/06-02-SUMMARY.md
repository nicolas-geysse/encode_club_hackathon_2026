---
phase: 06-critical-fixes
plan: 02
subsystem: frontend
tags: [i18n, localization, english, chat, llm]

# Dependency graph
requires:
  - phase: 06-01
    provides: Start My Plan button stability
provides:
  - English localization for all chat responses
  - English LLM classifier prompt
  - English budget formatting labels
affects: [07-ux-improvements, all-user-facing-text]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Consistent English messaging across all chat handlers

key-files:
  created: []
  modified:
    - packages/frontend/src/routes/api/chat.ts
    - packages/frontend/src/lib/budgetService.ts
    - packages/frontend/src/lib/chat/intent/llmClassifier.ts
    - packages/frontend/src/components/chat/OnboardingChat.tsx

key-decisions:
  - "Translate all user-facing French strings to English for consistent UX"
  - "Keep French patterns in detector.ts (intentional for French input detection)"

patterns-established:
  - "All chat responses in English"
  - "All LLM prompts in English"

# Metrics
duration: 8min
completed: 2026-01-31
---

# Phase 6 Plan 02: Translate French Strings to English Summary

**Audit and translate all French strings to English for consistent user experience across chat system**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-31T16:38:00Z
- **Completed:** 2026-01-31T16:46:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Translated all chat.ts response messages (swipe embed, chart gallery, budget/progress/energy charts)
- Translated budgetService.ts formatBudgetForChat() and calculateBudgetHealth() labels
- Translated INTENT_CLASSIFICATION_PROMPT from French to English
- Translated chart button trigger messages in OnboardingChat.tsx
- Discovered and translated additional formatBudgetForPrompt() function in chat.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Translate chat.ts response messages** - `c2ac891` (fix)
2. **Task 2: Translate budgetService.ts labels** - `5b11b0f` (fix)
3. **Task 3: Translate LLM classifier prompt** - `a3ec627` (fix)
4. **Task 4: Translate chart button messages** - `b1ec742` (fix)

**Additional fix (amended):** `7d0365d` - formatBudgetForPrompt function translation

## Files Created/Modified

- `packages/frontend/src/routes/api/chat.ts` - All response strings and formatBudgetForPrompt translated
- `packages/frontend/src/lib/budgetService.ts` - formatBudgetForChat and health messages translated
- `packages/frontend/src/lib/chat/intent/llmClassifier.ts` - Full prompt translated to English
- `packages/frontend/src/components/chat/OnboardingChat.tsx` - Chart button messages translated

## Decisions Made

- Kept French patterns in detector.ts intentionally (used for detecting French user input)
- All user-facing text now consistently in English

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Additional formatBudgetForPrompt function found**
- **Found during:** Task 1 verification
- **Issue:** formatBudgetForPrompt() in chat.ts also had French labels, not listed in plan
- **Fix:** Translated all labels in this function to English
- **Files modified:** packages/frontend/src/routes/api/chat.ts
- **Verification:** Global French pattern search returns no matches
- **Committed in:** 7d0365d (amended commit)

---

**Total deviations:** 1 auto-fixed (1 bug - missed function during planning)
**Impact on plan:** Minor scope addition for completeness. No architectural changes.

## Issues Encountered

None - plan executed with one additional function discovered during verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 complete with both plans executed
- All chat responses now in English
- Ready for Phase 7 (UX Improvements)

---
*Phase: 06-critical-fixes*
*Completed: 2026-01-31*
