# Roadmap: Stride Onboarding

## Milestones

- ✅ **v2.0 Stride Onboarding** — Phases 1-10 (shipped 2026-01-31)
- ✅ **v2.1 Bugfixes** — Phases 11-15 (shipped 2026-01-31)
- ✅ **v3.0 Early Engagement** — Phases 16-17 partial (shipped 2026-02-02)
- 🚧 **v4.0 Goals Tab Fix** — Phases 20-23 (in progress)

## Archived Milestones

<details>
<summary>✅ v2.1 Bugfixes (Phases 11-15) — SHIPPED 2026-01-31</summary>

- [x] Phase 11: Chart Rendering (1/1 plan) — completed 2026-01-31
- [x] Phase 12: Form Fixes (1/1 plan) — completed 2026-01-31
- [x] Phase 13: State Persistence (1/1 plan) — completed 2026-01-31
- [x] Phase 14: UI Fixes (1/1 plan) — completed 2026-01-31
- [x] Phase 15: GridMultiSelect Fixes (1/1 plan) — completed 2026-01-31

**Full details:** [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)

</details>

<details>
<summary>✅ v2.0 Stride Onboarding (Phases 1-10) — SHIPPED 2026-01-31</summary>

- [x] Phase 1-10: Complete onboarding UX (15 plans total)

**Full details:** See MILESTONES.md

</details>

<details>
<summary>✅ v3.0 Early Engagement (Phases 16-17) — SHIPPED 2026-02-02</summary>

- [x] Phase 16: Privacy & Consent (3/3 plans) — completed 2026-02-01
- [x] Phase 17: Real Job Search API (3/3 plans) — completed 2026-02-02

**Deferred to v4.1:**
- Phase 18: Background Prefetch (PREF-01, PREF-02, PREF-03)
- Phase 19: Commute & UI (COMM-01, COMM-02, COMM-03)

</details>

---

## 🚧 v4.0 Goals Tab Fix (In Progress)

**Milestone Goal:** Unify the Goals tab calculation systems and fix data consistency issues through architectural refactoring. Two parallel calculation systems (capacity-aware in WeeklyProgressCards, linear in EarningsChart) create user confusion. A centralized hook ensures consistency across all components.

**Reference:** [docs/bugs-dev/goals-fix.md](../docs/bugs-dev/goals-fix.md)

### Phase 20: Foundation

**Goal**: Establish typed data structures and hook skeleton that will centralize all goal data orchestration

**Depends on**: Nothing (milestone start)

**Requirements**: ARCH-01, ARCH-02

**Success Criteria** (what must be TRUE):
1. `EarningEvent` type exists with date, amount, source, weekNumber, and label fields
2. `useGoalData` hook exists and compiles (even if returning stubs)
3. Type definitions enable IDE autocompletion for all earnings sources (mission, savings, trade_sale, trade_borrow)
4. Hook signature accepts goal, profile, and optional simulation parameters

**Plans**: TBD

Plans:
- [ ] 20-01: TBD

**Key Files**:
- Create: `packages/frontend/src/lib/types/earnings.ts`
- Create: `packages/frontend/src/hooks/useGoalData.ts` (skeleton)

### Phase 21: Integration

**Goal**: Complete the useGoalData hook with real data fetching and rewire all components to use it as single source of truth

**Depends on**: Phase 20

**Requirements**: ARCH-03, ARCH-04, EARN-01, EARN-02, EARN-03

**Success Criteria** (what must be TRUE):
1. GoalsTab.tsx is reduced by 200+ lines (data orchestration moved to hook)
2. WeeklyProgressCards receives data via props instead of fetching internally
3. EarningsChart receives data via props instead of computing independently
4. Chart displays monthly savings at correct weeks (based on profile income day)
5. Chart displays completed trades at their actual completion date
6. Missions are attributed to correct week (using completedAt with updatedAt fallback)

**Plans**: TBD

Plans:
- [ ] 21-01: TBD

**Key Files**:
- Complete: `packages/frontend/src/hooks/useGoalData.ts`
- Create: `packages/frontend/src/lib/earningsAggregator.ts`
- Modify: `packages/frontend/src/components/tabs/GoalsTab.tsx`
- Modify: `packages/frontend/src/components/goals/WeeklyProgressCards.tsx`
- Modify: `packages/frontend/src/components/goals/EarningsChart.tsx`

### Phase 22: Calculation Unification

**Goal**: Replace all linear calculations with capacity-aware calculations and ensure consistent status display everywhere

**Depends on**: Phase 21

**Requirements**: CALC-01, CALC-02, CALC-03

**Success Criteria** (what must be TRUE):
1. "Weekly Need" value is identical in panel and cards (capacity-aware, not linear)
2. Status thresholds are configurable via GOAL_STATUS_THRESHOLDS constant
3. Panel and cards show identical status (ahead/on-track/behind/critical)
4. Changing from linear to capacity-aware does not break existing retroplan data

**Plans**: TBD

Plans:
- [ ] 22-01: TBD

**Key Files**:
- Create: `packages/frontend/src/lib/goalStatus.ts`
- Modify: `packages/frontend/src/hooks/useGoalData.ts` (add stats computation)
- Modify: `packages/frontend/src/components/goals/EarningsChart.tsx` (use capacity-aware pace)

### Phase 23: UX Polish

**Goal**: Fix visual issues and improve label clarity so users understand what each value means

**Depends on**: Phase 22

**Requirements**: UX-01, UX-02, UX-03, UX-04

**Success Criteria** (what must be TRUE):
1. Avatar is fully visible on both desktop and mobile (not cut off)
2. Labels have tooltips explaining their meaning ("This Week's Target" instead of generic "Weekly Need")
3. Chart has a legend explaining all lines (target, capacity-pace, projection, actual)
4. Status colors (ahead/on-track/behind/critical) are consistent across all components
5. User can understand where each number comes from without referring to documentation

**Plans**: TBD

Plans:
- [ ] 23-01: TBD

**Key Files**:
- Modify: `packages/frontend/src/components/goals/WeeklyProgressCards.tsx` (avatar fix, labels)
- Modify: `packages/frontend/src/components/goals/EarningsChart.tsx` (legend, tooltips)

---

## Progress

**Execution Order:**
Phase numbering continues from previous milestones: 1-10 (v2.0), 11-15 (v2.1), 16-17 (v3.0), 20-23 (v4.0)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v2.0 | 15/15 | Complete | 2026-01-31 |
| 11-15 | v2.1 | 5/5 | Complete | 2026-01-31 |
| 16. Privacy & Consent | v3.0 | 3/3 | Complete | 2026-02-01 |
| 17. Real Job Search API | v3.0 | 3/3 | Complete | 2026-02-02 |
| 20. Foundation | v4.0 | 0/TBD | Not started | - |
| 21. Integration | v4.0 | 0/TBD | Not started | - |
| 22. Calculation Unification | v4.0 | 0/TBD | Not started | - |
| 23. UX Polish | v4.0 | 0/TBD | Not started | - |
