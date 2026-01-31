# Roadmap: Stride Onboarding

## Overview

v2.1 Bugfixes — Fix critical bugs discovered during demo testing. Phases 11-15 continue from v2.0 milestone.

## Phases

**Phase Numbering:**
- Integer phases (11, 12, 13): Planned bugfix work
- Decimal phases (11.1, 11.2): Urgent insertions (marked with INSERTED)

### Milestone 3: v2.1 Bugfixes

- [x] **Phase 11: Chart Rendering** - Fix quick links to render actual charts
- [x] **Phase 12: Form Fixes** - Fix subscription object display and currency hardcoding
- [x] **Phase 13: State Persistence** - Fix onboarding state reset on navigation
- [ ] **Phase 14: UI Fixes** - Fix button placement and dark mode visibility
- [ ] **Phase 15: GridMultiSelect Fixes** - Fix column widths and stability

## Phase Details

### Phase 11: Chart Rendering
**Goal**: Quick links render actual chart visualizations instead of text-only responses
**Depends on**: Nothing (first phase)
**Requirements**: CHRT-01, CHRT-02, CHRT-03
**Success Criteria** (what must be TRUE):
  1. Clicking "Budget" quick link shows Monthly Budget Breakdown chart
  2. Clicking "Goals" quick link shows Goal Projection chart
  3. Clicking "Energy" quick link shows Energy Timeline chart (or "no data" message)
  4. 4th quick link "Savings" shows Savings Progress chart
  5. handleUIAction returns UIResource that MCPUIRenderer can render
**Plans**: 1 plan
Plans:
- [ ] 11-01-PLAN.md — Add 4th quick link and fix chartType-to-action mapping

### Phase 12: Form Fixes
**Goal**: Fix form serialization and currency issues
**Depends on**: Nothing
**Requirements**: FORM-01, FORM-02
**Success Criteria** (what must be TRUE):
  1. Adding a subscription shows the subscription name and cost (not `[object Object]`)
  2. "Items to sell" step uses profile currency (€ if profile is €, $ if $)
  3. Currency symbol is consistent throughout entire onboarding flow
**Plans**: 1 plan
Plans:
- [x] 12-01-PLAN.md — Fix subscription, inventory, and trade message formatting

### Phase 13: State Persistence
**Goal**: Onboarding completion state survives navigation
**Depends on**: Nothing
**Requirements**: STAT-01, STAT-02
**Success Criteria** (what must be TRUE):
  1. After completing onboarding, navigating to /plan and back does NOT restart onboarding
  2. Navigation menu items remain visible after returning from other pages
  3. onboardingStateStore reads localStorage value on app initialization
  4. Hard refresh after onboarding shows completed state (not restart)
**Plans**: 1 plan
Plans:
- [x] 13-01-PLAN.md — Fix SSR hydration bug in onboardingStateStore

### Phase 14: UI Fixes
**Goal**: Fix button placement and dark mode visibility
**Depends on**: Nothing
**Requirements**: PLAC-01, PLAC-02, DARK-01, DARK-02
**Success Criteria** (what must be TRUE):
  1. "Start my plan" button appears in chat message area after completion
  2. "Start my plan" button is NOT in the Bruno bar at bottom
  3. Bruno avatar "B" circle clearly visible in dark mode
  4. Progress indicator step circles and pulse visible in dark mode
**Plans**: TBD

### Phase 15: GridMultiSelect Fixes
**Goal**: Fix column widths and option stability
**Depends on**: Nothing
**Requirements**: GRID-01, GRID-02, GRID-03
**Success Criteria** (what must be TRUE):
  1. Skills list always shows options (never empty when skills exist)
  2. Skill names display fully without truncation
  3. Certifications grid is wider (matches chat response width)
  4. Certification names display fully without truncation
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 11 → 12 → 13 → 14 → 15

### Milestone 3: v2.1 Bugfixes

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Chart Rendering | 1/1 | Complete | 2026-01-31 |
| 12. Form Fixes | 1/1 | Complete | 2026-01-31 |
| 13. State Persistence | 1/1 | Complete | 2026-01-31 |
| 14. UI Fixes | 0/? | Not started | - |
| 15. GridMultiSelect Fixes | 0/? | Not started | - |
