# Architecture: Frontend → MCP Integration Pattern

**Domain:** SolidStart SSR frontend calling MCP tool handlers
**Researched:** 2026-02-01
**Confidence:** HIGH (verified with codebase analysis)

## Executive Summary

The Stride monorepo already implements **Option B: Direct import of MCP tool handlers** for frontend-to-backend integration. This is the recommended pattern for the prospection feature. The MCP server's stdio transport is designed for external clients (Claude Desktop), while internal frontend routes use direct TypeScript imports of the tool handler functions.

**Key Finding:** MCP server stdio transport ≠ HTTP API. It's a JSON-RPC protocol over stdin/stdout intended for external MCP clients, not internal frontend calls.

## Recommended Integration Pattern

### Pattern: Direct Import with Dynamic Loading

**What:** Frontend server functions (`routes/api/*.ts`) import and call MCP tool handler functions directly.

**Why this works:**
1. **Same monorepo** - `@stride/mcp-server` is a workspace package with TypeScript exports
2. **SSR context** - Server functions run in Node.js, can import native modules (DuckDB)
3. **Already proven** - `agent.ts` uses this pattern successfully (lines 29-37)
4. **Build configured** - `app.config.ts` externalizes `@stride/mcp-server` (line 15)

**Implementation:**

```typescript
// packages/frontend/src/routes/api/prospection.ts
import type { APIEvent } from '@solidjs/start/server';

// Dynamic import to avoid bundling MCP server in client code
async function getProspectionHandlers() {
  const { handleSearchNearbyJobs, handleCalculateCommute } =
    await import('@stride/mcp-server/tools/prospection');
  return { handleSearchNearbyJobs, handleCalculateCommute };
}

export async function POST(event: APIEvent): Promise<Response> {
  const body = await event.request.json();
  const { action, categoryId, latitude, longitude, radius = 5000 } = body;

  if (action === 'search') {
    // Call MCP tool handler directly
    const { handleSearchNearbyJobs } = await getProspectionHandlers();

    const result = await handleSearchNearbyJobs({
      latitude,
      longitude,
      category: categoryId,
      radius,
    });

    // Extract places from MCP response metadata
    const places = result.metadata?.places || [];

    // Transform to frontend ProspectionCard format
    const cards = places.map(transformPlaceToCard);

    return new Response(JSON.stringify({ cards }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

**Why dynamic import:**
- Avoids bundling native modules (DuckDB) in client-side code
- Lazy loads MCP handlers only when needed
- Pattern already used in `agent.ts` (proven to work)

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend Component (ProspectionTab.tsx)                         │
│ - User clicks category                                          │
│ - Triggers search with coordinates                              │
└───────────────────────┬─────────────────────────────────────────┘
                        │ fetch('/api/prospection', { action: 'search' })
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server Function (routes/api/prospection.ts)                     │
│ - Runs in Node.js SSR context                                   │
│ - Dynamic import: '@stride/mcp-server/tools/prospection'        │
│ - Calls handleSearchNearbyJobs({ lat, lng, category, radius })  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Direct function call (same process)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ MCP Tool Handler (packages/mcp-server/src/tools/prospection.ts) │
│ - handleSearchNearbyJobs()                                       │
│ - Creates Opik trace                                             │
│ - Calls Google Maps service                                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP request
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Google Places API                                                │
│ - Returns nearby places (restaurants, cafes, etc.)               │
│ - Includes: name, address, rating, coordinates, openNow         │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Response
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ MCP Tool Handler                                                 │
│ - Formats response in MCP composite format                       │
│ - Returns: { type: 'composite', metadata: { places: [...] } }   │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Return value
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server Function                                                  │
│ - Extracts places from metadata                                  │
│ - Transforms Place → ProspectionCard                             │
│ - Adds commute calculation if needed                             │
│ - Returns JSON response                                          │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP response
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Frontend Component                                               │
│ - Updates UI with swipeable cards                                │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Separation of Concerns

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **UI Components** | `packages/frontend/src/components/` | Presentation, user interaction, client state |
| **Server Functions** | `packages/frontend/src/routes/api/` | Request validation, orchestration, response transformation |
| **MCP Tool Handlers** | `packages/mcp-server/src/tools/` | Business logic, external API calls, Opik tracing |
| **Services** | `packages/mcp-server/src/services/` | External API wrappers (Google Maps, Groq, DuckDB) |

### Why This Layering

**Server Functions (thin orchestration layer):**
- Request/response shaping for frontend needs
- Validation and error handling
- Can batch multiple MCP tool calls
- Transform MCP responses to UI-specific formats

**MCP Tool Handlers (thick business logic layer):**
- Reusable by both frontend and external MCP clients (Claude Desktop)
- Opik tracing for observability
- Domain logic (category mapping, scoring, filtering)
- External API orchestration

**Example: Commute Calculation Enhancement**

```typescript
// Server function orchestrates multiple MCP tools
export async function POST(event: APIEvent) {
  const { handleSearchNearbyJobs, handleCalculateCommute } =
    await getProspectionHandlers();

  // Step 1: Get places
  const placesResult = await handleSearchNearbyJobs({
    latitude, longitude, category, radius
  });
  const places = placesResult.metadata?.places || [];

  // Step 2: Batch commute calculation
  const destinations = places.map(p => ({ lat: p.location.lat, lng: p.location.lng }));
  const commuteResult = await handleCalculateCommute({
    origin_lat: latitude,
    origin_lng: longitude,
    destinations,
    mode: 'transit'
  });
  const commutes = commuteResult.metadata?.results || [];

  // Step 3: Merge and transform
  const cards = places.map((place, i) => ({
    ...transformPlaceToCard(place),
    commuteMinutes: Math.round(commutes[i]?.durationSeconds / 60),
    commuteText: commutes[i]?.durationText,
  }));

  return new Response(JSON.stringify({ cards }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Build Configuration

### Current Setup (Verified)

**Frontend `app.config.ts`:**
```typescript
{
  server: {
    externals: [
      "duckdb",                    // Native module
      "@stride/mcp-server",         // Workspace package
      "@ai-sdk/provider-v5",
      "@ai-sdk/provider-utils-v5",
    ],
  },
  vite: {
    ssr: {
      external: ["duckdb", "@stride/mcp-server", "@mastra/core", "opik"],
    },
    build: {
      rollupOptions: {
        external: [
          "duckdb",
          "@stride/mcp-server",
          "@stride/mcp-server/agents",
          "@stride/mcp-server/services",
          // ...
        ],
      },
    },
  },
}
```

**Why this works:**
- `externals` tells Nitro (SolidStart's server) not to bundle MCP server
- SSR imports resolve from `node_modules/@stride/mcp-server` (pnpm workspace symlink)
- Native modules (DuckDB) load via `createRequire` helper (see `lib/nativeModule.ts`)

**MCP Server `package.json` exports:**
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./agents": "./dist/agents/index.js",
    "./services": "./dist/services/index.js",
    "./algorithms": "./dist/algorithms/index.js"
  }
}
```

**Required export addition for prospection:**
```json
{
  "exports": {
    // ... existing exports
    "./tools/prospection": "./dist/tools/prospection.js"
  }
}
```

## Alternative Pattern: Why NOT Use stdio MCP Server

### Option A: HTTP Call to MCP Server (Rejected)

**Problem:** MCP server uses stdio transport, not HTTP.

```typescript
// packages/mcp-server/src/index.ts (lines 77-80)
async function main() {
  const transport = new StdioServerTransport();  // stdin/stdout, not HTTP
  await server.connect(transport);
}
```

**To make this work would require:**
1. Add HTTP transport to MCP server (duplicate stdio transport)
2. Run MCP server as separate HTTP process
3. Frontend makes HTTP calls to `localhost:8080/tools/search_nearby_jobs`
4. Doubles latency (two process hops instead of direct call)
5. Lose TypeScript type safety (JSON over HTTP vs typed function calls)

**When to use:** Only if frontend and MCP server must run in separate processes (different deployment units, language boundaries, network separation).

**Not needed here:** Monorepo with TypeScript workspace packages.

## Caching Architecture

### Response Caching Layer

**Where:** Server function (`routes/api/prospection.ts`)

**What to cache:**
- Google Places API responses (expensive, rate-limited)
- Commute calculations (stable for location pairs)

**Strategy:**
```typescript
// In-memory LRU cache with TTL
import { LRUCache } from 'lru-cache';

const placesCache = new LRUCache<string, Place[]>({
  max: 100,           // 100 different searches
  ttl: 1000 * 60 * 60 // 1 hour
});

function getCacheKey(lat: number, lng: number, category: string, radius: number): string {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${category}_${radius}`;
}

export async function POST(event: APIEvent) {
  const cacheKey = getCacheKey(latitude, longitude, categoryId, radius);

  // Check cache
  let places = placesCache.get(cacheKey);
  if (!places) {
    // Call MCP tool
    const result = await handleSearchNearbyJobs({ ... });
    places = result.metadata?.places || [];
    placesCache.set(cacheKey, places);
  }

  // Transform and return
  const cards = places.map(transformPlaceToCard);
  return new Response(JSON.stringify({ cards }));
}
```

**Why cache at server function level:**
- MCP tools remain stateless (good for external MCP clients)
- Cache invalidation controlled by frontend API
- Can implement cache warming/prefetch at this layer

### Background Prefetch (Future Enhancement)

**Pattern:** Prefetch nearby categories when user selects location.

```typescript
// When user enables geolocation
async function prefetchNearbyCategories(lat: number, lng: number) {
  const categories = ['service', 'retail', 'cleaning']; // Top 3 categories

  // Fire-and-forget parallel prefetch
  Promise.all(
    categories.map(cat =>
      fetch('/api/prospection', {
        method: 'POST',
        body: JSON.stringify({ action: 'search', categoryId: cat, latitude: lat, longitude: lng })
      })
    )
  ).catch(() => {/* Ignore prefetch failures */});
}
```

**Result:** When user swipes to category tab, data already cached.

## Opik Tracing Flow

### Trace Propagation

**MCP Tool Handler creates trace:**
```typescript
// packages/mcp-server/src/tools/prospection.ts (lines 155-166)
export async function handleSearchNearbyJobs(args: Record<string, unknown>) {
  return trace('tool_search_nearby_jobs', async (span) => {
    span.setInput({ latitude, longitude, category, radius });
    // ... business logic
    span.setOutput({ places_count: places.length });

    return { type: 'composite', metadata: { places } };
  });
}
```

**Trace appears in Opik dashboard with:**
- Span name: `tool_search_nearby_jobs`
- Input: `{ latitude: 48.8566, longitude: 2.3522, category: "service", radius: 5000 }`
- Output: `{ places_count: 12 }`
- Attributes: `{ prospection.category: "service", prospection.radius: 5000, prospection.has_api_key: true }`

**No frontend changes needed** - Opik integration happens at MCP tool layer.

## Error Handling Pattern

### Graceful Degradation

**MCP tool level:**
```typescript
// packages/mcp-server/src/tools/prospection.ts (lines 168-182)
if (!isGoogleMapsAvailable()) {
  span.setAttributes({ error: 'Google Maps API not available' });
  return {
    type: 'text',
    params: {
      content: '⚠️ Google Maps API not configured. Please set GOOGLE_MAPS_API_KEY environment variable.',
      markdown: false,
    },
    metadata: { traceId: getCurrentTraceId(), error: 'api_not_configured' },
  };
}
```

**Server function level:**
```typescript
export async function POST(event: APIEvent) {
  try {
    const result = await handleSearchNearbyJobs({ ... });

    // Check for error in MCP response
    if (result.metadata?.error === 'api_not_configured') {
      return new Response(
        JSON.stringify({
          error: 'Google Maps API not configured',
          cards: [] // Empty results, not crash
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const places = result.metadata?.places || [];
    const cards = places.map(transformPlaceToCard);
    return new Response(JSON.stringify({ cards }));

  } catch (error) {
    logger.error('Prospection search failed', { error });
    return new Response(
      JSON.stringify({ error: 'Search failed', cards: [] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

**Frontend level:**
```typescript
// Component handles empty results gracefully
const { cards } = await response.json();
if (cards.length === 0) {
  return <EmptyState message="No jobs found nearby. Try adjusting your search." />;
}
```

## Security Considerations

### API Key Protection

**Google Maps API key in environment variables:**
```bash
# .env (never committed)
GOOGLE_MAPS_API_KEY=AIza...
```

**Server-side only:**
- MCP tool handlers run in Node.js (server context)
- API key never exposed to client
- Frontend components cannot access `process.env.GOOGLE_MAPS_API_KEY`

### Rate Limiting

**Google Places API quotas:**
- Nearby Search: 1000 requests/day (free tier)
- Distance Matrix: 1000 elements/day (free tier)

**Mitigation:**
1. Cache responses (reduces duplicate requests)
2. Limit search radius (reduces results per query)
3. Debounce user searches (prevent spam)
4. Consider upgrading to paid tier for production

## Testing Strategy

### Unit Tests (MCP Tool Handlers)

```typescript
// packages/mcp-server/src/tools/prospection.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleSearchNearbyJobs } from './prospection';

describe('handleSearchNearbyJobs', () => {
  it('returns places for valid category', async () => {
    const result = await handleSearchNearbyJobs({
      latitude: 48.8566,
      longitude: 2.3522,
      category: 'service',
      radius: 5000,
    });

    expect(result.metadata?.places).toBeDefined();
    expect(result.metadata?.places.length).toBeGreaterThan(0);
  });

  it('handles missing API key gracefully', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');

    const result = await handleSearchNearbyJobs({ ... });

    expect(result.metadata?.error).toBe('api_not_configured');
  });
});
```

### Integration Tests (Server Functions)

```bash
# scripts/test-api.sh
curl -X POST http://localhost:3006/api/prospection \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search",
    "categoryId": "service",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "radius": 5000
  }'
```

## Migration Path

### Phase 1: Replace Mock Data (Current Milestone)

**Change:**
```diff
// packages/frontend/src/routes/api/prospection.ts

+ async function getProspectionHandlers() {
+   const { handleSearchNearbyJobs, handleCalculateCommute } =
+     await import('@stride/mcp-server/tools/prospection');
+   return { handleSearchNearbyJobs, handleCalculateCommute };
+ }

  export async function POST(event: APIEvent) {
    if (action === 'search') {
-     const cards: ProspectionCard[] = generateMockCards(category, city, latitude, longitude);
+     const { handleSearchNearbyJobs } = await getProspectionHandlers();
+     const result = await handleSearchNearbyJobs({ latitude, longitude, category: categoryId, radius });
+     const places = result.metadata?.places || [];
+     const cards = places.map(transformPlaceToCard);

      return new Response(JSON.stringify({ cards, category }));
    }
  }
```

**Add to MCP server:**
```diff
// packages/mcp-server/package.json
{
  "exports": {
    ".": "./dist/index.js",
    "./agents": "./dist/agents/index.js",
    "./services": "./dist/services/index.js",
+   "./tools/prospection": "./dist/tools/prospection.js"
  }
}
```

### Phase 2: Add Commute Calculation

**Enhance server function:**
```typescript
// Step 1: Get places
const placesResult = await handleSearchNearbyJobs({ ... });
const places = placesResult.metadata?.places || [];

// Step 2: Batch calculate commutes
const destinations = places.map(p => ({ lat: p.location.lat, lng: p.location.lng }));
const commuteResult = await handleCalculateCommute({
  origin_lat: latitude,
  origin_lng: longitude,
  destinations,
  mode: 'transit'
});
const commutes = commuteResult.metadata?.results || [];

// Step 3: Merge
const cards = places.map((place, i) => ({
  ...transformPlaceToCard(place),
  commuteMinutes: Math.round(commutes[i]?.durationSeconds / 60),
  commuteText: commutes[i]?.durationText,
}));
```

### Phase 3: Add Response Caching

**Implement LRU cache:**
```typescript
import { LRUCache } from 'lru-cache';

const placesCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 60 });

// Check cache before calling MCP tool
```

### Phase 4: Background Prefetch

**Add prefetch endpoint:**
```typescript
// POST /api/prospection with action: 'prefetch'
if (action === 'prefetch') {
  // Fire-and-forget prefetch for top 3 categories
  Promise.all([...]).catch(() => {});
  return new Response(JSON.stringify({ prefetched: true }));
}
```

## Performance Benchmarks

### Expected Latencies

| Operation | Without Cache | With Cache | Notes |
|-----------|---------------|------------|-------|
| Places search (10 results) | 200-500ms | <10ms | Google API RTT + processing |
| Commute calculation (10 destinations) | 300-600ms | <10ms | Distance Matrix API |
| Full prospection flow | 500-1100ms | <20ms | Places + Commute |

### Bottlenecks

1. **Google API RTT** - External HTTP calls are slowest part
2. **Transformation overhead** - Minimal (<5ms for 20 places)
3. **Opik tracing** - Async, non-blocking (<1ms overhead)

### Optimization Targets

- Cache hit rate >70% for repeated searches
- P95 latency <800ms (cold cache)
- P95 latency <50ms (warm cache)

## Sources

**HIGH Confidence - Verified with codebase:**
- MCP Server stdio transport: `/packages/mcp-server/src/index.ts` (lines 77-80)
- Direct import pattern: `/packages/frontend/src/routes/api/agent.ts` (lines 29-37)
- Build externals config: `/packages/frontend/app.config.ts` (lines 14-18, 35-36)
- MCP tool prospection handlers: `/packages/mcp-server/src/tools/prospection.ts`
- Google Maps service: `/packages/mcp-server/src/services/google-maps.ts`
- Package exports: `/packages/mcp-server/package.json` (lines 7-12)
- Workspace setup: Root `package.json` (pnpm workspaces)

**Official Documentation:**
- Model Context Protocol Spec: https://spec.modelcontextprotocol.io/
- SolidStart SSR: https://docs.solidjs.com/solid-start
- Pnpm workspaces: https://pnpm.io/workspaces
