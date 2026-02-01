---
phase: bugfix-budget-projections
verified: 2026-02-01T15:36:35Z
status: passed
score: 19/19 must-haves verified
---

# Phase bugfix-budget-projections Verification Report

**Phase Goal:** Fix progress tracking to include trade sales, borrow savings, and paused subscriptions across the application (Suivi page, Goals tab, Chat charts).

**Verified:** 2026-02-01T15:36:35Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Suivi page progress bar includes completed trade sales | ✓ VERIFIED | TimelineHero uses calculateTotalProgress(currentAmount, oneTimeGains) at L46, oneTimeGains.tradeSales included at L48 |
| 2 | Suivi page progress bar includes active/completed borrow savings | ✓ VERIFIED | TimelineHero includes oneTimeGains.tradeBorrow in calculation at L48 |
| 3 | Suivi page progress bar includes paused subscription savings | ✓ VERIFIED | TimelineHero includes oneTimeGains.pausedSavings in calculation at L48 |
| 4 | Progress percentage reflects total earnings + one-time gains | ✓ VERIFIED | suivi.tsx L683: totalProgress = calculateTotalProgress(currentAmount, oneTimeGains()) |
| 5 | Chat 'show progress' command includes trade sales in projectedSaved | ✓ VERIFIED | chat.ts L1813-1817: oneTimeGainsTotal extracted from budgetContext |
| 6 | Chat progress chart accumulates one-time gains in starting point | ✓ VERIFIED | chat.ts L1847-1848: projectedSaved = getProjectedSavings() + oneTimeGainsTotal |
| 7 | Budget engine projection includes oneTimeGains parameter | ✓ VERIFIED | budgetEngine.ts L27: oneTimeGains?: number in FinancialData interface |
| 8 | Simulation + trades scenario shows correct combined total | ✓ VERIFIED | budgetEngine.ts L115-116: currentProjected = currentSaved + oneTimeGains + currentMargin * monthsRemaining |
| 9 | TimelineHero shows breakdown tooltip: Earned X, Sold Y, Borrowed Z | ✓ VERIFIED | TimelineHero.tsx L55-67: breakdownText() builds "Earned + Sold + Borrowed + Paused" |
| 10 | User understands where their progress comes from | ✓ VERIFIED | TimelineHero.tsx L282-290: breakdown displayed when hasOneTimeGains() |
| 11 | GoalsTab progress percentage includes one-time gains | ✓ VERIFIED | GoalsTab.tsx L228: totalProgress = calculateTotalProgress(currentAmount, oneTimeGains()) |
| 12 | Paused subscriptions appear in breakdown display | ✓ VERIFIED | TimelineHero.tsx L64-65: pausedSavings shown in breakdown |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/frontend/src/lib/progressCalculator.ts` | Unified progress calculation utility | ✓ VERIFIED | Exists (62 lines), exports OneTimeGains, calculateTotalProgress, getEmptyOneTimeGains |
| `packages/frontend/src/routes/suivi.tsx` | Budget data fetching and progress calculation | ✓ VERIFIED | Exists (1244 lines), fetch at L300, calculateTotalProgress at L683 |
| `packages/frontend/src/components/suivi/TimelineHero.tsx` | oneTimeGains prop handling | ✓ VERIFIED | Exists (342 lines), oneTimeGains prop at L36, used in L45-46 |
| `packages/frontend/src/routes/api/chat.ts` | Progress chart with oneTimeGains | ✓ VERIFIED | oneTimeGainsTotal extracted at L1813-1817 |
| `packages/frontend/src/lib/chatChartBuilder.ts` | buildProgressChart with oneTimeGains parameter | ✓ VERIFIED | oneTimeGains parameter at L169, accumulated at L179 |
| `packages/frontend/src/lib/budgetEngine.ts` | FinancialData interface with oneTimeGains | ✓ VERIFIED | oneTimeGains?: number at L27 |
| `packages/frontend/src/components/tabs/GoalsTab.tsx` | Progress calculation with oneTimeGains | ✓ VERIFIED | calculateTotalProgress at L228, adjustedProgress at L219 |

**Score:** 7/7 artifacts verified (all exist, substantive, and wired)

### Artifact Verification Details

#### Level 1: Existence ✓
All 7 artifacts exist on disk.

#### Level 2: Substantive ✓

| Artifact | Lines | Stub Patterns | Exports | Status |
|----------|-------|---------------|---------|--------|
| progressCalculator.ts | 62 | 0 | ✓ (3 exports) | SUBSTANTIVE |
| suivi.tsx | 1244 | 0 | ✓ (default export) | SUBSTANTIVE |
| TimelineHero.tsx | 342 | 0 | ✓ (TimelineHero export) | SUBSTANTIVE |
| chat.ts | ~2100 | 0 | ✓ (POST handler) | SUBSTANTIVE |
| chatChartBuilder.ts | ~220 | 0 | ✓ (buildProgressChart) | SUBSTANTIVE |
| budgetEngine.ts | ~200 | 0 | ✓ (interfaces, functions) | SUBSTANTIVE |
| GoalsTab.tsx | ~1300 | 0 | ✓ (default export) | SUBSTANTIVE |

No TODO, FIXME, placeholder, or empty return patterns found.

#### Level 3: Wired ✓

**progressCalculator.ts imported by:**
- suivi.tsx (L46-50)
- TimelineHero.tsx (L12-16)
- GoalsTab.tsx (L59-63)

**Key wiring verified:**

1. **suivi.tsx → /api/budget**
   - Fetch call at L300: `fetch(\`/api/budget?profileId=${profile.id}\`)`
   - Response used at L302-309: oneTimeGains extracted and set

2. **suivi.tsx → progressCalculator**
   - Import at L46-50
   - Used at L683: `calculateTotalProgress(updated.currentAmount, oneTimeGains())`

3. **TimelineHero.tsx → props.oneTimeGains**
   - Prop defined at L36
   - Used at L45-46: `calculateTotalProgress(props.currentAmount, props.oneTimeGains || getEmptyOneTimeGains())`
   - Breakdown at L51-67 displays tradeSales, tradeBorrow, pausedSavings

4. **chat.ts → budgetContext.oneTimeGains**
   - Extracted at L1813-1817: tradeSalesCompleted + tradeBorrowSavings + pausedSavings
   - Passed to buildProgressChart at L1879

5. **chat.ts → chatChartBuilder.buildProgressChart**
   - Called at L1867-1880 with oneTimeGainsTotal parameter

6. **chatChartBuilder.buildProgressChart → oneTimeGains**
   - Parameter at L169 with default 0
   - Accumulated at L179: `let accumulated = currentSaved + oneTimeGains;`

7. **budgetEngine.calculateProjection → oneTimeGains**
   - FinancialData.oneTimeGains at L27
   - Used at L115: `const oneTimeGains = data.oneTimeGains || 0;`
   - Used at L116: `currentProjected = currentSaved + oneTimeGains + currentMargin * monthsRemaining`

8. **GoalsTab → budget API + progressCalculator**
   - Budget fetch at L199-205 (createResource)
   - oneTimeGains extracted at L208-216
   - calculateTotalProgress used at L228

All key links verified as WIRED.

### Requirements Coverage

No REQUIREMENTS.md entries mapped to this phase (standalone bugfix).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

**Anti-pattern scan:** No TODO, FIXME, placeholder content, console.log-only implementations, or empty handlers found in any modified files.

### Human Verification Required

None. All must-haves can be verified programmatically through code structure and wiring.

---

## Verification Summary

### What Was Verified

**Plan 01 (bugfix-01): Suivi + TimelineHero Core Fix**
- ✓ progressCalculator.ts created with OneTimeGains interface and calculateTotalProgress function
- ✓ suivi.tsx fetches /api/budget and extracts oneTimeGains
- ✓ TimelineHero receives oneTimeGains prop and uses it in progress calculation
- ✓ Progress bar shows total (missions + trades), breakdown shows sources

**Plan 02 (bugfix-02): Chat Charts Fix**
- ✓ budgetEngine.ts FinancialData has oneTimeGains field
- ✓ chatChartBuilder.ts buildProgressChart accepts and uses oneTimeGains parameter
- ✓ chat.ts show_progress_chart extracts oneTimeGains from budgetContext
- ✓ Chart title indicates "(incl. trades)" when oneTimeGains > 0

**Plan 03 (bugfix-03): UI Clarity**
- ✓ TimelineHero shows breakdown (Earned + Sold + Borrowed + Paused)
- ✓ GoalsTab fetches budget and calculates adjusted progress with oneTimeGains
- ✓ Progress percentages consistent across Suivi and Goals pages

### Evidence of Goal Achievement

**Goal:** Fix progress tracking to include trade sales, borrow savings, and paused subscriptions across the application.

**Evidence:**
1. All three data sources (tradeSales, tradeBorrow, pausedSavings) flow from Budget API through progressCalculator
2. Suivi page TimelineHero includes all three in progress bar and breakdown
3. Chat charts include oneTimeGains in starting point and projections
4. GoalsTab progress matches Suivi page (both use calculateTotalProgress)
5. No double-counting risk (dynamic calculation at display time, not stored)

**Verification method:**
- Code structure analysis: All files exist with substantive implementations
- Import/export tracing: All modules properly wired
- Data flow verification: Budget API → oneTimeGains → calculateTotalProgress → UI
- Anti-pattern scan: No stubs, TODOs, or placeholders

**Conclusion:** Phase goal fully achieved. All 19 must-haves (12 truths + 7 artifacts) verified.

---

_Verified: 2026-02-01T15:36:35Z_
_Verifier: Claude (gsd-verifier)_
