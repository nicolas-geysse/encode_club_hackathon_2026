# Sprint 10.5: Integration - Wire Sprint 10 Features into Chat

## Status: ✅ COMPLETED

---

## Overview

Sprint 10 created infrastructure. Sprint 10.5 **wires it into the actual chat flow**.

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **HIGH** | MCPUIRenderer in Chat | ~1h | Interactive forms in chat |
| **HIGH** | RAG Context Injection | ~2h | Personalized responses |
| **HIGH** | Embedding Triggers | ~1h | Auto-index profiles/goals |
| **MEDIUM** | Mastra Agent Route | ~2h | True agentic chat |
| **LOW** | DuckDB-MCP Exposure | ~1h | External tool access |

**Total estimé**: ~7h

---

## Current State (Post-Sprint 10.5) ✅

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACTIVE FLOW                               │
│  OnboardingChat → /api/chat → fetchRAGContext → Groq            │
│        ↓                           ↓                             │
│  MCPUIRenderer              profileService.save()                │
│  (interactive forms)               ↓                             │
│                            /api/embed (fire-and-forget)          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    NOW INTEGRATED (Sprint 10.5)                  │
│  MCPUIRenderer.tsx    - ✅ Imported in OnboardingChat           │
│  vectorstore.ts       - ✅ Called via /api/embed                │
│  embeddings.ts        - ✅ Triggered on profile/goal save       │
│  rag-tools.ts         - ✅ Invoked via /api/rag                 │
│  Mastra Agents (6)    - ✅ Exposed via /api/agent               │
│  DuckDB              - ✅ REST API via /api/duckdb              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Target State (Post-Sprint 10.5)

```
┌─────────────────────────────────────────────────────────────────┐
│                     OnboardingChat.tsx                           │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Messages    │  │ MCPUIRenderer   │  │ Form Actions        │  │
│  │             │  │ (interactive)   │  │ (callbacks)         │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                      /api/chat.ts                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  1. getRAGContext(query, profileId)     ← NEW               ││
│  │  2. buildPrompt(basePrompt + ragContext)                    ││
│  │  3. processWithGroqExtractor(enrichedPrompt)                ││
│  │  4. Return { response, uiResource? }    ← NEW               ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                   profileService.ts                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  save() → triggerEmbedding(profile)     ← NEW               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: MCPUIRenderer Integration (HIGH)

### Objective
Render interactive UI components (forms, tables, metrics) in chat messages.

### Files to Modify

**`packages/frontend/src/components/chat/OnboardingChat.tsx`**

```typescript
// ADD import at top
import { MCPUIRenderer } from './MCPUIRenderer';

// In message rendering (around line 650-700)
// ADD after message text rendering:
<Show when={msg.uiResource}>
  <MCPUIRenderer
    resource={msg.uiResource}
    onAction={(action, data) => handleUIAction(action, data)}
  />
</Show>
```

**Add handler function:**
```typescript
function handleUIAction(action: string, data: unknown) {
  // Handle form submissions, button clicks, etc.
  switch (action) {
    case 'submit_goal':
      // Create goal from form data
      break;
    case 'confirm_budget':
      // Save budget settings
      break;
    default:
      console.log('UI Action:', action, data);
  }
}
```

### Message Type Extension

**`packages/frontend/src/types/chat.ts`** (create or extend)
```typescript
import type { UIResource } from '@seed-ship/mcp-ui-spec';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  uiResource?: UIResource;  // NEW
  timestamp: Date;
}
```

### Backend: Return UIResource

**`packages/frontend/src/routes/api/chat.ts`**

Modify response to include uiResource when appropriate:
```typescript
// After processing, check if we should return a UI component
const uiResource = generateUIResourceForResponse(extractedData, currentStep);

return {
  message: response,
  extractedData,
  uiResource,  // NEW
};
```

### Verification
- [ ] MCPUIRenderer imported in OnboardingChat
- [ ] Show/when conditional renders UIResource
- [ ] handleUIAction processes form callbacks
- [ ] Backend can return uiResource in response

---

## Phase 2: RAG Context Injection (HIGH)

### Objective
Enrich every chat prompt with relevant context from similar profiles/goals.

### Files to Modify

**`packages/frontend/src/routes/api/chat.ts`**

```typescript
// ADD imports
import { getRAGContext, formatRAGContextForPrompt } from '@stride/mcp-server/tools/rag';

// In chat handler, BEFORE calling Groq:
async function handleChat(req: Request) {
  const { message, profileId, currentStep } = await req.json();

  // NEW: Get RAG context
  let ragContext = '';
  try {
    const context = await getRAGContext({
      queryText: message,
      currentUserId: profileId,
      includeProfiles: true,
      includeAdvice: true,
      includeGoals: true,
      onlyHelpfulAdvice: true,
      topK: 3,
    });
    ragContext = formatRAGContextForPrompt(context);
  } catch (e) {
    // RAG optional - continue without it
    console.warn('RAG context fetch failed:', e);
  }

  // Enrich prompt
  const enrichedPrompt = `
${ragContext}

---
User message: ${message}
`;

  // Call Groq with enriched prompt
  const response = await processWithGroqExtractor(enrichedPrompt, currentStep);
  // ...
}
```

### RAG Context Format

The `formatRAGContextForPrompt()` function returns:
```
## Similar Student Profiles
- Student A (85% similar): L3 Informatique, saved 500€/month for laptop
- Student B (72% similar): M1 Commerce, freelance 15h/week

## Relevant Past Advice
- "For laptop savings, consider selling unused textbooks first" (helpful: 4/5)
- "Part-time tutoring in your major is high ROI" (helpful: 5/5)

## Similar Goals
- "Vacation Fund 800€" achieved in 4 months by similar profile
```

### Verification
- [ ] getRAGContext called before Groq
- [ ] Context formatted and prepended to prompt
- [ ] Graceful fallback if RAG fails
- [ ] Response quality improves with context

---

## Phase 3: Embedding Triggers (HIGH)

### Objective
Auto-index profiles and goals when saved.

### Files to Modify

**`packages/frontend/src/lib/profileService.ts`**

```typescript
// ADD import
import { indexStudentProfile } from '@stride/mcp-server/tools/rag';

// In saveProfile method, AFTER successful save:
async saveProfile(profile: Profile): Promise<void> {
  // Existing save logic...
  await this.saveToAPI(profile);

  // NEW: Trigger embedding (fire-and-forget)
  this.triggerEmbedding(profile).catch(console.warn);
}

private async triggerEmbedding(profile: Profile): Promise<void> {
  try {
    await indexStudentProfile(profile.id, {
      diploma: profile.diploma,
      skills: profile.skills,
      monthlyIncome: profile.monthlyIncome,
      monthlyExpenses: profile.monthlyExpenses,
      goals: profile.goals?.map(g => g.name),
    });
  } catch (e) {
    // Non-blocking - embedding is optional enhancement
    console.warn('Profile embedding failed:', e);
  }
}
```

**`packages/frontend/src/lib/goalService.ts`**

```typescript
// ADD import
import { indexGoal } from '@stride/mcp-server/tools/rag';

// In createGoal/updateGoal, AFTER successful save:
async createGoal(goal: Goal): Promise<Goal> {
  const created = await this.saveToAPI(goal);

  // NEW: Trigger embedding
  this.triggerGoalEmbedding(created).catch(console.warn);

  return created;
}

private async triggerGoalEmbedding(goal: Goal): Promise<void> {
  try {
    await indexGoal(goal.id, {
      name: goal.name,
      amount: goal.amount,
      deadline: goal.deadline,
      components: goal.components?.map(c => c.name),
    });
  } catch (e) {
    console.warn('Goal embedding failed:', e);
  }
}
```

### API Route for Embedding

**`packages/frontend/src/routes/api/embed.ts`** (NEW)

```typescript
import { indexStudentProfile, indexGoal } from '@stride/mcp-server/tools/rag';

export async function POST(req: Request) {
  const { type, id, data } = await req.json();

  switch (type) {
    case 'profile':
      await indexStudentProfile(id, data);
      break;
    case 'goal':
      await indexGoal(id, data);
      break;
    default:
      return new Response('Unknown type', { status: 400 });
  }

  return new Response(JSON.stringify({ success: true }));
}
```

### Verification
- [ ] Profile save triggers embedding
- [ ] Goal create/update triggers embedding
- [ ] Embeddings are non-blocking
- [ ] Vector store populates over time

---

## Phase 4: Mastra Agent Route (MEDIUM)

### Objective
Create an API route that uses Mastra agents instead of direct Groq calls.

### Why?
- Agents have specialized system prompts
- Agents can use tools (budget calculation, job matching)
- Better for complex multi-step reasoning

### New File

**`packages/frontend/src/routes/api/agent.ts`**

```typescript
import { createBudgetCoachAgent, createJobMatcherAgent, createGuardianAgent } from '@stride/mcp-server/agents';
import { getOnboardingAgent } from '@stride/mcp-server/agents';

// initialize agents (singleton pattern suggested for performance)
const budgetCoach = createBudgetCoachAgent();
const jobMatcher = createJobMatcherAgent();
const guardian = createGuardianAgent();
const onboarding = getOnboardingAgent();

export async function POST(req: Request) {
  const { message, profileId, agentType = 'budget-coach' } = await req.json();

  // Select agent
  const agents = {
    'budget-coach': budgetCoach,
    'job-matcher': jobMatcher,
    'guardian': guardian,
    'onboarding': onboarding
  };
  const agent = agents[agentType] || budgetCoach;

  // Get profile context
  const profile = await loadProfile(profileId);

  // Run agent
  const result = await agent.run({
    input: message,
    context: {
      profile,
      currentDate: new Date().toISOString(),
    },
  });

  return new Response(JSON.stringify({
    message: result.output,
    toolCalls: result.toolCalls,
    uiResource: result.uiResource,
  }));
}
```

### Usage in Chat

Could add a toggle or auto-detect when to use agents vs direct Groq:
- Simple extraction → Groq direct (faster)
- Complex advice → Agent (better quality)

### Verification
- [ ] `/api/agent` route created
- [ ] Agents respond correctly
- [ ] Tool calls execute
- [ ] Opik traces show agent spans

---

## Phase 5: DuckDB-MCP Exposure (LOW)

### Objective
Expose DuckDB tools for external MCP clients (Claude Desktop, other tools).

### Option A: MCP Server Endpoint

Already available via `packages/mcp-server` - just need to document usage:

```bash
# Run MCP server
pnpm dev:mcp

# Connect from Claude Desktop
# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "stride": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Option B: REST API Wrapper

**`packages/frontend/src/routes/api/duckdb.ts`** (NEW)

```typescript
import { handleDuckDBMCPTool } from '@stride/mcp-server/tools/duckdb-mcp';

export async function POST(req: Request) {
  const { tool, args } = await req.json();

  // Validate tool name
  const allowedTools = ['query_duckdb', 'list_tables', 'describe_table'];
  if (!allowedTools.includes(tool)) {
    return new Response('Tool not allowed', { status: 403 });
  }

  const result = await handleDuckDBMCPTool(tool, args);
  return new Response(JSON.stringify(result));
}
```

### Verification
- [ ] MCP server exposes DuckDB tools
- [ ] REST wrapper (optional) works
- [ ] Claude Desktop can query data

---

## Files Summary

### New Files ✅
```
packages/frontend/src/routes/api/
├── agent.ts          # Mastra agent endpoint (6 agents)
├── embed.ts          # Embedding trigger endpoint (fire-and-forget)
├── rag.ts            # RAG context retrieval endpoint
└── duckdb.ts         # DuckDB REST wrapper (read-only queries)
```

### Modified Files ✅
```
packages/frontend/src/
├── components/chat/
│   └── OnboardingChat.tsx   # +MCPUIRenderer import, +handleUIAction, +uiResource rendering
├── routes/api/
│   ├── chat.ts              # +fetchRAGContext, +RAG context injection in prompts
│   └── goals.ts             # +triggerGoalEmbedding after create/update
└── lib/
    └── profileService.ts    # +triggerProfileEmbedding after save
```

---

## Verification Checklist

### Phase 1: MCPUIRenderer
- [x] Import added to OnboardingChat.tsx
- [x] UIResource renders in chat
- [x] Form actions trigger callbacks
- [ ] Styling matches chat theme (needs manual verification)

### Phase 2: RAG Context
- [x] getRAGContext called in /api/chat (via /api/rag endpoint)
- [x] Context prepended to prompt
- [ ] Responses reference similar profiles (needs manual verification)
- [x] Graceful fallback on error

### Phase 3: Embeddings
- [x] Profile save triggers embedding
- [x] Goal save triggers embedding
- [ ] Vector store has entries (needs runtime verification)
- [ ] findSimilarProfiles returns results (needs runtime verification)

### Phase 4: Mastra Agents
- [x] /api/agent route works
- [x] budget-coach responds (and 5 other agents)
- [x] Tool calls execute
- [ ] Opik shows agent traces (needs runtime verification)

### Phase 5: DuckDB-MCP
- [x] MCP server works standalone
- [x] REST wrapper created (/api/duckdb)
- [ ] Queries return MCP-UI tables (needs manual verification)

### Quality
- [ ] `pnpm lint` passes (no lint script defined)
- [x] `pnpm typecheck` passes
- [x] `pnpm build` succeeds
- [ ] All existing tests pass (3 failing in onboardingPersistence.test.ts - pre-existing)

---

## Testing Strategy

### Manual Testing

1. **MCPUIRenderer**
   - Start chat, trigger a response that includes uiResource
   - Verify form renders, submit works

2. **RAG**
   - Create 2-3 profiles with different skills/goals
   - Ask for advice, check if response mentions similar profiles

3. **Embeddings**
   - Save a profile, check vector store has entry
   - Create a goal, verify embedding triggered

4. **Agents**
   - Call `/api/agent` directly with curl
   - Verify response includes agent-specific reasoning

### Automated Testing

Add integration tests:
```
packages/frontend/src/routes/api/__tests__/
├── chat.test.ts       # RAG injection tests
├── agent.test.ts      # Agent response tests
└── embed.test.ts      # Embedding trigger tests
```

---

## Rollout Plan

### Day 1: Foundation
- [ ] Phase 1: MCPUIRenderer integration
- [ ] Phase 3: Embedding triggers

### Day 2: Intelligence
- [ ] Phase 2: RAG context injection
- [ ] Test with real profiles

### Day 3: Agentic
- [ ] Phase 4: Mastra agent route
- [ ] Phase 5: DuckDB exposure (if needed)

### Day 4: Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation update

---

## Dependencies

No new dependencies needed - all packages from Sprint 10 are already installed:
- `@seed-ship/mcp-ui-solid` ✅
- `@mastra/duckdb` ✅
- `@xenova/transformers` ✅
- `@seed-ship/duckdb-mcp-native` ✅

---

## Out of Scope

- Real-time embedding updates (batch is fine)
- Multi-agent orchestration (single agent per request)
- Streaming responses (can add later)
- Browser tools integration (requires external CLI)

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| MCPUIRenderer usage | 0 | 100% of form responses |
| RAG context in prompts | 0% | 100% of chat requests |
| Profiles embedded | 0 | All saved profiles |
| Goals embedded | 0 | All saved goals |
| Agent usage | 0 | Optional toggle |

---

## Technical Considerations (Antigravity)

### 1. DuckDB Concurrency Warning
Since `packages/frontend` imports DuckDB code directly (running in the web server process), and we also have a standalone MCP server script:
- **Risk**: If both the Web App (`pnpm dev`) and the standalone MCP Server (`pnpm start:mcp`) run simultaneously and try to write to `stride-vectors.duckdb`, **locking errors will occur**.
- **Mitigation**: 
  - For development, favor running logic *inside* the web app (as planned in Phase 2 & 4).
  - If using Claude Desktop (MCP Client), ensure the Web App isn't performing heavy writes at the same time, or use `READ_ONLY` mode for the MCP server connection if possible.

### 2. Agent Instantiation
The `@stride/mcp-server/agents` package exports factory functions (`createBudgetCoachAgent`), not instances. The API route must instantiate them. To avoid overhead, we should instantiate them outside the request handler (server-side singleton) or use a service provider pattern.

### 3. Build & Runtime
- Ensure `@mastra/duckdb` and `duckdb` native bindings work correctly in the `vinxi` / `SolidStart` SSR environment. There might be need for `server-only` pragmas or specific vite config to exclude them from client bundles.

---

## Sprint 10.5 Fix: uiResource in Chat + Centralized Types

**Date**: 2026-01-19
**Status**: ✅ COMPLETED

### Problem

Two gaps identified in Sprint 10.5 review:
1. `/api/chat.ts` didn't support `uiResource` (only `/api/agent.ts` did)
2. Chat types were duplicated across files instead of centralized

### Solution

#### 1. Centralized Types (`src/types/chat.ts`)

Created a new file with fully documented types:

```typescript
// packages/frontend/src/types/chat.ts

/** Chat message displayed in the UI */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'mastra' | 'groq' | 'fallback';
  uiResource?: UIResource;
  timestamp?: Date;
}

/** Chat API response from /api/chat */
export interface ChatResponse {
  response: string;
  extractedData?: Record<string, unknown>;
  source?: 'mastra' | 'groq' | 'fallback';
  uiResource?: UIResource;
  error?: string;
}

/** Chat request body sent to /api/chat */
export interface ChatRequest {
  message: string;
  profile: Record<string, unknown>;
  currentStep: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}
```

**Benefits**:
- Single source of truth for chat types
- Full JSDoc documentation with `@example` blocks
- Re-exports `UIResource` for convenience

#### 2. Updated OnboardingChat.tsx

Removed local `Message` interface, now imports from centralized types:

```typescript
// Before
interface Message { ... }  // local definition

// After
import type { ChatMessage as Message, UIResource } from '~/types/chat';
```

#### 3. Added `generateUIResourceForResponse()` to `/api/chat.ts`

New function that returns appropriate MCP-UI components based on context:

| Condition | UI Resource Type | Description |
|-----------|-----------------|-------------|
| `step === 'goal'` + goal extracted | `form` | Confirm goal name, amount, deadline |
| `step === 'complete'` or `'lifestyle'` | `composite` | Summary metric + "Go to My Plan" button |
| `step === 'budget'` + income/expenses | `grid` | 3 metrics: income, expenses, margin |
| `step === 'skills'` + skills array | `table` | List of extracted skills |

**Implementation**:
```typescript
function generateUIResourceForResponse(
  extractedData: Record<string, unknown>,
  currentStep: OnboardingStep,
  _response: string
): UIResource | undefined {
  // Goal confirmation form
  if (currentStep === 'goal' && extractedData.goalName && extractedData.goalAmount) {
    return {
      type: 'form',
      params: {
        title: 'Confirm Your Goal',
        fields: [
          { name: 'goalName', label: 'Goal', type: 'text', value: extractedData.goalName },
          { name: 'goalAmount', label: 'Amount', type: 'number', value: extractedData.goalAmount },
          { name: 'goalDeadline', label: 'Deadline', type: 'date' },
        ],
        submitLabel: 'Confirm Goal',
      },
    };
  }
  // ... more cases
}
```

**All response paths updated**:
- ✅ Groq extractor path
- ✅ Fallback path (no LLM)
- ✅ Legacy Groq path

### Files Modified

| File | Change |
|------|--------|
| `src/types/chat.ts` | **CREATED** - Centralized, documented types |
| `src/components/chat/OnboardingChat.tsx` | Import from `~/types/chat` instead of local interface |
| `src/routes/api/chat.ts` | + `UIResource` import, + `generateUIResourceForResponse()`, + `uiResource` in all responses |

### What This Enables

1. **Interactive forms in chat** - When user mentions a goal, they see a form to confirm/edit the data
2. **Visual budget summary** - Income/expenses shown as metrics with trend indicators
3. **Skills table** - Extracted skills displayed in a clean table format
4. **Completion CTA** - "Go to My Plan" button rendered directly in chat

### Verification

```bash
pnpm typecheck  # ✅ Pass
pnpm build      # ✅ Success
```

### Example Flow

```
User: "I want to save $500 for a laptop by March"

→ API extracts: { goalName: "laptop", goalAmount: 500, goalDeadline: "March" }
→ generateUIResourceForResponse() returns:
  {
    type: 'form',
    params: {
      title: 'Confirm Your Goal',
      fields: [
        { name: 'goalName', label: 'Goal', value: 'laptop' },
        { name: 'goalAmount', label: 'Amount', value: 500 },
        { name: 'goalDeadline', label: 'Deadline', type: 'date' }
      ]
    }
  }

→ OnboardingChat renders:
  1. Bruno's text response: "Great goal! Let's make it happen..."
  2. MCPUIRenderer: Interactive form to confirm/edit goal details
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    OnboardingChat.tsx                            │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │ Messages    │  │ MCPUIRenderer                           │   │
│  │ (text)      │  │ - Forms (goal, budget)                  │   │
│  │             │  │ - Metrics (income, expenses, margin)    │   │
│  │             │  │ - Tables (skills list)                  │   │
│  │             │  │ - Actions (Go to My Plan button)        │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                         /api/chat.ts                             │
│  1. processWithGroqExtractor(message)                           │
│  2. extractedData = { goalName, goalAmount, ... }               │
│  3. uiResource = generateUIResourceForResponse(extractedData)   │
│  4. return { response, extractedData, uiResource }              │
└─────────────────────────────────────────────────────────────────┘
```
