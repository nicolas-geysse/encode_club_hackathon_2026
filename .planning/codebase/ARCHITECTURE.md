# Architecture

**Analysis Date:** 2026-01-31

## Pattern Overview

**Overall:** Monorepo with **SolidStart (SSR) frontend** + **MCP (Model Context Protocol) stdio server** backend, separated by transport layer. Frontend uses `Server Functions` for direct API calls to DuckDB; MCP server uses tool-based RPC for Claude/external clients. Both layers share Mastra agents for LLM orchestration and Opik for observability.

**Key Characteristics:**
- **Dual Transport:** Frontend uses SolidStart server functions (in-process); MCP uses stdio protocol (external process)
- **Shared LLM Layer:** Both use Mastra agents + Groq LLM, traces unified in Opik
- **Single Database:** DuckDB (persistent file-based) shared between frontend and MCP
- **Isolated Chat Contexts:** Each tab in frontend maintains separate chat memory; only onboarding is conversational
- **Profile Scenarios:** Support parent-child profiles for exploring alternatives without losing base profile
- **Simulation Time:** DuckDB stores simulation offset for testing energy debt/comeback without real time delays

## Layers

**Frontend (SolidStart + SolidJS):**
- Purpose: User-facing SSR app with 3 screens (onboarding, plan dashboard, suivi dashboard)
- Location: `packages/frontend/src`
- Contains: Components (SolidJS), routes (pages and server functions), UI library, services (profileService, goalService, etc.)
- Depends on: DuckDB (native module via nativeModule helper), Opik SDK, Groq SDK, Mastra agents (imported from mcp-server workspace)
- Used by: Browser clients (desktop/mobile via Vinxi)

**Server Functions (SolidStart):**
- Purpose: In-process API layer for frontend, handles DuckDB queries and LLM calls
- Location: `packages/frontend/src/routes/api/*.ts`
- Contains: 20+ endpoints for CRUD, chat, goals, profiles, simulation, trades, swipe, analytics
- Depends on: DuckDB connection (`_db.ts`), frontend services, Mastra agents, Opik tracing
- Used by: Frontend components via `server$` wrapper

**MCP Server (Model Context Protocol):**
- Purpose: External LLM interface via stdio transport, accessed by Claude/automation tools
- Location: `packages/mcp-server/src/index.ts`
- Contains: Tool registry with 50+ tools grouped into categories (LLM, Graph, ML, Voice, Goal, Profile, Simulation, etc.)
- Depends on: Tool handlers in `tools/`, Mastra agents, DuckDB service wrapper
- Used by: Claude desktop app, external MCP clients

**Mastra Agents (Core Intelligence):**
- Purpose: Multi-agent orchestration for recommendations and analysis
- Location: `packages/mcp-server/src/agents/`
- Contains: 4 main agents (budget-coach, job-matcher, guardian, projection-ml) + helpers
- Depends on: Groq LLM, DuckDB queries, algorithms, evaluation modules
- Used by: Frontend server functions, MCP tools, workflows

**Algorithms (Business Logic):**
- Purpose: Deterministic calculations for financial decisions
- Location: `packages/mcp-server/src/algorithms/`
- Contains: `skill-arbitrage.ts` (job scoring), `energy-debt.ts`, `comeback-detection.ts`, `retroplanning.ts`
- Depends on: Evaluation module (heuristics)
- Used by: Agents, tools, workflows

**Evaluation & Validation:**
- Purpose: Hybrid quality assessment (heuristic + LLM G-Eval)
- Location: `packages/mcp-server/src/evaluation/`
- Contains: Heuristics (readability, risk keywords, tone), G-Eval criteria, aggregation logic
- Depends on: Groq LLM, prompt registry
- Used by: Agents (Guardian layer), workflows

**Services (Cross-cutting):**
- Purpose: Shared utilities for LLM, database, observability
- Location: `packages/mcp-server/src/services/` and `packages/frontend/src/lib/`
- Contains: `opik.ts` (tracing), `groq.ts` (LLM), `duckdb.ts` (queries), `embeddings.ts`, Google Maps integration
- Depends on: External APIs (Groq, Opik, Google)
- Used by: All layers

**Data Persistence:**
- Purpose: Single source of truth for all student/profile data
- Location: `data/stride.duckdb` (file-based) + `data/simulation_state` table
- Contains: profiles, goals, skills, expenses, energy logs, simulation metadata, graph nodes/edges
- Accessed by: Frontend (`_db.ts`), MCP (query service), both wrapped with checksums and error handling

## Data Flow

**Frontend Chat Flow (Onboarding + Tabs):**

1. User types message in chat component (`OnboardingChat`, `ChatTab`)
2. Component calls server function `POST /api/chat` via `server$()` wrapper
3. Server function receives message + context (profileId, tab, timeContext)
4. Mastra agent executes intent detection → extraction (regex or Groq) → validation
5. Algorithm layer computes recommendations (skill arbitrage, energy check, etc.)
6. Guardian validates output quality (heuristics + G-Eval)
7. Opik traces entire flow with span hierarchy
8. Response rendered as composite UI components (metrics, tables, charts, text)

**Tab Data Updates (Profile, Goals, Skills, Budget, etc.):**

1. Tab component detects unsaved changes (dirty form state)
2. Component calls appropriate server function (`/api/goals`, `/api/budget`, `/api/profiles`)
3. Server function validates input, formats for DuckDB
4. Debounced profileService.save() queues write to DuckDB (500ms debounce)
5. If DuckDB fails, falls back to localStorage
6. Opik logs save operation with profile metadata

**MCP Tool Invocation (External Clients):**

1. Claude/external client sends tool call via stdio transport
2. MCP server receives, routes to `handleTool(name, args)`
3. Tool handler imports algorithm/agent module, executes logic
4. Returns structured result with UI-compatible format (composite, table, chart, text types)
5. Traces auto-exported to Opik with tool name + attributes

**Workflow Chain (Mastra Multi-Agent):**

1. Frontend calls `/api/agent` or MCP calls `analyze_student_profile`
2. Triggers `runStudentAnalysis(profile)` workflow
3. Workflow orchestrates agents sequentially:
   - `budget-coach`: Analyzes income vs expenses
   - `job-matcher`: Skill arbitrage + graph traversal
   - `projection-ml`: Graduation balance forecast
   - `guardian`: Validates all recommendations
4. Each agent wrapped in span with attributes
5. Returns unified AnalysisResult with synthesis
6. Frontend renders composite components from result

**Profile Switching (Active Profile):**

1. User selects profile from dropdown
2. Server function `/api/profiles/switch` updates `active_profile` metadata
3. All subsequent API calls use active profile ID
4. Child profiles inherit parent data until modified (immutable view pattern)

**Simulation Time Manipulation:**

1. Debug UI or test API calls `/api/simulation/advance-day?days=N`
2. Server function updates `simulation_state.time_offset` in DuckDB
3. All date calculations use `getReferenceDate()` which adds offset
4. Energy calculations, deadline checks, comeback detection use simulated time
5. Resets to real date on app restart or explicit reset

## Key Abstractions

**ProfileService (`packages/frontend/src/lib/profileService.ts`):**
- Purpose: Unified interface for profile CRUD with DuckDB persistence
- Methods: `getActiveProfile()`, `saveProfile()`, `listProfiles()`, `switchProfile()`, `duplicateProfile()`
- Pattern: Debounced async writes, localStorage fallback, event bus notifications
- Location in code: Used by all tab components and server functions

**Server Function Wrapper (`@solidjs/start/server`):**
- Purpose: Declare functions that run on server only, called from client transparently
- Pattern: `export const myServerFunction = server$(async (arg) => { /* DB access */ })`
- Used in: `packages/frontend/src/routes/api/` for all CRUD endpoints
- Advantage: Type-safe client-server boundary, no API routing boilerplate

**Mastra Agent Factory (`packages/mcp-server/src/agents/factory.ts`):**
- Purpose: Consistent agent creation with shared config (model, tools, system prompt)
- Pattern: `createStrideAgent(agentId, systemPrompt, tools)` with registration
- Used by: All 4 agents (budget-coach, job-matcher, guardian, projection-ml)
- Advantage: Unified Opik tracing, consistent prompt hashing

**Opik Tracing Wrapper (`packages/mcp-server/src/services/opik.ts` + `packages/frontend/src/lib/opik.ts`):**
- Purpose: Wrap LLM operations with automatic span creation and metadata
- Pattern: `trace('operation_name', async (ctx) => { ctx.setAttributes(...); ... })`
- Metadata: Prompt hash, version, user_id, input/output attributes
- Used by: All agents, tools, server functions
- Advantage: Full observability without instrumentation code in business logic

**DuckDB Singleton (`packages/frontend/src/routes/api/_db.ts`):**
- Purpose: Single persistent connection per process, survives Vite HMR
- Pattern: `globalThis['__stride_duckdb_v2__']` stores db/conn/writeQueue
- Methods: `query()`, `execute()`, `executeSchema()`, `queryWrite()`
- Features: Write queue to prevent WAL conflicts, periodic checkpoints, graceful shutdown
- Used by: All server functions via imports

**DuckDB Graph Queries (`packages/mcp-server/src/graph/`):**
- Purpose: Knowledge graph for job-skill relationships and budget optimizations
- Tables: `student_nodes` (skills, jobs, expenses, careers), `student_edges` (enables, reduces, leads_to)
- Pattern: SQL joins with JSON property extraction for flexibility
- Used by: `match_jobs`, `find_optimizations`, `career_projection` tools
- Fallback: Mock data if graph not initialized

**WorkingMemory for Chat (`packages/frontend/src/lib/mastra/workingMemory.ts`):**
- Purpose: Maintain conversation state within a tab without persistence
- Pattern: Temporary store for extracted data, prevents re-extraction on same message
- Features: Auto-expiry (configurable), deduplication, context merging
- Used by: Chat server function for improving LLM efficiency

**Time-Aware Date (`packages/frontend/src/lib/timeAwareDate.ts`):**
- Purpose: All date calculations respect simulation offset
- Pattern: `getReferenceDate()` returns simulated date, used instead of `new Date()`
- Fallback: Real date if simulation not running (offset = 0)
- Used by: Energy calculations, deadline checks, comeback detection

## Entry Points

**Frontend Public Page:**
- Location: `packages/frontend/src/routes/index.tsx`
- Triggers: GET /
- Responsibilities: Render onboarding chat screen (Screen 0)

**Plan Dashboard:**
- Location: `packages/frontend/src/routes/plan.tsx`
- Triggers: GET /plan
- Responsibilities: Render 7-tab dashboard (Screen 1) with tab switching, unsaved changes dialog

**Suivi Dashboard:**
- Location: `packages/frontend/src/routes/suivi.tsx`
- Triggers: GET /suivi
- Responsibilities: Render timeline, energy history, missions/achievements (Screen 2)

**Chat Server Function:**
- Location: `packages/frontend/src/routes/api/chat.ts` (exported as `server$`)
- Triggers: POST /api/chat (via ActionDispatcher)
- Responsibilities: Intent detection, extraction, algorithm execution, response evaluation, Opik tracing

**MCP Server Entry:**
- Location: `packages/mcp-server/src/index.ts`
- Triggers: `pnpm dev:mcp` (stdio transport startup)
- Responsibilities: List tools, route tool calls, return formatted results

**Workflow CLI:**
- Location: `scripts/demo-opik.ts` (uses `runStudentAnalysis` programmatically)
- Triggers: `pnpm demo:opik`
- Responsibilities: Full multi-agent flow for demo/testing

## Error Handling

**Strategy:** Layered with graceful degradation:
1. **Algorithm Layer:** Validation errors raise typed exceptions (e.g., `InvalidSkillError`)
2. **Agent Layer:** Catches algorithm errors, returns `validation.passed = false` with `issues` array
3. **Server Function Layer:** Catches agent errors, returns error response with trace ID for debugging
4. **Frontend Layer:** Displays error message + link to Opik traces

**Patterns:**

**Database Errors:**
```typescript
// Server function wraps DB errors
try {
  const result = await query(sql);
} catch (error) {
  logger.error('DB query failed', { sql, error });
  return { error: 'Database query failed', traceId: getCurrentTraceId() };
}
```

**Algorithm Validation Errors:**
```typescript
// Algorithm throws, agent catches and wraps
if (skills.length === 0) {
  throw new Error('No skills provided');
}
// Agent catches:
const validation = { passed: false, issues: ['No skills provided'] };
```

**Non-blocking Failures (Embedding, Opik):**
```typescript
// Embedding failure doesn't block save
try {
  await triggerProfileEmbedding(profile);
} catch (error) {
  logger.warn('Embedding failed - proceeding anyway');
}
```

## Cross-Cutting Concerns

**Logging:**

- **Framework:** Custom `createLogger()` utility (`packages/frontend/src/lib/logger.ts`)
- **ESLint Rule:** `no-console: warn` - use logger instead
- **Pattern:** `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
- **Used by:** All modules with module name as category
- **Format:** `[Module] message with { context }`

**Validation:**

- **Input Validation:** Zod schemas in Mastra tools (define `inputSchema` for type safety)
- **Business Logic Validation:** Guardian agent runs hybrid checks (heuristics + G-Eval)
- **Database Validation:** Server functions normalize before insert (e.g., `normalizeExpenses()`)

**Authentication:**

- **Approach:** No built-in auth (student app context)
- **Profile Identification:** profileId passed via session/URL parameter
- **Isolation:** Each profile has separate data, no cross-profile queries

**Tracing & Observability:**

- **Framework:** Opik (Comet product)
- **Pattern:** Every LLM operation wrapped with `trace()` function
- **Span Hierarchy:** `student_session` → `skill_arbitrage` → `graph_job_matching` → results
- **Metadata:** Prompt hash, version, user_id, attributes set at each level
- **Export:** Auto-exported by Mastra agents to Opik Cloud (configured via env vars)
- **Metadata Bug Workaround:** Use `traceOptions` constructor, NOT `trace.update()` (SDK issue)

---

*Architecture analysis: 2026-01-31*
