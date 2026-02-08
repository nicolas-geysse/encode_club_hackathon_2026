# Architecture Overview

**Last Updated**: 2026-02-08

This document provides a high-level overview of Stride's frontend architecture.

## Quick Stats

| Category | Files | Lines | Notes |
|----------|-------|-------|-------|
| API Routes | 45 | ~18,000 | chat.ts alone is 3,564 lines |
| Lib/Services | 95 | ~23,400 | Includes 33 modular chat files |
| **Total Backend** | **140** | **~41,400** | Significant growth since Jan 2026 |

## High-Level Structure

```
packages/frontend/src/
├── routes/
│   ├── api/              # Server-side API endpoints (45 files)
│   │   ├── chat.ts       # Onboarding + conversation chat (3,564 lines)
│   │   ├── goals.ts      # Goal management + embedding
│   │   ├── profiles.ts   # Profile CRUD + migration
│   │   ├── retroplan.ts  # Retroplanning engine
│   │   ├── tab-tips.ts   # Tab-specific AI tips
│   │   ├── budget.ts     # Budget analysis
│   │   ├── analytics.ts  # Analytics tracking
│   │   ├── prospection.ts # Job search + Google Maps
│   │   ├── job-listings.ts # Job listing cache
│   │   ├── budget/       # Budget insights sub-routes
│   │   ├── opik/         # Benchmark + metrics sub-routes
│   │   ├── profiles/     # Duplicate/import/reset sub-routes
│   │   ├── settings/     # Apply/status sub-routes
│   │   └── ...           # 30+ more CRUD endpoints
│   ├── index.tsx         # Onboarding page (Screen 0)
│   ├── me.tsx            # Multi-tab dashboard (Screen 1)
│   ├── swipe.tsx         # Standalone swipe page (Screen 2)
│   ├── progress.tsx      # Progress dashboard (Screen 3)
│   ├── settings.tsx      # Provider settings (Screen 4)
│   ├── plan.tsx          # Redirect → /me (backward compat)
│   └── suivi.tsx         # Redirect → /progress (backward compat)
├── lib/                  # Shared utilities and services (95 files)
│   ├── chat/             # Modular chat system (33 files)
│   │   ├── intent/       # Intent detection (detector + LLM classifier)
│   │   ├── handlers/     # 5 extracted handlers
│   │   ├── evaluation/   # Hybrid eval (heuristics + G-Eval)
│   │   ├── extraction/   # Regex + LLM hybrid extraction
│   │   ├── prompts/      # System prompt templates + versioning
│   │   ├── flow/         # Multi-step conversation flow
│   │   └── commands/     # Slash commands
│   ├── llm/              # Provider-agnostic LLM client
│   ├── opik.ts           # Opik trace wrapper (~800 lines)
│   ├── profileService.ts # Profile state management (debounce 2000ms)
│   ├── settingsStore.ts  # Runtime config override (in-memory)
│   ├── providerPresets.ts # LLM/STT provider presets
│   └── ...               # 50+ more utilities
└── components/           # UI components (10 directories)
    ├── chat/             # OnboardingChat, ChatInput, ChatMessage, PlasmaAvatar...
    ├── tabs/             # ProfileTab, GoalsTab, BudgetTab, TradeTab, ProspectionTab...
    ├── suivi/            # TimelineHero, EnergyHistory, MissionList, ComebackAlert...
    ├── swipe/            # SwipeCard, SwipeSession, RollDice, HoloCard
    ├── ui/               # Base primitives (Button, Card, Input, Sheet...)
    ├── layout/           # Navigation (AppLayout, BottomNav)
    ├── analytics/        # Analytics components
    ├── debug/            # Debug components
    ├── onboarding/       # Onboarding components
    └── prospection/      # Job search components
```

## Key Architectural Patterns

### 1. Chat Isolation by Tab
Each tab has isolated chat state - no cross-tab memory. Only the onboarding chat (Screen 0) maintains conversation history.

### 2. Server Functions Pattern
SolidStart uses server functions in `routes/api/*.ts` for backend logic. These run server-side but are called like regular functions from components.

### 3. DuckDB as Primary Store
All data flows through DuckDB (single-file database at `data/stride.duckdb`). Services use `_db.ts` for connection management. No localStorage fallback (removed to prevent cross-profile contamination).

### 4. Opik for Observability
Every LLM call is traced via `lib/opik.ts`. Child spans track extraction, generation, and evaluation phases.

### 5. Provider-Agnostic LLM
All LLM operations use the OpenAI SDK with configurable `baseURL`. Supports Mistral, Groq, Gemini, OpenAI, OpenRouter, Together, and custom providers. Provider switching at runtime via `/settings`.

## 18 Mastra Agents (MCP Server)

| Agent | ID | Purpose |
|-------|-----|---------|
| Budget Coach | `budget-coach` | Analyze budget, give advice |
| Job Matcher | `job-matcher` | Find compatible jobs (Skill Arbitrage) |
| Projection ML | `projection-ml` | Predict graduation balance |
| Guardian | `guardian` | Validate recommendations |
| Money Maker | `money-maker` | Side hustles, item selling |
| Strategy Comparator | `strategy-comparator` | Compare options |
| Onboarding Agent | `onboarding-agent` | Conversational onboarding |
| Lifestyle Agent | `lifestyle-agent` | Subscription optimization |
| Swipe Orchestrator | `swipe-orchestrator` | Swipe scenario generation |
| Daily Briefing | `daily-briefing` | Daily financial briefing |
| Tab Tips Orchestrator | `tab-tips-orchestrator` | Tab-specific AI tips |
| Tips Orchestrator | `tips-orchestrator` | General tips |
| Essential Guardian | `essential-guardian` | Structural alternative suggestions |
| Ghost Observer | `ghost-observer` | Rejection pattern detection |
| Asset Pivot | `asset-pivot` | Productive asset monetization |
| Cash Flow Smoother | `cashflow-smoother` | Timing mismatch detection |
| Agent Executor | `agent-executor` | Agent dispatch coordinator |
| Factory | `factory` | Agent creation from config |

Plus strategy files in `agents/strategies/` and guardrail exports in `agents/guardrails/`.

## Related Documentation

- [data-flow.md](./data-flow.md) - Request flow diagrams
- [chat-architecture.md](./chat-architecture.md) - Chat system deep dive
- [agent-registry.md](./agent-registry.md) - Agent & tool details
- [database-guide.md](./database-guide.md) - DuckDB integration guide
- [llm-provider-agnostic.md](./llm-provider-agnostic.md) - Multi-provider LLM
