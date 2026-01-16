# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stride** is a student financial health navigator for the Encode Club Hackathon 2026 (Financial Health track, sponsored by Comet/Opik). It combines LLM-powered agents with observability to help students manage budgets with 4 killer features: Skill Arbitrage (smart job matching), Swipe Scenarios (Tinder-style strategy selection), Comeback Mode (post-exam recovery detection), and Energy Debt gamification.

## Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Run frontend (http://localhost:3000)
pnpm dev:mcp              # Run MCP server (stdio transport)

# Building
pnpm build                # Build all packages
pnpm build:frontend       # Build frontend only
pnpm build:mcp            # Build MCP server only

# Quality
pnpm lint                 # Lint all packages
pnpm lint:fix             # Lint with auto-fix
pnpm format               # Format code with Prettier
pnpm typecheck            # Type check all packages

# Testing
pnpm --filter @stride/mcp-server test   # Run vitest tests
./scripts/test-api.sh                    # curl-based API tests
```

## Architecture

### Monorepo Structure (pnpm workspaces)
```
packages/
├── frontend/          # SolidStart (SSR meta-framework for SolidJS)
│   └── src/
│       ├── routes/    # Pages (index.tsx, plan.tsx, suivi.tsx)
│       │   └── api/   # Server functions (chat.ts, goals.ts, voice.ts)
│       ├── components/
│       └── lib/       # profileService, utilities
│
└── mcp-server/        # Model Context Protocol server
    └── src/
        ├── agents/    # 4 Mastra agents (budget-coach, job-matcher, guardian, energy-calculator)
        ├── tools/     # MCP tool implementations
        ├── algorithms/# Core logic (retroplanning, skill-arbitrage, comeback, energy-debt)
        ├── evaluation/# Hybrid eval (heuristics + G-Eval LLM)
        └── services/  # DuckDB, Groq, Opik integrations
```

### Tech Stack
- **Frontend**: SolidStart + SolidJS + TailwindCSS, Vinxi for builds
- **Backend**: MCP Server (stdio transport, not HTTP)
- **Agent Orchestration**: Mastra (auto-exports traces to Opik)
- **LLM**: Groq (llama-3.1-70b-versatile)
- **Database**: DuckDB (single file) + DuckPGQ (graph extension for skill→job queries)
- **Observability**: Opik (Comet) for tracing every recommendation

### Data Flow
```
Frontend Components → Server Functions (routes/api/*.ts) → MCP Tools → Mastra Agents + Services
                                       ↓
                              DuckDB (profileService)
```

### Key Patterns

1. **Chat isolation by tab**: Each tab chat is intentionally isolated (no cross-tab memory). Only the onboarding chat is conversational with progressive questions.

2. **Server Functions vs MCP Tools**: Server functions (`routes/api/*.ts`) for frontend-initiated requests; MCP tools for external clients (Claude, other tools).

3. **Profile duplication**: Supports parent-child profiles (`parent_profile_id`, `profile_type`) for exploring alternate scenarios.

4. **Simulation state**: DuckDB `simulation_state` table tracks time offset for testing energy debt/comeback without waiting weeks.

5. **Debounced auto-save**: `profileService.ts` debounces saves to DuckDB (500ms), falls back to localStorage if API is down.

### 4 Core Algorithms

| Algorithm | Purpose |
|-----------|---------|
| **Comeback Detection** | Detects energy recovery (>80%) after low periods (<40%), creates catch-up plans |
| **Skill Arbitrage** | Multi-criteria job scoring: `rate (30%) + demand (25%) + effort (25%) + rest (20%)` |
| **Swipe Preference Learning** | Updates weights (effort_sensitivity, hourly_rate_priority, time_flexibility) based on swipes |
| **Energy Debt** | ≥3 consecutive weeks with energy <40% triggers target reduction + achievement |

### 3 Screens Navigation
- **Screen 0** (`/`): Onboarding chat with Bruno avatar
- **Screen 1** (`/plan`): 6 tabs (Setup, Skills, Inventory, Lifestyle, Trade, Swipe)
- **Screen 2** (`/suivi`): Dashboard with timeline, energy history, missions

## ESLint Rules

- `no-console: warn` - Use `createLogger` utility instead
- `@typescript-eslint/no-unused-vars: warn` with `^_` pattern for intentionally unused
- SolidJS-specific rules for frontend: `solid/reactivity`, `solid/no-destructure`, `solid/prefer-for`

## Opik Tracing

Every recommendation has traces with span hierarchy:
- Top-level: `student_session` or `swipe_session`
- Nested spans: `skill_arbitrage_calculation` → `graph_job_matching` → results
- Every span has `user_id` and relevant attributes

Wrap new LLM operations with the trace function from `services/opik.ts`.

## Environment Variables

Required:
- `GROQ_API_KEY` - LLM provider
- `OPIK_API_KEY` + `OPIK_WORKSPACE` - For Opik Cloud (or `OPIK_BASE_URL` for self-hosted)

## Native Modules in Vite SSR

Vite SSR transforms ESM imports in a way incompatible with native Node.js modules (`.node` bindings). Direct `import * as duckdb from 'duckdb'` will fail.

**Solution**: Use `createRequire` to load native modules via CommonJS:

```typescript
// ❌ Wrong - fails in Vite SSR
import * as duckdb from 'duckdb';

// ✅ Correct - use the helper
import { duckdb } from '../../lib/nativeModule';
```

Files:
- `src/lib/nativeModule.ts` - Generic helper for loading native modules
- `src/types/duckdb.d.ts` - Local type definitions (avoids import conflicts)
- `src/routes/api/_db.ts` - Uses the helper for DuckDB

When adding new native modules:
1. Add a pre-loaded export in `nativeModule.ts`
2. Create local types if needed in `src/types/`
3. Configure `external` in `app.config.ts` if needed for bundling

## Important Notes

- DuckDB native module requires external dependency config in `app.config.ts` for SSR
- Frontend and backend use different DuckDB versions (1.4.1 vs 1.0.0)
- DuckPGQ extension is optional (gracefully degrades)
- Energy Debt and Comeback Mode are mutually exclusive states
- **pnpm v10+**: Run `pnpm install --ignore-scripts=false` if native bindings aren't compiled
