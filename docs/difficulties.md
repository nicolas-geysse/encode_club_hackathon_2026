# The Stride Development Story: From Chaos to Clarity

> *A hackathon project. 17 AI Agents. A single-file database. Race conditions everywhere. And an observability platform that saved us from ourselves.*
>
> This is the story of how we built an Agentic AI application for student financial health — and what we learned about LLM observability along the way.

---

## Chapter 1: The Foundations & The Sync Nightmare (Sprint 1-3)

### The Challenge: "Who owns the truth?"
We started with a simple premise: A Chatbot (Onboarding Agent) extracts data, and the UI displays it.
**Reality:** The Chatbot ran on the server (Mastra agents), the UI ran in the browser (SolidJS/SolidStart), and the state lived in... both? And `localStorage`? And DuckDB?

### The Battle: The Silent Failures
In Sprint 1, we hit the **"Step Flow Mismatch"**. The Frontend thought step 2 was "Region", the Backend thought it was "Name". Users were asked "Where do you live?" and when they answered "France", the backend yelled "I didn't catch your name!".
Then came the **"Silent Failures"**. A user would type their skills, the LLM would extract them, the code would *try* to save them... and fail silently. The UI would just show "No skills added".

### The Resolution: Single Source of Truth
We made three critical decisions that saved the project:
1. **DuckDB as primary truth**: localStorage was causing "Cross-Profile Contamination" (seeing Dylan's goals on Nicolas's profile). We made DuckDB the authoritative source and demoted localStorage to a **backup/redundancy layer** (96 remaining usages for offline fallback, theme, onboarding state — not for profile data).
2. **Promise.allSettled**: We stopped "hoping" saves would work. We implemented robust parallel saving with explicit feedback to the user if *any* part of the extraction failed.
3. **Strict Typing**: We customized the backend logic to match the frontend flow step-by-step, unifying the definition of the "Onboarding Journey".

---

## Chapter 2: The Database Concurrency Headache (Sprint 5-10)

### The Challenge: Multi-Process Madness
Stride grew. We added a Vector Store for RAG (DuckDB + HNSW indices via `@mastra/duckdb`). We added background agents.
Suddenly, we had:
- **Process A (Frontend SSR)** trying to read the DB via Vite SSR.
- **Process B (MCP Server)** embedding profiles into the Vector Store.
- **Process C (User)** asking "Why is the app spinning?"

### The Battle: Hard Locks & WAL Corruption
DuckDB uses a single-file architecture with a Write-Ahead Log (WAL). When the Frontend tried to save a profile *at the exact same millisecond* the MCP Server tried to update the Vector Store embedding for that profile, we hit hard locks.
We also faced:
- **"Vector Store Race"**: Two identical embedding requests would launch, race, and trigger "Constraint Violations" deep in the Mastra library.
- **WAL corruption**: Killing a process mid-write (`Ctrl+C`) or having two different DuckDB versions (Frontend uses 1.0.0, MCP uses 1.4.1) open the same file → corrupt WAL → `INTERNAL Error: Failure while replaying WAL file`.
- **`COUNT(*)` returns `bigint`**: DuckDB returns `BigInt(0)`, and `BigInt(0) === 0` is `false` in JavaScript. Comparisons failed silently.

### The Resolution: The "Good Enough" Architecture
We didn't rewrite the world. We got pragmatic:
1. **Deduplication Layer**: An `inFlightEmbeddings` map — if "Embed Profile 123" is already running, the second request just waits. Eliminated 90% of clashes.
2. **Debounce Everything**: 2000ms debounce on profile saves and embedding triggers calmed the system.
3. **Auto-Recovery**: Both `_db.ts` (frontend) and `duckdb.ts` (MCP) detect WAL corruption at startup — auto-delete both files, recreate a fresh DB. Never need to manually intervene.
4. **Init Singleton**: A `Promise` singleton prevents concurrent queries from running before schema initialization completes.

---

## Chapter 3: The Reactivity War (Sprint 11-12)

### The Challenge: "It flickers!"
SolidJS is fine-grained and fast. Sometimes *too* fast.
We wanted real-time updates: You change your budget in the Chat, the Budget Tab updates instantly.

### The Battle: The Infinite Loop
We implemented an **Event Bus** (`DATA_CHANGED`). Great!
But...
1. UI receives `DATA_CHANGED`.
2. UI fetches new data.
3. UI updates local state `setGoal(...)`.
4. `createEffect` sees state change, thinks "User updated goal!", and fires a Save.
5. Save completes -> Emits `DATA_CHANGED`.
6. **GOTO 1**.

Results: infinite loops, flickering inputs, and an API getting hammered.

### The Resolution: Smarter Reactivity
We learned to "Untrack" and respect SolidJS patterns:
- **Value Comparison** checks: Only update state if data *actually* changed (`JSON.stringify` deep-equal checks).
- **Separated** "Server-Driven Updates" from "User Interactions" — the Event Bus carries a `source` tag.
- **Animations** (like the "Orbital Pulse" for Bruno avatar) to hide the few milliseconds of latency, making the app *feel* instant.

We also discovered the **`<Show keyed>` anti-pattern**: `<Show when={signal()} keyed>` breaks reactivity for any signal *other than* the `when` value. This caused entire sub-trees to stop updating. We removed `keyed` from all `<Show>` blocks except those depending solely on the condition value.

---

## Chapter 4: The LLM Integration War (Sprint 13-15)

### The Challenge: "Why does the JSON parsing fail 40% of the time?"
Small LLM models like `ministral-3b-2512` are fast and cheap — perfect for a hackathon budget. But they have quirks that no documentation warns you about.

### The Battles

**Battle 1: Vite SSR vs `process.env`**
`process.env` is **not populated at module load time** in Vite SSR. Our LLM client was doing `const API_KEY = process.env.LLM_API_KEY` at the top of the file — always `undefined`. Solution: lazy getters inside `init()` functions, never module-level constants.

**Battle 2: Native Modules in Vite SSR**
DuckDB is a native C++ binding (`.node` file). Vite SSR transforms ESM imports in a way that breaks native modules. `import * as duckdb from 'duckdb'` → crash. Solution: `createRequire(import.meta.url)` to load via CommonJS, plus `external` config in `app.config.ts`.

**Battle 3: Small Model JSON Malformation**
`ministral-3b-2512` injects markdown **inside JSON values**: `**bold text**`, `` `code blocks` ``, literal unescaped newlines inside string values. Standard `JSON.parse()` fails. Our G-Eval LLM-as-Judge was silently skipping 100% of evaluations.

Solution: A multi-pass sanitization pipeline:
```
Raw LLM output
  → Strip ```json fences
  → Extract JSON with regex
  → Try JSON.parse (fast path)
  → On failure: strip **bold**, *italic*, `code`
  → Replace ALL control chars [\x00-\x1F] with spaces
  → Remove trailing commas before } or ]
  → Retry JSON.parse
  → On failure: log detailed skip reason to Opik
```

**Battle 4: The Global Trace ID Singleton**
Our Opik tracing used a module-level `currentTraceId` variable. Every `trace()` call overwrote it. When `chat.conversation` spawned a child `budget.calculation` trace, the evaluation scores were logged to the *budget* trace instead of the *chat* trace. Invisible until we added tracing to debug tracing.

Solution: Use closure-captured `ctx.getTraceId()` instead of the global `getCurrentTraceId()`. Traces must be scoped, not global.

---

## Chapter 5: Taming Chaos with Observability — The Opik Deep Dive

### The Challenge: "Why did it say that?"
With 17 agents, 5 chat handlers, 30+ intent types, and a hybrid evaluation pipeline — when the app gave bad advice, we had no idea *who* to blame. Was it the prompt? The context? The model? The intent detection? The extraction?

### What We Built: A Full Observability Stack on Opik

#### 5.1 Tracing Architecture

Every operation in Stride is traced. Here is what flows through Opik:

| Trace Name | Component | What it records |
|---|---|---|
| `chat.conversation` | Chat API | Message, intent, extraction, LLM response, evaluation scores |
| `chat.onboarding` | Onboarding | Step progression, profile extraction, validation |
| `voice.transcription` | Voice API | STT provider, model, audio bytes, language, duration |
| `swipe.preference_update` | Swipe API | Scenario ID, swipe decision, preference weight changes |
| `suggestion.user_feedback` | Feedback API | Thumbs up/down on AI suggestions |
| `budget.insight_generation` | Budget API | Budget analysis, health score |
| `tool.*` (11 traces) | MCP Tools | Goal planning, energy logging, job matching, etc. |

**Span hierarchy** (a single chat message generates 5+ spans):
```
chat.conversation (root trace)
  |- intent.detection        (regex → LLM fallback)
  |- extraction.groq         (LLM span: model, tokens, cost)
  |- budget.calculation       (tool span: margin, status)
  |- heuristic.evaluation    (5 checks in parallel)
  |- geval.judgment           (LLM span: 4 criteria scoring)
```

#### 5.2 Prompt Versioning

Every agent prompt is **hashed at startup** via SHA256 and attached to traces:

```typescript
const PROMPT_METADATA = registerPrompt('bruno-conversation', SYSTEM_PROMPT);
// → { name: 'bruno-conversation', version: '6beeab4c', hash: '6beeab4c6e99...' }
```

**8 prompts tracked** across frontend and backend:
- `bruno-onboarding`, `bruno-conversation`, `extraction-legacy`, `onboarding-extractor`
- `intent-classifier`, `geval-judge`
- `tab-tips.profile`, `tab-tips.goals`, `tab-tips.budget`, `tab-tips.trade`, `tab-tips.jobs`, `tab-tips.swipe`

In the Opik dashboard, we can filter traces by `prompt.version` to detect regressions when a prompt changes.

#### 5.3 Hybrid Evaluation Pipeline

Every chat response is evaluated by a **dual-layer system** before being shown to the user:

**Layer 1 — 5 Heuristic Checks (60% weight, instant, $0)**

| Check | What it detects | Score |
|---|---|---|
| `risk_keywords` | "crypto", "guaranteed returns" — with negation awareness ("avoid crypto" = safe) | 0-1 |
| `readability` | Flesch-Kincaid grade level (target 8-12 for students) | 0-1 |
| `tone` | Overly optimistic or aggressive language | 0-1 |
| `disclaimers` | Missing warnings when risky content is mentioned | 0-1 |
| `length_quality` | Response structure, length, formatting | 0-1 |

**Layer 2 — G-Eval LLM-as-Judge (40% weight, ~500ms, ~$0.0001)**

The same LLM that generates the response re-evaluates it against 4 criteria:

| Criterion | Weight | What it judges |
|---|---|---|
| `appropriateness` | 30% | Adapted to student context (budget < 1000/month) |
| `safety` | 35% | No risky financial recommendations |
| `coherence` | 15% | Logical, structured, no contradictions |
| `actionability` | 20% | Concrete, immediately actionable steps |

**Final score**: `heuristic (60%) + geval (40%)`, adjusted by G-Eval confidence. If confidence < 50%, the LLM weight is reduced proportionally.

**10+ feedback scores per response** are logged to Opik, enabling per-criterion dashboards and regression detection.

#### 5.4 Benchmark Dataset

`stride_benchmark_v1` — **28 test cases** across 5 categories, stored as an Opik Dataset:

| Category | Count | Purpose |
|---|---|---|
| **Valid** | 5 | Budget help, savings goals, expense reduction, job search, housing |
| **Subtle Violations** | 4 | Gambling curiosity, trading, dropshipping, investment scams |
| **Aggressive** | 4 | Crypto + student loan, casino borrowing, NFT loans, tax evasion |
| **Borderline** | 4 | Stocks with savings, debt vs savings, credit card cashback, family loan |
| **Intent Detection** | 11 | Restart, profile edits, goal creation, progress check, greetings |

Each benchmark run creates an Opik Experiment with pass/fail per test case, enabling trend analysis across prompt versions.

#### 5.5 Privacy & Compliance

**Location PII sanitization** (FERPA/GDPR):
- Before any data is sent to Opik, all location fields (`latitude`, `longitude`, `coords`) are replaced with `[LOCATION_REDACTED]`.
- Applied to both inputs and outputs of every trace.

#### 5.6 The Opik REST API — Going Beyond the SDK

We built a full REST API wrapper (`opikRest.ts`, 500+ lines) for features not available in the TypeScript SDK:

| Feature | What we use it for |
|---|---|
| **Datasets** | Create/manage benchmark datasets |
| **Experiments** | Run benchmark experiments, compare results |
| **Online Evaluation Rules** | Auto-evaluate ALL traces in the dashboard |
| **Annotation Queues** | Flag traces for human review |
| **Feedback Definitions** | Register custom metric types |
| **Metrics API** | 7-day aggregated stats (cost, tokens, error rate, pass rates) |
| **Trace Search** | Query traces by tags, status, duration |

---

## Chapter 6: The Routing Architecture — 50 Tools, No Tool Calling

### The Design Decision That Made Everything Work

Stride registers **50+ MCP tools** (budget analysis, job matching, voice transcription, goal planning...). The natural assumption is that the LLM picks which tool to call — the standard "agentic" approach.

**We didn't do that.** And that's why a 3B model can power the entire app.

### Why Not LLM Tool Calling?

Tool calling requires the LLM to:
1. Receive the full schema of all 50 tools (descriptions, parameters, types) in every prompt
2. Understand which tool(s) to invoke for a given message
3. Generate valid JSON for the tool parameters

This has three problems for our use case:
- **Token overhead**: 50 tool schemas ≈ 3,000-5,000 tokens per request, eating our context window
- **Small model reliability**: `ministral-3b-2512` hallucinates tool names and generates malformed parameters
- **Latency**: Multiple round-trips (generate tool call → execute → generate response) vs. a single LLM call

### What We Built Instead: Deterministic Routing

```
User: "Je suis fatigué, énergie 30%"
  │
  ├─ Step 1: Regex Intent Detection (~1ms, $0)
  │   100+ patterns test the message
  │   Match: /énergie\s*(\d+)/ → intent = "update_energy"
  │
  ├─ Step 2: Handler Dispatch (switch/case)
  │   "update_energy" → handleUpdateEnergy()
  │
  ├─ Step 3: Direct Function Call
  │   → POST /api/retroplan (energy log)
  │   → detectEnergyDebt() (algorithm)
  │   → detectComeback() (algorithm)
  │
  ├─ Step 4: LLM generates ONLY the response text
  │   No tools in prompt. Just: "Respond to a student who logged 30% energy"
  │
  └─ Step 5: Hybrid Evaluation (heuristics + G-Eval)
      → 10+ Opik feedback scores logged
```

When regex fails (ambiguous messages like "j'ai une idée pour gagner de l'argent"), the **LLM fallback** kicks in — but it doesn't do tool calling either. It classifies intent into a JSON action name:

```typescript
// LLM receives a simple classification prompt, NOT tool schemas
const response = await llmClient.chat.completions.create({
  model: 'ministral-3b-2512',
  messages: [{ role: 'user', content: classificationPrompt }],
  response_format: { type: 'json_object' },  // NOT tools/tool_choice
  max_tokens: 150,
});
// Returns: { "action": "search_jobs", "confidence": 0.85 }
// Then: switch(action) → direct function call
```

### The Three Invocation Paths

| Path | Who decides | How tools are called | When |
|---|---|---|---|
| **Frontend → Regex** | Code (100+ patterns) | `switch(intent.action)` → direct call | 80% of messages |
| **Frontend → LLM Classify** | LLM returns action name | `switch(action)` → direct call | 15% of messages |
| **MCP Protocol** | External client (Claude Desktop) | Client reads tool schemas, does real tool calling | Developer/debug mode |

The 50 MCP tool descriptions exist for **external MCP clients** (like Claude Desktop) that have powerful models capable of tool calling. The frontend never sends tool schemas to the LLM.

### Where Mastra Agents Fit

The 17 Mastra agents are instantiated with tools in their config, but `Agent.generate()` is only called for **onboarding** (new student profile collection). All other paths use:

| Component | How it invokes tools |
|---|---|
| `ActionDispatcher` | Validates extracted fields → shows form UI if missing |
| `ActionExecutor` | Calls service functions directly (profileService, goalService) |
| `executeAgent()` | Hardcoded algorithm execution (no LLM, no tools) |
| `handleTool()` | MCP server: flat `switch(name)` dispatch |

### Why This Architecture Is Better (For Our Use Case)

| Concern | LLM Tool Calling | Deterministic Routing |
|---|---|---|
| **Reliability** | Model may hallucinate tool names | 100% predictable |
| **Cost** | 3-5K extra tokens per request | $0 for routing |
| **Latency** | Multiple round-trips | Single LLM call (response only) |
| **Min. model size** | Needs 70B+ for reliable tool selection | Works with 3B |
| **Observability** | Hard to trace why a tool was chosen | Intent logged to Opik, fully debuggable |
| **MCP compatibility** | Built-in | Preserved via separate MCP server |

The trade-off: adding a new intent requires a regex pattern + handler code, not just a tool description. But for a hackathon app with well-defined features, deterministic routing is **faster to build and debug** than prompt-engineering reliable tool selection.

---

## Chapter 7: Architecture Overview — The Real Numbers

### 7.1 The Agent Swarm (17 Agents)

Stride is not one chatbot. It is **17 specialized agents** working in concert via the **Mastra** framework (`@mastra/core`):

**Core Specialists (7 in AGENT_CONFIGS)**

| Agent | Purpose | Tools |
|---|---|---|
| `BudgetCoach` | Income/expense analysis, personalized advice | analyze_budget, generate_advice, find_optimizations |
| `JobMatcher` | Skill-to-job matching via DuckPGQ graph | match_jobs, explain_job_match, compare_jobs |
| `ProjectionML` | Graduation balance predictions, scenario comparison | predict_graduation_balance, simulate_scenarios |
| `Guardian` | LLM-as-Judge safety validation | validate_calculation, check_risk_level |
| `MoneyMaker` | Vision-based item selling, side hustle ideas | analyze_image, estimate_price, suggest_hustles |
| `StrategyComparator` | Job vs side-hustle vs optimization comparison | compare_strategies, quick_strategy_comparison |
| `OnboardingAgent` | Progressive conversational onboarding | extract_profile_data, validate_profile |

**Orchestrators (3)**

| Agent | Purpose |
|---|---|
| `TabTipsOrchestrator` | Strategy pattern for per-tab contextual tips (Budget/Trade/Jobs/Goals/Profile) |
| `SwipeOrchestrator` | Tinder-style scenario compilation from user data |
| `DailyBriefing` | Morning briefing with energy/missions/deadline context |

**Guardrail Pipeline (4 — Scenario Protection)**

| Agent | Purpose |
|---|---|
| `EssentialGuardian` | Blocks naive suggestions (e.g., "stop eating") |
| `GhostObserver` | Behavioral filter — learns what user rejects |
| `AssetPivot` | Rent vs Sell economics for owned assets |
| `CashflowSmoother` | Timing mismatch detection (income/expense alignment) |

**Infrastructure (3)**

| Agent | Purpose |
|---|---|
| `LifestyleAgent` | Subscription analysis & pause strategies |
| `AgentExecutor` | Wraps agents with Opik tracing + error handling |
| `Factory` | Lazy agent creation with tool registration |

### 7.2 Frontend Chat Pipeline (5 Handlers + 30+ Intents)

The frontend chat is **not just an LLM wrapper**. It's a multi-stage pipeline:

```
User Message
  → Hybrid Intent Detection (100+ regex patterns, then LLM fallback)
  → Handler Dispatch (5 specialized handlers)
  → Action Extraction & Validation
  → Action Execution (DB writes, API calls)
  → Hybrid Evaluation (heuristics + G-Eval)
  → Opik Feedback Logging (10+ scores per response)
```

**5 extracted handlers** (each a self-contained module):

| Handler | Trigger | What it does |
|---|---|---|
| `progressSummary` | "how am I doing?" | Goal/mission/energy stats with action grid |
| `updateEnergy` | "tired", "super form", "energy 70" | Logs energy, detects debt/comeback |
| `completeMission` | "finished mission X" | Fuzzy-match → mark complete → update earnings |
| `skipMission` | "skip mission X" | Fuzzy-match → mark skipped |
| `recommendFocus` | "what should I focus on?" | Energy < 40 → rest, no missions → swipe, else highest-impact |

**30+ intent types** covering: chart requests, profile edits, goal creation, what-if scenarios, job search, subscription pauses, item sales, swipe navigation, and general conversation.

### 7.3 The 4 Killer Features

| Feature | Algorithm | How it works |
|---|---|---|
| **Skill Arbitrage** | `rate(30%) + demand(25%) + effort(25%) + rest(20%)` | Multi-criteria job scoring based on student's skills, with DuckPGQ graph queries |
| **Swipe Scenarios** | Pull architecture from user data | Tinder-style cards generated from trades, jobs, subscriptions — swipes update preference weights |
| **Comeback Mode** | Recovery detection: low(<40%) → high(>80%) | Detects energy recovery, generates 3-week catch-up plan |
| **Energy Debt** | 3+ consecutive weeks <40% energy | Severity levels (low/medium/high) → progressive target reduction (50-85%) |

### 7.4 The Data Layer

| Layer | Technology | Purpose |
|---|---|---|
| **Storage** | DuckDB (single file, local-first) | 15+ tables: profiles, goals, energy_logs, trades, inventory, etc. |
| **Knowledge Graph** | DuckPGQ extension | Skills → Jobs → Income paths as a property graph |
| **Vector Store** | `@mastra/duckdb` (HNSW indices) | Profile embeddings for RAG-powered recommendations |
| **Embedding Model** | `deposium_embeddings` (BGE-M3, 1024d) | External service via Ollama-compatible API |

### 7.5 Multi-Provider LLM Support

Stride is **provider-agnostic** — all via the OpenAI SDK:

| Provider | Service | Default Model | Use Case |
|---|---|---|---|
| **Mistral** | LLM | `ministral-3b-2512` | Fast chat, extraction, G-Eval |
| **Groq** | LLM | `llama-3.1-8b-instant` | Fallback, speed-critical paths |
| **Google Gemini** | LLM | `gemini-2.5-flash` | Heavy reasoning (configurable) |
| **Groq Whisper** | STT | `whisper-large-v3-turbo` | Default voice transcription |
| **Mistral Voxtral** | STT | `voxtral-mini-2602` | Alternative voice provider |

Providers are hot-swappable at runtime via the Settings page — no restart needed.

### 7.6 The Screens

| Screen | Route | Features |
|---|---|---|
| **Onboarding** | `/` | Conversational Q&A with Bruno avatar, progressive profile building |
| **Dashboard** | `/me` | 5 tabs: Profile, Goals, Budget, Trade (peer economy), Jobs (skill arbitrage) |
| **Swipe** | `/swipe` | Tinder-style income strategy selection with preference learning |
| **Progress** | `/progress` | Active missions, goal timeline, energy history, achievements |
| **Settings** | `/settings` | Multi-provider LLM/STT configuration with live API key testing |

---

## Chapter 8: Open Source Contributions

3 packages extracted and published during the hackathon:

| Package | Purpose | NPM |
|---|---|---|
| `@seed-ship/duckdb-mcp-native` | Bridge connecting DuckDB to the MCP ecosystem | [npmjs.com](https://www.npmjs.com/package/@seed-ship/duckdb-mcp-native) |
| `@seed-ship/mcp-ui-solid` | SolidJS component library for MCP UI Resources | [npmjs.com](https://www.npmjs.com/package/@seed-ship/mcp-ui-solid) |
| `deposium_embeddings-turbov2` | High-performance embedding inference engine | [GitHub](https://github.com/theseedship/deposium_embeddings-turbov2) |

---

## Chapter 9: Recommendations for Opik — From the Trenches

After integrating Opik deeply into a production-grade hackathon project, here is our honest feedback for the Opik team. These are the friction points we encountered, and the features we wish existed.

### 9.1 SDK Bugs We Worked Around

**Bug: `trace.update({ metadata })` does not persist metadata**
This is the most impactful bug we found. When you create a trace and later call `trace.update({ metadata: { ... } })`, the metadata is **silently lost**. It doesn't throw an error — it just doesn't save.

Our workaround: Pass ALL metadata in the initial `traceOptions` at trace creation time. This means you must know everything about the trace before it starts, which is architecturally awkward for dynamic metadata (like prompt version hashes computed during execution).

**Recommendation**: Fix the `update()` method or throw an error if metadata updates are not supported.

**Bug: Feedback scores logged inside `trace()` callback → 404**
The trace hasn't been flushed to Opik Cloud when the callback is still executing. Calling `logFeedbackScores(traceId, scores)` inside `trace()` returns a 404 because the trace doesn't exist yet server-side.

Our workaround: Always log feedback **after** `trace()` returns, not inside it.

**Recommendation**: Either flush traces synchronously before the callback returns, or provide an `onComplete` hook for post-trace operations.

### 9.2 Features We Wish Existed

**A JSON response parser / sanitizer for small models**
The #1 pain point of using small LLMs (Mistral 3B, Llama 8B) with Opik G-Eval is that they produce malformed JSON. We spent days building a multi-pass sanitizer (strip markdown, escape control chars, fix trailing commas). This could be a built-in utility:

```typescript
// Dream API:
import { safeParseJsonFromLLM } from 'opik';
const result = safeParseJsonFromLLM<MySchema>(rawLLMOutput);
// Handles: markdown fences, **bold** in values, literal \n in strings, trailing commas
```

**Built-in prompt versioning**
We built our own `registerPrompt()` that hashes prompts with SHA256 and attaches `prompt.name`, `prompt.version`, `prompt.hash` to traces. This should be a first-class Opik feature:

```typescript
// Dream API:
const prompt = opik.registerPrompt('budget-coach', SYSTEM_PROMPT);
// Automatically tracks version in every trace using this prompt
// Dashboard shows: "Prompt X v3 → 12% safety regression"
```

**Trace-level cost aggregation**
We manually calculate costs from token counts + per-model pricing tables. Opik could aggregate costs from nested LLM spans automatically:

```typescript
// Current: we compute cost ourselves and set totalEstimatedCost
// Dream: Opik reads model + tokens from LLM spans and auto-computes cost
```

**TypeScript SDK parity with REST API**
We had to build `opikRest.ts` (500+ lines) to access features the SDK doesn't expose:
- Online Evaluation Rules (LLM-as-Judge configuration)
- Annotation Queues
- Dataset/Experiment management
- Feedback Definitions
- Metrics/Statistics API

These are all REST-only. A unified SDK would reduce adoption friction significantly.

**Sampling configuration in SDK**
We built custom sampling logic (100% for errors/new users, 10% random) because the SDK traces everything or nothing. A built-in sampling API would help:

```typescript
// Dream API:
opik.configure({
  samplingRate: 0.1,
  alwaysTraceIf: (ctx) => ctx.hasError || ctx.isNewUser
});
```

### 9.3 What We Love About Opik

Despite the friction, Opik was **essential** to the project's success:

- **Trace timeline visualization**: Seeing the full span hierarchy (`chat → intent → extraction → evaluation`) in the Opik UI made debugging 10x faster than console logs.
- **Feedback scores on traces**: Being able to attach 10+ numeric scores to each trace and filter/sort by them in the dashboard is incredibly powerful for quality monitoring.
- **Online Evaluation Rules**: The ability to configure LLM-as-Judge evaluators in the dashboard (not in code) means non-engineers can tune evaluation criteria.
- **Dataset/Experiment model**: Running benchmark experiments against versioned datasets is the right abstraction for prompt regression testing.
- **Thread grouping**: `thread_id` on traces lets us group entire conversations, which is critical for conversational AI debugging.

### 9.4 Adoption Advice for Other Teams

1. **Start with feedback scores, not full tracing**. Attaching a simple `quality_score: 0.8` to each response gives immediate dashboard value before you invest in span hierarchies.
2. **Version your prompts from day 1**. We wasted days investigating regressions that were simply prompt changes. A SHA256 hash on every trace would have caught it instantly.
3. **Log feedback OUTSIDE the trace callback**. This bit us hard — the trace doesn't exist server-side until `trace()` returns.
4. **Use the REST API for advanced features**. The TypeScript SDK covers tracing and feedback, but Datasets, Experiments, and Online Evaluation Rules require direct REST calls.
5. **Sanitize LLM JSON before parsing**. If you use small models for evaluation (G-Eval), expect markdown artifacts in JSON. Build a sanitizer early.

---

## Chapter 10: Future Vision — What We Built For Tomorrow

### 10.1 RAG Infrastructure — Built, Wired, Ready to Scale

Most hackathon projects say "we'll add RAG later". **We already built the full pipeline** — it runs on every chat message today.

**What's live:**

| Component | Status | Technology |
|---|---|---|
| **Vector Store** | Running | `@mastra/duckdb` with HNSW indices, separate `stride-vectors.duckdb` |
| **Embedding Service** | Running | External Ollama API, BGE-M3 model (1024 dimensions, multilingual) |
| **3 Index Types** | Populated | `student_profiles`, `advice_history`, `goals` |
| **7 MCP RAG Tools** | Registered | `get_rag_context`, `index_student_profile`, `find_similar_goals`, etc. |
| **Chat Integration** | Active | RAG context injected into system prompt on every conversation message |
| **Tips Orchestrator** | Active | Similar profiles + past helpful advice retrieved for tip generation |
| **Feedback Loop** | Active | `storeAdvice()` + `updateAdviceOutcome()` → advice marked helpful/unhelpful → improves future retrieval |

**Data flow:**
```
Profile saved → embedStudentProfile() → Ollama API → vectorstore (HNSW)
                                                          ↓
User asks question → generateEmbedding(query) → findSimilar(profiles, advice, goals)
                                                          ↓
                                               formatRAGContextForPrompt()
                                                          ↓
                                               Injected into LLM system prompt
                                                          ↓
                                               "Students like you saved €200/month
                                                by doing X — here's how..."
```

**What it enables today:**
- "Students with similar profiles (same diploma, skills, city) who achieved their savings goal did X" — personalized advice from peer outcomes
- Past helpful advice is retrieved and reused, not regenerated from scratch
- Advice outcomes (helpful/unhelpful) feed back into the system — **the app learns which advice works**

**What it will enable at scale:**
- Cross-campus patterns: "Students in engineering in Lyon who worked 10h/week saved 30% more"
- Embedding fine-tuning based on outcome data
- Real-time similarity ranking with user engagement signals
- Privacy-preserving federated RAG across universities (embeddings shared, raw data never leaves)

**Graceful degradation**: If Ollama is unreachable, the frontend falls back to **mock deterministic embeddings** and the chat continues without RAG context. No feature is blocked — RAG is additive.

### 10.2 The MotherDuck Hybrid — Privacy-Preserving Community

This is where the architecture gets interesting. Today Stride is single-user, single-file DuckDB. But we designed the data model with a **clear privacy boundary** that maps perfectly to MotherDuck's hybrid architecture.

**The Privacy Map:**

```
┌─────────────────────────────────────────────────┐
│              LOCAL DuckDB (per student)          │
│                   stride.duckdb                  │
│                                                  │
│  🔒 PRIVATE — never leaves the device           │
│  ├── profiles (income, expenses, budget)         │
│  ├── goals (savings targets, progress)           │
│  ├── energy_logs (mood, stress, fatigue)         │
│  ├── academic_events (exams, deadlines)          │
│  ├── commitments (classes, obligations)          │
│  ├── job_recommendations (career data)           │
│  └── retroplans (financial projections)          │
│                                                  │
└─────────────────────────────────────────────────┘
                    ↕ sync only what's shared
┌─────────────────────────────────────────────────┐
│        MOTHERDUCK CLOUD (shared campus DB)       │
│            md:stride_community                   │
│                                                  │
│  🤝 SHARED — the student marketplace            │
│  ├── inventory_items (what I have to lend/sell)  │
│  ├── trades (borrow/lend/trade requests)         │
│  ├── karma_scores (reputation, tier badges)      │
│  ├── needs (what I'm looking for)                │
│  ├── challenges (community goals)                │
│  └── campus_board (browsable listings)           │
│                                                  │
│  📊 AGGREGATED — anonymous statistics           │
│  ├── avg_savings_by_diploma (no PII)             │
│  ├── popular_skills_by_city (counts only)        │
│  └── goal_success_rates (aggregated)             │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Why MotherDuck, not Postgres?**

| Requirement | MotherDuck | Postgres |
|---|---|---|
| DuckPGQ graph queries | Native support | Requires Apache AGE plugin |
| Zero-rewrite migration | Just change connection string | Full ORM rewrite |
| Local-first dev | Same DuckDB file | Needs Docker for local dev |
| Hybrid local/cloud | Built-in `md:` prefix for cloud tables | Not possible |
| HNSW vector indices | Via `@mastra/duckdb` | Via pgvector |

**The key insight:** MotherDuck lets you query **both local and cloud tables in the same SQL statement**:

```sql
-- Local financial data + cloud community data in ONE query
SELECT t.name, t.value, k.tier
FROM local.trades t
JOIN md:stride_community.karma_scores k ON t.profile_id = k.profile_id
WHERE t.type = 'lend' AND k.tier = 'star'
```

Your financial data stays on your device. Only your inventory, trades, and karma are visible to the community. **Data sovereignty by design.**

### 10.3 The Community Evolution — From Solo App to Campus Network

The existing data model already supports 4 trade types with karma scoring:

| Action | Karma | Today (solo) | Tomorrow (community) |
|---|---|---|---|
| **Sell** | 0 pts | List on Vinted/LeBonCoin | Campus marketplace listing |
| **Lend** | +50 pts | Self-declared, partner = string | Match with borrower requests |
| **Borrow** | +20 pts | Self-declared | Browse campus board, request items |
| **Trade** | +30 pts | Self-declared | Skill/item exchange matching |

**What already exists in the code:**
- Karma tiers (Newcomer → Helper → Star) with energy bonuses (+1% per 50 karma, capped +10%)
- Swipe scenarios include `karma_trade`, `karma_lend`, `karma_borrow` categories
- Achievements: "Community Helper", "Sharing Champion", "Karma Legend"
- Trade lifecycle: `pending → active → completed`

**Phase 1 — Campus Board (mocked, T1)**
A simulated feed of nearby students with available items. Demonstrates the vision with seed data. Clicking "I need this" creates a borrow intent in your Trade tab.

**Phase 2 — Karma V2 with Collateral (T2)**
Borrowing *locks* karma points as collateral (returned when item returned on time). Late returns cost karma. This prevents "parasite" behavior — you must contribute before you can take.

**Phase 3 — Smart Matching via RAG (T2)**
Users declare "needs" (items they want). The embedding service matches needs against campus inventory using semantic similarity — "perceuse" matches "drill", "bouquin de chimie" matches "Organic Chemistry textbook".

**Phase 4 — Full MotherDuck Hybrid (T3)**
Real multi-user with authentication (university email domains), real-time campus board via WebSocket, and the privacy boundary described above.

### 10.4 TabPFN — Zero-Shot Prediction (Deferred)

We planned TabPFN for "zero-shot tabular prediction" — predicting burnout risk, goal failure probability, and optimal work hours from structured profile data. For the hackathon, we used heuristic rules (energy debt = 3+ weeks below 40%). TabPFN remains the path to **true predictive intelligence** without training data.

### 10.5 The Vercel Wall

DuckDB requires a persistent, writable file system. Vercel Serverless has ephemeral `/tmp`. We deploy on **VPS/Docker** with persistent volumes. With MotherDuck hybrid, the local DuckDB would move to the user's device (browser/PWA) and only the shared tables would live in the cloud — solving the deployment problem entirely.

---

## Appendix A: By The Numbers

| Metric | Count |
|---|---|
| **Agents** | 17 (7 specialists + 3 orchestrators + 4 guardrails + 3 infrastructure) |
| **MCP Tools** | 50+ (across 10 tool files) |
| **Chat Handlers** | 5 (extracted, tested, traced) |
| **Intent Types** | 30+ (100+ regex patterns + LLM fallback) |
| **Evaluation Criteria** | 9 per response (5 heuristics + 4 G-Eval) |
| **Feedback Scores per Trace** | 10+ (heuristic.*, geval.*, evaluation.*) |
| **Prompt Versions Tracked** | 12 (6 frontend + 6 backend) |
| **Benchmark Test Cases** | 28 (across 5 categories) |
| **DuckDB Tables** | 15+ |
| **API Endpoints** | 40+ |
| **Chart Types** | 8 |
| **Screens** | 5 |
| **LLM Providers Supported** | 3 (Mistral, Groq, Gemini) |
| **STT Providers Supported** | 2 (Groq Whisper, Mistral Voxtral) |
| **Open Source Packages** | 3 |
| **Lines of Agent Code** | ~6,000+ |
| **Lines of Opik Integration** | ~2,500+ (opik.ts + opikRest.ts + hybridEval.ts + benchmark.ts + metrics.ts) |

## Appendix B: Opik Integration Map

```
                           +------------------+
                           |   Opik Cloud     |
                           |   Dashboard      |
                           +--------+---------+
                                    |
                    +---------------+---------------+
                    |               |               |
              Traces API    Feedback API    REST API
                    |               |               |
         +----------+        +-----+-----+    +----+----+
         |          |        |           |    |         |
    opik.ts    opik.ts    logFeedback  Online   Datasets
  (frontend)  (MCP srv)   Scores     Eval Rules  Experiments
         |          |        |           |         Metrics
         |          |        |           |
  +------+----+ +---+---+ +-+-------+  +-+--------+
  |           | |       | |         |  |          |
  chat.ts    voice.ts  swipe    hybridEval   benchmark
  (traces)   (traces)  (traces) (eval+scores) (28 cases)
  |
  +-- intent.detection (span)
  +-- extraction.groq (LLM span)
  +-- budget.calculation (span)
  +-- heuristic.evaluation (span)
  +-- geval.judgment (LLM span)
```
