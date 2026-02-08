# File Inventory

**Last Updated**: 2026-02-08

Complete listing of all backend files with line counts.

> Note: The chat.ts monolith (originally 2,872 lines) was refactored into 33 modular files
> in `lib/chat/` during Phase 5. `onboardingExtractor.ts` was split into `extraction/`,
> `flow/`, and `prompts/` submodules. This inventory reflects the current state.

---

## API Routes (`routes/api/`)

| File | Lines | Purpose |
|------|-------|---------|
| `chat.ts` | 3,564 | Chat engine (onboarding + conversation, delegates to lib/chat/) |
| `retroplan.ts` | 1,285 | Retroplanning engine |
| `goals.ts` | 660 | Goal management + embedding |
| `profiles.ts` | 690 | Profile CRUD + migration |
| `budget.ts` | 475 | Budget analysis |
| `tab-tips.ts` | 475 | Tab-specific AI tips |
| `prospection.ts` | 720 | Job search + Google Maps |
| `analytics.ts` | 420 | Analytics tracking |
| `job-listings.ts` | 365 | Job listing cache |
| `skills.ts` | 290 | Skills CRUD |
| `lifestyle.ts` | 225 | Lifestyle CRUD |
| `inventory.ts` | 220 | Inventory CRUD |
| `_db.ts` | 450 | DuckDB connection management (singleton, HMR-safe) |
| `_crud-helpers.ts` | 430 | Shared CRUD utilities |
| `_job-cache.ts` | 170 | Job cache with TTL |
| `agent.ts` | 259 | Mastra agent proxy |
| `goal-components.ts` | 225 | Goal components CRUD |
| `income.ts` | 165 | Income sources CRUD |
| `trades.ts` | 185 | Trade opportunities CRUD |
| `chat-history.ts` | 163 | Chat history management |
| `leads.ts` | 280 | Leads management |
| `duckdb.ts` | 210 | Direct DuckDB access |
| `embed.ts` | 140 | Embedding generation |
| `voice.ts` | 140 | Voice transcription |
| `simulation.ts` | 210 | Time simulation |
| `rag.ts` | 145 | RAG context fetch |
| `tips.ts` | 200 | General tips |
| `daily-briefing.ts` | 145 | Daily briefing |
| `comeback-detection.ts` | 135 | Comeback mode |
| `energy-debt.ts` | 140 | Energy debt |
| `energy-logs.ts` | 55 | Energy log CRUD |
| `feedback.ts` | 55 | User feedback |
| `suggestion-feedback.ts` | 170 | Suggestion feedback |
| `swipe-trace.ts` | 170 | Swipe tracing |
| `exclusions.ts` | 140 | Exclusion management |
| `debug-state.ts` | 215 | Debug state |
| `reset.ts` | 125 | Full reset |
| `budget/insights.ts` | ~100 | Budget insights |
| `opik/benchmark.ts` | ~200 | Safety benchmark |
| `opik/metrics.ts` | ~100 | Opik metrics |
| `profiles/duplicate.ts` | ~100 | Profile duplication |
| `profiles/import.ts` | ~100 | Profile import |
| `profiles/reset.ts` | ~80 | Profile reset |
| `settings/apply.ts` | ~80 | Settings apply |
| `settings/status.ts` | ~80 | Settings status |

**Subtotal**: ~18,000 lines in 45 files

---

## Library/Services (`lib/`)

### Chat Modules (`lib/chat/` — 33 files)

| Directory | Files | Purpose |
|-----------|-------|---------|
| `chat/intent/` | 3 | Intent detection (detector.ts, llmClassifier.ts, index.ts) |
| `chat/handlers/` | 7 | 5 handlers + types + index (updateEnergy, completeMission, progressSummary, recommendFocus, skipMission) |
| `chat/extraction/` | 5 | Hybrid extraction (patterns, regex, groq, hybrid, index) |
| `chat/evaluation/` | 3 | Hybrid eval (hybridEval.ts, feedback.ts, index.ts) |
| `chat/prompts/` | 3 | System prompts (templates.ts, interpolator.ts, index.ts) |
| `chat/flow/` | 2 | Flow controller (flowController.ts, index.ts) |
| `chat/commands/` | 3 | Slash commands (definitions.ts, executor.ts, index.ts) |
| `chat/` (root) | 7 | ActionDispatcher, ActionExecutor, fieldValidation, proactiveQueue, stepForms, types, index |

### Core Libraries

| File | Lines | Purpose |
|------|-------|---------|
| `opik.ts` | ~800 | Opik trace wrapper + feedback |
| `profileService.ts` | ~600 | Profile state management (debounce 2000ms) |
| `goalService.ts` | ~390 | Goal validation |
| `dateUtils.ts` | ~350 | Date parsing |
| `achievements.ts` | ~330 | Achievement logic |
| `settingsStore.ts` | ~100 | Runtime config override |
| `providerPresets.ts` | ~100 | LLM/STT provider presets |
| `llm/client.ts` | ~150 | Provider-agnostic LLM client |
| And 50+ more utility files... | | |

**Subtotal**: ~23,400 lines in 95 files

---

## Summary

| Category | Files | Lines |
|----------|-------|-------|
| API Routes | 45 | ~18,000 |
| Libraries | 95 | ~23,400 |
| **Total** | **140** | **~41,400** |

---

## Refactoring Status

The original P0 items have been addressed:
- **chat.ts** (2,872→3,564 lines): Still the largest file but now delegates to 33 modular files in `lib/chat/`
- **onboardingExtractor.ts** (1,646 lines): Split into `extraction/`, `flow/`, `prompts/` submodules — file no longer exists
