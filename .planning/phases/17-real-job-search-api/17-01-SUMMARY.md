---
phase: 17-real-job-search-api
plan: 01
subsystem: api
tags: [google-maps, places-api, cost-control]

# Dependency graph
requires:
  - phase: 16-privacy-consent
    provides: Privacy utilities for coordinate fuzzing
provides:
  - Google Places API with photo billing control (includePhotos option)
  - google-maps service exported from @stride/mcp-server/services
affects: [17-02, 17-03, 18-background-prefetch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Photo billing opt-in: includePhotos defaults to false to avoid API costs"

key-files:
  created: []
  modified:
    - packages/mcp-server/src/services/google-maps.ts
    - packages/mcp-server/src/services/index.ts

key-decisions:
  - "Photo billing control via opt-in includePhotos option (default false)"
  - "Direct MCP import pattern: export all google-maps functions and types"

patterns-established:
  - "Cost control pattern: API features that incur additional billing are opt-in"

# Metrics
duration: 5min
completed: 2026-02-01
---

# Phase 17 Plan 01: Google Maps Field Masks Summary

**Photo billing control for Google Places API with includePhotos option (default false) and full service export for frontend imports**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-01T18:00:00Z
- **Completed:** 2026-02-01T18:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `includePhotos` option to findNearbyPlaces() (default false) to avoid photo API billing
- Added billing documentation comments explaining Places API costs
- Exported all google-maps functions and types from @stride/mcp-server/services
- Enabled direct import pattern for frontend API routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add field masks to Google Places API** - `0e8b63f` (feat)
2. **Task 2: Export google-maps service from MCP services** - `078578f` (feat)

## Files Created/Modified
- `packages/mcp-server/src/services/google-maps.ts` - Added includePhotos option and billing docs
- `packages/mcp-server/src/services/index.ts` - Added google-maps exports

## Decisions Made
- **Photo billing opt-in**: Photos are not fetched by default since they incur separate billing (~$0.007/photo). Callers must explicitly set `includePhotos: true`
- **Direct export pattern**: Following existing services pattern (groq, opik, duckdb), google-maps is now exportable for direct frontend import

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- google-maps service ready for use in job-search tool (Plan 17-02)
- Export pattern enables direct import in frontend API routes
- Photo billing controlled to prevent unexpected API costs

---
*Phase: 17-real-job-search-api*
*Completed: 2026-02-01*
