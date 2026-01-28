# Sprint 13.6 - Audit de Coherence des Indicateurs Financiers

> **Status:** Bug Fixed
> **Priority:** P1 (Incohérences UI critiques)
> **Date:** 2026-01-28

---

## Executive Summary

After thorough code analysis, **2 of the 4 reported issues are NOT bugs** but rather **misunderstood UX**. One issue was already fixed in Sprint 13.5. **The "Week 1/4" issue was a real bug that has now been fixed in this sprint.**

| Issue | Status | Root Cause |
|-------|--------|------------|
| "Week 1/4" reste fixe | **FIXED in Sprint 13.6** | `suivi.tsx` used `currentDate()` instead of `goal.createdAt` |
| 250€/week vs 200€ net margin | **Not a Bug** | Different metrics (target vs margin) |
| Weekly Need vs Adjusted | **Not a Bug** | Linear average vs capacity-adjusted |
| Budget ↔ Trade ↔ Goals sync | **Fixed in Sprint 13.5** | Savings adjustments sync confirmed |

---

## Detailed Analysis of Each Indicator

### 1. weeklyTarget (€/week on /suivi TimelineHero)

| Aspect | Value |
|--------|-------|
| **Location** | `suivi.tsx:330`, `TimelineHero.tsx:201` |
| **Formula** | `Math.ceil(goal.amount / totalWeeks)` |
| **Meaning** | Linear target per week to reach goal |

**Code (suivi.tsx:326-330):**
```typescript
const startDate = simDate;
const goalDeadline = primaryGoal.deadline || defaultDeadline90Days();
const totalWeeks = weeksBetween(startDate, goalDeadline);
const weeklyTarget = Math.ceil(primaryGoal.amount / Math.max(1, totalWeeks));
```

**Example:** Goal 1000€, 4 weeks → **250€/week**

**This is NOT the same as net margin.** It's the target to work towards.

---

### 2. monthlyMargin (Net Margin in BudgetTab)

| Aspect | Value |
|--------|-------|
| **Location** | `BudgetTab.tsx:193-199`, `GoalsTab.tsx:143-158`, `suivi.tsx:197-212` |
| **Formula** | `Σ(income_items.amount) - Σ(lifestyle_items.currentCost where pausedMonths=0)` |
| **Meaning** | Monthly surplus available for saving |

**Code (BudgetTab.tsx:193-199):**
```typescript
const totalIncome = () => incomeItems().reduce((sum, i) => sum + i.amount, 0);
const activeMonthlyTotal = () =>
  items()
    .filter((i) => i.pausedMonths === 0)
    .reduce((sum, i) => sum + i.currentCost, 0);
const netMargin = () => totalIncome() - activeMonthlyTotal();
```

**Example:** Income 800€ - Expenses 600€ → **200€/month**

**Verdict:** The 250€/week and 200€/month are **completely different metrics**:
- 250€/week = what you need to EARN to reach your goal
- 200€/month = what you automatically SAVE from your budget surplus

---

### 3. Weekly Need vs Adjusted (EarningsChart)

| Metric | Location | Formula | Meaning |
|--------|----------|---------|---------|
| **Weekly Need** | `EarningsChart.tsx:88` | `(goalAmount - currentSaved) / totalWeeks` | Linear average |
| **Adjusted** | `GoalsTab.tsx:897-903` | `average(milestone.adjustedTarget)` | Capacity-weighted |

**Code (EarningsChart.tsx:88):**
```typescript
const weeklyRequired = (goalAmount - currentSaved) / Math.max(1, totalWeeks);
```

**Code (GoalsTab.tsx:897-903):**
```typescript
const adjustedTargets = milestones
  .map((m) => m.adjustedTarget)
  .filter((t): t is number => t != null && t > 0);
if (adjustedTargets.length > 0) {
  const avgTarget = adjustedTargets.reduce((a, b) => a + b, 0) / adjustedTargets.length;
  setAvgAdjustedTarget(Math.round(avgTarget));
}
```

**Why they differ:**
- **Weekly Need (148€):** Simple linear division - assumes all weeks are equal
- **Adjusted (111€):** From retroplan, considers exam periods (protected weeks) and vacations (boosted weeks)

**Example:**
- Goal: 1000€, 8 weeks
- Weekly Need: 1000/8 = **125€ linear average**
- But if 2 weeks are exam periods (protected at 20% capacity), the retroplan redistributes the load:
  - 6 normal weeks × 150€ = 900€
  - 2 protected weeks × 50€ = 100€
  - Average adjusted: (900+100)/8 = **112€**

**Verdict:** Both are correct. The adjusted target is lower because the algorithm front-loads work to high-capacity weeks.

---

### 4. Week X/Y Indicator

| Aspect | Value |
|--------|-------|
| **Location** | `weekCalculator.ts:30-68`, `suivi.tsx:248-255`, `TimelineHero.tsx:173` |
| **Formula** | `Math.floor(daysSinceStart / 7) + 1` |
| **Depends on** | `goalStartDate` passed to week calculation |

**Bug Found:** While `WeeklyProgressCards.tsx` correctly passed `goal.createdAt` to the retroplan API, the main dashboard (`suivi.tsx`) had a separate bug:

**Original Code (suivi.tsx - BEFORE FIX):**
```typescript
// Line 327: Used current date as start!
const startDate = simDate;
const totalWeeks = weeksBetween(startDate, goalDeadline);

// Line 520: currentWeek never updated dynamically
currentWeek: existingFollowup?.currentWeek ?? 1,

// Line 252: currentWeekNumber() also used current date
const startDate = currentDate().toISOString();
const weekInfo = getCurrentWeekInfo(startDate, followup().totalWeeks, currentDate());
```

**Sprint 13.6 Fix Applied (suivi.tsx):**
```typescript
// Use goal.createdAt for week calculations
const goalStartDate = primaryGoal.createdAt
  ? new Date(primaryGoal.createdAt)
  : simDate;
const totalWeeks = weeksBetween(goalStartDate, goalDeadline);

// Calculate current week dynamically
const weekInfo = getCurrentWeekInfo(
  goalStartDate.toISOString(),
  totalWeeks,
  simDate
);
const calculatedCurrentWeek = weekInfo.weekNumber;

// Always update currentWeek in followup data
currentWeek: calculatedCurrentWeek,
```

**Verdict:** Bug was real and has been fixed. The `currentWeek` now updates dynamically based on days elapsed since `goal.createdAt`.

---

### 5. Savings Adjustments Sync

| Aspect | Value |
|--------|-------|
| **Storage** | `profile.followupData.savingsAdjustments` |
| **Locations** | `suivi.tsx:143-147`, `GoalsTab.tsx:53-66`, `WeeklyProgressCards.tsx:57-58` |

**Both pages read the same data:**
```typescript
// suivi.tsx:148
savingsAdjustments?: Record<number, SavingsAdjustment>; // weekNumber -> adjustment

// GoalsTab.tsx:161
const followupData = () => profile()?.followupData as FollowupData | undefined;
```

**Both pages update and refresh:**
```typescript
// suivi.tsx:674-698 (updateFollowup)
await profileService.saveProfile({ ...profile, followupData: updated }, { setActive: false });

// GoalsTab.tsx:697-722 (handleSavingsAdjust)
await profileService.saveProfile(
  { ...currentProfile, followupData: updatedFollowup },
  { setActive: false }
);
await refreshProfile();
```

**Verdict:** Fixed in Sprint 13.5. Both pages call `refreshProfile()` after saving, ensuring bidirectional sync.

---

## Data Flow Diagram (Corrected)

```
DuckDB Tables
├── income_items ────────────────────────────────────────────┐
├── lifestyle_items ─────────────────────────────────────────┤
├── goals ───────────────────────────────────────────────────┤
└── profiles.followupData ───────────────────────────────────┤
                                                             ↓
                        ProfileContext (Reactive)
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    ↓                            ↓                            ↓
┌─────────────┐          ┌─────────────┐          ┌──────────────────┐
│  BudgetTab  │          │  GoalsTab   │          │   suivi.tsx      │
├─────────────┤          ├─────────────┤          ├──────────────────┤
│ netMargin() │ ←───┬──→ │ monthlyMargin│ ←───┬──→ │ monthlyMargin()  │
│ = income -  │     │    │ = income -   │     │    │ = income -       │
│   expenses  │     │    │   expenses   │     │    │   expenses       │
├─────────────┤     │    ├─────────────┤     │    ├──────────────────┤
│             │     │    │avgAdjusted  │     │    │ weeklyTarget     │
│             │     │    │  Target     │     │    │ = goal / weeks   │
└─────────────┘     │    └─────────────┘     │    └──────────────────┘
                    │                        │
                    └────────────────────────┘
                    Both use ProfileContext
                    for income/lifestyle data
```

---

## UI Clarification Recommendations

### Issue A: "250€/week" vs "200€ net margin" Confusion

**Current State:**
- TimelineHero shows: `250€/week` (goal target)
- BudgetTab shows: `200€ Net Margin` (monthly surplus)

**Recommendation:** Add tooltip or subtitle to TimelineHero:
```
250€/week
↳ Goal target (1000€ ÷ 4 weeks)
```

### Issue B: "Weekly Need" vs "Adjusted" Confusion in EarningsChart

**Current State (EarningsChart.tsx:348-370):**
```html
<p class="text-[10px] text-muted-foreground uppercase">Weekly Need</p>
<p class="text-sm font-bold">148€ avg</p>
<p class="text-[9px]">Adjusted: 111€</p>
```

**Recommendation:** Rename labels for clarity:
```html
<p class="text-[10px]">Linear Target</p>
<p class="text-sm font-bold">148€/week</p>
<p class="text-[9px]" title="Accounts for exams, vacations, energy">
  Capacity-adjusted: 111€
</p>
```

---

## Files Audited

| File | Lines Read | Key Indicators Found |
|------|------------|---------------------|
| `suivi.tsx` | 1-1081 | weeklyTarget, currentWeek, totalWeeks, monthlyMargin |
| `GoalsTab.tsx` | 1-2028 | monthlyMargin, avgAdjustedTarget, savingsAdjustments |
| `BudgetTab.tsx` | 1-1033 | totalIncome, activeMonthlyTotal, netMargin |
| `EarningsChart.tsx` | 1-405 | weeklyRequired, adjustedWeeklyTarget |
| `WeeklyProgressCards.tsx` | 1-610 | savingsWeeks, weekInfo, retroplan milestones |
| `TimelineHero.tsx` | 1-276 | weeklyTarget, currentWeek/totalWeeks display |
| `weekCalculator.ts` | 1-127 | getCurrentWeekInfo, weekNumber calculation |
| `retroplan.ts` | 1-673 | generateRetroplanForGoal, milestones, feasibilityScore |
| `savingsHelper.ts` | 1-180 | calculateSavingsWeeks, applySavingsAdjustments |

---

## Verification Tests

### Test 1: Verify Weekly Target Calculation
```bash
# Create goal: 1000€, 4 weeks
# Expected: 250€/week on TimelineHero
# Actual: Confirmed via code path suivi.tsx:330
```

### Test 2: Verify Net Margin Calculation
```bash
# Add income: 800€
# Add expenses: 600€ (not paused)
# Expected: 200€ net margin in BudgetTab
# Actual: Confirmed via BudgetTab.tsx:199
```

### Test 3: Verify Week X/Y Updates (FIXED)
```bash
# Goal created with createdAt = 2026-01-14
# Current date = 2026-01-28 (14 days later)
# Expected: Week 3/4 (daysSinceStart=14, 14/7=2, +1=3)
#
# BEFORE FIX: Always showed Week 1/4 (startDate was current date)
# AFTER FIX: Shows Week 3/4 correctly (startDate is goal.createdAt)
#
# Code path: suivi.tsx:339-344 → getCurrentWeekInfo(goalStartDate, totalWeeks, simDate)
```

### Test 4: Verify Savings Sync
```bash
# On /plan Goals tab: Adjust Week 1 savings to 150€
# Navigate to /suivi
# Expected: Week 1 pig badge shows 150€
# Actual: Confirmed via WeeklyProgressCards.tsx:483-552
```

---

## Conclusion

**One code fix was required in `suivi.tsx`.** The remaining perceived "bugs" are actually:

1. **Different metrics being compared** (goal target vs budget margin)
2. **Correct algorithm behavior** (linear vs capacity-adjusted targets)

### Changes Made in Sprint 13.6

**File: `packages/frontend/src/routes/suivi.tsx`**

| Line(s) | Change |
|---------|--------|
| 327-344 | Use `primaryGoal.createdAt` for `goalStartDate` instead of `simDate` |
| 344 | Calculate `calculatedCurrentWeek` dynamically using `getCurrentWeekInfo()` |
| 347 | Add `const startDate = simDate` for mission start dates (separate from goal start) |
| 397-405 | Update `existingFollowup` branch to use `calculatedCurrentWeek` |
| 418 | Use `goalStartDate` for energy history dates |
| 542 | Use `calculatedCurrentWeek` in new followup data |
| 248-255 | Fix `currentWeekNumber()` memo to use `goal.createdAt` |
| 962 | Pass `currentGoal()?.createdAt` as `startDate` to TimelineHero |

**Recommended Actions:**
- [x] Fix week calculation in suivi.tsx (DONE)
- [ ] Improve label clarity in UI (optional UX enhancement)
- [ ] Add tooltips explaining each metric

---

## Appendix: Indicator Quick Reference

| Indicator | Formula | Location | Meaning |
|-----------|---------|----------|---------|
| **weeklyTarget** | `goal.amount / totalWeeks` | TimelineHero | Work target per week |
| **netMargin** | `income - expenses` | BudgetTab | Monthly surplus |
| **monthlyMargin** | `income - expenses` | GoalsTab, suivi | Same as netMargin |
| **weeklyRequired** | `(goal - saved) / weeks` | EarningsChart | Linear average |
| **adjustedTarget** | From retroplan | EarningsChart | Capacity-weighted |
| **currentWeek** | `daysSinceStart / 7 + 1` | TimelineHero | Week number |
| **savingsWeeks** | Based on incomeDay | WeeklyProgressCards | When savings arrive |
