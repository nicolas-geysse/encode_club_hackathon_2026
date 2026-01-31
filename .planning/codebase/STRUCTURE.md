# Codebase Structure

**Analysis Date:** 2026-01-31

## Directory Layout

```
encode_club_hackathon_2026/
├── packages/
│   ├── frontend/                  # SolidStart SSR frontend
│   │   ├── src/
│   │   │   ├── routes/            # Pages (index.tsx, plan.tsx, suivi.tsx) + server functions
│   │   │   │   ├── api/           # 20+ server function endpoints (chat, goals, profiles, etc.)
│   │   │   │   ├── (routes)/      # Layout/fallback routes
│   │   │   │   ├── index.tsx      # Onboarding page
│   │   │   │   ├── plan.tsx       # Dashboard (7 tabs)
│   │   │   │   └── suivi.tsx      # Analytics dashboard
│   │   │   ├── components/        # SolidJS components (chat, tabs, UI, layout)
│   │   │   │   ├── chat/          # OnboardingChat, ChatComponents
│   │   │   │   ├── tabs/          # ProfileTab, GoalsTab, SkillsTab, BudgetTab, etc.
│   │   │   │   ├── ui/            # Reusable UI (Button, Card, Tabs, Sheet, Dialog)
│   │   │   │   ├── layout/        # Page layout components
│   │   │   │   ├── swipe/         # Swipe scenario components
│   │   │   │   ├── suivi/         # Dashboard components (timeline, energy chart)
│   │   │   │   ├── analytics/     # Analytics visualizations
│   │   │   │   └── debug/         # Debug/test components
│   │   │   ├── lib/               # Core services and utilities
│   │   │   │   ├── profileService.ts          # Profile CRUD + DuckDB persistence
│   │   │   │   ├── goalService.ts             # Goal/milestone management
│   │   │   │   ├── budgetService.ts           # Budget calculation
│   │   │   │   ├── budgetEngine.ts            # Projection + scenario math
│   │   │   │   ├── tradeService.ts            # Inventory trades
│   │   │   │   ├── incomeService.ts           # Income sources
│   │   │   │   ├── inventoryService.ts        # Items/inventory
│   │   │   │   ├── lifestyleService.ts        # Lifestyle items
│   │   │   │   ├── chatChartBuilder.ts        # UI chart rendering
│   │   │   │   ├── chat/                      # Chat intelligence modules
│   │   │   │   │   ├── extraction.ts          # Regex + Groq extraction
│   │   │   │   │   ├── intent.ts              # Intent detection logic
│   │   │   │   │   ├── prompts.ts             # Chat system/step prompts
│   │   │   │   │   ├── flow.ts                # Onboarding step flow
│   │   │   │   │   ├── evaluation.ts          # Response quality check
│   │   │   │   │   ├── commands.ts            # Slash command parsing
│   │   │   │   │   └── ActionDispatcher.ts    # Request routing
│   │   │   │   ├── mastra/                    # Mastra integration
│   │   │   │   │   └── workingMemory.ts       # Tab-scoped memory
│   │   │   │   ├── opik.ts                    # Opik tracing (frontend wrapper)
│   │   │   │   ├── timeAwareDate.ts           # Simulation time support
│   │   │   │   ├── geolocation.ts             # Map + location utilities
│   │   │   │   ├── dateUtils.ts               # Date helpers
│   │   │   │   ├── expenseUtils.ts            # Expense normalization
│   │   │   │   ├── arrayMergeUtils.ts         # Array merge strategies
│   │   │   │   ├── logger.ts                  # Custom logger
│   │   │   │   ├── eventBus.ts                # Event pub/sub
│   │   │   │   ├── nativeModule.ts            # DuckDB native module loader
│   │   │   │   ├── cn.ts                      # TailwindCSS class merger
│   │   │   │   ├── config.ts                  # App config
│   │   │   │   └── api.ts                     # API fetch helpers
│   │   │   ├── types/
│   │   │   │   ├── entities.ts                # Core entities (Profile, Skill, Expense, etc.)
│   │   │   │   ├── chat.ts                    # Chat types (Message, UIResource)
│   │   │   │   ├── actions.ts                 # Action/dispatch types
│   │   │   │   └── duckdb.ts                  # DuckDB type definitions (local)
│   │   │   ├── hooks/                        # SolidJS hooks (useProfile, useSimulation)
│   │   │   ├── data/                         # Static/reference data
│   │   │   └── config/                       # Configuration
│   │   ├── app.config.ts                     # Vite + SolidStart config (external deps)
│   │   ├── app.tsx                           # Root component + providers
│   │   └── package.json
│   │
│   └── mcp-server/                           # MCP stdio server (Mastra agents)
│       ├── src/
│       │   ├── index.ts                      # MCP server entry + tool router
│       │   ├── tools/                        # Tool implementations (50+ tools)
│       │   │   ├── index.ts                  # Tool registry + handleTool router
│       │   │   ├── goal.ts                   # Goal creation/tracking
│       │   │   ├── profile.ts                # Profile management
│       │   │   ├── simulation.ts             # Time manipulation
│       │   │   ├── swipe.ts                  # Swipe scenario preference learning
│       │   │   ├── voice.ts                  # Audio transcription
│       │   │   ├── rag.ts                    # RAG + vector search
│       │   │   ├── rag-tools.ts              # RAG tool wrappers
│       │   │   ├── prospection.ts            # Job prospection (Google Maps)
│       │   │   ├── browser.ts                # Browser automation
│       │   │   ├── duckdb-mcp.ts             # DuckDB query interface
│       │   │   └── __tests__/
│       │   ├── agents/                       # Mastra agents (4 core agents)
│       │   │   ├── factory.ts                # Agent creation + registration
│       │   │   ├── budget-coach.ts           # Income vs expenses analysis
│       │   │   ├── job-matcher.ts            # Skill arbitrage + graph matching
│       │   │   ├── projection-ml.ts          # Graduation balance forecast
│       │   │   ├── guardian.ts               # Recommendation validation
│       │   │   ├── onboarding-agent.ts       # Onboarding Q&A (not in workflow)
│       │   │   ├── money-maker.ts            # Job discovery expansion
│       │   │   ├── strategy-comparator.ts    # Swipe scenario comparison
│       │   │   ├── tips-orchestrator.ts      # Tip generation
│       │   │   └── index.ts                  # Agent exports
│       │   ├── algorithms/                   # Business logic (deterministic)
│       │   │   ├── skill-arbitrage.ts        # Job scoring: rate(30%) + demand(25%) + effort(25%) + rest(20%)
│       │   │   ├── energy-debt.ts            # Energy <40% for 3+ weeks triggers target
│       │   │   ├── comeback-detection.ts     # Energy >80% after low period recovery
│       │   │   ├── retroplanning.ts          # Goal milestone → action plan
│       │   │   └── __tests__/                # Algorithm tests
│       │   ├── evaluation/                   # Hybrid validation
│       │   │   ├── index.ts                  # Evaluation orchestrator
│       │   │   ├── geval/                    # G-Eval LLM-based scoring
│       │   │   │   ├── index.ts
│       │   │   │   ├── criteria.ts           # Quality criteria definitions
│       │   │   │   └── prompts.ts            # G-Eval system prompts
│       │   │   ├── heuristics/               # Rule-based checks
│       │   │   │   ├── index.ts
│       │   │   │   ├── readability.ts        # Flesch-Kincaid score
│       │   │   │   ├── tone.ts               # Tone analysis
│       │   │   │   ├── calculation.ts        # Math correctness checks
│       │   │   │   ├── risk-keywords.ts      # Risky language detection
│       │   │   │   └── disclaimers.ts        # Disclaimer requirements
│       │   │   ├── opik-integration.ts       # Opik score logging
│       │   │   └── types.ts
│       │   ├── services/                     # Cross-cutting services
│       │   │   ├── groq.ts                   # Groq LLM wrapper (chat, completion)
│       │   │   ├── opik.ts                   # Opik tracing (MCP server version)
│       │   │   ├── duckdb.ts                 # DuckDB query wrapper
│       │   │   ├── embeddings.ts             # Embedding generation
│       │   │   ├── gemini.ts                 # Google Gemini (experimental)
│       │   │   ├── google-maps.ts            # Google Maps API (prospection)
│       │   │   ├── llm-provider.ts           # LLM abstraction
│       │   │   ├── vectorstore.ts            # Vector DB (for RAG)
│       │   │   ├── local-discovery.ts        # Local file indexing
│       │   │   ├── prompts.ts                # Shared prompt library
│       │   │   ├── promptHash.ts             # Prompt version tracking
│       │   │   └── index.ts
│       │   ├── workflows/                    # Multi-agent orchestration
│       │   │   ├── student-analysis.ts       # Main workflow: analyze_student_profile
│       │   │   ├── goal-planning.ts          # Goal decomposition + action plans
│       │   │   └── index.ts
│       │   ├── graph/                        # Knowledge graph (DuckDB relations)
│       │   │   └── (graph queries in tools)
│       │   ├── experiments/                  # A/B testing support
│       │   │   └── providerAB.ts
│       │   ├── types/                        # Type definitions
│       │   └── utils/                        # Utility functions
│       ├── mastra.config.ts                  # Mastra configuration
│       ├── vitest.config.ts                  # Test runner config
│       └── package.json
│
├── data/
│   └── stride.duckdb                         # Single persistent database file
│
├── scripts/
│   ├── test-api.sh                           # curl-based API tests
│   └── demo-opik.ts                          # Workflow demo script
│
├── docs/
│   ├── 0-main/                               # Project documentation
│   ├── architecture/                         # Architecture diagrams
│   ├── bugs-dev/                             # Known issues
│   └── mcp-ui-solid/                         # MCP + SolidJS notes
│
├── .planning/
│   └── codebase/                             # GSD analysis documents
│
├── pnpm-workspace.yaml                       # Workspace definition
├── package.json                              # Root scripts + shared deps
└── CLAUDE.md                                 # This file (Claude instructions)
```

## Directory Purposes

**`packages/frontend/src/routes/`:**
- Purpose: Page routes and server functions
- Contains: 3 page routes + 20+ API server functions
- Key files: `index.tsx` (onboarding), `plan.tsx` (dashboard), `suivi.tsx` (analytics), `api/*.ts` (endpoints)

**`packages/frontend/src/components/`:**
- Purpose: Reusable SolidJS components
- Contains: Chat UI, tab panels, buttons, cards, dialogs, charts
- Key files: `chat/OnboardingChat.tsx`, `tabs/*.tsx` (one per dashboard tab)

**`packages/frontend/src/lib/`:**
- Purpose: Business logic, services, and utilities
- Contains: Profile/goal/budget services, chat intelligence, Opik tracing, DuckDB integration
- Key patterns: Services use async initialization, chat modules compose with other modules

**`packages/frontend/src/types/`:**
- Purpose: TypeScript interfaces and type aliases
- Key files: `entities.ts` (core domain types), `chat.ts` (UI types), `actions.ts` (dispatch types)

**`packages/mcp-server/src/tools/`:**
- Purpose: MCP tool implementations, callable from Claude
- Contains: 50+ tools grouped by domain (goal, profile, simulation, voice, rag, etc.)
- Pattern: Each tool module exports `{NAME}_TOOLS` object + `handleNameTool()` function
- Router: `index.ts` dispatches to correct handler

**`packages/mcp-server/src/agents/`:**
- Purpose: Mastra agents for LLM-powered recommendations
- Contains: 4 core agents + helper agents
- Key pattern: Agents defined as functions returning Agent instance with tools + system prompt
- Used by: Workflows, tools, server functions (imported from frontend)

**`packages/mcp-server/src/algorithms/`:**
- Purpose: Deterministic business logic
- Contains: Job scoring, energy calculations, comeback detection, retroplanning
- Key pattern: Pure functions with test coverage, no side effects
- Difference from agents: No LLM involved, fully deterministic

**`packages/mcp-server/src/evaluation/`:**
- Purpose: Quality validation for recommendations
- Contains: Heuristic checks (readability, tone, risk) + LLM G-Eval scoring
- Used by: Guardian agent for final validation before returning recommendations

**`packages/mcp-server/src/services/`:**
- Purpose: Integration with external APIs and databases
- Contains: Groq LLM, Opik tracing, DuckDB queries, embeddings, Google Maps
- Pattern: Each service is a module with exported functions, lazily initialized

**`packages/mcp-server/src/workflows/`:**
- Purpose: Multi-agent orchestration
- Contains: `student-analysis.ts` (main workflow), `goal-planning.ts` (goal decomposition)
- Pattern: Async function that sequences agents, aggregates results, returns structured output

**`data/`:**
- Purpose: Persistent data storage
- Contains: Single `stride.duckdb` file with all tables
- Size: Starts empty, grows with user data and graph relationships

## Key File Locations

**Entry Points:**

- `packages/frontend/src/routes/index.tsx`: GET / → OnboardingChat
- `packages/frontend/src/routes/plan.tsx`: GET /plan → Dashboard (7 tabs)
- `packages/frontend/src/routes/suivi.tsx`: GET /suivi → Analytics dashboard
- `packages/mcp-server/src/index.ts`: MCP server startup (stdio transport)

**Configuration:**

- `package.json`: Root scripts (dev, build, lint, test)
- `packages/frontend/app.config.ts`: Vite + SolidStart configuration
- `packages/mcp-server/mastra.config.ts`: Mastra LLM model + API key config
- `CLAUDE.md`: Development guidelines and architecture notes
- `.env`: Runtime configuration (GROQ_API_KEY, OPIK_API_KEY, OPIK_WORKSPACE)

**Core Logic:**

- `packages/frontend/src/routes/api/_db.ts`: DuckDB singleton connection
- `packages/frontend/src/lib/profileService.ts`: Profile CRUD + persistence
- `packages/mcp-server/src/agents/factory.ts`: Agent creation with consistent config
- `packages/mcp-server/src/workflows/student-analysis.ts`: Main multi-agent workflow

**Testing:**

- `packages/mcp-server/src/algorithms/__tests__/`: Algorithm unit tests
- `packages/mcp-server/src/tools/__tests__/`: Tool integration tests
- `packages/frontend/src/routes/api/__tests__/`: Server function tests
- `packages/frontend/src/lib/__tests__/`: Service unit tests

**Observability:**

- `packages/frontend/src/lib/opik.ts`: Frontend tracing wrapper
- `packages/mcp-server/src/services/opik.ts`: MCP server tracing + prompt registration

## Naming Conventions

**Files:**

- `camelCase` for services (`profileService.ts`, `goalService.ts`)
- `PascalCase` for React/SolidJS components (`OnboardingChat.tsx`, `ProfileTab.tsx`)
- `kebab-case` for tools (`duckdb-mcp.ts`, `rag-tools.ts`)
- `lowercase` for utilities and types (`logger.ts`, `entities.ts`, `actions.ts`)
- `__tests__/` directory for test files alongside source

**Directories:**

- Feature areas use singular nouns: `components/`, `services/`, `algorithms/`
- Route grouping with parentheses: `routes/(routes)/layout.tsx`
- API endpoints as separate files: `routes/api/chat.ts`, `routes/api/goals.ts`

**Classes/Types:**

- `PascalCase` for classes and interfaces (`FullProfile`, `BudgetContext`, `OnboardingStep`)
- `camelCase` for instances and functions
- Type names end with `-Type` or `-Schema` when needed for disambiguation

**Functions:**

- `camelCase` for all functions
- Prefix with `create`, `fetch`, `handle`, `get`, `set` for clear intent
- Server functions prefixed with `server$` (SolidStart convention): `server$(async (arg) => {})`
- Trace function calls: `trace(spanName, async (ctx) => {})`

## Where to Add New Code

**New Feature (e.g., "Loan Repayment Planner"):**

1. **Backend Algorithm:**
   - Create `packages/mcp-server/src/algorithms/loan-repayment.ts`
   - Export pure function: `calculateRepaymentSchedule(principal, rate, term)`
   - Add tests in `__tests__/loan-repayment.test.ts`

2. **Agent (if LLM needed):**
   - Create `packages/mcp-server/src/agents/loan-agent.ts`
   - Use factory: `export const loanAgent = createStrideAgent('loan-agent', systemPrompt, [loanTool])`
   - Add tool: `packages/mcp-server/src/agents/loan-agent.ts` (co-located)

3. **Frontend Service:**
   - Create `packages/frontend/src/lib/loanService.ts` with CRUD methods
   - Use DuckDB for persistence: call server function for DB access

4. **Frontend Component:**
   - Create `packages/frontend/src/components/tabs/LoanTab.tsx`
   - Add to tab list in `packages/frontend/src/routes/plan.tsx`

5. **Server Function:**
   - Create `packages/frontend/src/routes/api/loan.ts`
   - Export as: `export const saveLoanData = server$(async (data) => {})`
   - Import service and call DuckDB

6. **MCP Tool:**
   - Add to `packages/mcp-server/src/tools/` or expand existing tool
   - Follow pattern: `TOOL_DEFINITIONS` + `handleToolName()`
   - Register in `tools/index.ts` TOOLS object

**New Component/Module (e.g., "Energy Visualization"):**

- Implementation: `packages/frontend/src/components/suivi/EnergyChart.tsx`
- Type definitions: Add to `packages/frontend/src/types/entities.ts` if needed
- Shared utilities: `packages/frontend/src/lib/energyUtils.ts` if reused
- Tests: `packages/frontend/src/components/suivi/__tests__/EnergyChart.test.tsx`

**Shared Utilities:**

- Algorithmic utilities: `packages/mcp-server/src/utils/`
- Frontend utilities: `packages/frontend/src/lib/` (if used by multiple components)
- Shared types: `packages/frontend/src/types/` (single source of truth)

**Database Schema Changes:**

1. Create migration script in `packages/frontend/src/routes/api/`
2. Use `executeSchema()` for CREATE/ALTER/DROP (includes checkpoint)
3. Update types in `packages/frontend/src/types/entities.ts`
4. Test with fresh database: `rm data/stride.duckdb && pnpm dev`

**Tests:**

- Unit tests: Co-locate with source (`file.ts` → `file.test.ts` or `__tests__/file.test.ts`)
- Integration tests: `packages/frontend/src/routes/api/__tests__/`
- Algorithm tests: `packages/mcp-server/src/algorithms/__tests__/`
- Test framework: `vitest` for mcp-server, SolidJS testing utilities for frontend

## Special Directories

**`packages/frontend/src/lib/chat/`:**
- Purpose: Onboarding chat intelligence modules
- Generated: No (all source code)
- Committed: Yes
- Files: extraction, intent, prompts, flow, evaluation, commands
- Pattern: Each module is composable, chat.ts uses them sequentially

**`packages/mcp-server/src/graph/`:**
- Purpose: Knowledge graph queries (stored in DuckDB tables, not separate)
- Generated: No
- Committed: Yes
- Note: Graph is represented as `student_nodes` and `student_edges` tables in DuckDB

**`data/`:**
- Purpose: DuckDB persistent file
- Generated: Yes (on first run, then grows)
- Committed: No (should be .gitignored)
- Size: Typically 10-100MB depending on data volume and graph size

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by GSD mapper)
- Committed: Yes (helpful for onboarding)
- Files: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md

**`docs/`:**
- Purpose: Project documentation and architecture diagrams
- Generated: No
- Committed: Yes
- Note: Update manually when architecture changes

---

*Structure analysis: 2026-01-31*
