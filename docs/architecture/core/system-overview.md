# Architecture Overview

**Last Updated**: 2026-01-21

This document provides a high-level overview of Stride's frontend architecture to guide refactoring and Mastra migration efforts.

## Quick Stats

| Category | Files | Lines | Notes |
|----------|-------|-------|-------|
| API Routes | 21 | ~9,600 | chat.ts alone is 2,872 lines |
| Lib/Services | 25 | ~7,600 | onboardingExtractor.ts is 1,646 lines |
| **Total Backend** | **46** | **~17,200** | Significant technical debt |

## High-Level Structure

```
packages/frontend/src/
├── routes/
│   ├── api/              # Server-side API endpoints (21 files)
│   │   ├── chat.ts       # 🔴 CRITICAL: Onboarding chat (2,872 lines)
│   │   ├── goals.ts      # Goal management + embedding
│   │   ├── profiles.ts   # Profile CRUD + migration
│   │   └── ...           # 18 more CRUD endpoints
│   ├── index.tsx         # Onboarding page (Screen 0)
│   ├── plan.tsx          # Multi-tab planning (Screen 1)
│   └── suivi.tsx         # Dashboard (Screen 2)
├── lib/                  # Shared utilities and services (25 files)
│   ├── onboardingExtractor.ts  # 🔴 CRITICAL: LLM extraction (1,646 lines)
│   ├── opikRest.ts       # Opik REST client (1,199 lines)
│   ├── opik.ts           # Trace wrapper (700 lines)
│   ├── profileService.ts # Profile state management
│   └── ...               # 21 more utilities
└── components/           # UI components
    ├── chat/             # Chat components
    └── plan/             # Plan tab components
```

## Key Architectural Patterns

### 1. Chat Isolation by Tab
Each tab has isolated chat state - no cross-tab memory. Only the onboarding chat (Screen 0) maintains conversation history.

### 2. Server Functions Pattern
SolidStart uses server functions in `routes/api/*.ts` for backend logic. These run server-side but are called like regular functions from components.

### 3. DuckDB as Primary Store
All data flows through DuckDB (single-file database). Services use `_db.ts` for connection management.

### 4. Opik for Observability
Every LLM call is traced via `lib/opik.ts`. Child spans track extraction, generation, and evaluation phases.

## Current Pain Points

1. **Monolithic chat.ts** (2,872 lines): Mixes 5+ concerns - routing, extraction, generation, commands, evaluation
2. **Duplicate extraction logic**: `onboardingExtractor.ts` and `chat.ts` both have regex patterns
3. **Repeated patterns**: Schema init, error handling, response construction duplicated across 21 API files
4. **Unused Mastra agents**: 8 agents exist in `packages/mcp-server/src/agents/` but frontend doesn't use them

## Related Documentation

- [data-flow.md](./data-flow.md) - Request flow diagrams
- [file-inventory.md](./file-inventory.md) - Complete file listing with priorities
- [refactoring-priorities.md](./refactoring-priorities.md) - Execution order
- [mastra-migration.md](./mastra-migration.md) - Agent integration plan
