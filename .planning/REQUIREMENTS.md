# Requirements: Stride v3.0 Early Engagement

**Defined:** 2026-02-01
**Core Value:** Show real job opportunities to users during onboarding to maximize engagement

## v3.0 Requirements

Requirements for Early Engagement milestone. Each maps to roadmap phases.

### Privacy & Consent

- [ ] **PRIV-01**: User sees consent screen before location access ("Allow" or "Enter city instead")
- [ ] **PRIV-02**: User can decline GPS and manually enter city
- [ ] **PRIV-03**: No raw latitude/longitude stored in DuckDB or Opik traces
- [ ] **PRIV-04**: Location data reduced to city name or radius-from-point (no precise GPS)

### Real Job Search

- [ ] **JOBS-01**: Prospection API returns real Google Places results (not mocks)
- [ ] **JOBS-02**: Job cards show business name, address, rating, and distance
- [ ] **JOBS-03**: User can filter jobs by category (hospitality, retail, tutoring, cleaning, etc.)
- [ ] **JOBS-04**: Jobs are matched to user's onboarding skills automatically
- [ ] **JOBS-05**: Each job displays star rating based on scoring algorithm (distance + profile + arbitrage)

### Background Prefetch

- [ ] **PREF-01**: Job search prefetches in background after city/location captured
- [ ] **PREF-02**: Prefetch does not block onboarding flow
- [ ] **PREF-03**: User sees "X opportunities near you" message during onboarding

### Commute & Distance

- [ ] **COMM-01**: Job cards show estimated commute time (walking/transit)
- [ ] **COMM-02**: User can adjust search radius via slider
- [ ] **COMM-03**: Distance Matrix API batches requests efficiently

### UI Enhancements

- [ ] **UI-01**: "Top Pick" badge appears on jobs with score ≥ 4.5/5
- [ ] **UI-02**: Radius slider allows 1-10km range adjustment
- [ ] **UI-03**: Commute time badge displays on each job card

## Future Requirements

Deferred to later milestones.

### Advanced Matching

- **ADV-01**: Same-day gig partnerships integration
- **ADV-02**: Work-study schedule filter
- **ADV-03**: Push notifications for new jobs in area

### Social Features

- **SOC-01**: "Friends work here" indicator (if social graph available)
- **SOC-02**: Share job listings

## Out of Scope

Explicitly excluded for this milestone.

| Feature | Reason |
|---------|--------|
| OAuth login for job sites | High complexity, not core to demo |
| Job application tracking | Requires external API integrations |
| Real-time job availability | Too complex for hackathon timeline |
| Photo caching beyond 30 days | Google Places photo URLs expire |
| Detailed employer profiles | Would need additional API calls |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRIV-01 | Phase 16 | Pending |
| PRIV-02 | Phase 16 | Pending |
| PRIV-03 | Phase 16 | Pending |
| PRIV-04 | Phase 16 | Pending |
| JOBS-01 | Phase 17 | Pending |
| JOBS-02 | Phase 17 | Pending |
| JOBS-03 | Phase 17 | Pending |
| JOBS-04 | Phase 17 | Pending |
| JOBS-05 | Phase 17 | Pending |
| PREF-01 | Phase 18 | Pending |
| PREF-02 | Phase 18 | Pending |
| PREF-03 | Phase 18 | Pending |
| COMM-01 | Phase 19 | Pending |
| COMM-02 | Phase 19 | Pending |
| COMM-03 | Phase 19 | Pending |
| UI-01 | Phase 19 | Pending |
| UI-02 | Phase 19 | Pending |
| UI-03 | Phase 19 | Pending |

**Coverage:**
- v3.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-01*
*Last updated: 2026-02-01 after milestone initialization*
