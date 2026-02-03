# Health Check Sprint - Technical Debt & Feature Connectivity

## Executive Summary

**Date**: 2026-02-03
**Status**: In Progress (P0 Complete)
**Priority**: High - Core features are disconnected

This sprint addresses technical debt discovered during a health audit of the "mental charge" (energy management) features. Several features are implemented but not properly connected end-to-end.

---

## Progress Summary

| Objective | Priority | Status | Commit |
|-----------|----------|--------|--------|
| Connect Swipe Preferences to Job Scoring | P0 | ✅ COMPLETE | `26ace87` |
| Unify Algorithm Implementations | P1 | 🔲 TODO | - |
| Improve Debug Panel Clarity | P2 | 🔲 TODO | - |
| Clean Up Data Sources | P3 | 🔲 TODO | - |

---

## Current State Audit

### Feature Connectivity Matrix

| Feature | Backend Algorithm | Frontend Display | API Route | **End-to-End** |
|---------|-------------------|------------------|-----------|----------------|
| Comeback Detection | `mcp-server/algorithms/comeback-detection.ts` | `ComebackAlert.tsx` (DUPLICATE) | None | ⚠️ Duplicated |
| Energy Debt | `mcp-server/algorithms/energy-debt.ts` | `EnergyHistory.tsx` (DUPLICATE) | None | ⚠️ Duplicated |
| Swipe Preferences | `jobScoring.ts` ✅ | `SwipeSession.tsx` + DB save | `swipe-trace.ts` | ✅ **FIXED** |
| Debug Panel | `api/debug-state.ts` | `DebugPanel.tsx` | Connected | ✅ OK |

### Critical Finding: Swipe Preferences ~~Are Disconnected~~ FIXED

```
BEFORE (broken):
User swipes jobs → Preferences learned → Saved to profile.swipePreferences
                                              ↓
                              NEVER READ BY JOB RECOMMENDATIONS
                                              ↓
                              jobScoring.ts used HARDCODED weights

AFTER (fixed - commit 26ace87):
User swipes jobs → Preferences learned → Saved to profile.swipePreferences
                                              ↓
                              plan.tsx passes swipePreferences to ProspectionTab
                                              ↓
                              jobScoring.ts reads via mapSwipeToWeights()
                                              ↓
                              Dynamic weights applied to job scoring
                                              ↓
                              Jobs sorted by personalized score
```

---

## Technical Debt Inventory

### 1. Algorithm Duplication (DRY Violation) - 🔲 TODO (P1)

**Problem**: Same algorithms implemented twice:
- Backend: `packages/mcp-server/src/algorithms/` (with Opik tracing)
- Frontend: Inline in components (no tracing)

**Files with duplicate logic**:
```
Backend                                    Frontend (Duplicate)
─────────────────────────────────────────────────────────────────
comeback-detection.ts (150 lines)    →    ComebackAlert.tsx:42-62
energy-debt.ts (120 lines)           →    EnergyHistory.tsx:35-55
                                     →    debug-state.ts (copies both)
```

**Risk**: Bug fixes must be applied in 3 places. Frontend versions lack Opik tracing.

### 2. Naming Inconsistencies - 🔲 TODO (P2)

| Concept | Backend | Frontend | Debug Panel |
|---------|---------|----------|-------------|
| Debt severity | `low/medium/high` | `mild/moderate/severe` | Mixed |
| Preference keys | `snake_case` | `camelCase` | Converted |

### 3. Data Source Confusion - 🔲 TODO (P3)

Energy history exists in two places:
- `energy_logs` table (deprecated?)
- `profiles.followup_data.energyHistory` (current)

Sprint 13.5 comment in `debug-state.ts` documents this migration but old references may remain.

### 4. ~~Missing Swipe→Scoring Connection~~ - ✅ FIXED (P0)

~~Frontend calls algorithms directly instead of via API~~

**Fixed**: `jobScoring.ts` now reads `profile.swipePreferences` and applies dynamic weights.

---

## Sprint Objectives

### Objective 1: Connect Swipe Preferences to Job Scoring ✅ COMPLETE

**Priority**: P0 - Critical
**Effort**: Medium
**Status**: ✅ Complete (2026-02-03)
**Commit**: `26ace87`

Make learned preferences actually affect job recommendations.

**Tasks**:
- [x] Read `profile.swipePreferences` in `jobScoring.ts`
- [x] Map swipe weights to scoring factors:
  - `effortSensitivity` → effort weight (±0.10 adjustment)
  - `hourlyRatePriority` → rate weight (±0.10 adjustment)
  - `timeFlexibility` → included in interface (future use)
  - `incomeStability` → included in interface (future use)
- [x] Add fallback to defaults if no swipe data (`DEFAULT_SWIPE_PREFERENCES`)
- [x] Add Opik tracing for personalized scoring (`preferenceVersion` hash)

**Acceptance Criteria**:
- [x] Jobs tab shows different results after swiping
- [x] Debug panel shows preferences affecting scores (via `appliedWeights` in breakdown)
- [x] Opik traces include personalization factor (`preferenceVersion`)

**Files Modified**:
| File | Changes |
|------|---------|
| `packages/frontend/src/lib/jobScoring.ts` | +138 lines: `SwipePreferences` interface, `mapSwipeToWeights()`, `getPreferenceVersion()`, updated `scoreJob()` |
| `packages/frontend/src/lib/prospectionTypes.ts` | +7 lines: Added `swipePreferences` to `ProspectionTabProps` |
| `packages/frontend/src/components/tabs/ProspectionTab.tsx` | +2 lines: Pass `swipePreferences` to `UserProfile` |
| `packages/frontend/src/routes/plan.tsx` | +14 lines: Pass `swipePreferences` with snake→camelCase conversion |

---

### Objective 2: Unify Algorithm Implementations - 🔲 TODO

**Priority**: P1 - High
**Effort**: Medium
**Status**: Not started

Create shared API routes for algorithms, remove frontend duplicates.

**Tasks**:
- [ ] Create `/api/comeback-detection` route (calls mcp-server algorithm)
- [ ] Create `/api/energy-debt` route (calls mcp-server algorithm)
- [ ] Update `ComebackAlert.tsx` to use API instead of inline logic
- [ ] Update `EnergyHistory.tsx` to use API instead of inline logic
- [ ] Update `debug-state.ts` to use new API routes
- [ ] Ensure Opik tracing flows through all paths

**Acceptance Criteria**:
- [ ] Single source of truth for each algorithm
- [ ] All algorithm calls traced in Opik
- [ ] Frontend components are display-only (no business logic)

**Files to Create/Modify**:
| File | Action |
|------|--------|
| `packages/frontend/src/routes/api/comeback-detection.ts` | CREATE - New API route |
| `packages/frontend/src/routes/api/energy-debt.ts` | CREATE - New API route |
| `packages/frontend/src/components/suivi/ComebackAlert.tsx` | MODIFY - Remove inline algorithm |
| `packages/frontend/src/components/suivi/EnergyHistory.tsx` | MODIFY - Remove inline algorithm |
| `packages/frontend/src/routes/api/debug-state.ts` | MODIFY - Use new API routes |

---

### Objective 3: Improve Debug Panel Clarity - 🔲 TODO

**Priority**: P2 - Medium
**Effort**: Low
**Status**: Not started

Make the "System Internals" section more understandable.

**Tasks**:
- [ ] Add explanatory tooltips for each card
- [ ] Show connectivity status (is this data being used?)
- [ ] Add "How this affects you" explanations:
  - Comeback: "Your weekly target is adjusted to help you catch up"
  - Energy Debt: "Your goals are reduced by X% while recovering"
  - Swipe Preferences: "Jobs are ranked based on your preferences"
- [ ] Unify severity naming (pick one: low/medium/high)
- [ ] Add visual connection lines or badges showing data flow

**Acceptance Criteria**:
- [ ] Non-technical users understand what each section means
- [ ] Clear indication of what's active vs inactive
- [ ] Consistent terminology throughout

**Files to Modify**:
| File | Action |
|------|--------|
| `packages/frontend/src/components/debug/DebugPanel.tsx` | MODIFY - Add tooltips and explanations |

---

### Objective 4: Clean Up Data Sources - 🔲 TODO

**Priority**: P3 - Low
**Effort**: Low
**Status**: Not started

Ensure single source of truth for energy history.

**Tasks**:
- [ ] Audit all references to `energy_logs` table
- [ ] Confirm migration to `followup_data.energyHistory` is complete
- [ ] Remove or deprecate old data paths
- [ ] Document canonical data flow

**Acceptance Criteria**:
- [ ] Single source of truth for energy history
- [ ] No dead code referencing deprecated tables
- [ ] Clear documentation of data flow

---

## Implementation Log

### 2026-02-03: P0 Complete

**Commit**: `26ace87` - `feat(jobs): connect swipe preferences to job scoring (P0-Health)`

**What was implemented**:

1. **SwipePreferences Interface** (`jobScoring.ts:57-70`):
```typescript
export interface SwipePreferences {
  effortSensitivity: number;    // 0-1, 0.5 = neutral
  hourlyRatePriority: number;   // 0-1, 0.5 = neutral
  timeFlexibility: number;      // 0-1, 0.5 = neutral
  incomeStability: number;      // 0-1, 0.5 = neutral
}

export const DEFAULT_SWIPE_PREFERENCES: SwipePreferences = {
  effortSensitivity: 0.5,
  hourlyRatePriority: 0.5,
  timeFlexibility: 0.5,
  incomeStability: 0.5,
};
```

2. **Dynamic Weight Calculation** (`jobScoring.ts:120-154`):
```typescript
export function mapSwipeToWeights(prefs?: SwipePreferences): ScoringWeights {
  if (!prefs) return { ...DEFAULT_WEIGHTS }; // Cold start fallback

  // Calculate preference influence (how far from neutral 0.5)
  const effortInfluence = prefs.effortSensitivity - 0.5;  // -0.5 to +0.5
  const rateInfluence = prefs.hourlyRatePriority - 0.5;   // -0.5 to +0.5

  // Max adjustment is ±0.10 per factor
  const effortAdjust = effortInfluence * 0.20;
  const rateAdjust = rateInfluence * 0.20;

  // Redistribute weights, normalize to sum = 1.0
  // ...
}
```

3. **Opik Trace Correlation** (`jobScoring.ts:160-168`):
```typescript
export function getPreferenceVersion(prefs?: SwipePreferences): string {
  if (!prefs) return 'default';
  const e = Math.round(prefs.effortSensitivity * 100);
  const r = Math.round(prefs.hourlyRatePriority * 100);
  const t = Math.round(prefs.timeFlexibility * 100);
  const s = Math.round(prefs.incomeStability * 100);
  return `v${e}-${r}-${t}-${s}`;  // e.g., "v50-50-50-50" for default
}
```

4. **Score Breakdown Enhancement** (`jobScoring.ts:26-48`):
```typescript
export interface JobScoreBreakdown {
  // ... existing fields
  appliedWeights?: {       // P0-Health: Show which weights were used
    distance: number;
    profile: number;
    effort: number;
    rate: number;
    goalFit: number;
  };
  preferenceVersion?: string;  // P0-Health: For Opik correlation
}
```

5. **Data Flow Connection** (`plan.tsx:683-714`):
```typescript
<ProspectionTab
  // ... existing props
  swipePreferences={
    activeProfile()?.swipePreferences
      ? {
          effortSensitivity: activeProfile()?.swipePreferences?.effort_sensitivity ?? 0.5,
          hourlyRatePriority: activeProfile()?.swipePreferences?.hourly_rate_priority ?? 0.5,
          timeFlexibility: activeProfile()?.swipePreferences?.time_flexibility ?? 0.5,
          incomeStability: activeProfile()?.swipePreferences?.income_stability ?? 0.5,
        }
      : undefined
  }
/>
```

---

## Success Metrics

| Metric | Before | Current | Target |
|--------|--------|---------|--------|
| Swipe → Job correlation | 0% | **100%** ✅ | 100% |
| Algorithm duplications | 3 | 3 | 0 |
| Opik trace coverage | ~60% | ~70% | 100% |
| Debug panel clarity score | Low | Low | High |

---

## Files Summary

### Completed (P0)
- ✅ `packages/frontend/src/lib/jobScoring.ts` - Swipe preference integration
- ✅ `packages/frontend/src/lib/prospectionTypes.ts` - Props interface
- ✅ `packages/frontend/src/components/tabs/ProspectionTab.tsx` - Pass to UserProfile
- ✅ `packages/frontend/src/routes/plan.tsx` - Wire up swipePreferences prop

### Remaining (P1-P3)
- 🔲 `packages/frontend/src/routes/api/comeback-detection.ts` - NEW (P1)
- 🔲 `packages/frontend/src/routes/api/energy-debt.ts` - NEW (P1)
- 🔲 `packages/frontend/src/components/suivi/ComebackAlert.tsx` - Remove duplicate (P1)
- 🔲 `packages/frontend/src/components/suivi/EnergyHistory.tsx` - Remove duplicate (P1)
- 🔲 `packages/frontend/src/routes/api/debug-state.ts` - Use new APIs (P1)
- 🔲 `packages/frontend/src/components/debug/DebugPanel.tsx` - UX improvements (P2)

---

## Senior Review Feedback (2026-02-03)

### Verified Findings
- ✅ Swipe disconnect confirmed: `jobScoring.ts` uses hardcoded `WEIGHTS`, ignores `profile.swipePreferences`
- ✅ Analysis is 100% accurate, P0 priority is correct

### Architecture Recommendations (All Applied in P0)
1. ✅ **Keep client-side scoring** - Don't move scoring to API, kills instant sort UX performance
2. ✅ **Update UserProfile interface** - Added `swipePreferences` field
3. ✅ **Update ProspectionTab** - Populate swipePreferences when calling `scoreJobsForProfile()`
4. ✅ **Cold start handling** - `DEFAULT_SWIPE_PREFERENCES` for users with 0 swipes
5. ✅ **Trace linking** - `preferenceVersion` hash for Opik cause→effect proof

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| Breaking existing functionality | Medium | High | Test thoroughly | ✅ P0 tested |
| Performance regression (more API calls) | Low | Medium | Cache algorithm results | N/A for P0 |
| User confusion from changed behavior | Low | Low | Add changelog notification | 🔲 TODO |
| Cold start edge cases | Medium | Low | Robust defaults, graceful fallback | ✅ Implemented |

---

## Definition of Done

- [x] All tests pass (pnpm typecheck, pre-commit hooks)
- [ ] No algorithm duplication (P1 pending)
- [x] Swipe preferences affect job scoring (verifiable in Opik)
- [ ] Debug panel shows accurate, understandable information (P2 pending)
- [x] Documentation updated
- [x] No new ESLint warnings

---

## Next Steps (Planning)

### Recommended Order
1. **P1: Unify Algorithms** - Medium effort, high impact on maintainability
2. **P2: Debug Panel UX** - Low effort, improves user understanding
3. **P3: Data Cleanup** - Low effort, reduces confusion

### Estimation
| Objective | Estimated Effort |
|-----------|------------------|
| P1: Unify Algorithms | ~2-3 hours |
| P2: Debug Panel UX | ~1 hour |
| P3: Data Cleanup | ~30 min |

---

## Appendix: Current Algorithm Locations

### Comeback Detection
```
packages/mcp-server/src/algorithms/comeback-detection.ts
├── detectComebackWindow(history, currentEnergy)
├── generateCatchUpPlan(deficit, weeksRemaining)
├── COMEBACK_THRESHOLDS
└── Tests: comeback-detection.test.ts

packages/frontend/src/components/suivi/ComebackAlert.tsx
├── Lines 42-62: DUPLICATE detection logic
└── No tests
```

### Energy Debt
```
packages/mcp-server/src/algorithms/energy-debt.ts
├── detectEnergyDebt(history)
├── adjustTargetForDebt(weeklyTarget, severity)
├── DEBT_THRESHOLDS
└── Tests: energy-debt.test.ts

packages/frontend/src/components/suivi/EnergyHistory.tsx
├── Lines 35-55: DUPLICATE detection logic
└── No tests
```

### Swipe Preference Learning ✅ CONNECTED
```
packages/frontend/src/components/swipe/SwipeSession.tsx
├── updatePreferences(direction, scenario)
├── LEARNING_RATE = 0.15
└── Saves to profile.swipePreferences

packages/frontend/src/lib/jobScoring.ts ✅ NOW READS PREFERENCES
├── SwipePreferences interface
├── mapSwipeToWeights() - dynamic weight calculation
├── getPreferenceVersion() - Opik trace correlation
├── scoreJob() - uses dynamic weights
└── DEFAULT_SWIPE_PREFERENCES - cold start fallback
```
