# Sprint: Wellbeing Connections & Mood Tracking

**Status**: COMPLETED
**Priority**: High (pre-submission fix)
**Scope**: Re-enable energy tracking, verify algorithm connections

---

## Implementation Summary

### Completed Tasks

- [x] **P0**: Re-enabled EnergyHistory component in progress.tsx
- [x] **P0**: Re-enabled ComebackAlert component
- [x] **P1**: Created DailyMoodModal component with emoji input
- [x] **P1**: Added daily mood check-in on Progress page load (once per day via localStorage)
- [x] **P2**: Created `useKarma` hook for karma calculation
- [x] **P2**: Added 3 karma-based achievements (Community Helper, Sharing Champion, Karma Legend)
- [x] **P2**: Integrated karma into achievements system
- [x] **P2**: Added karma-based Bruno tips (celebration when karma >= 5, opportunity when >= 2)
- [x] **P2**: Passed karma score to BrunoTips component

---

## Investigation Summary

### Current State Analysis

| Feature | Status | Connected? | Notes |
|---------|--------|-----------|-------|
| **Karma Score** | UI counter only | NO | Just counts lend/trade actions in TradeTab.tsx:521-524 |
| **Energy History** | Component exists | HIDDEN | EnergyHistory.tsx has emoji input, but COMMENTED OUT in progress.tsx:1148-1154 |
| **Comeback Detection** | Algorithm works | YES | Checks `followup().energyHistory` in progress.tsx:269 |
| **Energy Debt** | Algorithm works | YES | Uses `detectEnergyDebt()` from lib/algorithms |
| **Swipe Preferences** | Weights update | YES | Updates profile weights after swipes |

### Root Cause

The **EnergyHistory component is commented out** in `packages/frontend/src/routes/progress.tsx` (lines 1148-1154). This means:
- Users cannot input their mood/energy via emoji buttons
- Energy history shows only demo data (random values generated at startup)
- Comeback Detection and Energy Debt algorithms receive stale/fake data

The data flow EXISTS and is properly wired:
```
Emoji click → handleEnergyUpdate (line 892)
            → updateFollowup({ energyHistory })
            → triggers Comeback/Debt algorithms
            → affects BrunoTips recommendations
```

---

## Tasks

### P0: Re-enable Energy Tracking (Critical)

**Task 1.1**: Uncomment EnergyHistory in progress.tsx
- File: `packages/frontend/src/routes/progress.tsx`
- Lines: 1148-1154
- Risk: Low (component is tested, just hidden)

**Task 1.2**: Consider also re-enabling ComebackAlert
- File: `packages/frontend/src/routes/progress.tsx`
- Lines: 1156-1167
- This shows the full comeback UI when conditions are met

### P1: Add Daily Mood Check-in

**Proposal**: Add an app-launch mood prompt that:
1. Shows a modal on first visit of the day
2. Uses the same emoji scale (😴 😔 😐 😊 😄)
3. Could be a simple toast/popup or a dedicated modal

**UI Options**:
- **A) Toast notification** - Gentle, non-blocking
- **B) Modal prompt** - Forces input before proceeding
- **C) Tab greeting** - Shows in Progress page header

**Implementation location**:
- `packages/frontend/src/routes/progress.tsx` (on mount)
- Or global in `App.tsx` with localStorage timestamp check

#### Technical Risk (Senior Dev Review)

**Current behavior** (`handleEnergyUpdate` in progress.tsx:892-903):
```typescript
const existingIndex = history.findIndex((e) => e.week === week);
if (existingIndex >= 0) {
  // Overwrites existing entry for the week
  history[existingIndex] = { ...history[existingIndex], level };
}
```

The code stores ONE entry per week. Multiple daily inputs will overwrite each other.

**Decision**:
- **Pragmatic (Recommended for hackathon)**: Accept "last input = week's value". Simple, no schema change.
- **Robust (Future)**: Modify `EnergyEntry` to store daily values array + compute weekly average. Scope creep risk.

### P2: Connect Karma to Wellbeing (Nice-to-have)

Currently karma is just a UI counter in TradeTab.tsx:521-524:
```typescript
const karmaScore = () =>
  trades().filter((t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending')
    .length;
```

**Options to make it meaningful**:

**Option A: Energy Boost**
- Each karma point = +2% energy bonus
- "Good karma gives you energy"

**Option B: Achievement Unlock**
- Karma thresholds unlock achievements
- 5 karma = "Community Helper" badge
- 10 karma = "Sharing Champion" badge

**Option C: Leave as-is (Recommended)**
- Karma is a visible metric for gamification
- No direct wellbeing impact needed

#### Refactoring Note (Senior Dev Review)

If Karma becomes shared across components, extract to a hook:
```typescript
// packages/frontend/src/hooks/useKarma.ts
export function useKarma(trades: Accessor<Trade[]>) {
  return createMemo(() =>
    trades().filter((t) =>
      (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending'
    ).length
  );
}
```
For now, the calculation stays local to TradeTab (no duplication yet).

### P3: Fix Daily Popup Errors (Investigation needed)

**Symptoms**: User reports daily popup errors on Progress page
**Possible causes**:
1. BrunoTips/BrunoHintV2 API call failures
2. Warmup fetch errors (tab-tips warmup)
3. Profile loading race conditions

**Debug steps**:
1. Check browser console for specific errors
2. Look for patterns in Opik traces
3. Test with empty profile vs populated profile

---

## Affected Files (Final)

| File | Changes |
|------|---------|
| `packages/frontend/src/routes/progress.tsx` | Re-enabled EnergyHistory + ComebackAlert, added DailyMoodModal, integrated karma |
| `packages/frontend/src/components/suivi/DailyMoodModal.tsx` | **NEW** - Daily mood check-in modal with emoji input |
| `packages/frontend/src/hooks/useKarma.ts` | **NEW** - Karma calculation hook + helper functions |
| `packages/frontend/src/lib/achievements.ts` | Added 3 karma achievements + check logic |
| `packages/frontend/src/components/suivi/BrunoTips.tsx` | Added karmaScore prop + karma-based tips |

---

## Testing Checklist

- [ ] Energy emoji buttons work (click updates state)
- [ ] Energy history persists across page refresh
- [ ] Comeback Detection triggers when conditions met (3+ low weeks, then >80%)
- [ ] Energy Debt triggers after 3 consecutive weeks <40%
- [ ] BrunoTips reflect current energy state
- [ ] No popup errors on page load

---

## Quick Fix (Minimal)

If time-constrained, just uncomment lines 1148-1154 in `progress.tsx`:

```tsx
{/* Section 2: Energy (MOVED UP - leading indicator) */}
<EnergyHistory
  history={followup().energyHistory}
  onEnergyUpdate={handleEnergyUpdate}
  currentWeek={currentWeekNumber()}
/>
```

This alone re-enables the full energy tracking flow.
