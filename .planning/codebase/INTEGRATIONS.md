# External Integrations

**Analysis Date:** 2026-01-31

## APIs & External Services

**LLM Providers:**
- **Groq** - Primary LLM for recommendations, budget analysis, and chat
  - SDK/Client: `groq-sdk@0.37.0`
  - Auth: `GROQ_API_KEY` (required)
  - Model: `llama-3.1-70b-versatile` (default) or `llama-3.1-8b-instant`, `mixtral-8x7b-32768`
  - Whisper Model: `whisper-large-v3-turbo` (for speech-to-text)
  - Pricing: Integrated in `packages/mcp-server/src/services/groq.ts` (cost calculation)
  - Usage: Backend agents, frontend chat API (`packages/frontend/src/routes/api/chat.ts`)

- **Google Gemini** - Optional fallback LLM
  - SDK/Client: `@google/generative-ai@0.24.1`
  - Auth: `GEMINI_API_KEY` (optional)
  - Model: `gemini-1.5-flash` (default) or `gemini-1.5-pro`, `gemini-2.0-flash`
  - Pricing: Integrated in `packages/mcp-server/src/services/gemini.ts`
  - Usage: Fallback LLM provider for agent flexibility
  - Implementation: `packages/mcp-server/src/services/gemini.ts`

**Observability & Tracing:**
- **Opik (Comet)** - LLM call tracing and evaluation
  - SDK/Client: `opik@1.9.98`
  - Auth: `OPIK_API_KEY` (optional but recommended)
  - Config: `OPIK_WORKSPACE`, `OPIK_PROJECT`, `OPIK_PROJECT_ID`
  - Endpoints:
    - Cloud: `https://www.comet.com/opik/api/v1/private/otel` (OTLP export)
    - Self-hosted: `http://localhost:4318/v1/traces` (default)
  - Features:
    - Automatic trace export from Mastra agents
    - Span hierarchy: student_session → skill_arbitrage_calculation → graph_job_matching
    - Metadata tracking: prompt version, hash, user_id
    - Feedback scores for quality evaluation
  - Implementation: `packages/frontend/src/lib/opik.ts`, `packages/mcp-server/src/services/opik.ts`
  - Note: SDK bug workaround - metadata must be passed in traceOptions, not via trace.update()

**Maps & Location Services:**
- **Google Maps API** - Location-based job prospection
  - APIs required: Places API, Distance Matrix API
  - Auth: `GOOGLE_MAPS_API_KEY` (optional, for Prospection tab)
  - Usage: Find nearby businesses, calculate commute times
  - Implementation: `packages/mcp-server/src/services/google-maps.ts`
  - Types: Coordinates, Place, DistanceResult

**Search & Market Research:**
- **SERP API** - Job market enrichment (optional)
  - Auth: `SERP_API_KEY` (optional, 250 free searches/month)
  - Usage: Additional job market data, skill demand analysis
  - Implementation: Referenced in `.env.example` but integration status TBD

## Data Storage

**Databases:**
- **DuckDB** (Primary - Single-file SQL database)
  - Version: Frontend 1.4.1, MCP-Server 1.0.0
  - Connection: Native file-based (no server)
  - Path: `./data/stride.duckdb` (configurable via `DUCKDB_PATH`)
  - Client: Native DuckDB library (async constructor with callback)
  - Features:
    - Write queue serialization (prevents concurrent write issues)
    - Process-level lock file (`{DB_PATH}.app.lock`)
    - Retry logic for transient errors
    - DuckPGQ extension for graph queries (skill→job matching)
  - Schemas: Profiles, goals, academic_events, simulation_state, projections, chat_history
  - Implementation: `packages/frontend/src/routes/api/_db.ts`, `packages/mcp-server/src/services/duckdb.ts`
  - Frontend access: Via `profileService.ts` with 500ms debounced saves
  - Fallback: localStorage if API is down

**File Storage:**
- Local filesystem only (no cloud storage)
- Data directory: `./data/` (created automatically)
- DuckDB file: `stride.duckdb`

**Caching:**
- In-memory: Opik trace cache (activeTraces Map for race condition prevention)
- LocalStorage: Fallback for profile data if DuckDB unavailable
- Write queue: Serialized writes via Promise chain in DuckDB service

## Authentication & Identity

**Auth Provider:**
- Custom (no third-party auth service)
  - Implementation: Profile-based with optional parent-child relationships
  - Profile types: Student (primary), simulated scenarios (parent_profile_id)
  - Simulation state: Time offset tracking (for testing energy debt/comeback without weeks of waiting)

**No OAuth/SSO:**
- All authentication is implicit (no login system)
- Profiles are session-based with optional persistence to DuckDB

## Monitoring & Observability

**Error Tracking:**
- Opik (via trace metadata and feedback scores)
- Console logging via createLogger utility (CLAUDE.md: use instead of console)

**Logs:**
- Server: console.error (stderr) for DuckDB lock messages, Opik initialization
- Frontend: createLogger utility in `packages/frontend/src/lib/logger.ts`
- Log levels: debug, info, warn, error, none (configured via `LOG_LEVEL` env var)
- Opik debug logs: `ENABLE_OPIK=true` (feature flag), realtime mode via `ENABLE_REALTIME_OPIK`

**Traces:**
- Every recommendation traced with span hierarchy
- Metadata: user_id, profile_id, prompt version/hash (for regression detection)
- Evaluation: G-Eval LLM scoring + hybrid heuristics in `packages/mcp-server/src/evaluation/`

## CI/CD & Deployment

**Hosting:**
- Docker deployment (Dockerfile provided for multi-stage build)
- Node 20 Debian Slim base
- Port 3000 exposed
- Health check: `curl http://localhost:3000/`

**CI Pipeline:**
- Not detected in codebase (GitHub Actions config not found)

**Build Process:**
1. Frontend built first: `pnpm build:frontend`
2. MCP-server built first: `pnpm build:mcp` (frontend imports from it)
3. Both use TypeScript compiler (tsc)
4. Frontend postbuild: Sharp image processing via `packages/frontend/scripts/postbuild.mjs`
5. Vite SSR optimization with rollup external config

## Environment Configuration

**Required env vars:**
- `GROQ_API_KEY` - LLM provider authentication
- `DUCKDB_PATH` - Database file location (default: `./data/stride.duckdb`)

**Recommended env vars:**
- `OPIK_API_KEY` + `OPIK_WORKSPACE` - For LLM tracing
- `OPIK_BASE_URL` - For self-hosted Opik

**Optional env vars:**
- `GOOGLE_MAPS_API_KEY` - For Prospection tab
- `GEMINI_API_KEY` - For Gemini fallback LLM
- `SERP_API_KEY` - For job market research
- `ENABLE_OPIK` - Master switch for tracing (default: true)
- `ENABLE_REALTIME_OPIK` - Realtime span export (default: false, batch mode)
- `LOG_LEVEL` - Opik debug output (debug | info | warn | error | none)
- `NODE_ENV` - Set to 'production' for deployment
- `PORT` - Frontend port (default: 3006)
- `VITE_DEBUG` - Frontend debug mode (default: false)

**Secrets location:**
- `.env` file (git-ignored)
- Environment variables in container runtime
- CLAUDE.md warns against committing .env files

## Webhooks & Callbacks

**Incoming:**
- Chat API endpoints: `POST /api/chat` (frontend, `packages/frontend/src/routes/api/chat.ts`)
- Goal API endpoints: `POST /api/goals` (frontend, `packages/frontend/src/routes/api/goals.ts`)
- Voice API endpoint: `POST /api/voice` (frontend, `packages/frontend/src/routes/api/voice.ts`)
- Feedback endpoint: `POST /api/feedback` (frontend, `packages/frontend/src/routes/api/feedback.ts`)
- Profile endpoints: GET/POST `packages/frontend/src/routes/api/profiles.ts`

**Outgoing:**
- Opik OTLP telemetry export (automatic from Mastra agents and SDK)
- No webhook callbacks to external services detected

## MCP Tools & Agents

**MCP Server:**
- Implementation: `packages/mcp-server/src/index.ts`
- Transport: stdio (not HTTP)
- Tools available: `packages/mcp-server/src/tools/`
  - Profile management (profile.ts)
  - Goal planning (goal.ts)
  - DuckDB queries (duckdb-mcp.ts)
  - RAG tools (rag-tools.ts, rag.ts)
  - Swipe preferences (swipe.ts)
  - Simulation state (simulation.ts)
  - Voice processing (voice.ts)
  - Browser/scraping (browser.ts)
  - Prospection (job discovery, google-maps.ts)

**Agents:**
- Budget Coach - Budget analysis and advice
- Job Matcher - Skill arbitrage scoring
- Guardian - Energy debt/comeback detection
- Energy Calculator - Energy projections
- Onboarding Agent - Initial profiling chat
- Money Maker - Income optimization
- Projection ML - Time series forecasting
- Strategy Comparator - Swipe scenario evaluation
- Tips Orchestrator - Personalized recommendations

Implementation: `packages/mcp-server/src/agents/`

---

*Integration audit: 2026-01-31*
