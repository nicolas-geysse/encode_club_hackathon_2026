# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** Frictionless onboarding that keeps users in conversation flow while taking financial planning actions
**Current focus:** v3.0 Early Engagement — Phase 17 Real Job Search API

## Current Position

Phase: 17 of 19 (Real Job Search API)
Plan: 2 of 3 complete
Status: In progress
Last activity: 2026-02-01 — Completed 17-02-PLAN.md (Real Google Places API Integration)

Progress: [█████░░░░░] 50% (v3.0 milestone: 5/10 plans estimated)

Next: Execute 17-03-PLAN.md (Job Search MCP Tool)

## Performance Metrics

**Milestone v2.1:**
- Total plans completed: 5
- Total phases: 5
- Execution time: 2026-01-31

**Milestone v2.0:**
- Total plans completed: 15
- Total phases: 10
- Execution time: 2026-01-31

**v3.0 (in progress):**
- Total plans completed: 5
- Total phases: 4 (16-19)
- Status: Phase 17 plan 2 complete, continuing with plan 3

## Accumulated Context

### Decisions

**v3.0 Milestone Decisions:**
- Privacy-first approach: Explicit consent screen before location access (FERPA/GDPR compliance)
- No raw GPS storage: City name or fuzzy coordinates only (rounded to 2 decimals = ~1km precision)
- Direct MCP import pattern: Proven in agent.ts, avoids HTTP overhead, maintains type safety
- Field mask enforcement: Strict 6-field whitelist to prevent Google API cost explosion
- Background prefetch: Non-blocking job search during onboarding for instant results
- Phase structure: 4 phases derived from 18 requirements (16: Privacy, 17: API, 18: Prefetch, 19: UI)

**Phase 17 Decisions (17-01):**
- Photo billing opt-in: includePhotos defaults to false to avoid API costs (~$0.007/photo)
- Direct export pattern: google-maps now exported from @stride/mcp-server/services

**Phase 17 Decisions (17-02):**
- Platform fallback: Categories without googlePlaceTypes use platform suggestions
- Commute speed: Walking at 80m/min for urban commute estimation
- Score weights: distance 30%, profile 25%, effort 25%, rate 20%

**Phase 16 Decisions (16-01):**
- 2 decimal places = ~1.1km precision (city-level, not street-level)
- PII sanitizer handles nested objects recursively
- Inline SVG for location icon (no lucide import needed)

**Phase 16 Decisions (16-02):**
- Consent overlay approach: Modal overlay (not route) keeps user in onboarding flow
- Empty messages until consent: Chat messages empty until user makes choice, then greeting appears
- API defense-in-depth: Even if frontend sends raw coords, API enforces fuzzyCoordinates
- Duplicate sanitization function: PII sanitizer in opik.ts with dual-maintenance warning (hackathon speed)

**v2.x Decisions:**
- Hybrid iframe+button rendering over pure iframe (mobile touch issues)
- postMessage for swipe feedback (avoid polling)
- Quick links trigger charts in chat (keep conversation context)

### Pending Todos

None

### Blockers/Concerns

**Resolved (Phase 17-01 complete):**
- Google Places API costs: Photo billing now controlled via opt-in includePhotos option
- google-maps service exported for direct frontend imports

**Remaining concerns:**
- None currently

**Phase dependencies:**
- Phase 17 depends on Phase 16 (cannot collect location without consent) - SATISFIED
- Phase 18 depends on Phase 17 (cannot prefetch without real API) - IN PROGRESS
- Phase 19 depends on Phase 18 (commute calculation needs cached results)

### Roadmap Evolution

v2.0 milestone complete (Phases 1-10) — shipped 2026-01-31
v2.1 milestone complete (Phases 11-15) — shipped 2026-01-31

**v3.0 Early Engagement (Phases 16-19):**
- Phase 16: Privacy & Consent (PRIV-01 to PRIV-04) — VERIFIED COMPLETE
- Phase 17: Real Job Search API (JOBS-01 to JOBS-05) — Plan 2/3 complete
- Phase 18: Background Prefetch (PREF-01 to PREF-03)
- Phase 19: Commute & UI Enhancements (COMM-01 to COMM-03, UI-01 to UI-03)

**Coverage:** 18/18 requirements mapped (100%)

## Session Continuity

Last session: 2026-02-01
Stopped at: Completed 17-02-PLAN.md
Resume file: None
