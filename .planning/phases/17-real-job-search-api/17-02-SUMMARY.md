---
phase: 17-real-job-search-api
plan: 02
subsystem: "frontend-api"
completed: 2026-02-01
duration: "~3 minutes"
tags: ["google-places", "job-search", "scoring", "api"]

dependency-graph:
  requires:
    - "17-01: Google Maps service exports"
  provides:
    - "Real Google Places API integration in prospection endpoint"
    - "Job scoring utility for frontend"
  affects:
    - "17-03: Job commute times (needs real distance data)"
    - "18-*: Background prefetch (now has real API to call)"
    - "19-*: UI enhancements (can display real job scores)"

tech-stack:
  added: []
  patterns:
    - "Lazy-loaded MCP service imports"
    - "Haversine distance-based commute calculation"
    - "Weighted multi-criteria scoring"

key-files:
  created:
    - "packages/frontend/src/lib/jobScoring.ts"
  modified:
    - "packages/frontend/src/routes/api/prospection.ts"

decisions:
  - id: "platform-fallback"
    description: "Categories without googlePlaceTypes fall back to platform suggestions"
    rationale: "handyman, events, interim are platform-based, not physical locations"
  - id: "commute-speed"
    description: "Walking speed set to 80m/min for commute calculation"
    rationale: "Reasonable walking pace for urban environment"
  - id: "score-weights"
    description: "Scoring weights: distance 30%, profile 25%, effort 25%, rate 20%"
    rationale: "Adapted from skill-arbitrage algorithm, balances proximity with sustainability"

metrics:
  duration: "172 seconds"
  completed: "2026-02-01"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
---

# Phase 17 Plan 02: Real Google Places API Integration Summary

**One-liner:** Real Places API replaces mock data, job scoring utility scores opportunities based on distance, profile match, effort, and rate.

## What Was Built

### Task 1: Real Google Places API Integration

Replaced the mock data generator (`generateMockCards`) with real Google Places API calls.

**Key changes to `prospection.ts`:**
- Added lazy-loaded Google Maps service import from `@stride/mcp-server/services`
- Created `searchRealPlaces()` function that calls `findNearbyPlaces()` for each place type
- Calculates actual commute time based on Haversine distance (~80m/min walking speed)
- Uses `includePhotos: false` for API cost control
- Falls back to `generatePlatformCards()` for categories without googlePlaceTypes

**Categories with real Places search:**
- service (restaurant, cafe, bar, meal_takeaway)
- retail (store, shopping_mall, supermarket, clothing_store)
- cleaning (lodging, gym, school)
- childcare (school)
- tutoring (library, university, school)
- digital (cafe, library)
- campus (university, library)

**Categories with platform fallback:**
- handyman (TaskRabbit, Frizbiz, YoupiJob)
- events (Hotesse.com, Jobbing, Student Pop)
- interim (Adecco, Manpower, Randstad, Synergie)

### Task 2: Job Scoring Utility

Created `packages/frontend/src/lib/jobScoring.ts` with a multi-criteria scoring algorithm.

**Scoring weights:**
| Factor | Weight | Logic |
|--------|--------|-------|
| Distance | 30% | Closer is better (45+ min = 0, 0 min = 1) |
| Profile | 25% | Skill match + rate preference |
| Effort | 25% | Lower effort is better (inverted 1-5 scale) |
| Rate | 20% | Higher hourly rate is better (capped at 25/h) |

**Exports:**
- `scoreJob(job, profile)` - Score a single job, returns 1-5 star rating
- `scoreJobsForProfile(jobs, profile)` - Score and sort multiple jobs
- `formatStarRating(score)` - Format score for display (e.g., "4.2")
- `isTopPick(score)` - Check if job qualifies as top pick (score >= 4.5)

**Skill-to-category mapping** covers all 10 categories with relevant skills.

## Commits

| Commit | Description |
|--------|-------------|
| `f6076da` | Replace mock data with real Google Places API |
| `e4b4b5e` | Add job scoring utility for frontend |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] `pnpm typecheck` passes for entire project
- [x] Prospection API uses dynamic import pattern (line 18, 22, 141)
- [x] `findNearbyPlaces` called in searchRealPlaces (line 139)
- [x] jobScoring.ts exports all required functions
- [x] Types are consistent between prospectionTypes.ts and jobScoring.ts

## Must-Haves Checklist

### Truths
- [x] Prospection API returns real Google Places results - via `findNearbyPlaces()`
- [x] Job cards have real business names and addresses - from `place.name` and `place.address`
- [x] Jobs are scored using skill arbitrage algorithm - adapted in `jobScoring.ts`

### Artifacts
- [x] `packages/frontend/src/routes/api/prospection.ts` provides "Real Places API integration"
- [x] `packages/frontend/src/lib/jobScoring.ts` exports `scoreJob`, `scoreJobsForProfile`

### Key Links
- [x] prospection.ts imports from `@stride/mcp-server/services` (line 22)
- [x] jobScoring.ts uses scoring formula with distance, profile, effort (lines 52-79)

## Next Phase Readiness

**Phase 17-03 (Job Search Tool):** Ready
- Real Places API available for MCP tool integration
- Job scoring utility can be used for ranking results

**Phase 18 (Background Prefetch):** Ready
- Prospection API now returns real results to cache
- No blockers identified

## Files Changed

```
packages/frontend/src/routes/api/prospection.ts  (106 insertions, 73 deletions)
packages/frontend/src/lib/jobScoring.ts          (165 insertions, new file)
```

## Testing Notes

Manual API test (requires GOOGLE_MAPS_API_KEY):
```bash
curl -X POST http://localhost:3006/api/prospection \
  -H "Content-Type: application/json" \
  -d '{"action":"search","categoryId":"service","latitude":48.8566,"longitude":2.3522}'
```

Expected: Response contains real restaurant/cafe names from Paris, not mock data like "Le Petit Bistrot".
