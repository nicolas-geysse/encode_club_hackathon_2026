# Stride - Project Context for AI Agents

> Concise reference for AI agents implementing features in this codebase.

## Quick Facts

- **Type**: Monorepo (pnpm workspaces)
- **Frontend**: SolidJS + SolidStart + TailwindCSS
- **Backend**: MCP Server + Mastra agents
- **Database**: DuckDB (single file at `data/stride.duckdb`)
- **LLM**: Provider-agnostic via OpenAI SDK (Mistral, Groq, Gemini, OpenAI...)
- **Default LLM**: Mistral (`ministral-3b-2512`) or Groq (`llama-3.1-8b-instant`)
- **Observability**: Opik (traces all LLM calls)

---

## Critical Rules

### 1. DuckDB in Vite SSR

**ALWAYS use createRequire for DuckDB:**
```typescript
// ✅ Correct
import { duckdb } from '../../lib/nativeModule';

// ❌ Wrong - will fail
import * as duckdb from 'duckdb';
```

### 2. File-Based Routing

- Pages: `packages/frontend/src/routes/*.tsx`
- API routes: `packages/frontend/src/routes/api/*.ts`
- API routes run server-side only

### 3. Agent Tool Pattern

```typescript
// 1. Create tool with Zod schema
export const myTool = createTool({
  id: 'my_tool',
  inputSchema: z.object({ param: z.string() }),
  execute: async (input) => { /* ... */ }
});

// 2. Register in tool registry
registerTool('my_tool', myTool);

// 3. Add to agent config toolNames array
AGENT_CONFIGS.push({
  id: 'my-agent',
  toolNames: ['my_tool']
});
```

### 4. Profile Service Pattern

Always use profileService for profile operations:
```typescript
import { profileService } from '~/lib/profileService';

// Load
const profile = await profileService.loadActiveProfile();

// Save (debounced by default)
await profileService.saveProfile(profile, { immediate: true });
```

### 5. API Route Pattern

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { query, execute, escapeSQL } from './_db';

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const id = url.searchParams.get('id');

  const rows = await query(`SELECT * FROM table WHERE id = ${escapeSQL(id)}`);

  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 6. Opik Tracing

Wrap LLM operations with trace:
```typescript
import { trace } from '../services/opik';

const result = await trace('my_operation', async (span) => {
  span.setAttributes({ 'my.attribute': value });
  // ... operation ...
  return result;
});
```

---

## Key Patterns

### Component Structure

```
components/
├── ui/         # Base primitives (Button, Card, Input)
├── tabs/       # Plan page tabs (ProfileTab, SkillsTab)
├── chat/       # Conversation UI (ChatMessage, ChatInput)
├── swipe/      # Scenario selection (SwipeCard, SwipeSession)
├── suivi/      # Dashboard widgets (TimelineHero, MissionCard)
└── layout/     # Navigation (AppLayout, BottomNav)
```

### Service Files

| Service | Purpose |
|---------|---------|
| `profileService.ts` | Profile CRUD with DuckDB (no localStorage fallback) |
| `skillService.ts` | Skills API client |
| `lifestyleService.ts` | Lifestyle items API client |
| `inventoryService.ts` | Inventory items API client |
| `goalService.ts` | Goals API client |
| `simulationService.ts` | Time simulation for testing |

### Entity Types

Import from canonical source:
```typescript
import type { Skill, LifestyleItem, InventoryItem, Expense } from '~/types/entities';
```

---

## Algorithms

| Algorithm | Trigger | Action |
|-----------|---------|--------|
| **Skill Arbitrage** | Job matching request | Score = rate(30%) + demand(25%) + effort(25%) + rest(20%) |
| **Comeback Detection** | energy current>80% AND previous<50% AND lowWeeks>=2 | Generate catch-up plan |
| **Energy Debt** | 3+ consecutive weeks energy<40% | Reduce targets 50-85% |
| **Swipe Learning** | User swipes right/left | Update preference weights (lr=0.15) |

---

## Database Schema

**Tables** (created lazily in API routes):
- `profiles` - User profiles
- `skills` - User skills with ratings
- `lifestyle_items` - Monthly expenses
- `inventory_items` - Items to sell
- `goals` - Savings goals
- `simulation_state` - Time offset for testing

**Connection**: Use `query()`, `execute()`, `executeSchema()` from `_db.ts`

---

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Run frontend (localhost:3006)
pnpm build                # Build all packages
pnpm lint:fix             # Lint with auto-fix
pnpm typecheck            # Type check all packages
```

---

## Environment Variables

Required:
```
LLM_API_KEY=xxx           # LLM provider API key (Mistral, Groq, OpenAI, etc.)
LLM_BASE_URL=xxx          # Provider base URL (e.g. https://api.mistral.ai/v1)
LLM_MODEL=xxx             # Model name (e.g. ministral-3b-2512)
OPIK_API_KEY=xxx          # Opik Cloud
OPIK_WORKSPACE=xxx        # Opik workspace
```

Optional:
```
GEMINI_API_KEY=xxx        # Google Gemini
GROQ_API_KEY=xxx          # Groq (LLM fallback + Whisper STT)
STT_API_KEY=xxx           # STT provider override
GOOGLE_MAPS_API_KEY=xxx   # Google Maps for Prospection tab
```

---

## File Locations

| What | Where |
|------|-------|
| Main pages | `packages/frontend/src/routes/*.tsx` |
| API routes | `packages/frontend/src/routes/api/*.ts` |
| Components | `packages/frontend/src/components/` |
| Services | `packages/frontend/src/lib/` |
| Types | `packages/frontend/src/types/entities.ts` |
| Agents | `packages/mcp-server/src/agents/` |
| Algorithms | `packages/mcp-server/src/algorithms/` |
| MCP Tools | `packages/mcp-server/src/tools/` |
