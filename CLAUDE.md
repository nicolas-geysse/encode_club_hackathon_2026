# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stride** is a student financial health navigator for the Encode Club Hackathon 2026 (Financial Health track, sponsored by Comet/Opik). It combines LLM-powered agents with observability to help students manage budgets with 4 killer features: Skill Arbitrage (smart job matching), Swipe Scenarios (Tinder-style strategy selection), Comeback Mode (post-exam recovery detection), and Energy Debt gamification.

## Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Run frontend (http://localhost:3006)
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
│       ├── routes/    # Pages (index.tsx, me.tsx, swipe.tsx, progress.tsx, settings.tsx)
│       │   └── api/   # Server functions (chat.ts, goals.ts, voice.ts, settings/)
│       ├── components/
│       └── lib/
│           ├── chat/          # Modular chat system (33 files)
│           │   ├── intent/    # Intent detection (detector + LLM classifier)
│           │   ├── handlers/  # 5 intent handlers (energy, mission, progress, focus, skip)
│           │   ├── evaluation/# Hybrid eval (heuristics + G-Eval LLM-as-Judge)
│           │   ├── extraction/# Profile extraction (regex + LLM hybrid)
│           │   ├── prompts/   # System prompt templates + versioning
│           │   ├── flow/      # Flow controller for multi-step conversations
│           │   ├── commands/  # Slash commands
│           │   ├── ActionDispatcher.ts  # Generative UI dispatch (slot filling)
│           │   ├── ActionExecutor.ts    # Action execution
│           │   └── proactiveQueue.ts    # Event-driven message queue
│           ├── llm/           # Provider-agnostic LLM client (lazy getters)
│           ├── settingsStore.ts   # Runtime config override (in-memory)
│           └── providerPresets.ts # LLM/STT provider presets
│
└── mcp-server/        # Model Context Protocol server
    └── src/
        ├── agents/    # 4 Mastra agents (budget-coach, job-matcher, guardian, energy-calculator)
        ├── tools/     # MCP tool implementations
        ├── algorithms/# Core logic (retroplanning, skill-arbitrage, comeback, energy-debt)
        ├── evaluation/# Hybrid eval (heuristics + G-Eval LLM)
        └── services/  # DuckDB, LLM, Opik integrations
```

### Tech Stack
- **Frontend**: SolidStart + SolidJS + TailwindCSS, Vinxi for builds
- **Backend**: MCP Server (stdio transport, not HTTP)
- **Agent Orchestration**: Mastra (auto-exports traces to Opik)
- **LLM**: Provider-agnostic via OpenAI SDK (supports Mistral, Groq, OpenAI, etc.)
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

### 4 Screens Navigation
- **Screen 0** (`/`): Onboarding chat with Bruno avatar
- **Screen 1** (`/me`): 5 tabs (Profile, Goals, Budget, Trade, Jobs)
- **Screen 2** (`/swipe`): Tinder-style strategy swiper (standalone page)
- **Screen 3** (`/progress`): Dashboard with timeline, energy history, missions

## Multi-Provider LLM & STT

### Runtime Settings Store (`lib/settingsStore.ts`)

Server-side in-memory `Map` that overrides `process.env` at runtime. Allows the frontend to push API keys and config via `POST /api/settings/apply` without restarting.

- **Priority**: `store` (runtime) > `process.env` > `undefined`
- **API**: `getSetting(key)`, `applySettings(settings)`, `getSettingsSources()`
- **Whitelisted keys**: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `STT_API_KEY`, `STT_BASE_URL`, `STT_MODEL`, `OPIK_API_KEY`, `OPIK_WORKSPACE`, `GOOGLE_MAPS_API_KEY`

```typescript
// ❌ Wrong - reads process.env at module load (undefined in Vite SSR)
const API_KEY = process.env.LLM_API_KEY;

// ✅ Correct - lazy getter via settingsStore
import { getSetting } from '~/lib/settingsStore';
const getApiKey = () => getSetting('LLM_API_KEY');
```

### Provider Presets (`lib/providerPresets.ts`)

Shared config for provider switching, used by `settings.tsx` (UI) and `app.tsx` (auto-apply on startup).

| Service | Provider | Base URL | Default Model |
|---------|----------|----------|---------------|
| LLM | Mistral AI | `https://api.mistral.ai/v1` | `ministral-3b-2512` |
| LLM | Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |
| LLM | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` |
| STT | Groq Whisper | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` |
| STT | Mistral Voxtral | `https://api.mistral.ai/v1` | `voxtral-mini-2602` |

All providers use OpenAI-compatible APIs. `computeSettingsFromConfig(config, apiKeys)` maps UI selections to the settings object for `/api/settings/apply`.

### Settings Page (`/settings`)

- Provider dropdowns for LLM and STT (independent selection)
- API key fields with show/hide toggles, contextual to selected provider
- Server status indicators (green/yellow/red via `GET /api/settings/status`)
- "Apply Settings" → saves to localStorage + pushes to server
- Auto-apply on startup: `app.tsx` reads `stride_provider_config` + `stride_api_keys` from localStorage and calls `/api/settings/apply` on mount

### LLM Client (`lib/llm/client.ts`)

Uses lazy getters via `getSetting()` instead of module-level constants. Auto-detects when apiKey/baseUrl change and recreates the OpenAI client.

- `getLLMClient()` — returns cached or recreated client
- `resetLLMClient()` — forces client recreation (called by `/api/settings/apply`)
- `getProvider()` — auto-detects from baseUrl: `'mistral' | 'groq' | 'gemini' | 'openai'`

## Chat Architecture (Post-Phase 5)

The chat system was refactored from a monolithic `chat.ts` into 33 modular files in `lib/chat/`:

- **`intent/detector.ts`** — Rule-based intent detection (profile-edit, onboarding, energy, mission, etc.)
- **`intent/llmClassifier.ts`** — LLM fallback for ambiguous intents
- **`handlers/`** — 5 extracted handlers: `updateEnergy`, `completeMission`, `progressSummary`, `recommendFocus`, `skipMission`
- **`ActionDispatcher.ts`** — Generative UI dispatch with slot filling
- **`ActionExecutor.ts`** — Executes validated actions against services
- **`proactiveQueue.ts`** — Event-driven message queue with drain receiver (Phase 5)
- **`flow/flowController.ts`** — Multi-step conversation flow
- **`extraction/`** — Hybrid extraction: regex (`patterns.ts`) + LLM (`hybridExtractor.ts`)
- **`evaluation/`** — See Hybrid Evaluation section below
- **`prompts/templates.ts`** — System prompts with `registerPrompt()` for versioning

Main entry point remains `routes/api/chat.ts` but delegates to modular handlers.

## Hybrid Evaluation System

Two-layer quality checks on every chat response (`lib/chat/evaluation/hybridEval.ts`).

**Heuristics (60% weight, fast):**
- `risk_keywords` (30%) — Detects HIGH_RISK_KEYWORDS, accounts for negation context
- `tone` (20%) — Flags overly optimistic or aggressive tone
- `readability` (15%) — Flesch-Kincaid adapted for French (target grade 8-12)
- `disclaimers` (15%) — Checks for appropriate warnings when risk content present
- `length_quality` (20%) — Response length and structure

**G-Eval LLM-as-Judge (40% weight):**
- `appropriateness` (30%) — Adapted to student context
- `safety` (35%) — No risky financial recommendations
- `coherence` (15%) — Logical structure
- `actionability` (20%) — Concrete, actionable steps

Scores logged as Opik feedback: `evaluation.final_score`, `heuristic.*`, `geval.*`.

### Benchmark (`/api/opik/benchmark`)

43 test cases across 5 categories:
- `valid` (5) — Safe student budget/goal requests
- `subtle_violation` (4) — Risky topic probes (gambling, trading, dropshipping)
- `aggressive` (4) — High-risk requests (crypto loans, tax evasion)
- `borderline` (4) — Edge cases needing disclaimers
- `intent` (26) — Intent detection accuracy

Safety evaluation uses `HIGH_RISK_KEYWORDS` + extended French risk patterns (paris sportifs, casino, dropshipping, etc.). Results saved as Opik experiments with `intent_match` and `safety_match` feedback scores.

```bash
# Run benchmark
curl -X POST http://localhost:3006/api/opik/benchmark
# Check last results
curl http://localhost:3006/api/opik/benchmark
```

## ESLint Rules

- `no-console: warn` - Use `createLogger` utility instead
- `@typescript-eslint/no-unused-vars: warn` with `^_` pattern for intentionally unused
- SolidJS-specific rules for frontend: `solid/reactivity`, `solid/no-destructure`, `solid/prefer-for`

## SolidJS Patterns & Anti-Patterns

### `<Show>` with `keyed` breaks reactivity

```tsx
// ❌ ANTI-PATTERN: keyed prevents updates when other signals change
<Show when={goal().id} keyed>
  {(goalId) => (
    <ChildComponent data={otherSignal()} />  // Won't update when otherSignal changes!
  )}
</Show>

// ✅ CORRECT: Without keyed, children re-evaluate on any signal change
<Show when={goal().id}>
  <ChildComponent data={otherSignal()} />  // Updates when otherSignal changes
</Show>
```

**Rule**: Only use `keyed` when the content depends SOLELY on the `when` value.

### Computed values must derive from current state

```typescript
// ❌ ANTI-PATTERN: Using historical/adjusted data for future calculations
const savingsForTargetCalc = adjustedSavingsWeeks.reduce(
  (sum, s) => sum + getEffectiveSavingsAmount(s), // Uses manual adjustments from past
  0
);

// ✅ CORRECT: Use current state (margin) for projections
const projectedSavings = baseSavingsWeeks.reduce(
  (sum, s) => sum + s.amount, // Based on current margin
  0
);
```

**Rule**: Distinguish **projected** (based on current state) from **actual** (with historical adjustments).

### API parameter naming must be semantic

```typescript
// ❌ ANTI-PATTERN: Misleading parameter names
return {
  actualTotalSavings: projectedTotalSavings, // Confusing! It's a projection, not actual
};

// ✅ CORRECT: Clear, semantic naming
return {
  projectedSavingsBasis: projectedTotalSavings,  // For target calculations
  actualTotalSavings: adjustedTotalSavings,      // For tracking real progress
};
```

### Chart.js: Use named lookups, not indices

```typescript
// ❌ ANTI-PATTERN: Fragile indices that break if order changes
if (chartData.datasets[0]) chartData.datasets[0].data = goalData;
if (chartData.datasets[1]) chartData.datasets[1].data = paceData;

// ✅ CORRECT: Named lookups are robust to reordering
const goalDataset = chartData.datasets.find(d => d.label === 'Goal');
const paceDataset = chartData.datasets.find(d => d.label === 'Required Pace');
if (goalDataset) goalDataset.data = goalData;
if (paceDataset) paceDataset.data = paceData;
```

### Component size limits

**Target**: Keep components under ~500 lines. Extract sections when a component exceeds ~800 lines.

Large components (>1500 lines) cause:
- Hard-to-trace reactivity bugs
- Difficult mental model of data flow
- Merge conflicts in team settings

**Extraction pattern** (see `src/components/tabs/goals/`):
- Keep orchestration logic in parent
- Extract self-contained UI sections
- Pass state accessors as props (not raw values) for SolidJS reactivity

## Opik Tracing

Every recommendation has traces with span hierarchy:
- Top-level: `student_session` or `swipe_session`
- Nested spans: `skill_arbitrage_calculation` → `graph_job_matching` → results
- Every span has `user_id` and relevant attributes

Traced endpoints in frontend: `chat.onboarding`, `chat.conversation`, `chat.extraction`, `chat.generation`, `voice.transcription`, `tab-tips`, `budget.insights`, `opik.metrics`.

Wrap new LLM operations with the trace function from `lib/opik.ts` (frontend) or `services/opik.ts` (MCP).

### Prompt Versioning Pattern

When creating new traced tools, include prompt metadata for regression detection.

**⚠️ SDK Bug Workaround**: The Opik TypeScript SDK (v1.9.98+) has a bug where `trace.update({ metadata })` does not persist metadata. You MUST pass metadata in the initial `traceOptions` instead.

```typescript
import { trace, type TraceOptions, registerPrompt } from '../lib/opik';

// Register prompt at module load (generates hash)
const PROMPT_METADATA = registerPrompt('my-agent-id', MY_SYSTEM_PROMPT);

// ✅ CORRECT: Pass metadata in traceOptions (persists correctly)
const traceOptions: TraceOptions = {
  source: 'my_source',
  metadata: {
    'prompt.name': PROMPT_METADATA.name,
    'prompt.version': PROMPT_METADATA.version,
    'prompt.hash': PROMPT_METADATA.hash,
  },
};

return trace('tool.my_new_tool', async (ctx) => {
  ctx.setAttributes({ /* input/output attrs - these work */ });
  // ...
}, traceOptions);

// ❌ WRONG: setPromptAttributes uses update() internally - metadata is LOST
// setPromptAttributes(ctx, 'my-agent-id');  // Don't use this!
```

This adds `prompt.name`, `prompt.version`, `prompt.hash` to the trace metadata, enabling:
- Filtering traces by prompt version in Opik dashboard
- Regression detection when prompts change
- Correlation of quality metrics with specific prompt versions

**Related bug report**: Opik SDK GitHub issue (trace.update metadata not persisting)

## Environment Variables

Required:
- `LLM_API_KEY` - LLM provider API key (Mistral, Groq, OpenAI, or any OpenAI-compatible)
- `LLM_BASE_URL` - Provider base URL (e.g. `https://api.mistral.ai/v1`, default: `https://api.groq.com/openai/v1`)
- `LLM_MODEL` - Model name (e.g. `ministral-3b-2512`, default: `llama-3.1-8b-instant`)
- `OPIK_API_KEY` + `OPIK_WORKSPACE` - For Opik Cloud (or `OPIK_BASE_URL` for self-hosted)

Optional:
- `GEMINI_API_KEY` - Google Gemini API key (from [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
- `GROQ_API_KEY` - Groq API key (LLM fallback + Whisper STT)
- `STT_API_KEY` + `STT_BASE_URL` + `STT_MODEL` - Override speech-to-text provider (default: Groq Whisper)
- `GOOGLE_MAPS_API_KEY` - For Prospection tab (Google Places + Distance Matrix APIs)

All keys can be set at runtime via `/settings` UI or `POST /api/settings/apply` (see Runtime Settings Store).

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

## DuckDB Pitfalls

### Shared database between frontend and MCP server

Frontend and MCP server open the **same DuckDB file** (`data/stride.duckdb`). Both use `CREATE TABLE IF NOT EXISTS` — whichever process starts first "wins" and defines the schema. The other process's CREATE is a no-op.

**Rules for shared tables** (`profiles`, `goals`, `energy_logs`, `skills`, `inventory_items`, `academic_events`, `commitments`, `retroplans`, `goal_achievements`):
- **Always use `profile_id`** (never `user_id`) in all table definitions and queries
- **Frontend's `goals.ts` is the authoritative schema** for the `goals` table: columns are `name`, `amount`, `deadline`, `progress`, `plan_data` (NOT `goal_name`/`goal_amount`/`goal_deadline`)
- MCP adds extra columns (`feasibility_score`, `risk_level`, `weekly_target`) via `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- MCP's `initSchema()` auto-migrates old column names at startup

```typescript
// ❌ Wrong - never use user_id as a column name
WHERE user_id = '${profileId}'

// ✅ Correct - profile_id is the standardized column name
WHERE profile_id = '${profileId}'
```

### `CREATE TABLE IF NOT EXISTS` does NOT migrate columns

`CREATE TABLE IF NOT EXISTS` is a **no-op** if the table already exists, even if the column names differ. This means:
- Renaming a column in a CREATE TABLE statement has **zero effect** on existing databases
- The running DuckDB process keeps the schema **in memory** — deleting the `.duckdb` file while the server runs does nothing (DuckDB recreates it from WAL/memory)

**Always add explicit migrations** when renaming columns. See `duckdb.ts` `initSchema()` for the pattern:

```typescript
// ✅ Correct - auto-migration at startup handles both fresh and existing DBs
const tablesToMigrate = ['goals', 'energy_logs', ...];
for (const table of tablesToMigrate) {
  const cols = await query(`SELECT column_name FROM information_schema.columns
    WHERE table_name = '${table}' AND column_name = 'old_name'`);
  if (cols.length > 0) {
    await execute(`ALTER TABLE ${table} RENAME COLUMN old_name TO new_name`);
  }
}
```

### `COUNT(*)` returns `bigint`, not `number`

DuckDB returns `COUNT(*)` as JavaScript `bigint`. Strict equality `=== 0` fails silently because `BigInt(0) === 0` is `false`.

```typescript
// ❌ Wrong - bigint vs number comparison always false
if (result[0]?.count === 0) { ... }

// ✅ Correct - convert to number first
if (Number(result[0]?.count) === 0) { ... }
```

### WAL corruption auto-recovery

DuckDB uses a Write-Ahead Log (WAL) file (`stride.duckdb.wal`). It can become corrupted when:
- The process is killed mid-write (`Ctrl+C` during a transaction, `kill -9`)
- Two different DuckDB versions open the same file (frontend uses 1.0.0, MCP uses 1.4.1)
- The `.duckdb` file is deleted while the `.wal` file remains

Both `_db.ts` (frontend) and `duckdb.ts` (MCP) have **auto-recovery**: if opening fails with a WAL replay error, they delete both files and retry with a fresh database. Never need to manually delete DB files.

```
// Error you'll see in logs when WAL is corrupted:
INTERNAL Error: Failure while replaying WAL file "...stride.duckdb.wal"
// → Auto-recovered: both .duckdb and .wal deleted, fresh DB created
```

### Init race condition pattern

Use a promise singleton for async initialization to prevent concurrent queries from running before schema is ready:

```typescript
let initPromise: Promise<void> | null = null;
export async function initDatabase(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initSchema();
      initialized = true;
    })();
  }
  await initPromise;
}
```

## Vite SSR Environment Variables

`process.env` is **NOT populated at module load time** in Vite SSR. All environment variables must be read inside `init*()` functions or via lazy getters. Prefer `getSetting()` from `settingsStore.ts` which handles both runtime overrides and `process.env` fallback.

```typescript
// ❌ Wrong - undefined at module load time
const API_KEY = process.env.LLM_API_KEY;

// ✅ Correct - use settingsStore (handles store > process.env > undefined)
import { getSetting } from '~/lib/settingsStore';
const getApiKey = () => getSetting('LLM_API_KEY') || getSetting('GROQ_API_KEY');

// ✅ Also correct - read at runtime inside init (for non-whitelisted keys)
let API_KEY: string | undefined;
export async function initLLM() {
  API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
}
```

## LLM JSON Parsing (Small Models)

Small LLM models (e.g. `ministral-3b-2512`) inject markdown formatting inside JSON values (`**bold**`, `` ```json `` fences). Always use `safeParseJson()` from `services/llm.ts` instead of raw `JSON.parse()`.

```typescript
// ❌ Wrong - breaks on markdown in JSON values
const data = JSON.parse(response);

// ✅ Correct - strips fences, sanitizes markdown, retries
import { safeParseJson } from '../services/llm.js';
const data = safeParseJson<{ title?: string }>(response);
```

## Opik Feedback Timing

Never call `logFeedbackScores()` **inside** a `trace()` callback. The trace hasn't been flushed to Opik Cloud yet, causing 404s. Always call it **after** `trace()` returns.

```typescript
// ❌ Wrong - trace not yet flushed
const result = await trace('my_trace', async (ctx) => {
  await logFeedbackScores(ctx.getTraceId(), scores); // 404!
  return data;
});

// ✅ Correct - trace is flushed after trace() returns
const result = await trace('my_trace', async (ctx) => {
  return { ...data, traceId: ctx.getTraceId() };
});
await logFeedbackScores(result.traceId, scores); // Works!
```

## Testing

### Unit Tests (vitest)
- **MCP algorithms**: 100% coverage (skill-arbitrage, comeback, retroplanning, energy-debt)
- **Frontend components**: GoalsTab, TradeTab, skill data integrity
- Run: `pnpm --filter @stride/mcp-server test`

### Benchmark (43 test cases)
- Safety evaluation: valid, subtle_violation, aggressive, borderline categories
- Intent detection: 26 cases covering onboarding, profile-edit, goals, conversation
- Run: `POST /api/opik/benchmark` — results saved as Opik experiment

### Not unit-tested (hackathon scope)
- Chat system (`lib/chat/`), API routes, budgetEngine, settingsStore, LLM client
- No CI/CD pipeline

## Important Notes

- DuckDB native module requires external dependency config in `app.config.ts` for SSR
- DuckPGQ extension is optional (gracefully degrades)
- Energy Debt and Comeback Mode are mutually exclusive states
- tsc does NOT copy non-TS files (`.sql`, `.json`) to `dist/`. Use `PROJECT_ROOT` paths for these assets.
- **pnpm v10+**: Run `pnpm install --ignore-scripts=false` if native bindings aren't compiled
- LLM/STT providers can be switched at runtime via `/settings` without restart
