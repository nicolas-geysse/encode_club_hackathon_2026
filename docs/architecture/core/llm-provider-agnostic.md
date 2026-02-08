# Provider-Agnostic LLM Architecture

## Overview

Stride uses a **provider-agnostic LLM architecture** that supports any OpenAI-compatible API provider through environment variables. This allows switching between Groq, Mistral, OpenAI, OpenRouter, or any compatible provider without code changes.

## Environment Variables

### LLM (Chat Completions)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (required) | API key for the LLM provider |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Provider base URL |
| `LLM_MODEL` | `llama-3.1-8b-instant` | Model name |

Legacy fallbacks: `GROQ_API_KEY`, `GROQ_MODEL` (deprecated, kept for backward compat).

### STT (Speech-to-Text / Transcription)

| Variable | Default | Description |
|----------|---------|-------------|
| `STT_API_KEY` | `$GROQ_API_KEY` | API key for transcription provider |
| `STT_BASE_URL` | `https://api.groq.com/openai/v1` | Transcription API base URL |
| `STT_MODEL` | `whisper-large-v3-turbo` | Transcription model name |

## Switching Providers

### Example: Mistral

```env
LLM_API_KEY=your-mistral-key
LLM_BASE_URL=https://api.mistral.ai/v1
LLM_MODEL=ministral-3b-2512
```

### Example: OpenAI

```env
LLM_API_KEY=sk-your-openai-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

### Example: Groq (default)

```env
LLM_API_KEY=gsk_your-groq-key
# LLM_BASE_URL defaults to https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
```

### Example: Voxtral Transcription (Mistral)

```env
STT_API_KEY=$LLM_API_KEY
STT_BASE_URL=https://api.mistral.ai/v1
STT_MODEL=voxtral-mini-latest
```

## Architecture

### Vite SSR Compatibility

All env vars are read **at request time** (inside `init*()` functions), not at module load time. This is critical because Vite SSR may not have `process.env` populated when ES modules are first imported.

Pattern used across all services:
```typescript
// BAD: read at module load (breaks in Vite SSR)
const API_KEY = process.env.LLM_API_KEY;

// GOOD: read inside init function (works in Vite SSR)
let API_KEY: string | undefined;
export async function initLLM() {
  API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  // ...
}
```

### Frontend (`packages/frontend/src/lib/llm/client.ts`)

Uses the `openai` npm package with configurable `baseURL`. Singleton pattern with lazy initialization.

### MCP Server (`packages/mcp-server/src/services/llm.ts`)

Same pattern as frontend. Uses `openai` SDK. Includes full Opik tracing with provider-aware tags and pricing. Env vars read in `initLLM()`.

### Speech-to-Text (`packages/mcp-server/src/services/whisper.ts` + `frontend/routes/api/voice.ts`)

Uses `fetch` with multipart form-data to call `/v1/audio/transcriptions`. Compatible with both Groq Whisper and Mistral Voxtral. Env vars read in `initSTT()`.

### Mastra Agents (`packages/mcp-server/src/mastra.config.ts`)

Uses `@ai-sdk/openai` with `createOpenAI({ baseURL })` for provider-agnostic model creation. Model created lazily via `getDefaultModel()`.

### A/B Testing (`packages/mcp-server/src/experiments/providerAB.ts`)

Provider and model variants created lazily on first access. All env vars read at call time.

## Provider Detection

The `detectProvider(baseUrl)` function identifies the provider from the base URL for:
- Opik trace tags (e.g., `['llm', 'mistral']`)
- Cost estimation (per-provider pricing tables)
- Logging

Supported providers: `groq`, `mistral`, `gemini`, `openai`, `openrouter`, `together`, `custom`.

## DuckDB Path Resolution

The MCP server's DuckDB service resolves the project root dynamically:
```typescript
function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('packages/')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}
```
This ensures the correct database path whether running from the monorepo root or from `packages/frontend/`.

## Bug Fixes Applied

### 1. `energy_logs` column name (`tab-context.ts`)
- **Bug**: `SELECT level` referenced non-existent column
- **Fix**: Changed to `SELECT energy_level` and `ORDER BY log_date` (matching actual schema)

### 2. `student_nodes` table not found (`duckdb.ts`)
- **Bug**: Direct query on `student_nodes` crashed if base graph schema wasn't loaded
- **Fix**: Wrapped prospection/skills graph queries in try/catch

### 3. LLM client not initialized in Vite SSR (`llm.ts`, `whisper.ts`, `mastra.config.ts`, `providerAB.ts`)
- **Bug**: `process.env` read at module load time returns undefined in Vite SSR
- **Fix**: All env vars now read inside `init*()` functions or via lazy getters

### 4. Graph schema SQL files not found (`duckdb.ts`)
- **Bug**: `__dirname` in `dist/services/` resolved `../graph/` to `dist/graph/` which doesn't exist (tsc doesn't copy `.sql` files)
- **Fix**: Changed to `path.join(PROJECT_ROOT, 'packages/mcp-server/src/graph')` for schema paths. Added warning log when files are missing.

### 5. JSON parse errors from small LLM models (`llm.ts`, tips-orchestrator, daily-briefing, tab-tips-orchestrator)
- **Bug**: Mistral's `ministral-3b-2512` injects markdown formatting (`**bold**`, `*italic*`, `` ```json `` fences) inside JSON values, breaking `JSON.parse()`
- **Fix**: Created `safeParseJson<T>()` utility in `llm.ts` that: (1) strips markdown code fences, (2) extracts JSON with regex, (3) tries parsing as-is, (4) on failure sanitizes markdown formatting/control chars/trailing commas and retries. Used in all three agent orchestrators.

### 6. Tab-context queries: shared DuckDB schema discovery (`tab-context.ts`)
- **Bug**: MCP `tab-context.ts` initially used `profile_id` (correct), was changed to `user_id` (wrong), then reverted.
- **Root cause**: Frontend and MCP share the SAME DuckDB file. Frontend creates tables first (with `profile_id`). MCP's `CREATE TABLE IF NOT EXISTS` with `user_id` is a no-op since tables already exist.
- **Lesson**: The real schema is always the frontend's (`profile_id`), not MCP's aspirational schema (`user_id`).

### 7. DuckDB init race condition (`duckdb.ts`)
- **Bug**: `initDatabase()` set `initialized = true` before `await initSchema()` completed. Concurrent `query()` calls would see `initialized = true` and skip schema init, hitting non-existent tables.
- **Fix**: Used promise singleton pattern - all concurrent calls await the same init promise. `initialized` is only set after schema is fully created. Internal schema queries use `queryWithRetry` directly to avoid recursion.

### 8. DuckDB `COUNT(*)` returns `bigint`, not `number` (`duckdb.ts`)
- **Bug**: `tablesExist[0]?.count === 0` used strict equality. DuckDB's `COUNT(*)` returns JavaScript `bigint`. `BigInt(0) === 0` is `false`, so the graph schema NEVER loaded.
- **Fix**: Wrapped all count checks with `Number()`: `Number(tablesExist[0]?.count) === 0`

### 9. Unknown swipe agent IDs in agent-executor (`agent-executor.ts`)
- **Bug**: Swipe strategy references agents (`swipe-orchestrator`, `lifestyle-agent`, `essential-guardian`, `ghost-observer`, `asset-pivot`, `cashflow-smoother`) not registered in `executeAgent()` switch, causing warning spam.
- **Fix**: Added explicit cases for swipe agents that return a default response. These agents are tool-based and orchestrated via the swipe-orchestrator, not individually executable.

### 10. Opik feedback 404 on swipe traces (`frontend/src/routes/api/swipe-trace.ts`)
- **Bug**: `logFeedbackScores()` was called INSIDE the `trace()` callback, before the trace was flushed to Opik Cloud. The REST PUT call returned 404 because the trace didn't exist server-side yet.
- **Fix**: Moved `logFeedbackScores()` to AFTER `trace()` returns (which auto-flushes). Fire-and-forget pattern to not block the response.

## Files

| File | Purpose |
|------|---------|
| `mcp-server/src/services/llm.ts` | Unified LLM service (chat, JSON mode, budget analysis) |
| `mcp-server/src/services/whisper.ts` | Speech-to-text service |
| `mcp-server/src/services/llm-provider.ts` | LLM provider interface (`providerName: string`) |
| `mcp-server/src/services/tab-context.ts` | Tab context loading (energy history query fixed) |
| `mcp-server/src/services/duckdb.ts` | DuckDB service (path fix + graph query guards) |
| `mcp-server/src/mastra.config.ts` | Mastra framework + lazy AI SDK model |
| `mcp-server/src/experiments/providerAB.ts` | A/B testing with lazy provider init |
| `mcp-server/src/agents/factory.ts` | Agent factory (uses `getDefaultModel()`) |
| `frontend/src/lib/llm/client.ts` | Frontend unified LLM client |
| `frontend/src/routes/api/voice.ts` | Frontend voice transcription API |
| `frontend/src/routes/settings.tsx` | Settings page (LLM API Key primary) |
| `frontend/src/routes/api/settings/status.ts` | Settings status (checks LLM_API_KEY) |
| `frontend/src/lib/config.ts` | Config (`llmModel` instead of `groqModel`) |
| `frontend/src/routes/api/swipe-trace.ts` | Swipe trace + feedback (timing fix) |
| `mcp-server/src/agents/agent-executor.ts` | Agent executor (swipe agents registered) |

## Dependencies

### Removed
- `groq-sdk` (from both mcp-server and frontend)
- `@ai-sdk/groq` (from mcp-server)

### Added
- `openai` (mcp-server - for provider-agnostic LLM via OpenAI SDK)
- `@ai-sdk/openai` (mcp-server - for Mastra agent model creation)

## Deleted Files
- `mcp-server/src/services/groq.ts` (replaced by `llm.ts` + `whisper.ts`)
