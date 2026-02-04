# Sprint: Bruno Agents Enhancement - Opik & Multi-Agent Boost

## Overview

This sprint aims to bring the full multi-agent orchestration capabilities from the Progress page (BrunoTips v2) to all tabs in the application. Currently, tabs use a simplified BrunoHint component with single-LLM tips, while the Progress page benefits from a sophisticated 4-agent pipeline with full Opik tracing.

## Key Architecture Decisions

### 1. Strategy/Factory Pattern (NOT if/else)

The current `tips-orchestrator.ts` is tightly coupled to Progress page logic. To avoid unmaintainable if/else chains, we adopt a **Strategy/Factory pattern**:

```typescript
// packages/mcp-server/src/agents/strategies/types.ts
interface TabAgentStrategy {
  tabType: TabType;
  loadContext(profileId: string): Promise<TabContext>;
  getPrimaryAgent(): Agent;
  getSecondaryAgents(): Agent[];
  getValidationRules(): ValidationRules;
  getSystemPrompt(): string;
}

// Factory
function createTabStrategy(tabType: TabType): TabAgentStrategy {
  const strategies: Record<TabType, () => TabAgentStrategy> = {
    profile: () => new ProfileStrategy(),
    goals: () => new GoalsStrategy(),
    budget: () => new BudgetStrategy(),
    trade: () => new TradeStrategy(),
    jobs: () => new JobsStrategy(),
    swipe: () => new SwipeStrategy(),
  };
  return strategies[tabType]();
}
```

The orchestrator becomes **tab-agnostic** - it just executes the pipeline:
```
Load Strategy → Parallel Analysis → Strategy Comparison → Guardian → LLM
```

### 2. Agent Reuse & Contextual Guardian

**V1 Pragmatic Approach:**
- Reuse existing agents with **persona-specific prompts** rather than creating new agents
- `MoneyMaker` already exists in `mcp-server/src/agents/money-maker.ts` with:
  - `analyzeImageTool` - Analyze item photos for resale
  - `estimatePriceTool` - Estimate item value
  - `budgetImpactTool` - Calculate budget impact of selling
  - `suggestHustlesTool` - Suggest side hustles
- For Trade tab V1, can use MoneyMaker directly or combine with `BudgetCoach` for holistic advice

**Contextual Guardian:**
The Guardian must validate differently per tab:
- **Jobs Guardian**: Verify feasibility (commute time, skill match, energy cost)
- **Budget Guardian**: Verify solvency (no risky advice if deficit)
- **Trade Guardian**: Verify item valuations are realistic
- **Goals Guardian**: Verify timeline feasibility with current margin

### 3. Graceful DuckPGQ Fallback

DuckPGQ extension can fail silently on some architectures. **Explicit fallback required:**

```typescript
async function getSkillJobGraph(profileId: string): Promise<SkillJobGraph> {
  try {
    // Try DuckPGQ graph query
    return await db.query(`
      SELECT s.name, j.title, path_length(shortest_path(s, j)) as relevance
      FROM GRAPH_TABLE(skill_job_graph MATCH (s:Skill)-[*1..3]->(j:Job))
      WHERE s.profile_id = $1
    `, [profileId]);
  } catch (error) {
    logger.warn('DuckPGQ unavailable, falling back to SQL join', { error });
    // Fallback: Standard SQL with explicit joins
    return await db.query(`
      SELECT s.name, j.title,
             1.0 / (1 + ABS(s.hourly_rate - j.hourly_rate)) as relevance
      FROM skills s
      JOIN jobs j ON j.required_skills && ARRAY[s.name]
      WHERE s.profile_id = $1
      ORDER BY relevance DESC
    `, [profileId]);
  }
}
```

### 4. UI: Keep Current Expandable Pattern

The current `BrunoTips` v2 expandable interface works well:
- **Closed by default**: Compact tip with avatar + message + feedback
- **Expandable on click**: Shows agent badges, timing, details
- **Not intrusive**: User chooses when to see more details

**No Popover needed** - the current inline expandable pattern is clean and functional.

```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Consider tutoring for $35/h!    [AI] [3] [👍][👎]   │
│                                                         │
│ ▶ Show agent details                                    │
└─────────────────────────────────────────────────────────┘
                    ↓ click to expand
┌─────────────────────────────────────────────────────────┐
│ 🟢 Consider tutoring for $35/h!    [AI] [3] [👍][👎]   │
│                                                         │
│ ▼ Agent details                                         │
│ ├─ 💼 Job Matcher  ├─ 📊 Strategy  ├─ 🛡️ Guardian      │
│ ⏱️ 847ms • Level 0 (full)                              │
└─────────────────────────────────────────────────────────┘
```

### 5. Opik Sampling Strategy

**Risk:** Tracing every tab load explodes quotas and creates noise.

**Solution:** Intelligent sampling:
- **100%** trace on errors and fallback levels > 0
- **100%** trace when user gives feedback (thumbs up/down)
- **10%** random sampling on successful level-0 traces
- **100%** trace for new users (first 7 days)

```typescript
function shouldTrace(context: TraceContext): boolean {
  if (context.hasError || context.fallbackLevel > 0) return true;
  if (context.hasFeedback) return true;
  if (context.isNewUser) return true;
  return Math.random() < 0.1; // 10% sampling
}
```

### 6. Smart In-Memory Caching (NO Redis)

**Simple LRU cache** (no external dependencies):
```typescript
// In-memory LRU cache with smart invalidation
const tipCache = new Map<string, CachedTip>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200;

interface CachedTip {
  tip: BrunoTipResponse;
  timestamp: number;
  dataHash: string; // Hash of context data used to generate tip
}

function getCacheKey(tabType: TabType, profileId: string): string {
  return `${tabType}:${profileId}`;
}
```

**Smart Invalidation** (recalculate only when relevant):
```typescript
// Hash the context data to detect meaningful changes
function hashContextData(data: TabContextData): string {
  // Only hash fields that would change the tip
  const relevantFields = {
    skills: data.skills?.length,
    goalsCount: data.goals?.length,
    monthlyMargin: Math.round(data.monthlyMargin / 50) * 50, // Round to 50€ buckets
    energy: Math.round(data.currentEnergy / 10) * 10,        // Round to 10% buckets
  };
  return JSON.stringify(relevantFields);
}

function shouldRecalculate(cached: CachedTip, newData: TabContextData): boolean {
  // Expired?
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) return true;

  // Data changed meaningfully?
  const newHash = hashContextData(newData);
  if (newHash !== cached.dataHash) return true;

  return false;
}
```

**Pre-fetching** (background, non-blocking):
```typescript
// Prefetch likely next tabs on navigation
const TAB_PREDICTION: Record<TabType, TabType[]> = {
  profile: ['goals', 'jobs'],
  goals: ['budget', 'swipe'],
  budget: ['jobs', 'trade'],
  trade: ['budget'],
  jobs: ['swipe', 'budget'],
  swipe: ['goals', 'jobs'],
};

function prefetchNextTabs(currentTab: TabType, profileId: string) {
  // Only prefetch if not already cached
  const nextTabs = TAB_PREDICTION[currentTab];
  nextTabs.forEach(tab => {
    const key = getCacheKey(tab, profileId);
    if (!tipCache.has(key)) {
      // Fire and forget - errors are swallowed
      fetchTipForTab(tab, profileId).catch(() => {});
    }
  });
}
```

### 7. Warmup on Login

Pre-calculate tips for the most likely tabs when user logs in:

```typescript
// Called after successful login/profile load
async function warmupTipsCache(profileId: string) {
  // Most commonly visited tabs after login
  const warmupTabs: TabType[] = ['goals', 'budget', 'jobs'];

  // Parallel fetch - non-blocking, errors swallowed
  await Promise.allSettled(
    warmupTabs.map(tab => fetchTipForTab(tab, profileId))
  );

  logger.debug('Tips cache warmed up', { profileId, tabs: warmupTabs });
}
```

### 8. A/B Testing Ready

Prepare infrastructure for testing different agent combinations:

```typescript
// Feature flags for agent experiments
interface AgentExperiment {
  id: string;
  name: string;
  variants: {
    control: AgentConfig;    // Current behavior
    treatment: AgentConfig;  // New behavior to test
  };
  allocation: number; // 0.0-1.0, percentage in treatment
}

// Example: Test if adding RAG improves tip quality
const RAG_EXPERIMENT: AgentExperiment = {
  id: 'rag-social-proof',
  name: 'RAG Social Proof in Tips',
  variants: {
    control: { enableRAG: false },
    treatment: { enableRAG: true },
  },
  allocation: 0.2, // 20% get RAG-enhanced tips
};

// Get experiment variant for user
function getExperimentVariant(experimentId: string, profileId: string): 'control' | 'treatment' {
  // Deterministic hash ensures same user always gets same variant
  const hash = simpleHash(`${experimentId}:${profileId}`);
  const experiment = EXPERIMENTS[experimentId];
  return hash < experiment.allocation ? 'treatment' : 'control';
}

// Track in Opik for analysis
function traceWithExperiment(traceOptions: TraceOptions, experiments: string[]) {
  return {
    ...traceOptions,
    metadata: {
      ...traceOptions.metadata,
      'experiment.ids': experiments.join(','),
      'experiment.variants': experiments.map(e =>
        `${e}:${getExperimentVariant(e, traceOptions.metadata?.profileId)}`
      ).join(','),
    },
  };
}
```

**Experiment Ideas for Future:**
- Compare 2 vs 4 agents (speed vs quality tradeoff)
- Test different Guardian strictness levels
- RAG social proof vs no social proof
- Different LLM temperatures for tip generation

---

## Current State Analysis

### BrunoHint v1 (All Tabs)
**Location:** `frontend/src/components/ui/BrunoHint.tsx`
**API:** `/api/tab-tips`

Current capabilities:
- Single LLM call with tab-specific system prompts
- Basic context data per tab (profile, skills, budget, etc.)
- Simple 5-minute in-memory cache
- Basic Opik tracing (trace ID only)
- Thumbs up/down feedback

Limitations:
- No multi-agent orchestration
- No algorithm integration (energy debt, comeback, skill arbitrage)
- No RAG context (social proof from similar students)
- No fallback levels
- No agent insights display
- Generic prompts without DuckDB/DuckPGQ data

### BrunoTips v2 (Progress Page Only)
**Location:** `frontend/src/components/suivi/BrunoTips.tsx`
**API:** `/api/tips`
**Orchestrator:** `mcp-server/src/agents/tips-orchestrator.ts`

Full capabilities:
- 4-stage pipeline: Parallel Analysis → Strategy Comparison → Guardian Validation → LLM Generation
- 4 agents coordinated: Budget Coach, Job Matcher, Strategy Comparator, Guardian
- 4-level fallback: full → single → algorithms → static
- RAG context retrieval for social proof
- Regional tips database (France, UK, US, Europe)
- Location-aware recommendations
- Full Opik tracing with nested spans per agent
- Expandable agent details UI (which agents contributed, processing time)
- Guardian validation before tip delivery

### Onboarding Agent (Chat)
**Location:** `mcp-server/src/agents/onboarding-agent.ts`
**API:** `/api/chat`

Additional patterns to leverage:
- Mastra agent with structured tools
- Progressive data extraction
- Prompt versioning with `registerPrompt()`
- Tool-based extraction, validation, response generation
- Step-by-step flow management

## Target Architecture

### Phase 1: Tab-Specific Agent Integration

Each tab type should have access to relevant specialized agents:

| Tab | Primary Agent | Secondary Agents | Key Data Sources |
|-----|---------------|------------------|------------------|
| **Profile** | Guardian | - | Profile completeness, certifications |
| **Goals** | Strategy Comparator | Budget Coach | Goals, timelines, energy history |
| **Budget** | Budget Coach | Guardian | Income, expenses, optimizations |
| **Trade** | Money Maker | Guardian | Inventory, estimated values, trades |
| **Jobs** | Job Matcher | Strategy Comparator | Skills, arbitrage scores, leads |
| **Swipe** | Strategy Comparator | Job Matcher | Preferences, scenarios, energy |

### Phase 2: DuckDB + DuckPGQ Data Access

Enhance agent context with rich user data:

```typescript
// Example: Enhanced context for Jobs tab
interface JobsTabContext {
  // From DuckDB profile table
  skills: Array<{
    name: string;
    hourlyRate: number;
    marketDemand: number;
    cognitiveEffort: number;
  }>;
  // From DuckPGQ graph queries
  skillJobGraph: Array<{
    skill: string;
    matchedJobs: Array<{
      title: string;
      platform: string;
      arbitrageScore: number;
      distance?: string; // If location enabled
    }>;
  }>;
  // From simulation_state
  energyHistory: number[];
  currentEnergy: number;
  // From leads table
  savedOpportunities: number;
  appliedJobs: number;
}
```

**DuckPGQ Graph Queries:**
```sql
-- Skill → Job matching with graph traversal
SELECT s.name as skill, j.title, j.hourly_rate,
       path_length(shortest_path(s, j)) as relevance_score
FROM GRAPH_TABLE(skill_job_graph MATCH (s:Skill)-[*1..3]->(j:Job))
WHERE s.profile_id = $1
ORDER BY relevance_score ASC, j.hourly_rate DESC;
```

### Phase 3: Full Opik Tracing Architecture

```
tab-tips.{tabType}                    # Root trace
├── context.load                      # Load user data from DuckDB
│   ├── profile.fetch                 # Profile data
│   ├── graph.query                   # DuckPGQ skill→job graph
│   └── history.energy                # Energy history
├── agent.parallel                    # Parallel agent execution
│   ├── agent.{primary}               # Primary agent for tab
│   └── agent.{secondary}             # Secondary agent(s)
├── agent.guardian                    # Validation
├── rag.context                       # Similar students (social proof)
├── tips.llm_generation               # Final tip synthesis
└── feedback                          # User feedback (async)
```

**Trace Metadata:**
```typescript
const traceOptions: TraceOptions = {
  tags: ['bruno', 'tips', tabType, 'multi-agent'],
  metadata: {
    'tab.type': tabType,
    'profile.id': profileId,
    'agents.primary': primaryAgent,
    'agents.used': agentsUsed.join(','),
    'fallback.level': fallbackLevel,
    'prompt.version': PROMPT_METADATA.version,
    'prompt.hash': PROMPT_METADATA.hash,
  },
  input: {
    tabType,
    contextSummary: summarizeContext(contextData),
  },
};
```

### Phase 4: Unified API Design

New unified `/api/bruno-tips` endpoint:

```typescript
// Request
interface BrunoTipsRequest {
  tabType: TabType;
  profileId: string;
  contextData: TabContextData;
  options?: {
    enableFullOrchestration?: boolean; // Default: true
    timeoutMs?: number;                 // Default: 5000
    maxAgents?: number;                 // Default: 3
    includeRAG?: boolean;               // Default: true
    includeRegionalTips?: boolean;      // Default: true
  };
}

// Response
interface BrunoTipsResponse {
  tip: {
    title: string;
    message: string;
    category: TipCategory;
    action?: { label: string; href: string };
  };
  insights: {
    tabSpecific: TabInsights;         // e.g., { topJob: {...}, budgetStatus: 'tight' }
    energyDebt?: EnergyDebtInfo;
    comeback?: ComebackInfo;
    agentRecommendations: AgentRecommendation[];
    localOpportunities?: LocalOpportunity;
    socialProof?: { similarStudents: number; successRate: number };
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'partial' | 'algorithms' | 'static';
  };
  traceId: string;
  traceUrl: string;
}
```

### Phase 5: UI Enhancement

Upgrade `BrunoHint` to `BrunoHintV2`:

```tsx
// New capabilities
<BrunoHintV2
  tabType="jobs"
  profileId={profile()?.id}
  contextData={jobsContextData}
  // New props
  showAgentBadges={true}              // Show which agents contributed
  showProcessingInfo={true}           // Show timing + fallback level
  expandable={true}                   // Expandable details panel
  showSocialProof={true}              // "X students like you..."
/>
```

**Agent Badges UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🟢 Bruno                                      [AI] [3 agents]│
│                                                             │
│ Consider tutoring - it matches your Python skills and pays  │
│ $35/hour with high flexibility!                             │
│                                                             │
│ ├─ 💼 Job Matcher  ├─ 📊 Strategy  ├─ 🛡️ Guardian           │
│                                                             │
│ [Explore jobs →]                              [👍] [👎]     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Phase A: Backend Foundation (Priority 1)

1. **Create Strategy/Factory Architecture**
   - Create `packages/mcp-server/src/agents/strategies/` directory
   - Implement `TabAgentStrategy` interface
   - Create 6 strategy classes: `ProfileStrategy`, `GoalsStrategy`, `BudgetStrategy`, `TradeStrategy`, `JobsStrategy`, `SwipeStrategy`
   - Build `TabStrategyFactory` to instantiate strategies

2. **Refactor `tips-orchestrator.ts`**
   - Make orchestrator tab-agnostic
   - Accept `TabAgentStrategy` as input
   - Keep 4-stage pipeline: Parallel → Comparison → Guardian → LLM
   - Export `orchestrateTabTips(strategy, input)` function

3. **Create `TabContextService` with Fallbacks**
   - `getTabContext(profileId, tabType)` - unified data loader
   - DuckPGQ graph queries with **explicit SQL fallback**
   - Graceful degradation logging
   - Energy history, skills, goals, budget data

4. **Implement Contextual Guardian**
   - `GuardianRules` per tab type
   - Jobs: feasibility (time, skills, energy)
   - Budget: solvency checks
   - Trade: valuation realism
   - Goals: timeline feasibility

### Phase B: Caching & Performance (Priority 2)

5. **Smart In-Memory Cache**
   - LRU with 10-minute TTL per `tabType:profileId`
   - **Hash-based invalidation**: Recalculate only if context data changed meaningfully
   - Round values to buckets (energy ±10%, margin ±50€) to avoid unnecessary recalcs

6. **Pre-fetching & Warmup**
   - `TAB_PREDICTION` map for likely next tabs
   - Background fetch on tab navigation (if not cached)
   - **Warmup on login**: Pre-fetch `['goals', 'budget', 'jobs']` after profile load

7. **Unified API Endpoint**
   - Create `/api/bruno-tips` with full orchestration
   - Keep `/api/tab-tips` as fallback (don't deprecate yet)
   - Request validation + timeout handling (5s default)

### Phase C: Frontend UI (Priority 2)

8. **Create `BrunoHintV2` Component**
   - Based on current `BrunoTips` expandable pattern
   - **Closed by default**: Avatar + tip + feedback buttons
   - **Expandable section**: Agent badges, timing, details (click to toggle)
   - Smooth transitions and loading states

9. **Add Warmup Hook**
   - `useTipsWarmup(profileId)` - call after login/profile load
   - Pre-fetches tips for `['goals', 'budget', 'jobs']` in background
   - Non-blocking, errors swallowed

10. **Migrate All Tabs to V2**
    - ProfileTab, GoalsTab, BudgetTab, TradeTab, SkillsTab, SwipeTab
    - Pass correct `contextData` per tab
    - Wire up pre-fetching on tab change

### Phase D: Opik Observability (Priority 3)

11. **Implement Sampling Strategy**
    - 100% on errors + fallback > 0
    - 100% on user feedback
    - 100% for new users (< 7 days)
    - 10% random for success level-0

12. **Trace Hierarchy per Tab**
    - Root: `bruno-tips.{tabType}`
    - Children: `context.load`, `agent.parallel`, `agent.guardian`, `llm.generate`
    - Propagate prompt hashes in parent metadata

13. **Prompt Versioning**
    - `registerPrompt()` for each tab's system prompt
    - Hash propagation to trace metadata
    - Dashboard filtering by prompt version

### Phase E: A/B Testing Infrastructure (Priority 3)

14. **Experiment Framework**
    - `AgentExperiment` interface with control/treatment variants
    - Deterministic hash-based allocation (same user = same variant)
    - Experiment metadata in Opik traces for analysis

15. **First Experiments to Prepare**
    - `rag-social-proof`: Test RAG vs no-RAG (20% allocation)
    - `agent-count`: 2 agents vs 4 agents (speed vs quality)
    - `guardian-strictness`: Strict vs lenient validation

### Phase F: Polish & Testing (Priority 3)

16. **Error Handling**
    - Graceful degradation at each level
    - User-friendly error messages
    - Automatic retry with exponential backoff

17. **Testing**
    - Unit tests for each Strategy
    - Integration tests for orchestrator
    - E2E tests for full tab tip flow
    - Cache behavior validation

## Success Metrics

| Metric | Current (v1) | Target (v2) |
|--------|--------------|-------------|
| Agents used per tip | 1 | 2-4 |
| Context data points | 3-5 | 10-15 |
| Opik span depth | 1 | 4-6 |
| Fallback coverage | None | 4 levels |
| User feedback rate | ~5% | ~15% |
| Tip relevance score | N/A | >0.7 avg |

## Prompt Versioning

Each tab will have registered prompts for tracking:

```typescript
// Register prompts at module load
const PROFILE_TIP_PROMPT = registerPrompt('tab-tips.profile', PROFILE_SYSTEM_PROMPT);
const GOALS_TIP_PROMPT = registerPrompt('tab-tips.goals', GOALS_SYSTEM_PROMPT);
const BUDGET_TIP_PROMPT = registerPrompt('tab-tips.budget', BUDGET_SYSTEM_PROMPT);
const TRADE_TIP_PROMPT = registerPrompt('tab-tips.trade', TRADE_SYSTEM_PROMPT);
const JOBS_TIP_PROMPT = registerPrompt('tab-tips.jobs', JOBS_SYSTEM_PROMPT);
const SWIPE_TIP_PROMPT = registerPrompt('tab-tips.swipe', SWIPE_SYSTEM_PROMPT);
```

## Dependencies

- Mastra v1.0.4+ (agent orchestration)
- Opik SDK v1.9.98+ (tracing)
- DuckDB v1.0.0+ (database)
- DuckPGQ extension (graph queries)
- Groq API (LLM)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Orchestration timeout | Tips delayed | 4-level fallback system |
| Agent failures | Incomplete tips | Graceful degradation per agent |
| DuckPGQ unavailable | No graph queries | Fallback to standard SQL |
| High latency | Poor UX | Parallel agent execution + caching |
| Opik SDK metadata bug | Lost trace data | Pass metadata in traceOptions (workaround) |

## Timeline Estimate

| Phase | Tasks | Duration |
|-------|-------|----------|
| **A: Backend Foundation** | Strategy pattern, orchestrator refactor, context service, guardian | 3-4 days |
| **B: Caching & Performance** | Smart cache, warmup, pre-fetching, unified API | 2 days |
| **C: Frontend UI** | BrunoHintV2 (expandable pattern), tab migration | 2 days |
| **D: Opik Observability** | Sampling, trace hierarchy, prompt versioning | 1-2 days |
| **E: A/B Testing Infra** | Experiment framework, first experiments | 1 day |
| **F: Polish & Testing** | Error handling, tests | 1-2 days |

**Total: ~2 weeks**

## Recommended Action Plan (V1 MVP)

For a faster V1, focus on **high-impact, low-complexity** items:

### Week 1: Core Value (Backend) ✅ DONE
1. ✅ Refactor `tips-orchestrator.ts` with Strategy pattern (`12753d5`)
2. ✅ Create `TabContextService` with DuckDB queries (`e218606`)
3. ✅ Smart cache with hash-based invalidation (`a355ff8`)
4. ✅ Warmup on login (pre-fetch top 3 tabs) (`12753d5`)
5. ✅ Contextual Guardian rules per tab (`12753d5`)
6. ✅ Pre-fetching on tab navigation (`a355ff8`)

### Week 2: Frontend & Observability 🔄 IN PROGRESS
7. ✅ Create `BrunoHintV2` component (expandable pattern)
8. ✅ Create `useTipsWarmup` hook for frontend
9. ✅ Migrate all tabs to enhanced BrunoHint (7 tabs migrated)
10. ⏳ Opik sampling (100% errors, 10% success)
11. ⏳ A/B testing framework ready

### V2 (Future Sprint)
- RAG social proof integration (with A/B test)
- Advanced graph queries with DuckPGQ
- ML-based tab prediction (replace static map)
- Analyze A/B test results and optimize agent combinations

## File Structure (Proposed)

```
packages/mcp-server/src/
├── agents/
│   ├── strategies/
│   │   ├── types.ts              # TabAgentStrategy interface
│   │   ├── factory.ts            # createTabStrategy()
│   │   ├── profile.strategy.ts
│   │   ├── goals.strategy.ts
│   │   ├── budget.strategy.ts
│   │   ├── trade.strategy.ts
│   │   ├── jobs.strategy.ts
│   │   └── swipe.strategy.ts
│   ├── tips-orchestrator.ts      # Refactored (tab-agnostic)
│   └── ...existing agents...
├── services/
│   ├── tab-context.ts            # TabContextService with DuckPGQ fallback
│   ├── tip-cache.ts              # Smart LRU cache with hash invalidation
│   └── experiments.ts            # A/B testing framework
└── ...

packages/frontend/src/
├── components/
│   └── ui/
│       └── BrunoHintV2.tsx       # Expandable pattern (like current BrunoTips)
├── hooks/
│   └── useTipsWarmup.ts          # Warmup on login hook
└── ...
```

---

## Progress Tracking

### Phase A: Backend Foundation ✅ COMPLETE (Consolidated)

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| **A1: Strategy/Factory Architecture** | ✅ Done | `e218606` | Created 6 strategies, factory, base class |
| **A2: Tab-Agnostic Orchestrator** | ✅ Done | `12753d5` | `tab-tips-orchestrator.ts` with 4-stage pipeline |
| **A3: TabContextService** | ✅ Done | `e218606` | `tab-context.ts` with DuckDB queries |
| **A4: Contextual Guardian** | ✅ Done | `12753d5` | Validation rules per tab in Stage 3 |
| **A5: Agent Executor** | ✅ Done | - | Real agent logic in `agent-executor.ts` |
| **A6: Skill-Job SQL Fallback** | ✅ Done | - | `loadSkillJobMatches()` for DuckPGQ fallback |

**Files Created (Phase A):**
```
packages/mcp-server/src/agents/strategies/
├── types.ts              # TabAgentStrategy interface, TabContext, ValidationRules
├── base.strategy.ts      # Abstract base with helpers (formatCurrency, formatList, etc.)
├── factory.ts            # createTabStrategy() factory function
├── profile.strategy.ts   # Primary: guardian, completeness calculation
├── goals.strategy.ts     # Primary: strategy-comparator, checkTimeline=true
├── budget.strategy.ts    # Primary: budget-coach, checkSolvency=true
├── trade.strategy.ts     # Primary: money-maker, checkRealism=true
├── jobs.strategy.ts      # Primary: job-matcher, checkFeasibility=true
├── swipe.strategy.ts     # Primary: strategy-comparator, maxRiskLevel=high
└── index.ts              # Re-exports

packages/mcp-server/src/agents/tab-tips-orchestrator.ts  # New orchestrator
packages/mcp-server/src/services/tab-context.ts          # DuckDB context loader
packages/mcp-server/src/services/logger.ts               # Logger utility
packages/frontend/src/routes/api/tab-tips.ts             # Enhanced API endpoint
```

**Key Implementation Decisions:**
- 4-stage pipeline: Context Loading → Agent Analysis → Guardian Validation → LLM Generation
- 4-level fallback: full (0) → partial (1) → algorithms (2) → static (3)
- Smart LRU cache with hash-based invalidation in API endpoint
- `warmupTabTips()` function for pre-fetching on login
- Backwards compatible with legacy implementation

**Consolidation (Post-Review):**
After Senior Developer review, the following gaps were filled:

1. **Agent Executor** (`agent-executor.ts`) - Real agent logic:
   - `executeBudgetCoach()` - Analyzes margin, generates advice, finds optimizations
   - `executeJobMatcher()` - Matches skills to jobs database, calculates fit scores
   - `executeMoneyMaker()` - Suggests side hustles, estimates inventory potential
   - `executeStrategyComparator()` - Compares savings vs work strategies for goals
   - `executeGuardian()` - Risk assessment (margin, energy, profile completeness)

2. **Skill-Job Graph** (`tab-context.ts`):
   - `loadSkillJobMatches()` - SQL-based fallback for DuckPGQ
   - `getJobSuggestionForSkill()` - Knowledge-based job mapping
   - `estimateHourlyRate()` - Rate estimation by skill type
   - `getPlatformForSkill()` - Platform suggestions

3. **Updated Types** (`strategies/types.ts`):
   - Added `skillJobGraph` to jobs context for graph query results

---

### Phase B: Caching & Performance ✅ COMPLETE

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| **B5: Smart In-Memory Cache** | ✅ Done | `12753d5` | LRU cache in `/api/tab-tips.ts` |
| **B6: Pre-fetching & Warmup** | ✅ Done | `12753d5` | `warmupTabTips()` + GET endpoint |
| **B7: Tab Prediction Map** | ✅ Done | `a355ff8` | `prefetchNextTabs()` + `getTabPrediction()` |
| **B8: Cache Metrics** | ✅ Done | `a355ff8` | `tip-cache.ts` with `getCacheMetrics()` |

**Files Created (Phase B):**
```
packages/mcp-server/src/services/tip-cache.ts    # Dedicated cache service
  - LRU cache with 10-min TTL, max 200 entries
  - hashContext() for smart invalidation
  - Tab prediction map for prefetching
  - Full metrics: hits, misses, invalidations, evictions, hitRate
  - getPredictedTabs(), getTabsToPreFetch(), getWarmupTabs()

packages/mcp-server/src/agents/tab-tips-orchestrator.ts
  - Added: prefetchNextTabs(currentTab, profileId, cachedTabs)
  - Added: getTabPrediction(currentTab)
```

**Tab Prediction Map:**
```
profile → [goals, jobs]
goals   → [budget, swipe]
budget  → [jobs, trade]
trade   → [budget]
jobs    → [swipe, budget]
swipe   → [goals, jobs]
```

---

### Phase C: Frontend UI ✅ COMPLETE

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| **C8: BrunoHintV2 Component** | ✅ Done | `12ba213` | `BrunoHintV2.tsx` with expandable agent details |
| **C9: Warmup Hook** | ✅ Done | `12ba213` | `useTipsWarmup.ts` with tab prediction |
| **C10: Migrate All Tabs** | ✅ Done | `12ba213` | All 7 tabs migrated to BrunoHintV2 |
| **C11: Hook Integration** | ✅ Done | `8ce4f0a` | `useTipsWarmup` wired in `routes/me.tsx` |

**Files Created (Phase C):**
```
packages/frontend/src/components/ui/BrunoHintV2.tsx   # NEW - Enhanced tip component
  - Multi-agent orchestration per tab via /api/tab-tips
  - Expandable agent details panel (click badge to toggle)
  - Agent badges with icons: Budget (PiggyBank), Jobs (Briefcase), Strategy (TrendingUp), etc.
  - Processing info: duration, fallback level, orchestration type
  - Feedback buttons with Opik tracing
  - Category-based left border colors
  - Cached indicator

packages/frontend/src/hooks/useTipsWarmup.ts          # NEW - Cache warmup hook
  - useTipsWarmup(profileIdAccessor, currentTab, options)
  - Auto-warmup current tab on mount
  - Prefetch predicted next tabs (500ms debounce)
  - Tab prediction map mirroring backend
  - Tracks warmup status per tab
  - Re-warmup on profile change
  - Non-blocking, errors swallowed

packages/frontend/src/routes/me.tsx                    # MODIFIED - Hook integration
  - Import useTipsWarmup hook
  - createEffect triggers warmupTabs on activeTab change
  - Warmup current tab if not already cached
  - Prefetch predicted tabs after 500ms delay
  - Dev mode logging for warmup progress
```

**Hook Integration (C11):**
```typescript
// In routes/me.tsx
const profileIdAccessor = () => activeProfile()?.id;
const { warmupTabs, warmupStatus, isTabWarmedUp } = useTipsWarmup(
  profileIdAccessor,
  'profile',
  { skipPrefetch: true }  // Manual prefetch based on activeTab
);

createEffect(() => {
  const tab = activeTab() as TabType;
  const pid = profileIdAccessor();
  if (pid && tab) {
    // Warm current tab + prefetch predicted tabs
    if (!isTabWarmedUp(tab)) warmupTabs([tab]);
    const predictions = TAB_PREDICTION[tab];
    setTimeout(() => warmupTabs(predictions), 500);
  }
});
```

**Tabs Migrated (C10):**
1. `ProfileTab.tsx` - profile tab → BrunoHintV2
2. `GoalsTab.tsx` - goals tab → BrunoHintV2
3. `BudgetTab.tsx` - budget tab → BrunoHintV2
4. `TradeTab.tsx` - trade tab → BrunoHintV2
5. `SkillsTab.tsx` - jobs tab → BrunoHintV2
6. `ProspectionTab.tsx` - jobs tab → BrunoHintV2
7. `swipe.tsx` - swipe page → BrunoHintV2

Migration pattern: `message` prop → `fallbackMessage` prop

**BrunoHintV2 Features:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🟢 Bruno           [AI] [3 👆] [cached]   [↻] [👍] [👎]    │
│                                                             │
│ Consider tutoring - it matches your Python skills and pays  │
│ $35/hour with high flexibility!                             │
│                                                             │
│ [Explore jobs →]                                            │
└─────────────────────────────────────────────────────────────┘
                    ↓ click [3] badge to expand
┌─────────────────────────────────────────────────────────────┐
│ 🟢 Bruno           [AI] [3 ▼]              [↻] [👍] [👎]    │
│                                                             │
│ Consider tutoring...                                        │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Agents: [💼 Jobs] [📊 Strategy] [🛡️ Guardian]              │
│ ⏱️ 847ms • Level: Full • Type: full                        │
│                                                             │
│ Jobs: Python tutoring at 35€/h (85%)                        │
│ Strategy: High flexibility score (72%)                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase D: Opik Observability ✅ COMPLETE

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| **D11: Sampling Strategy** | ✅ Done | `e7fa24b` | `trace-sampling.ts` with intelligent sampling |
| **D12: Trace Hierarchy** | ✅ Done | `e7fa24b` | `tips.orchestrator.${tabType}` with nested spans |
| **D13: Prompt Versioning** | ✅ Done | `e7fa24b` | `tab-prompts.ts` with registerPrompt |

**Files Created (Phase D):**
```
packages/mcp-server/src/services/trace-sampling.ts     # NEW - Intelligent sampling
  - shouldSampleTrace(context): Pre-trace decision
  - shouldUpgradeSampling(decision, postContext): Post-trace upgrade
  - Sampling rules:
    • 100% on errors or fallback > 0
    • 100% on user feedback
    • 100% for new users (< 7 days)
    • 100% for users in A/B experiments
    • 10% random for successful level-0 traces
  - Deterministic hash-based sampling (same user = same result)
  - OPIK_TRACE_ALL=true env var for testing

packages/mcp-server/src/agents/strategies/tab-prompts.ts  # NEW - Prompt registry
  - System prompts for all 6 tabs (profile, goals, budget, trade, jobs, swipe)
  - registerPrompt() generates content hashes
  - getTabPromptMetadata(tabType): Get hash/version for traces
  - Auto-registers on module load
```

**Modified Files (Phase D):**
```
packages/mcp-server/src/services/opik.ts               # MODIFIED
  - Added conditionalTrace() for sampling-aware tracing
  - Re-exports sampling functions
  - ConditionalTraceOptions with sampling context
  - ConditionalTraceResult with sampling decision

packages/mcp-server/src/agents/tab-tips-orchestrator.ts  # MODIFIED
  - Uses conditionalTrace() instead of trace()
  - Builds SamplingContext with profileId, tabType, experimentIds
  - Adds prompt.name, prompt.version, prompt.hash to trace metadata
  - Includes sampling info in processingInfo output
```

**Sampling Decision Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│ shouldSampleTrace(context)                                  │
│                                                             │
│   ┌─ FORCE_TRACE_ALL=true? ──────────────► TRACE (forced)   │
│   │                                                         │
│   ├─ context.forceTrace? ────────────────► TRACE (forced)   │
│   │                                                         │
│   ├─ context.hasKnownError? ─────────────► TRACE (error)    │
│   │                                                         │
│   ├─ fallbackLevel > 0? ─────────────────► TRACE (fallback) │
│   │                                                         │
│   ├─ hasFeedback? ───────────────────────► TRACE (feedback) │
│   │                                                         │
│   ├─ isNewUser (< 7 days)? ──────────────► TRACE (new_user) │
│   │                                                         │
│   ├─ has experimentIds? ─────────────────► TRACE (experiment)│
│   │                                                         │
│   ├─ random 10%? ────────────────────────► TRACE (sampled_in)│
│   │                                                         │
│   └─ otherwise ──────────────────────────► SKIP (sampled_out)│
└─────────────────────────────────────────────────────────────┘
```

**Trace Metadata with Prompt Versioning:**
```json
{
  "providers": ["groq"],
  "source": "tab_tips_orchestrator",
  "tabType": "goals",
  "prompt.name": "tab-tips.goals",
  "prompt.version": "1.0.0",
  "prompt.hash": "a1b2c3d4",
  "sampling.reason": "sampled_in",
  "sampling.rate": 0.1
}
```

---

### Phase E: A/B Testing ✅ COMPLETE

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| **E14: Experiment Framework** | ✅ Done | `2fcff39` | `experiments.ts` with hash-based allocation |
| **E15: First Experiments** | ✅ Done | `2fcff39` | 5 experiments configured (3 enabled) |

**Files Created (Phase E):**
```
packages/mcp-server/src/services/experiments.ts     # NEW - A/B Testing Framework
  - ExperimentConfig interface with control/treatment variants
  - Deterministic hash-based allocation (same user = same variant)
  - getExperimentVariant(experimentId, profileId): Get user's variant
  - getExperimentAssignments(profileId): Get all active assignments
  - buildExperimentMetadata(profileId): Build Opik trace metadata
  - getMergedExperimentConfig(profileId): Merge all experiment configs
  - listExperiments(): Admin view of all experiments
  - setExperimentEnabled(): Toggle experiments on/off
```

**Modified Files (Phase E):**
```
packages/mcp-server/src/agents/tab-tips-orchestrator.ts  # MODIFIED
  - Gets experiment assignments at start of orchestration
  - Extracts experiment-controlled settings:
    • skipSecondaryAgents (agent-count experiment)
    • llmTemperature (llm-temperature experiment)
    • guardianMinConfidence (guardian-strictness experiment)
  - Passes skipSecondary option to runStage2()
  - Passes llmTemperature to TipGenerationContext → chat()
  - Adds experiment metadata to Opik traces
```

**Configured Experiments:**

| ID | Name | Allocation | Enabled | Control | Treatment |
|----|------|------------|---------|---------|-----------|
| `agent-count` | Agent Count Optimization | 30% | ✅ | 4 agents | 2 agents (skip secondary) |
| `guardian-strictness` | Guardian Strictness Level | 25% | ✅ | minConfidence: 0.7 | minConfidence: 0.5 |
| `llm-temperature` | LLM Temperature for Tips | 20% | ✅ | temperature: 0.5 | temperature: 0.7 |
| `rag-social-proof` | RAG Social Proof in Tips | 20% | ❌ | enableRAG: false | enableRAG: true |
| `tip-length` | Tip Length Optimization | 25% | ❌ | maxTokens: 256 | maxTokens: 128 |

**Experiment Assignment Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│ getExperimentVariant('agent-count', profileId)              │
│                                                             │
│   1. Check if experiment exists ─────► null if not found    │
│   2. Check if experiment is active ──► null if disabled     │
│   3. Hash: hashToFloat('agent-count:profile123')            │
│      → e.g., 0.234                                          │
│   4. Compare: 0.234 < 0.30 (allocation)?                    │
│      → YES: return 'treatment'                              │
│      → NO:  return 'control'                                │
└─────────────────────────────────────────────────────────────┘
```

**Trace Metadata Example:**
```json
{
  "experiment.ids": "agent-count,llm-temperature",
  "experiment.variants": "agent-count:treatment,llm-temperature:control",
  "experiment.agent-count.variant": "treatment",
  "experiment.agent-count.allocation": 0.3,
  "experiment.llm-temperature.variant": "control",
  "experiment.llm-temperature.allocation": 0.2
}
```

**Usage in Orchestrator:**
```typescript
// Get experiment assignments
const experimentAssignments = getExperimentAssignments(profileId);
const experimentConfig = getMergedExperimentConfig(profileId);

// Extract experiment-controlled settings
const skipSecondaryAgents = experimentConfig.skipSecondary === true;
const llmTemperature = (experimentConfig.temperature as number) || 0.5;

// Use in Stage 2 (agent analysis)
runStage2(strategy, context, span, { skipSecondary: skipSecondaryAgents });

// Use in Stage 4 (LLM generation)
chat(messages, { temperature: llmTemperature });
```

---

## References

- `packages/mcp-server/src/agents/tips-orchestrator.ts` - Legacy v2 orchestration
- `packages/mcp-server/src/agents/tab-tips-orchestrator.ts` - **New** Strategy-based orchestrator
- `packages/frontend/src/components/suivi/BrunoTips.tsx` - v2 component
- `packages/mcp-server/src/agents/onboarding-agent.ts` - Mastra agent patterns
- `packages/mcp-server/src/services/opik.ts` - Opik tracing utilities
- `packages/frontend/src/routes/api/chat.ts` - Chat flow patterns
