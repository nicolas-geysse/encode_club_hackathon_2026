# Requirements: v2.1 Bugfixes

**Defined:** 2026-01-31
**Core Value:** Fix critical bugs discovered during demo testing

## v1 Requirements

Bug fixes for this milestone. Each maps to roadmap phases.

### Chart Rendering

- [x] **CHRT-01**: Quick links (Budget, Goals, Energy) render actual chart visualizations, not text-only responses
- [x] **CHRT-02**: Add 4th quick link "Savings Progress" with savings projection chart
- [x] **CHRT-03**: handleUIAction 'show_chart' returns proper UIResource for MCPUIRenderer

### Form Data

- [x] **FORM-01**: Subscription form properly displays added items (not `[object Object]`)
- [x] **FORM-02**: "Items to sell" step uses profile currency (not hardcoded $)

### State Persistence

- [x] **STAT-01**: Onboarding completion state persists across navigation (no restart on return)
- [x] **STAT-02**: onboardingStateStore reads from localStorage on initial page load

### UI Placement

- [ ] **PLAC-01**: "Start my plan" button appears in chat area after completion
- [ ] **PLAC-02**: "Start my plan" button removed from Bruno bar at bottom

### Dark Mode

- [ ] **DARK-01**: Bruno avatar circle visible in dark mode (increase contrast/opacity)
- [ ] **DARK-02**: Progress indicator pulse animation visible in dark mode

### GridMultiSelect

- [ ] **GRID-01**: Skills list always shows options (no random empty state)
- [ ] **GRID-02**: Skills column width shows full titles without truncation
- [ ] **GRID-03**: Certifications GridMultiSelect 2x wider (match response area width)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New features | This is a bugfix milestone only |
| Refactoring | Fix bugs in place, don't restructure |
| i18n additions | Only fix existing localization bugs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| CHRT-01 | Phase 11 | Chart Rendering | Complete |
| CHRT-02 | Phase 11 | Chart Rendering | Complete |
| CHRT-03 | Phase 11 | Chart Rendering | Complete |
| FORM-01 | Phase 12 | Form Fixes | Complete |
| FORM-02 | Phase 12 | Form Fixes | Complete |
| STAT-01 | Phase 13 | State Persistence | Complete |
| STAT-02 | Phase 13 | State Persistence | Complete |
| PLAC-01 | Phase 14 | UI Fixes | Pending |
| PLAC-02 | Phase 14 | UI Fixes | Pending |
| DARK-01 | Phase 14 | UI Fixes | Pending |
| DARK-02 | Phase 14 | UI Fixes | Pending |
| GRID-01 | Phase 15 | GridMultiSelect Fixes | Pending |
| GRID-02 | Phase 15 | GridMultiSelect Fixes | Pending |
| GRID-03 | Phase 15 | GridMultiSelect Fixes | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after Phase 13 completion*
