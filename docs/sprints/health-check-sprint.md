# Health Check Sprint - Technical Debt & Feature Connectivity

## Executive Summary

**Date**: 2026-02-03
**Status**: Planning
**Priority**: High - Core features are disconnected

This sprint addresses technical debt discovered during a health audit of the "mental charge" (energy management) features. Several features are implemented but not properly connected end-to-end.

---

## Current State Audit

### Feature Connectivity Matrix

| Feature | Backend Algorithm | Frontend Display | API Route | **End-to-End** |
|---------|-------------------|------------------|-----------|----------------|
| Comeback Detection | `mcp-server/algorithms/comeback-detection.ts` | `ComebackAlert.tsx` (DUPLICATE) | None | ⚠️ Duplicated |
| Energy Debt | `mcp-server/algorithms/energy-debt.ts` | `EnergyHistory.tsx` (DUPLICATE) | None | ⚠️ Duplicated |
| Swipe Preferences | Not used anywhere | `SwipeSession.tsx` + DB save | `swipe-trace.ts` | **❌ BROKEN** |
| Debug Panel | `api/debug-state.ts` | `DebugPanel.tsx` | Connected | ✅ OK |

### Critical Finding: Swipe Preferences Are Disconnected

```
User swipes jobs → Preferences learned → Saved to profile.swipePreferences
                                              ↓
                              NEVER READ BY JOB RECOMMENDATIONS
                                              ↓
                              skill-arbitrage.ts uses HARDCODED weights:
                              { rate: 0.30, demand: 0.25, effort: 0.25, rest: 0.20 }
```

**Impact**: Users expect their swipe behavior to personalize job recommendations. Currently it has zero effect.

---

## Technical Debt Inventory

### 1. Algorithm Duplication (DRY Violation)

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

### 2. Naming Inconsistencies

| Concept | Backend | Frontend | Debug Panel |
|---------|---------|----------|-------------|
| Debt severity | `low/medium/high` | `mild/moderate/severe` | Mixed |
| Preference keys | `snake_case` | `camelCase` | Converted |

### 3. Data Source Confusion

Energy history exists in two places:
- `energy_logs` table (deprecated?)
- `profiles.followup_data.energyHistory` (current)

Sprint 13.5 comment in `debug-state.ts` documents this migration but old references may remain.

### 4. Missing API Abstraction

Frontend calls algorithms directly instead of via API:
```typescript
// Current (bad)
const result = detectEnergyDebt(energyHistory); // in component

// Should be
const result = await fetch('/api/energy-debt').then(r => r.json());
```

---

## Sprint Objectives

### Objective 1: Connect Swipe Preferences to Job Scoring

**Priority**: P0 - Critical
**Effort**: Medium

Make learned preferences actually affect job recommendations.

**Tasks**:
1. Read `profile.swipePreferences` in `jobScoring.ts`
2. Map swipe weights to scoring factors:
   - `effortSensitivity` → effort weight
   - `hourlyRatePriority` → rate weight
   - `timeFlexibility` → schedule fit factor
   - `incomeStability` → job type preference
3. Add fallback to defaults if no swipe data
4. Add Opik tracing for personalized scoring

**Acceptance Criteria**:
- [ ] Jobs tab shows different results after swiping
- [ ] Debug panel shows preferences affecting scores
- [ ] Opik traces include personalization factor

### Objective 2: Unify Algorithm Implementations

**Priority**: P1 - High
**Effort**: Medium

Create shared API routes for algorithms, remove frontend duplicates.

**Tasks**:
1. Create `/api/comeback-detection` route (calls mcp-server algorithm)
2. Create `/api/energy-debt` route (calls mcp-server algorithm)
3. Update `ComebackAlert.tsx` to use API instead of inline logic
4. Update `EnergyHistory.tsx` to use API instead of inline logic
5. Ensure Opik tracing flows through all paths

**Acceptance Criteria**:
- [ ] Single source of truth for each algorithm
- [ ] All algorithm calls traced in Opik
- [ ] Frontend components are display-only (no business logic)

### Objective 3: Improve Debug Panel Clarity

**Priority**: P2 - Medium
**Effort**: Low

Make the "System Internals" section more understandable.

**Tasks**:
1. Add explanatory tooltips for each card
2. Show connectivity status (is this data being used?)
3. Add "How this affects you" explanations:
   - Comeback: "Your weekly target is adjusted to help you catch up"
   - Energy Debt: "Your goals are reduced by X% while recovering"
   - Swipe Preferences: "Jobs are ranked based on your preferences"
4. Unify severity naming (pick one: low/medium/high)
5. Add visual connection lines or badges showing data flow

**Acceptance Criteria**:
- [ ] Non-technical users understand what each section means
- [ ] Clear indication of what's active vs inactive
- [ ] Consistent terminology throughout

### Objective 4: Clean Up Data Sources

**Priority**: P3 - Low
**Effort**: Low

Ensure single source of truth for energy history.

**Tasks**:
1. Audit all references to `energy_logs` table
2. Confirm migration to `followup_data.energyHistory` is complete
3. Remove or deprecate old data paths
4. Document canonical data flow

---

## Implementation Plan

### Phase 1: Connect Swipe Preferences (P0)

```
jobScoring.ts
├── Add swipePreferences to UserProfile interface
├── Create mapSwipeToWeights() with cold start defaults
├── Integrate dynamic weights in scoreJob()
├── Add personalization factor to score breakdown
└── Add preferenceVersion to Opik traces

ProspectionTab.tsx
├── Read profile.swipePreferences
├── Pass to scoreJobsForProfile() call
└── Link preferenceVersion in trace context
```

**Key Code Changes**:

1. **UserProfile interface** (jobScoring.ts):
```typescript
interface UserProfile {
  // ... existing fields
  swipePreferences?: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
}
```

2. **Weight mapping with cold start** (jobScoring.ts):
```typescript
function mapSwipeToWeights(prefs?: SwipePreferences): Weights {
  if (!prefs) return DEFAULT_WEIGHTS; // Cold start fallback

  // Normalize swipe preferences to scoring weights
  return {
    distance: 0.25, // Fixed (geography matters)
    profile: 0.15,  // Reduced to make room for preferences
    effort: 0.20 * (1 + prefs.effortSensitivity - 0.5),
    rate: 0.20 * (1 + prefs.hourlyRatePriority - 0.5),
    goalFit: 0.20,  // Fixed (goal alignment)
  };
}
```

3. **Trace linking** (ProspectionTab.tsx):
```typescript
// Generate preferenceVersion hash for Opik correlation
const preferenceVersion = hashPreferences(profile.swipePreferences);
// Pass to scoring and log in swipe-trace for cause→effect proof
```

**Architecture Decision**: Keep scoring client-side for instant UI performance. Only trace metadata goes to API.

### Phase 2: API Unification (P1)

```
routes/api/
├── comeback-detection.ts (NEW)
│   └── Calls mcp-server algorithm with profile data
├── energy-debt.ts (NEW)
│   └── Calls mcp-server algorithm with profile data
└── debug-state.ts (UPDATE)
    └── Calls above APIs instead of duplicating logic
```

### Phase 3: UX Improvements (P2)

```
components/debug/DebugPanel.tsx
├── Add InfoTooltip for each card header
├── Add "Affecting: Job recommendations" badges
├── Unify severity terminology
└── Add "Learn more" links to docs
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Swipe → Job correlation | 0% | 100% |
| Algorithm duplications | 3 | 0 |
| Opik trace coverage | ~60% | 100% |
| Debug panel clarity score | Low | High |

---

## Files to Modify

### High Impact
- `packages/frontend/src/lib/jobScoring.ts` - Add swipe preference integration
- `packages/frontend/src/routes/api/comeback-detection.ts` - NEW
- `packages/frontend/src/routes/api/energy-debt.ts` - NEW

### Medium Impact
- `packages/frontend/src/components/suivi/ComebackAlert.tsx` - Remove duplicate algorithm
- `packages/frontend/src/components/suivi/EnergyHistory.tsx` - Remove duplicate algorithm
- `packages/frontend/src/routes/api/debug-state.ts` - Use new APIs

### Low Impact
- `packages/frontend/src/components/debug/DebugPanel.tsx` - UX improvements

---

## Senior Review Feedback (2026-02-03)

### Verified Findings
- ✅ Swipe disconnect confirmed: `jobScoring.ts` uses hardcoded `WEIGHTS`, ignores `profile.swipePreferences`
- ✅ Analysis is 100% accurate, P0 priority is correct

### Architecture Recommendations
1. **Keep client-side scoring** - Don't move scoring to API, kills instant sort UX performance
2. **Update UserProfile interface** - Must add `swipePreferences` field (critical omission in original plan)
3. **Update ProspectionTab** - Must populate swipePreferences when calling `scoreJobsForProfile()`
4. **Cold start handling** - Robust defaults for users with 0 swipes
5. **Trace linking** - Return `preferenceVersion` ID from swipe-trace, log same ID when scoring for Opik cause→effect proof

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing functionality | Medium | High | Add feature flags, test thoroughly |
| Performance regression (more API calls) | Low | Medium | Cache algorithm results |
| User confusion from changed behavior | Low | Low | Add changelog notification |
| Cold start edge cases | Medium | Low | Robust defaults, graceful fallback |

---

## Definition of Done

- [ ] All tests pass
- [ ] No algorithm duplication
- [ ] Swipe preferences affect job scoring (verifiable in Opik)
- [ ] Debug panel shows accurate, understandable information
- [ ] Documentation updated
- [ ] No new ESLint warnings

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

### Swipe Preference Learning
```
packages/frontend/src/components/swipe/SwipeSession.tsx
├── updatePreferences(direction, scenario)
├── LEARNING_RATE = 0.15
└── Saves to profile.swipePreferences

packages/frontend/src/lib/jobScoring.ts
├── scoreJob() - DOES NOT READ swipePreferences
├── Uses hardcoded WEIGHTS constant
└── BUG: Personalization not implemented
```
