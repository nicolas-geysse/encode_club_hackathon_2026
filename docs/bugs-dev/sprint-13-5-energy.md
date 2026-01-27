# Sprint 13.5: Energy State & Swipe Preferences Consolidation

> **Status:** Completed
> **Prerequisite:** Sprint 13 (Timeline) completed
> **Focus:** Fix debug panel, energy tracking, and swipe preference persistence

## Summary

This sprint fixed three issues with the debug panel where it was showing incorrect/static data:

1. **Energy data source was wrong** - Reading from non-existent `energy_logs` table
2. **Energy algorithms were duplicated/different** - Debug panel had its own logic
3. **Swipe preferences flow needed verification** - Added debug logs to trace the flow

## Changes Made

### 1. Fixed debug-state.ts Energy Reading

**File:** `packages/frontend/src/routes/api/debug-state.ts`

**Problem:** The API was querying a non-existent `energy_logs` table:
```typescript
// OLD - BROKEN
energyResult = await query<Record<string, unknown>>(
  `SELECT energy_level, week_number FROM energy_logs...`
);
```

**Solution:** Now reads from `profiles.followup_data.energyHistory`:
```typescript
// NEW - FIXED
if (profile.followup_data) {
  const followupData = typeof profile.followup_data === 'string'
    ? JSON.parse(profile.followup_data)
    : profile.followup_data;

  if (Array.isArray(followupData?.energyHistory)) {
    energyEntries = followupData.energyHistory.slice(-8);
    energyHistory = energyEntries.map((e) => e.level);
  }
}
```

### 2. Aligned Energy Algorithms

**Problem:** Debug panel had its own inline energy detection logic that didn't match the algorithms in `mcp-server/src/algorithms/`.

**Solution:** Copied the pure logic from the mcp-server algorithms:

- `detectEnergyDebt()` - Matches `energy-debt.ts:80-121`
  - ≥3 consecutive weeks with energy < 40% triggers debt
  - Severity: 3 weeks = low, 4 weeks = medium, 5+ weeks = high

- `detectComebackWindow()` - Matches `comeback-detection.ts:100-143`
  - Requires: ≥3 data points, ≥2 low weeks, current > 80%, previous < 50%
  - Confidence = min(1, recoveryDelta / 50)

The algorithms are now identical between debug-state.ts and tips-orchestrator.ts.

### 3. Added Swipe Preference Debug Logs

Added `console.debug` logs to trace the swipe preference callback chain:

| Location | Log Message | Purpose |
|----------|-------------|---------|
| `SwipeSession.tsx:214` | `[SwipeSession] Preferences updated:` | After each swipe |
| `SwipeTab.tsx:262` | `[SwipeTab] Calling onPreferencesChange:` | Before callback |
| `plan.tsx:395` | `[plan.tsx] Saving swipe preferences:` | On entry |
| `plan.tsx:422` | `[plan.tsx] Swipe preferences saved to DB:` | After save |

These logs can be viewed in browser DevTools Console to verify the flow.

## Files Modified

| File | Change |
|------|--------|
| `packages/frontend/src/routes/api/debug-state.ts` | Complete rewrite of energy reading and algorithm logic |
| `packages/frontend/src/components/swipe/SwipeSession.tsx` | Added debug log |
| `packages/frontend/src/components/tabs/SwipeTab.tsx` | Added debug log |
| `packages/frontend/src/routes/plan.tsx` | Added 2 debug logs |

## Testing Verification

### Test 1: Energy in Debug Panel
1. Go to `/suivi`
2. Click on an emoji in energy history (e.g., 😔 = 40%)
3. Wait 1-2 seconds for debounce
4. Open Debug menu (top-right)
5. **Verify:** Energy bar shows the value you just set

### Test 2: Energy Debt Detection
1. Via simulation or debug, set 3+ consecutive weeks with energy < 40%
2. Open Debug menu
3. **Verify:** State = "Energy Debt", severity displayed

### Test 3: Comeback Detection
1. After 2+ low weeks (< 40%), set current energy to 85%
2. Ensure previous week was < 50%
3. Open Debug menu
4. **Verify:** State = "Comeback Active", confidence displayed

### Test 4: Swipe Preferences
1. Go to `/plan?tab=swipe`
2. Click "Roll the Dice"
3. Swipe 3+ cards (right = accept)
4. Click "Validate my plan"
5. Open browser DevTools Console
6. **Verify:** See the 4 log messages in order:
   - `[SwipeSession] Preferences updated: {...}` (per swipe)
   - `[SwipeTab] Calling onPreferencesChange: {...}`
   - `[plan.tsx] Saving swipe preferences: {...}`
   - `[plan.tsx] Swipe preferences saved to DB: {...}`
7. Open Debug menu
8. **Verify:** AI Profile bars reflect the updated preferences

## Algorithm Reference

### Energy Debt Rules
- **Threshold:** < 40% is considered "low energy"
- **Detection:** ≥3 consecutive low weeks
- **Severity levels:**
  - `low` (mild): 3 weeks
  - `medium` (moderate): 4 weeks
  - `high` (severe): 5+ weeks

### Comeback Rules
- **Requirements:**
  - ≥3 weeks of history
  - ≥2 low weeks (< 40%)
  - Current energy > 80%
  - Previous week < 50%
- **Confidence:** Based on recovery delta (50+ points = 100%)

### Swipe Learning Rate
- Base learning rate: 0.15 (15% adjustment per swipe)
- Direction multipliers:
  - Right: +1.0
  - Left: -1.0
  - Up (Super like): +1.5
  - Down (Meh): -0.3

## Notes

- Energy Debt and Comeback are mutually exclusive states
- Energy is stored weekly, not daily (by design)
- The debug logs use `console.debug` so they don't pollute production logs
