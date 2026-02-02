# Requirements: Stride v4.0 Goals Tab Fix

**Defined:** 2026-02-02
**Core Value:** Unified and consistent goal progress display that builds user trust
**Reference:** [docs/bugs-dev/goals-fix.md](../docs/bugs-dev/goals-fix.md)

## v4.0 Requirements

Requirements for Goals Tab Fix milestone. Derived from comprehensive analysis in goals-fix.md.

### Data Architecture

- [ ] **ARCH-01**: `useGoalData` hook centralizes all goal data fetching and computation
- [ ] **ARCH-02**: `EarningEvent` type with strict date attribution (date, amount, source, weekNumber)
- [ ] **ARCH-03**: GoalsTab reduced by 200+ lines through hook extraction
- [ ] **ARCH-04**: WeeklyProgressCards and EarningsChart become pure display components

### Calculation Unification

- [ ] **CALC-01**: Weekly Need uses capacity-aware calculation everywhere (not linear)
- [ ] **CALC-02**: Status calculation uses configurable thresholds (GOAL_STATUS_THRESHOLDS)
- [ ] **CALC-03**: Both panel and cards show identical status (ahead/on-track/behind/critical)

### Earnings Aggregation

- [ ] **EARN-01**: Chart displays monthly savings at correct weeks (based on income day)
- [ ] **EARN-02**: Chart displays completed trades at their completion date
- [ ] **EARN-03**: Missions attributed to correct week (using completedAt with updatedAt fallback)

### UX Polish

- [ ] **UX-01**: Avatar not cut off (inside card approach for mobile responsiveness)
- [ ] **UX-02**: Labels clarified with tooltips ("This Week's Target" vs generic "Weekly Need")
- [ ] **UX-03**: Graph legend explains all lines (target, capacity-pace, projection, actual)
- [ ] **UX-04**: Consistent color coding for status across all components

## Future Requirements

Deferred to later milestones.

### v4.1 (Deferred from v3.0)

- **PREF-01**: Job search prefetches in background after city/location captured
- **PREF-02**: Prefetch does not block onboarding flow
- **PREF-03**: User sees "X opportunities near you" message during onboarding
- **COMM-01**: Job cards show estimated commute time
- **COMM-02**: User can adjust search radius via slider
- **COMM-03**: Distance Matrix API batches requests efficiently

### What-If Scenarios (v4.2+)

- **WHAT-01**: User can simulate "No exams" scenario and see updated projections
- **WHAT-02**: User can simulate extra hours/week and see impact
- **WHAT-03**: Simulations update chart and cards instantly

## Out of Scope

Explicitly excluded for this milestone.

| Feature | Reason |
|---------|--------|
| Database schema changes | No migration needed — calculations done at runtime |
| New API endpoints | Using existing retroplan/budget/goals APIs |
| Mobile app changes | Web-first, this is frontend-only |
| Backend algorithm changes | retroplanning.ts unchanged, just better data consumption |
| Cross-tab state sharing | Each tab remains isolated by design |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 20 | Pending |
| ARCH-02 | Phase 20 | Pending |
| ARCH-03 | Phase 21 | Pending |
| ARCH-04 | Phase 21 | Pending |
| EARN-01 | Phase 21 | Pending |
| EARN-02 | Phase 21 | Pending |
| EARN-03 | Phase 21 | Pending |
| CALC-01 | Phase 22 | Pending |
| CALC-02 | Phase 22 | Pending |
| CALC-03 | Phase 22 | Pending |
| UX-01 | Phase 23 | Pending |
| UX-02 | Phase 23 | Pending |
| UX-03 | Phase 23 | Pending |
| UX-04 | Phase 23 | Pending |

**Coverage:**
- v4.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Traceability updated: 2026-02-02 after roadmap creation*
