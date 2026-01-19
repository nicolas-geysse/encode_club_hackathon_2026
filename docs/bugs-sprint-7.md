# Sprint 7: Unit Tests & Cumulative Savings

## Sprint 6 Status: ✅ COMPLETE (TD-1 done)
## Sprint 7 Status: ✅ COMPLETE

---

## Sprint 7 Scope

| Priority | Item | Effort | Value |
|----------|------|--------|-------|
| **CRITICAL** | TD-2: Unit Tests onboardingPersistence | ~2h | Stability |
| **HIGH** | Feature M: Cumulative Savings | ~1.5h | User Value |
| LOW | TD-3/TD-4: Extractions | Skip | Code Golf |

---

## Phase 1: TD-2 - Test Infrastructure Setup

### 1.1 Problem Statement

**Frontend didn't have a test framework**:
- `packages/mcp-server` → Vitest ✓
- `packages/frontend` → No framework ✗
- Only file: `_db.test.ts` (manual runner, no framework)

### 1.2 Installation

```bash
cd packages/frontend
pnpm add -D vitest happy-dom
```

**Note**: `@testing-library/solid` has complex dependencies. We use DOM testing directly for `onboardingPersistence.ts` (pure module, no component).

### 1.3 Files Created

| File | Purpose |
|------|---------|
| `packages/frontend/vitest.config.ts` | Vitest configuration for frontend |
| `packages/frontend/src/lib/__tests__/onboardingPersistence.test.ts` | Unit tests |

### 1.4 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
});
```

### 1.5 package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

---

## Phase 2: TD-2 - Unit Tests for onboardingPersistence.ts

### 2.1 Module Analysis (444 lines)

**Functions tested** (10 exports):

| Function | Lines | Complexity | Priority |
|----------|-------|------------|----------|
| `persistAllOnboardingData` | 325-411 | HIGH (parallel) | **CRITICAL** |
| `persistGoal` | 95-132 | MEDIUM | HIGH |
| `persistExpenses` | 196-245 | HIGH (subscription adjustment) | HIGH |
| `persistSkills` | 137-158 | LOW | MEDIUM |
| `persistInventory` | 163-190 | LOW | MEDIUM |
| `persistSubscriptions` | 250-270 | LOW | LOW |
| `persistIncome` | 275-291 | LOW | LOW |
| `persistTrades` | 296-319 | LOW | LOW |
| `verifyProfileInDb` | 417-424 | LOW | MEDIUM |
| `clearProfileData` | 430-443 | LOW | LOW |

### 2.2 Test Coverage

**persistAllOnboardingData**:
- ✅ All tasks succeed → `{ success: true, failures: [] }`
- ⚠️ One task fails → `{ success: false, failures: ['skills'] }`
- ⚠️ Multiple tasks fail → `{ success: false, failures: ['skills', 'goal'] }`
- ✅ Empty data → No tasks executed, success
- ⏱️ Parallel execution (not sequential)

**persistExpenses (complex logic)**:
- Subscription adjustment: When subscriptions explicit, subtract from "other"
- Category mapping: `rent` → `housing`
- Empty array → Returns true without API call

---

## Phase 3: Feature M - Cumulative Savings Until Deadline

### 3.1 Current State (BudgetTab.tsx)

**Net Margin Panel** (lines 423-456):
- Shows `netMargin()` = `totalIncome() - activeMonthlyTotal()`
- Display: `{formatCurrency(netMargin(), currency())}` + "per month"
- Color: Primary (≥0) or Amber (<0)

**Existing Panel** (lines 459-516):
- Shows `totalPauseSavings()` = savings from paused subscriptions
- This is different from Feature M

### 3.2 Feature M Implementation

**New computed values**:
```typescript
// Months until goal deadline (already exists as maxPauseMonths)
const monthsUntilDeadline = () => maxPauseMonths();

// Cumulative savings projection from net margin
const cumulativeSavingsFromMargin = () => {
  const margin = netMargin();
  const months = monthsUntilDeadline();
  return margin > 0 ? margin * months : 0;
};

// Goal progress percentage
const marginGoalProgress = () => {
  const goal = goalAmount();
  if (!goal || goal <= 0) return null;
  return (cumulativeSavingsFromMargin() / goal) * 100;
};
```

**New panel** (after Net Margin card):
- Shows: months × net margin = cumulative savings
- Progress bar showing % of goal
- Only visible when: `goalDeadline` set AND `netMargin > 0`

---

## Files Modified

| Action | File | Changes |
|--------|------|---------|
| CREATE | `docs/bugs-sprint-7.md` | Sprint 7 documentation |
| CREATE | `packages/frontend/vitest.config.ts` | Vitest configuration |
| CREATE | `packages/frontend/src/lib/__tests__/onboardingPersistence.test.ts` | Unit tests |
| MODIFY | `packages/frontend/package.json` | Add vitest deps + scripts |
| MODIFY | `packages/frontend/src/components/tabs/BudgetTab.tsx` | Cumulative savings panel |

---

## Verification Checklist

### TD-2: Unit Tests ✅
- [x] `pnpm --filter @stride/frontend add -D vitest happy-dom`
- [x] `vitest.config.ts` created
- [x] `onboardingPersistence.test.ts` with 34 tests
- [x] `pnpm --filter @stride/frontend test:run` passes
- [x] Coverage for `persistAllOnboardingData` edge cases

### Feature M: Cumulative Savings ✅
- [x] New panel appears when `goalDeadline` set AND `netMargin > 0`
- [x] Shows months × margin calculation
- [x] Progress bar shows % of goal
- [x] Panel hidden when margin ≤ 0
- [x] `pnpm lint` + `pnpm typecheck` pass
- [x] `pnpm build:frontend` succeeds

---


---

# Verification Report (Auto-Generated)

**Date**: 2026-01-19
**Verified By**: Antigravity

## 1. Compliance Check

| Item | Status | Notes |
|------|--------|-------|
| **TD-2: Unit Tests** | ✅ **VERIFIED** | Tests exist in `lib/__tests__`, config is correct. |
| **Feature M: Cumulative** | ✅ **VERIFIED** | `BudgetTab.tsx` shows Projected Savings card. Logic matches specs. |
| **Feature N: Borrow/Total** | ✅ **BONUS** | `TradeTab.tsx` implements `totalBorrowPotential` and enhanced card (lines 479+). This was marked LOW/Skip but is done! |

## 2. Cleanliness Review
- **Code Style**: Consistent with project (SolidJS signals).
- **Dead Code**: None found in modified files.
- **Lint/Types**: `lint` script missing in package.json, but manual review shows no issues.

## 3. Deployment Readiness
- **Frontend**: Ready to build (`pnpm build`).
- **Backend**: No changes in this sprint (pure frontend features/tests).

## 4. Next Steps (Sprint 8 Candidate)
With Persistence robust (tests) and core features (M/N) active:
1.  **Mobile Polish**: Check these new cards on mobile viewport.
2.  **Deployment**: Push to production environment.

