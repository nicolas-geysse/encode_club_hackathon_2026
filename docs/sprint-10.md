# Sprint 10: RAG + Agent Browser + MCP-UI + Tech Debt

## Status: ✅ IMPLEMENTED (2026-01-19)

---

## Overview

Sprint 10 delivered 3 killer features + tech debt cleanup.

| Priority | Item | Status | Files |
|----------|------|--------|-------|
| **🚨 CRITICAL** | DuckDB 1.4.1 Upgrade | ✅ Done | `packages/mcp-server/package.json` |
| **HIGH** | RAG Vector Store (Mastra DuckDB + BGE-M3) | ✅ Done | `services/vectorstore.ts`, `services/embeddings.ts`, `tools/rag.ts` |
| **HIGH** | Agent Browser (géoloc/scraping jobs) | ✅ Done | `tools/browser.ts` |
| **HIGH** | MCP-UI (@seed-ship/mcp-ui-solid) | ✅ Done | `components/chat/MCPUIRenderer.tsx` |
| **MEDIUM** | TD-3: City/Currency Detection | ✅ Done | `lib/cityUtils.ts` |
| **MEDIUM** | TD-4: Smart Merge Helper | ✅ Done | `lib/arrayMergeUtils.ts` |
| **MEDIUM** | DuckDB MCP Tools | ✅ Done | `tools/duckdb-mcp.ts` |
| **LOW** | Component Tests | ✅ Done | `GoalsTab.test.tsx`, `TradeTab.test.tsx` |

---

## Architecture Implemented

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (SolidStart)                     │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ OnboardChat │  │ MCPUIRenderer   │  │ Plan/Suivi Tabs     │  │
│  │             │  │ (mcp-ui-solid)  │  │                     │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  lib/cityUtils.ts  │  lib/arrayMergeUtils.ts               ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────────┘
                            │ API Routes
┌───────────────────────────┼─────────────────────────────────────┐
│                     MCP Server (Mastra)                          │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Agents      │  │ RAG Tools       │  │ Browser Tools       │  │
│  │ (existing)  │  │ (rag-tools.ts)  │  │ (browser.ts)        │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           tools/duckdb-mcp.ts (@seed-ship/duckdb-mcp-native)││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ services/vectorstore.ts    │  services/embeddings.ts       ││
│  │ @mastra/duckdb (1024 dims) │  @xenova/transformers BGE-M3  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: DuckDB 1.4.1 Upgrade ✅

### Changes
- Upgraded `packages/mcp-server/package.json`: `duckdb: 1.0.0` → `duckdb: 1.4.1`
- Aligned with frontend version for consistency
- No breaking changes in existing queries

---

## Phase 1: RAG Vector Store ✅

### New Files

**`packages/mcp-server/src/services/vectorstore.ts`**
```typescript
// DuckDB Vector Store using @mastra/duckdb
// 1024-dimensional embeddings with cosine similarity
// Indexes: student_profiles, advice_history, goals

export async function initVectorStore(): Promise<DuckDBVector>
export async function embedProfile(profileId, profileText, embedding, metadata)
export async function findSimilarProfiles(queryEmbedding, topK, minScore)
export async function storeAdvice(adviceId, adviceText, embedding, metadata)
export async function findSimilarAdvice(queryEmbedding, options)
export async function embedGoal(goalId, goalText, embedding, metadata)
export async function findSimilarGoals(queryEmbedding, options)
export async function updateAdviceOutcome(adviceId, outcome)
```

**`packages/mcp-server/src/services/embeddings.ts`**
```typescript
// Local embedding generation using @xenova/transformers
// Model: Xenova/bge-m3 (1024 dimensions)

export async function generateEmbedding(text: string): Promise<number[]>
export async function generateEmbeddings(texts: string[]): Promise<number[][]>
export async function embedStudentProfile(profile): Promise<number[]>
export async function embedGoal(goal): Promise<number[]>
export async function embedAdvice(advice): Promise<number[]>
```

**`packages/mcp-server/src/tools/rag.ts`**
```typescript
// RAG query and context formatting

export async function getRAGContext(params: RAGQueryParams): Promise<RAGContext>
export function formatRAGContextForPrompt(context: RAGContext): string
export async function indexStudentProfile(profileId, profile)
export async function indexAdvice(adviceId, advice)
export async function indexGoal(goalId, goal)
```

**`packages/mcp-server/src/tools/rag-tools.ts`**
```typescript
// MCP Tool definitions for RAG

export const RAG_TOOLS = {
  get_rag_context,        // Retrieve personalized context
  index_student_profile,  // Index a profile
  index_advice,           // Index advice
  index_goal,             // Index a goal
  update_advice_feedback, // Feedback learning
  find_similar_students,  // Find similar profiles
  find_similar_goals,     // Find similar goals
}
```

### Dependencies Added
```bash
pnpm --filter @stride/mcp-server add @mastra/duckdb@1.0.0-beta.3 @xenova/transformers@2.17.2
```

### Usage Example
```typescript
import { rag } from './tools/rag';
import { embeddings } from './services/embeddings';

// Index a profile
await rag.indexProfile(profileId, {
  diploma: 'L3 Informatique',
  skills: ['python', 'javascript'],
  monthlyMargin: 200,
});

// Get RAG context for personalized advice
const context = await rag.getContext({
  queryText: 'Student needs to save 500€ for laptop',
  currentUserId: profileId,
  onlyHelpfulAdvice: true,
});

// Add context to LLM prompt
const promptAddition = rag.formatForPrompt(context);
```

---

## Phase 2: Agent Browser ✅

### New File

**`packages/mcp-server/src/tools/browser.ts`**
```typescript
// Geolocation-aware job search using agent-browser
// Falls back to mock data when CLI not available

export async function checkAgentBrowserAvailable(): Promise<boolean>
export async function setGeolocation(lat: number, lng: number): Promise<void>
export async function searchJobsNearby(params): Promise<JobSearchResult[]>
export function getCityCoordinates(city: string): { lat, lng } | undefined

export const BROWSER_TOOLS = {
  search_jobs_nearby,       // Search jobs with geolocation
  check_browser_available,  // Check CLI availability
}
```

### Features
- Geolocation-aware job search
- Graceful fallback to mock data when agent-browser CLI not installed
- City coordinates lookup for major cities
- Integration with Indeed job board

### Setup (Optional)
```bash
# Install agent-browser globally
npm install -g agent-browser
agent-browser install  # Downloads Chromium
```

---

## Phase 3: MCP-UI Integration ✅

### New File

**`packages/frontend/src/components/chat/MCPUIRenderer.tsx`**
```typescript
// SolidJS component for rendering MCP UI resources

export interface UIResource {
  type: 'text' | 'form' | 'table' | 'chart' | 'metric' | 'grid' | 'link' | 'action' | 'composite';
  params?: Record<string, unknown>;
  components?: UIResource[];
}

export function MCPUIRenderer(props: { resource: UIResource; onAction?: ActionCallback })
```

### Supported Resource Types
| Type | Description |
|------|-------------|
| `text` | Markdown/plain text |
| `table` | Data table with columns |
| `metric` | Single value with trend |
| `grid` | Grid layout for children |
| `link` | External link |
| `action` | Button with callback |
| `form` | Input form |
| `composite` | Multiple components |
| `chart` | Chart placeholder |

### Dependencies Added
```bash
pnpm --filter @stride/frontend add @seed-ship/mcp-ui-solid @seed-ship/mcp-ui-spec
```

### Usage in Chat
```tsx
import { MCPUIRenderer } from './MCPUIRenderer';

<Show when={message.uiResource}>
  <MCPUIRenderer
    resource={message.uiResource}
    onAction={(action, data) => handleUIAction(action, data)}
  />
</Show>
```

---

## Phase 4: DuckDB MCP Tools ✅

### New File

**`packages/mcp-server/src/tools/duckdb-mcp.ts`**
```typescript
// DuckDB MCP tools using @seed-ship/duckdb-mcp-native
// Provides SQL query capabilities, table management, and data import/export

export async function initDuckDBService(config?: DuckDBMCPConfig): Promise<DuckDBService>
export function getDuckDBService(): DuckDBService | null
export async function handleDuckDBMCPTool(name: string, args: Record<string, unknown>): Promise<unknown>
export async function closeDuckDBService(): Promise<void>

export const DUCKDB_MCP_TOOLS = {
  query_duckdb,      // Execute SQL queries
  list_tables,       // List tables in schema
  describe_table,    // Get table structure
  load_csv,          // Import CSV files
  load_parquet,      // Import Parquet files
  export_data,       // Export query results
}
```

### Features
- In-memory DuckDB with configurable memory/threads
- Opik tracing for all tool calls
- MCP-UI compatible result formatting (tables, text)
- DuckPGQ extension support (optional)

### Usage Example
```typescript
import { handleDuckDBMCPTool } from './tools/duckdb-mcp';

// Execute a query
const result = await handleDuckDBMCPTool('query_duckdb', {
  query: 'SELECT * FROM profiles LIMIT 10'
});

// Returns MCP-UI table resource
// { type: 'table', params: { columns: [...], rows: [...] } }
```

---

## TD-3: City/Currency Detection ✅

### New File

**`packages/frontend/src/lib/cityUtils.ts`**
```typescript
// City lists by region (UK, France, US, Europe)
export const CITY_LISTS = { uk: [...], france: [...], us: [...], europe: [...] }

// Detection functions
export function detectCitySize(city: string): 'small' | 'medium' | 'large'
export function detectCurrencyFromCity(city: string): 'USD' | 'EUR' | 'GBP' | undefined
export function detectCityMetadata(city: string): { size: CitySize; currency?: Currency }
export function getCurrencySymbol(currency: Currency): string
export function formatCurrency(amount: number, currency?: Currency): string
export function detectRegion(city: string): 'uk' | 'france' | 'us' | 'europe' | undefined
```

### OnboardingChat.tsx Changes
```typescript
// Before (80+ lines)
if (data.city) {
  const cityLower = String(data.city).toLowerCase();
  const ukCities = ['london', ...];
  // ... lots of inline logic
}

// After (5 lines)
import { detectCityMetadata } from '~/lib/cityUtils';

if (data.city) {
  const { size, currency } = detectCityMetadata(String(data.city));
  updates.citySize = size;
  if (!currentProfile.currency && currency) {
    updates.currency = currency;
  }
}
```

---

## TD-4: Smart Merge Helper ✅

### New File

**`packages/frontend/src/lib/arrayMergeUtils.ts`**
```typescript
// Step-aware array merging for onboarding flows

export function smartMergeArrays<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  currentStep: string,
  stepForField: string
): T[] | undefined

export function mergeArraysByKey<T>(existing, incoming, keyField: keyof T): T[]
export function mergeArraysUnique<T>(existing, incoming): T[]
export function mergeArraysOverwrite<T>(existing, incoming, keyField): T[]
export function createStepAwareMerger<T>(stepForField: string)
```

### Behavior
| Scenario | Result |
|----------|--------|
| `incoming = undefined` | Keep existing |
| `incoming = []` at step for field | Clear (user said "none") |
| `incoming = []` at other step | Keep existing |
| `incoming` non-empty | Merge with deduplication |

---

## Files Summary

### Created
```
packages/mcp-server/src/
├── services/
│   ├── vectorstore.ts     # Vector store (345 lines)
│   └── embeddings.ts      # Embeddings (175 lines)
└── tools/
    ├── rag.ts             # RAG logic (250 lines)
    ├── rag-tools.ts       # MCP tools (310 lines)
    ├── browser.ts         # Browser tools (425 lines)
    └── duckdb-mcp.ts      # DuckDB MCP tools (255 lines)

packages/frontend/src/
├── lib/
│   ├── cityUtils.ts       # City detection (195 lines)
│   └── arrayMergeUtils.ts # Array merging (145 lines)
├── components/
│   ├── chat/
│   │   └── MCPUIRenderer.tsx  # UI renderer (395 lines)
│   └── tabs/__tests__/
│       ├── GoalsTab.test.tsx  # Goals tests (23 tests)
│       └── TradeTab.test.tsx  # Trade tests (31 tests)

scripts/
└── setup-rag.sh           # Setup script
```

### Modified
```
packages/mcp-server/
├── package.json           # +4 dependencies, duckdb upgrade
└── src/
    ├── services/index.ts  # +vectorstore, +embeddings exports
    └── tools/index.ts     # +RAG_TOOLS, +BROWSER_TOOLS, +DUCKDB_MCP_TOOLS

packages/frontend/
├── package.json           # +2 dependencies
└── src/components/chat/
    └── OnboardingChat.tsx # Refactored city detection & merge
```

---

## Verification

```bash
# All checks passed
pnpm lint        # ✅ No errors
pnpm typecheck   # ✅ No errors
pnpm build       # ✅ Success

# MCP Server
pnpm --filter @stride/mcp-server build  # ✅

# Frontend
pnpm --filter @stride/frontend build    # ✅
```

---

## Next Steps

1. ~~**Phase 6**: Add component tests for GoalsTab and TradeTab~~ ✅ Done (54 tests)
2. **Integration Testing**: Test RAG with real student profiles
3. **Agent Browser**: Test with agent-browser CLI in production
4. **MCP-UI**: Integrate MCPUIRenderer into OnboardingChat

## Component Tests Summary (Phase 6) ✅

### GoalsTab.test.tsx (23 tests)
- Single Active Goal Policy (Sprint 9.5)
- Goal Presets validation
- Auto-Complete (Feature K)
- Goal Component Progress calculation
- Conditional Goals behavior
- Form Validation

### TradeTab.test.tsx (31 tests)
- Financial Calculations (borrowedValue, pendingBorrowValue, karmaScore, soldValue, potentialSaleValue)
- Trade Type Handling (status progression)
- Inventory linking for sells
- Trade Suggestions
- Form Validation

---

## Dependencies Reference

### MCP Server (`packages/mcp-server/package.json`)
```json
{
  "@mastra/duckdb": "1.0.0-beta.3",
  "@seed-ship/duckdb-mcp-native": "0.11.2",
  "@xenova/transformers": "2.17.2",
  "duckdb": "1.4.1"
}
```

### Frontend (`packages/frontend/package.json`)
```json
{
  "@seed-ship/mcp-ui-solid": "^1.2.6",
  "@seed-ship/mcp-ui-spec": "^1.x.x"
}
```
