# Roadmap: Stride Onboarding

## Milestones

- ✅ **v2.0 Stride Onboarding** — Phases 1-10 (shipped 2026-01-31)
- ✅ **v2.1 Bugfixes** — Phases 11-15 (shipped 2026-01-31)
- 🚧 **v3.0 Early Engagement** — Phases 16-19 (in progress)

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

## 🚧 v3.0 Early Engagement (In Progress)

**Milestone Goal:** Exploit geolocation from onboarding to show real job opportunities during profile setup, creating instant engagement before users complete their profiles.

### Phase 16: Privacy & Consent

**Goal**: Establish privacy-first location handling that complies with FERPA/GDPR before any user location data is collected

**Depends on**: Nothing (milestone start)

**Requirements**: PRIV-01, PRIV-02, PRIV-03, PRIV-04

**Success Criteria** (what must be TRUE):
1. User sees explicit consent screen before any location access is requested
2. User can decline GPS permission and manually enter city instead
3. DuckDB and Opik traces contain no raw latitude/longitude coordinates
4. Location data is stored as city name or fuzzy coordinates only (rounded to 2 decimals)
5. Privacy policy disclosure states Google Places API third-party data sharing

**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md — Location privacy utilities and consent UI component
- [x] 16-02-PLAN.md — Integrate consent flow and enforce privacy across stack
- [x] 16-03-PLAN.md — Human verification of end-to-end privacy compliance

**Key Files**:
- Create: `packages/frontend/src/components/onboarding/LocationConsent.tsx`
- Modify: `packages/frontend/src/routes/api/profiles.ts` (coordinate fuzzing)
- Modify: `packages/mcp-server/src/services/opik.ts` (PII sanitization)
- Create: `packages/frontend/src/lib/locationPrivacy.ts` (fuzzy coordinate helpers)

### Phase 17: Real Job Search API

**Goal**: Replace mock job data with real Google Places API results matched to user skills

**Depends on**: Phase 16

**Requirements**: JOBS-01, JOBS-02, JOBS-03, JOBS-04, JOBS-05

**Success Criteria** (what must be TRUE):
1. Prospection API returns real Google Places results instead of mocks
2. Job cards display business name, address, rating, and distance from user location
3. User can filter job results by category (hospitality, retail, tutoring, cleaning, etc.)
4. Jobs are automatically matched to skills captured during onboarding
5. Each job card shows star rating based on scoring algorithm (distance + profile + skill arbitrage)

**Plans**: TBD

Plans:
- [ ] 17-01: TBD

**Key Files**:
- Modify: `packages/frontend/src/routes/api/prospection.ts` (remove mocks, direct MCP import)
- Modify: `packages/mcp-server/package.json` (add `./tools/prospection` export)
- Modify: `packages/mcp-server/src/services/google-maps.ts` (add field masks)
- Create: `packages/frontend/src/lib/jobScoring.ts` (scoring algorithm integration)
- Modify: `packages/frontend/src/components/tabs/ProspectionTab.tsx` (star rating display)

### Phase 18: Background Prefetch

**Goal**: Prefetch job results in background during onboarding so users see instant results without waiting

**Depends on**: Phase 17

**Requirements**: PREF-01, PREF-02, PREF-03

**Success Criteria** (what must be TRUE):
1. Job search prefetches in background after city/location is captured in onboarding
2. Prefetch does not block onboarding flow (user continues immediately)
3. User sees "X opportunities near you" message during onboarding steps
4. Prefetch respects data saver mode (WiFi-only when enabled)
5. DuckDB caches prefetched results with 7-day TTL for identity data

**Plans**: TBD

Plans:
- [ ] 18-01: TBD

**Key Files**:
- Create: `packages/frontend/src/lib/prefetchQueue.ts` (in-memory job queue)
- Modify: `packages/frontend/src/components/chat/OnboardingChat.tsx` (trigger prefetch)
- Create: `packages/frontend/src/routes/api/_cache.ts` (DuckDB cache helpers)
- Modify: `packages/frontend/src/routes/api/_db.ts` (add location_cache table)

### Phase 19: Commute & UI Enhancements

**Goal**: Add commute time display and UI polish to make job cards actionable and visually appealing

**Depends on**: Phase 18

**Requirements**: COMM-01, COMM-02, COMM-03, UI-01, UI-02, UI-03

**Success Criteria** (what must be TRUE):
1. Job cards display estimated commute time (walking or transit mode)
2. User can adjust search radius via slider (1-10km range)
3. Distance Matrix API batches commute requests efficiently (max 25 destinations per call)
4. "Top Pick" badge appears on jobs with score >= 4.5/5
5. Radius slider updates results dynamically with debounced API calls
6. Commute time badge is visually distinct on each job card

**Plans**: TBD

Plans:
- [ ] 19-01: TBD

**Key Files**:
- Modify: `packages/mcp-server/src/tools/prospection.ts` (add handleCalculateCommute)
- Modify: `packages/mcp-server/src/services/google-maps.ts` (batch distance matrix)
- Modify: `packages/frontend/src/components/tabs/ProspectionTab.tsx` (radius slider)
- Create: `packages/frontend/src/components/jobs/CommuteBadge.tsx` (commute UI)
- Create: `packages/frontend/src/components/jobs/TopPickBadge.tsx` (top pick UI)

## Progress

**Execution Order:**
Phase numbering continues from previous milestones: 1-10 (v2.0), 11-15 (v2.1), 16-19 (v3.0)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v2.0 | 15/15 | Complete | 2026-01-31 |
| 11-15 | v2.1 | 5/5 | Complete | 2026-01-31 |
| 16. Privacy & Consent | v3.0 | 3/3 | Complete | 2026-02-01 |
| 17. Real Job Search API | v3.0 | 0/TBD | Ready | - |
| 18. Background Prefetch | v3.0 | 0/TBD | Not started | - |
| 19. Commute & UI | v3.0 | 0/TBD | Not started | - |
