# Technology Stack: Real-Time Location-Based Job Search

**Project:** Stride - Early Job Engagement Milestone
**Researched:** 2026-02-01
**Confidence:** HIGH

## Executive Summary

The existing Stride architecture already has 90% of what's needed. The "problem" is **not** a missing stack component—it's an **integration gap**. The frontend `/api/prospection` returns mock data instead of calling the MCP `google-maps.ts` service that already exists.

**Key Finding:** Do NOT add new libraries. Use direct imports of MCP services in server functions (existing pattern). Add a simple in-memory job queue for background prefetch.

---

## Current Architecture (DO NOT CHANGE)

| Layer | Technology | Why It Works |
|-------|------------|--------------|
| **Frontend** | SolidStart + SolidJS | SSR with fine-grained reactivity, route preloading built-in |
| **Server Functions** | SolidStart `/api/*.ts` | Server-only code with RPC, already used in `/api/chat.ts` |
| **MCP Integration** | Direct imports from `@stride/mcp-server` | Workspace package, externalized in Vite SSR config |
| **Location API** | Google Maps (Places + Distance Matrix) | Already implemented in `mcp-server/src/services/google-maps.ts` |
| **Database** | DuckDB | Already used for profiles, can cache location results |
| **Observability** | Opik tracing | Already integrated in MCP services |

**Confidence:** HIGH - Verified via codebase inspection (`app.config.ts`, `package.json`, existing services)

---

## Integration Pattern: Frontend → MCP Services

### ✅ Existing Pattern (Use This)

```typescript
// packages/frontend/src/routes/api/prospection.ts
import { findNearbyPlaces, getDistanceMatrix } from '@stride/mcp-server/services/google-maps';

export async function POST(event: APIEvent): Promise<Response> {
  const { categoryId, latitude, longitude, radius } = await event.request.json();

  // Direct service call (NOT MCP stdio, NOT HTTP)
  const places = await findNearbyPlaces(
    { lat: latitude, lng: longitude },
    categoryPlaceType,
    { radius, maxResults: 20 }
  );

  // ... transform to ProspectionCard format
}
```

**Why this works:**
- `@stride/mcp-server` is a workspace package
- `app.config.ts` externalizes it for SSR (`externals: ["@stride/mcp-server"]`)
- DuckDB native module handled via `nativeModule.ts` helper
- No subprocess spawning, no stdio transport, no serialization overhead

**Evidence:**
- `/api/chat.ts` already imports `{ processWithGroqExtractor }` from `lib/chat/extraction` which wraps Groq SDK
- `app.config.ts` lines 13-18: `externals` and `ssr.external` configured
- Pattern established, just needs replication for location services

**Confidence:** HIGH - This is the project's established pattern per CLAUDE.md

---

## Background Prefetch Pattern

### Requirement
During onboarding step 1 (city capture), trigger background job search prefetch so results are ready when user reaches Prospection tab.

### ❌ DON'T: Add Redis/BullMQ
**Why not:** Adds infrastructure complexity for a single-use case. Student projects don't need distributed queues.

**Evidence:** [BullMQ](https://bullmq.io/) and [Bee Queue](https://github.com/bee-queue/bee-queue) require Redis. Overkill for prefetch pattern.

### ✅ DO: Simple In-Memory Queue

**Rationale:**
- Single-process Node server (SolidStart SSR)
- Jobs are fire-and-forget (prefetch doesn't block user flow)
- No need for persistence (if server restarts, re-fetch is fast anyway)
- No concurrency issues (single-threaded event loop with async)

**Implementation:**

```typescript
// packages/frontend/src/lib/prefetchQueue.ts
import { createLogger } from './logger';
import { findNearbyPlaces } from '@stride/mcp-server/services/google-maps';
import { db } from './db'; // DuckDB cache

const logger = createLogger('PrefetchQueue');

interface PrefetchJob {
  id: string;
  userId: string;
  location: { lat: number; lng: number };
  categories: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: number;
}

class PrefetchQueue {
  private jobs: Map<string, PrefetchJob> = new Map();
  private running = false;

  enqueue(userId: string, location: { lat: number; lng: number }, categories: string[]) {
    const jobId = `${userId}_${Date.now()}`;
    this.jobs.set(jobId, {
      id: jobId,
      userId,
      location,
      categories,
      status: 'pending',
      createdAt: Date.now(),
    });

    // Start processing if not already running
    if (!this.running) {
      this.process();
    }

    logger.info('Job enqueued', { jobId, userId, categories });
  }

  private async process() {
    this.running = true;

    for (const [jobId, job] of this.jobs) {
      if (job.status !== 'pending') continue;

      job.status = 'running';

      try {
        // Fetch for all categories in parallel
        const results = await Promise.all(
          job.categories.map(cat =>
            findNearbyPlaces(job.location, categoryToPlaceType(cat), { radius: 5000 })
          )
        );

        // Cache in DuckDB
        await db.run(`
          INSERT OR REPLACE INTO location_cache (user_id, location_lat, location_lng, category, places, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [job.userId, job.location.lat, job.location.lng, /* ... */]);

        job.status = 'complete';
        logger.info('Job complete', { jobId, resultsCount: results.flat().length });
      } catch (error) {
        job.status = 'failed';
        logger.error('Job failed', { jobId, error });
      }
    }

    // Clean up old jobs (>1 hour)
    const cutoff = Date.now() - 3600000;
    for (const [jobId, job] of this.jobs) {
      if (job.createdAt < cutoff) {
        this.jobs.delete(jobId);
      }
    }

    this.running = false;
  }
}

export const prefetchQueue = new PrefetchQueue();
```

**Usage in onboarding chat:**

```typescript
// packages/frontend/src/routes/api/chat.ts (after city extraction)
import { prefetchQueue } from '~/lib/prefetchQueue';

// After step 1 completes (city + coordinates extracted)
if (step === 'city' && extractedData.latitude && extractedData.longitude) {
  // Fire-and-forget prefetch
  prefetchQueue.enqueue(
    profileId,
    { lat: extractedData.latitude, lng: extractedData.longitude },
    ['service', 'retail', 'tutoring'] // Top 3 popular categories
  );
}
```

**Why this pattern:**
- No external dependencies
- SolidStart server runs continuously (not serverless cold starts)
- Graceful failure: if prefetch fails, user still gets fresh data on tab click
- Memory-bounded: auto-cleans old jobs

**Confidence:** MEDIUM - Pattern is sound but not tested in SolidStart SSR context. Needs validation that event loop handles async well.

**Source:** [Background tasks in SolidStart](https://www.answeroverflow.com/m/1310190736670457856) discussion, [Node.js queue patterns](https://www.sitepoint.com/implement-task-queue-node-js/)

---

## Caching Strategy

### DuckDB Table Schema

```sql
CREATE TABLE IF NOT EXISTS location_cache (
  user_id TEXT NOT NULL,
  location_lat REAL NOT NULL,
  location_lng REAL NOT NULL,
  category TEXT NOT NULL,
  places JSON NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, location_lat, location_lng, category)
);

CREATE INDEX idx_location_cache_user ON location_cache(user_id);
CREATE INDEX idx_location_cache_fetched ON location_cache(fetched_at);
```

### Cache Invalidation

**Strategy:** Time-based with 7-day TTL

**Rationale:**
- Business hours don't change weekly
- User location rarely changes during semester
- Google Maps API costs money (minimize calls)

```typescript
// packages/frontend/src/routes/api/prospection.ts
async function getCachedOrFetch(userId, location, category) {
  const cached = await db.get(`
    SELECT places, fetched_at
    FROM location_cache
    WHERE user_id = ? AND category = ?
    AND fetched_at > datetime('now', '-7 days')
  `, [userId, category]);

  if (cached) {
    return JSON.parse(cached.places);
  }

  // Cache miss - fetch fresh
  const places = await findNearbyPlaces(location, categoryToPlaceType(category));

  // Store in cache
  await db.run(`
    INSERT OR REPLACE INTO location_cache (user_id, location_lat, location_lng, category, places)
    VALUES (?, ?, ?, ?, ?)
  `, [userId, location.lat, location.lng, category, JSON.stringify(places)]);

  return places;
}
```

**Confidence:** HIGH - DuckDB already used for profiles, adding table is straightforward

---

## Real-Time Job Scoring

### Requirement
Combine Google Places results with skill arbitrage scoring algorithm.

### Pattern: Enrich Places with Graph Data

```typescript
// Import existing MCP graph queries
import { enrichPlacesWithGraph } from '@stride/mcp-server/tools/prospection';

// In /api/prospection POST handler
const places = await findNearbyPlaces(location, placeType);

// Get user skills from profile
const profile = await loadProfile(userId);
const userSkills = profile.skills || [];

// Enrich with graph data (matching skills, recommended jobs)
const enrichment = await enrichPlacesWithGraph(
  places.map(p => p.types).flat(),
  userSkills
);

// Score each place
const scoredPlaces = places.map(place => {
  const placeType = place.types[0]; // Primary type
  const data = enrichment.get(placeType);

  const score = calculateScore({
    distance: calculateDistance(userLocation, place.location),
    matchingSkills: data?.matchingSkills.length || 0,
    relevance: data?.relevanceScore || 0,
    rating: place.rating || 3.0,
  });

  return { ...place, score, matchingSkills: data?.matchingSkills };
}).sort((a, b) => b.score - a.score);
```

**Scoring Formula:**

```typescript
function calculateScore(factors: {
  distance: number; // meters
  matchingSkills: number;
  relevance: number; // 0-1 from graph
  rating: number; // 1-5 Google rating
}) {
  // Normalize distance (closer = higher score)
  const distanceScore = Math.max(0, 1 - (factors.distance / 5000)); // 5km max

  // Weight factors
  return (
    distanceScore * 0.3 +        // 30% proximity
    factors.matchingSkills * 0.25 + // 25% skill match
    factors.relevance * 0.25 +      // 25% graph relevance
    (factors.rating / 5) * 0.2      // 20% quality
  );
}
```

**Why this works:**
- Reuses existing `enrichPlacesWithGraph()` from MCP (line 715-809 in `prospection.ts`)
- Combines location data (Google) with skill data (DuckPGQ graph)
- Real-time scoring without pre-computation

**Confidence:** HIGH - Functions already exist, just need integration

---

## What NOT to Add

| ❌ Don't Add | Why Not | Alternative |
|--------------|---------|-------------|
| **Redis** | Infrastructure overhead, single-server app doesn't need distributed cache | In-memory Map or DuckDB cache |
| **BullMQ/Bee Queue** | Requires Redis, overkill for prefetch | Simple in-memory queue class |
| **HTTP MCP Client** | MCP server uses stdio transport for Claude Desktop, not HTTP | Direct ESM imports from workspace package |
| **WebSockets** | No real-time updates needed, user triggers search | Standard HTTP POST to `/api/prospection` |
| **Service Workers** | Client-side caching not needed, data is user-specific | Server-side DuckDB cache |
| **Separate Job Worker Process** | SolidStart runs single Node process | Async queue in same process |

**Confidence:** HIGH - Based on existing architecture constraints and CLAUDE.md patterns

---

## Installation (None Required)

All dependencies already installed:

```json
// packages/frontend/package.json (lines 14-42)
{
  "dependencies": {
    "@stride/mcp-server": "workspace:*",  // ✅ Already linked
    "duckdb": "1.4.1",                    // ✅ Already installed
    // ... rest
  }
}
```

**Action Required:** ZERO new npm packages

---

## Migration Path

### Step 1: Add Cache Table
```bash
# Run in packages/frontend/src/routes/api/_db.ts initialization
CREATE TABLE location_cache (...);
```

### Step 2: Create Prefetch Queue
```bash
# New file: packages/frontend/src/lib/prefetchQueue.ts
# Pattern: In-memory job queue (see code above)
```

### Step 3: Update `/api/prospection.ts`
```typescript
// Replace generateMockCards() with:
// 1. Check cache
// 2. Call findNearbyPlaces()
// 3. Enrich with graph
// 4. Score and return
```

### Step 4: Trigger Prefetch in `/api/chat.ts`
```typescript
// After city extraction (step 1), enqueue background prefetch
```

### Step 5: Add Distance Matrix to Cards
```typescript
// After user selects category, calculate commute times
const destinations = places.map(p => p.location);
const distances = await getDistanceMatrix(userLocation, destinations);
// Merge into ProspectionCard results
```

**Estimated Effort:** 4-6 hours (2 files new, 2 files modified, 1 table added)

---

## Tracing & Observability

**Pattern:** All MCP services already trace to Opik

```typescript
// google-maps.ts already wraps calls with trace()
return trace('google_places_nearby', async (span) => {
  span.setAttributes({ 'places.type': type, 'places.radius': radius });
  // ... API call
  span.setOutput({ places_count: places.length });
}, traceOptions);
```

**Frontend integration:**

```typescript
// /api/prospection.ts
import { trace, getCurrentTraceId } from '@stride/mcp-server/services/opik';

export async function POST(event: APIEvent): Promise<Response> {
  return trace('prospection_search', async (span) => {
    span.setAttributes({ category, user_id: userId });

    const places = await findNearbyPlaces(location, placeType);
    // ^ Automatically creates child span

    span.setOutput({ results_count: places.length });

    return new Response(JSON.stringify({
      cards,
      metadata: { traceId: getCurrentTraceId() }
    }));
  });
}
```

**Result:** Full trace hierarchy in Opik:
```
prospection_search (parent)
└── google_places_nearby (child)
    └── graph_enrich_places (child)
```

**Confidence:** HIGH - Pattern already used in MCP tools

---

## Performance Considerations

### Cold Start (First Search)
- **Cache Miss:** ~500-800ms (Google API + graph query)
- **User Experience:** Show skeleton loader while fetching

### Warm Start (Cached)
- **Cache Hit:** ~50-100ms (DuckDB read + scoring)
- **User Experience:** Near-instant results

### Prefetch Benefit
- **Without Prefetch:** User waits 500-800ms on tab click
- **With Prefetch:** Results ready in 50-100ms (90% faster)

### Google Maps API Quotas
- **Free Tier:**
  - Places Nearby: 5,000 requests/month (~166/day)
  - Distance Matrix: 40,000 elements/month
- **Mitigation:** 7-day cache reduces calls by ~85%
- **Cost Estimate:** Free tier sufficient for 50-100 active students

**Evidence:** [Google Maps Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) - verified 2026-01-31

**Confidence:** MEDIUM - Assumes typical student usage patterns

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Google API Key Missing** | High | Graceful degradation: show platform links only (no map results) |
| **Cache Stale Data** | Low | 7-day TTL + manual refresh button |
| **Prefetch Memory Leak** | Medium | Auto-cleanup of jobs >1 hour old |
| **DuckDB Lock Contention** | Low | Write cache async (fire-and-forget) |
| **Google API Rate Limits** | Medium | Cache + exponential backoff on 429 errors |

**Confidence:** MEDIUM - Mitigations are standard patterns but untested in this codebase

---

## Open Questions

1. **Prefetch Categories:** Which 3-5 categories to prefetch? (Suggest: service, retail, tutoring based on popularity)
2. **Cache Eviction:** Should we purge cache on profile location change? (Suggest: yes, delete old entries for user_id)
3. **Commute Mode:** Default to transit or let user choose? (Suggest: transit, show dropdown to change)

**Resolution:** Needs product decision, not technical research

---

## Sources

### Official Documentation
- [SolidStart Prefetch](https://egghead.io/lessons/solid-prefetch-and-cache-data-in-solidstart) - Route preload patterns
- [SolidStart "use server"](https://docs.solidjs.com/solid-start/reference/server/use-server) - Server function specification
- [MCP STDIO Transport](https://mcp-framework.com/docs/Transports/stdio-transport/) - Why not to use for server-to-server

### Background Tasks
- [Background tasks in SolidStart](https://www.answeroverflow.com/m/1310190736670457856) - Discussion on initialization
- [Node.js Queue Patterns](https://www.sitepoint.com/implement-task-queue-node-js/) - In-memory queue design
- [BullMQ](https://bullmq.io/) - Why NOT to use (requires Redis)

### Codebase Evidence
- `/packages/frontend/app.config.ts` - SSR externals configuration
- `/packages/mcp-server/src/services/google-maps.ts` - Existing implementation
- `/packages/mcp-server/src/tools/prospection.ts` - Graph enrichment functions
- `CLAUDE.md` - Established patterns for native modules and MCP integration

---

## Recommendation

**DO THIS:**
1. Replace mock data in `/api/prospection.ts` with direct imports of `findNearbyPlaces()` and `getDistanceMatrix()`
2. Add simple in-memory prefetch queue triggered after onboarding step 1
3. Cache results in DuckDB with 7-day TTL
4. Enrich places with skill graph data using existing `enrichPlacesWithGraph()`
5. Score results by distance + skill match + rating

**DON'T DO THIS:**
- Add Redis or distributed queue (overkill)
- Try to use MCP stdio transport from server functions (wrong pattern)
- Add client-side service workers (server cache sufficient)
- Pre-compute all categories (cache + prefetch handles it)

**Timeline:** 4-6 hours implementation + 2 hours testing

**Risk Level:** LOW - Uses established patterns, minimal new code
