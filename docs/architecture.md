# Stride Architecture Documentation

## Overview

Stride is a student financial health navigator built for the Encode Club Hackathon 2026. It combines LLM-powered agents with observability to help students manage budgets through 4 killer features:

1. **Skill Arbitrage** - Smart job matching with multi-criteria scoring
2. **Swipe Scenarios** - Tinder-style strategy selection with preference learning
3. **Comeback Mode** - Post-exam recovery detection and catch-up plans
4. **Energy Debt** - Gamified burnout prevention with target reduction

---

## Project Structure

```
encode_club_hackathon_2026/
├── packages/
│   ├── frontend/              # SolidJS + SolidStart web application
│   │   ├── src/
│   │   │   ├── routes/        # File-based routing
│   │   │   │   ├── api/       # Server-side API routes (DuckDB)
│   │   │   │   ├── index.tsx  # Screen 0: Onboarding
│   │   │   │   ├── plan.tsx   # Screen 1: My Plan (6 tabs)
│   │   │   │   └── suivi.tsx  # Screen 2: Dashboard
│   │   │   ├── components/    # UI components
│   │   │   ├── lib/           # Services and utilities
│   │   │   └── types/         # TypeScript definitions
│   │   └── app.config.ts      # Vinxi/SolidStart config
│   │
│   └── mcp-server/            # MCP Server + Mastra agents
│       └── src/
│           ├── agents/        # AI agents with tools
│           ├── algorithms/    # Core business logic
│           ├── tools/         # MCP tool implementations
│           └── services/      # DuckDB, Groq, Opik integrations
│
├── data/                      # DuckDB database file (stride.duckdb)
├── docs/                      # Project documentation
└── pnpm-workspace.yaml        # Monorepo configuration
```

---

## Technology Stack

### Frontend (packages/frontend)

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Framework | SolidJS | 1.9.x | Reactive UI framework |
| Meta-framework | SolidStart | 1.1.x | SSR, routing, API routes |
| Build | Vinxi | 0.5.x | Build tool (Nitro-based) |
| Styling | TailwindCSS | 3.4.x | Utility-first CSS |
| UI Library | @kobalte/core | 0.13.x | Accessible primitives |
| Database | DuckDB | 1.4.1 | In-process analytics DB |
| LLM | Groq SDK | 0.37.x | Fast LLM inference |
| Observability | Opik | 1.9.x | LLM tracing |

### Backend (packages/mcp-server)

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Protocol | MCP SDK | 1.0.x | Model Context Protocol |
| Orchestration | Mastra Core | 1.0.0-beta | Agent framework |
| Database | DuckDB | 1.0.0 | Persistent storage |
| LLM | @ai-sdk/groq | 0.x | AI SDK integration |
| Validation | Zod | 3.22.x | Schema validation |
| NLP | compromise | 14.x | Natural language parsing |

### Shared Infrastructure

| Category | Technology | Purpose |
|----------|------------|---------|
| Package Manager | pnpm 10.x | Workspace management |
| Linting | ESLint + TypeScript ESLint | Code quality |
| Formatting | Prettier | Code style |
| Testing | Vitest | Unit testing |
| Git Hooks | Husky + lint-staged | Pre-commit checks |

---

## Core Algorithms

### 1. Skill Arbitrage (`packages/mcp-server/src/algorithms/skill-arbitrage.ts`)

Multi-criteria job scoring that balances income potential with sustainability.

**Formula:**
```
score = rate(30%) + demand(25%) + effort(25%) + rest(20%)
```

**Weights:**
- `hourlyRate` (30%): Monetary compensation
- `marketDemand` (25%): Job availability in local market
- `cognitiveEffort` (25%): Mental load (inverse scoring)
- `restNeeded` (20%): Recovery time required

**Key Function:**
```typescript
function calculateSkillScore(skill: Skill): number {
  return (
    normalize(skill.hourlyRate, 8, 50) * 0.30 +
    normalize(skill.marketDemand, 1, 5) * 0.25 +
    (1 - normalize(skill.cognitiveEffort, 1, 5)) * 0.25 +
    (1 - normalize(skill.restNeeded, 0, 4)) * 0.20
  );
}
```

### 2. Comeback Detection (`packages/mcp-server/src/algorithms/comeback-detection.ts`)

Detects recovery from low energy periods and generates catch-up plans.

**Trigger Conditions:**
- ≥2 weeks with energy <40% (low period)
- Current energy >80% (recovered)
- Previous week energy <50% (recent low)

**Catch-up Plan Generation:**
1. Calculate missed progress during low period
2. Distribute catch-up across remaining weeks
3. Cap at max weekly hours from profile
4. Suggest reduced effort activities first

### 3. Energy Debt (`packages/mcp-server/src/algorithms/energy-debt.ts`)

Prevents burnout through automatic target reduction and gamification.

**Trigger:** ≥3 consecutive weeks with energy <40%

**Severity Levels:**
| Level | Weeks | Target Reduction |
|-------|-------|-----------------|
| Low | 3 | 50% |
| Medium | 4 | 75% |
| High | 5+ | 85% |

**Gamification Elements:**
- Debt points accumulate per low week (30 pts/week)
- Achievements: "Debt Survivor", "Fully Recharged", "Resilient"
- Recovery progress tracking

### 4. Swipe Preference Learning (`packages/mcp-server/src/tools/swipe.ts`)

Updates user preferences based on Tinder-style swipes on scenarios.

**Preference Dimensions:**
- `effortSensitivity` (0-1): Prefer low-effort jobs
- `hourlyRatePriority` (0-1): Prioritize high pay
- `timeFlexibility` (0-1): Value flexible hours
- `incomeStability` (0-1): Prefer stable income

**Update Algorithm:**
```typescript
const learningRate = 0.15;
const multiplier = decision === 'right' ? 1 : -1;

preferences.effortSensitivity = clamp(
  current.effortSensitivity +
  learningRate * multiplier * (1 - normalizedEffort)
);
```

---

## Agent Architecture

### Agent Factory Pattern (`packages/mcp-server/src/agents/factory.ts`)

Agents are created from configuration objects using a centralized factory:

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;  // System prompt
  toolNames: string[];   // Registered tool IDs
}
```

### Available Agents

| Agent | ID | Purpose | Tools |
|-------|-----|---------|-------|
| Budget Coach | `budget-coach` | Analyze budget, give advice | analyze_budget, generate_advice, find_optimizations |
| Job Matcher | `job-matcher` | Find compatible jobs | match_jobs, explain_job_match, compare_jobs |
| Projection ML | `projection-ml` | Predict graduation balance | predict_graduation_balance, simulate_scenarios |
| Guardian | `guardian` | Validate recommendations | validate_calculation, check_risk_level |
| Money Maker | `money-maker` | Side hustles, item selling | analyze_sellable_objects, estimate_item_price, suggest_side_hustles |
| Strategy Comparator | `strategy-comparator` | Compare options | compare_strategies, quick_strategy_comparison |
| Goal Planner | `goal-planner` | Create savings plans | create_goal_plan, update_goal_progress, goal_risk_assessment |

### Tool Registry

Tools are registered globally and referenced by name:

```typescript
// Register
registerTool('analyze_budget', analyzeBudgetTool);

// Lookup
const tools = getToolsByNames(['analyze_budget', 'generate_advice']);
```

---

## API Routes

### Frontend API (`packages/frontend/src/routes/api/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/chat` | POST | Onboarding & conversation with LLM |
| `/api/profiles` | GET, POST, PUT, DELETE | Profile CRUD |
| `/api/skills` | GET, POST, PUT, DELETE | Skills management |
| `/api/lifestyle` | GET, POST, PUT, DELETE | Lifestyle expenses |
| `/api/inventory` | GET, POST, PUT, DELETE | Items to sell |
| `/api/income` | GET, POST, PUT, DELETE | Income sources |
| `/api/goals` | GET, POST, PUT, DELETE | Savings goals |
| `/api/retroplan` | GET, POST | Retroplanning calculations |
| `/api/simulation` | GET, POST | Time simulation for testing |
| `/api/analytics` | GET | Usage analytics |
| `/api/voice` | POST | Voice interaction |

### DuckDB Integration

All API routes use a centralized DuckDB connection:

```typescript
import { query, execute, escapeSQL } from './_db';

// Read
const items = await query<LifestyleItemRow>(
  `SELECT * FROM lifestyle_items WHERE profile_id = ${escapeSQL(profileId)}`
);

// Write (queued to prevent WAL conflicts)
await execute(`
  INSERT INTO lifestyle_items (id, name, current_cost)
  VALUES (${escapeSQL(id)}, ${escapeSQL(name)}, ${cost})
`);
```

---

## UI Components

### Screen Structure

```
Screen 0 (/) - Onboarding
├── OnboardingChat
│   ├── ChatMessage
│   └── ChatInput

Screen 1 (/plan) - My Plan
├── ProfileTab
├── GoalsTab
├── SkillsTab
├── BudgetTab (Lifestyle)
├── TradeTab
└── SwipeTab
    ├── RollDice
    ├── SwipeSession
    └── SwipeCard

Screen 2 (/suivi) - Dashboard
├── TimelineHero
├── MissionList
│   └── MissionCard
├── EnergyHistory
│   ├── EnergyChart
│   └── ComebackAlert
└── AnalyticsDashboard
```

### Component Categories

| Category | Components | Purpose |
|----------|------------|---------|
| `ui/` | Button, Card, Input, Select, Tabs, etc. | Base primitives (Kobalte) |
| `chat/` | ChatMessage, ChatInput, OnboardingChat | Conversational UI |
| `tabs/` | ProfileTab, GoalsTab, SkillsTab, etc. | Plan page tabs |
| `swipe/` | SwipeCard, SwipeSession, RollDice | Scenario selection |
| `suivi/` | TimelineHero, MissionCard, EnergyChart | Dashboard widgets |
| `analytics/` | AnalyticsDashboard, MetricCard, GoalProgressCard | Data visualization |
| `layout/` | AppLayout, BottomNav, Sidebar | Navigation |

---

## Data Models

### Profile

```typescript
interface FullProfile {
  id: string;
  name: string;
  currency: 'USD' | 'EUR' | 'GBP';
  diploma?: string;
  field?: string;
  skills?: string[];
  certifications?: string[];
  city?: string;
  citySize?: string;
  incomeSources?: IncomeSource[];
  expenses?: Expense[];
  maxWorkHoursWeekly?: number;
  minHourlyRate?: number;
  hasLoan?: boolean;
  loanAmount?: number;
  profileType: 'main' | 'goal-clone';
  parentProfileId?: string;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  planData?: Record<string, unknown>;
  followupData?: Record<string, unknown>;
  achievements?: string[];
  isActive: boolean;
}
```

### Skill

```typescript
interface Skill {
  id: string;
  profileId: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  hourlyRate: number;
  marketDemand: number;      // 1-5
  cognitiveEffort: number;   // 1-5
  restNeeded: number;        // hours
  score?: number;
}
```

### LifestyleItem

```typescript
interface LifestyleItem {
  id: string;
  profileId: string;
  name: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  essential: boolean;
  applied: boolean;
  pausedMonths: number;
}
```

---

## Observability (Opik Integration)

### Trace Hierarchy

```
student_session (top-level)
├── chat.onboarding
│   ├── chat.extraction
│   └── chat.generation
├── swipe_session
│   ├── swipe_roll_dice
│   └── swipe_record_decision
└── skill_arbitrage_calculation
    └── graph_job_matching
```

### Span Attributes

Every span includes:
- `user_id` / `profile_id`
- `input.message` / `output.response`
- Tool-specific attributes

### Feedback Scores

```typescript
logFeedbackScores(traceId, [
  { name: 'extraction_success', value: 1.0, reason: 'Extracted 5 fields' },
  { name: 'conversation_progress', value: 1.0, reason: 'Advanced to next step' },
]);
```

---

## Development Patterns

### DuckDB in Vite SSR

Native Node.js modules require special handling:

```typescript
// ❌ Wrong - fails in Vite SSR
import * as duckdb from 'duckdb';

// ✅ Correct - use createRequire
import { duckdb } from '../../lib/nativeModule';
```

### Profile Duplication

For "what-if" scenarios, profiles can be cloned:

```typescript
const newProfile = await duplicateProfileForGoal(
  sourceProfileId,
  { goalName: 'Vacation', goalAmount: 1000, goalDeadline: '2026-06-01' }
);
// Creates profile with profileType: 'goal-clone' and parentProfileId set
```

### Debounced Auto-Save

Profile changes are debounced to reduce DB writes:

```typescript
const SAVE_DEBOUNCE_MS = 500;
await saveProfile(profile, { immediate: false }); // Waits 500ms before saving
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq LLM API key |
| `OPIK_API_KEY` | Yes | Opik Cloud API key |
| `OPIK_WORKSPACE` | Yes | Opik workspace name |
| `OPIK_BASE_URL` | No | Self-hosted Opik URL |
| `OPIK_PROJECT` | No | Project name (default: "stride") |
| `DUCKDB_PATH` | No | Custom DB path |
| `USE_GROQ_EXTRACTOR` | No | Enable Groq JSON mode (default: true) |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/frontend/src/lib/profileService.ts` | Profile CRUD with fallback |
| `packages/frontend/src/routes/api/_db.ts` | DuckDB singleton connection |
| `packages/frontend/src/routes/api/chat.ts` | Onboarding conversation logic |
| `packages/mcp-server/src/agents/factory.ts` | Agent creation pattern |
| `packages/mcp-server/src/algorithms/skill-arbitrage.ts` | Job scoring algorithm |
| `packages/mcp-server/src/algorithms/comeback-detection.ts` | Recovery detection |
| `packages/mcp-server/src/algorithms/energy-debt.ts` | Burnout prevention |
| `packages/mcp-server/src/tools/swipe.ts` | Preference learning |
