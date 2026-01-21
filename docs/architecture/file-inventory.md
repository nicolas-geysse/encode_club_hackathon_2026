# File Inventory

**Last Updated**: 2026-01-21

Complete listing of all backend files with line counts, concerns, and refactoring priority.

## Priority Legend

- 🔴 **P0 (Critical)**: High complexity, blocks other work
- 🟠 **P1 (High)**: Significant tech debt, frequent changes
- 🟡 **P2 (Medium)**: Moderate complexity, stable
- 🟢 **P3 (Low)**: Simple, well-structured

---

## API Routes (`routes/api/`)

| Priority | File | Lines | Concerns | Issues | Action |
|----------|------|-------|----------|--------|--------|
| 🔴 P0 | `chat.ts` | 2,872 | 5 | Slash commands, extraction, prompts, flow control, evaluation all mixed | Split into 12 modules |
| 🟠 P1 | `goals.ts` | 915 | 3 | Embedding triggers, validation, component management | Extract embedding logic |
| 🟡 P2 | `profiles.ts` | 657 | 2 | Schema migration + CRUD | Extract migration helper |
| 🟢 P3 | `retroplan.ts` | 502 | 1 | Algorithm mixed with API | Move algo to MCP |
| 🟡 P2 | `skills.ts` | 433 | 1 | CRUD, similar pattern | Use shared utilities |
| 🟡 P2 | `lifestyle.ts` | 431 | 1 | CRUD, similar pattern | Use shared utilities |
| 🟡 P2 | `inventory.ts` | 394 | 1 | CRUD, similar pattern | Use shared utilities |
| 🟡 P2 | `analytics.ts` | 385 | 1 | Query aggregation | OK |
| 🟡 P2 | `goal-components.ts` | 371 | 1 | Goal component CRUD | Use shared utilities |
| 🟡 P2 | `_db.ts` | 362 | 1 | Connection management | OK (core) |
| 🟡 P2 | `income.ts` | 348 | 1 | CRUD, similar pattern | Use shared utilities |
| 🟢 P3 | `trades.ts` | 293 | 1 | CRUD, similar pattern | Use shared utilities |
| 🟢 P3 | `duckdb.ts` | 292 | 1 | Direct DuckDB access | OK |
| 🟢 P3 | `agent.ts` | 259 | 1 | Agent proxy | OK |
| 🟢 P3 | `simulation.ts` | 215 | 1 | Time simulation | OK |
| 🟢 P3 | `rag.ts` | 211 | 1 | RAG context fetch | OK |
| 🟢 P3 | `chat-history.ts` | 208 | 1 | History CRUD | OK |
| 🟢 P3 | `embed.ts` | 139 | 1 | Embedding trigger | OK |
| 🟢 P3 | `reset.ts` | ~100 | 1 | Reset functionality | OK |
| 🟢 P3 | `voice.ts` | 112 | 1 | Voice transcription | OK |

**Subtotal**: ~9,600 lines in 21 files

---

## Library/Services (`lib/`)

| Priority | File | Lines | Concerns | Issues | Action |
|----------|------|-------|----------|--------|--------|
| 🔴 P0 | `onboardingExtractor.ts` | 1,646 | 3 | Extraction + regex + tracing mixed | Merge with chat modules |
| 🟠 P1 | `opikRest.ts` | 1,199 | 2 | Monolithic REST client | Simplify API |
| 🟠 P1 | `opik.ts` | 700 | 2 | Complex trace wrapper | Simplify interface |
| 🟡 P2 | `profileService.ts` | 542 | 2 | Auto-save + switching | OK (well-structured) |
| 🟡 P2 | `onboardingPersistence.ts` | 462 | 1 | State persistence | OK |
| 🟡 P2 | `goalService.ts` | 387 | 1 | Goal validation | OK |
| 🟡 P2 | `dateUtils.ts` | 352 | 1 | Date parsing | OK |
| 🟡 P2 | `achievements.ts` | 332 | 1 | Achievement logic | OK |
| 🟡 P2 | `lifestyleService.ts` | 271 | 1 | Service wrapper | OK |
| 🟡 P2 | `tradeService.ts` | 266 | 1 | Service wrapper | OK |
| 🟡 P2 | `cityUtils.ts` | 263 | 1 | City data | OK |
| 🟢 P3 | `inventoryService.ts` | 243 | 1 | Service wrapper | OK |
| 🟢 P3 | `incomeService.ts` | 195 | 1 | Service wrapper | OK |
| 🟢 P3 | `skillService.ts` | 191 | 1 | Service wrapper | OK |
| 🟢 P3 | `arrayMergeUtils.ts` | 167 | 1 | Merge utilities | OK |
| 🟢 P3 | `simulationService.ts` | 135 | 1 | Simulation state | OK |
| 🟢 P3 | `expenseUtils.ts` | 133 | 1 | Expense calculations | OK |
| 🟢 P3 | `notificationStore.ts` | 131 | 1 | UI notifications | OK |
| 🟢 P3 | `confetti.ts` | 100 | 1 | Celebration effect | OK |
| 🟢 P3 | `logger.ts` | 72 | 1 | Logging utility | OK |
| 🟢 P3 | `eventBus.ts` | 64 | 1 | Event system | OK |
| 🟢 P3 | `api.ts` | 60 | 1 | API helpers | OK |
| 🟢 P3 | `config.ts` | 38 | 1 | Configuration | OK |
| 🟢 P3 | `nativeModule.ts` | 33 | 1 | Native loading | OK |
| 🟢 P3 | `cn.ts` | 6 | 1 | Class names | OK |

**Subtotal**: ~7,600 lines in 25 files

---

## Repeated Patterns (Technical Debt)

| Pattern | Occurrences | ~Lines Each | Total Waste |
|---------|-------------|-------------|-------------|
| Schema initialization (`ensureSchema`) | 13 files | 26 | ~338 lines |
| Type conversions (row↔model) | 13 files | 15 | ~200 lines |
| Response construction | 21 files | 14 | ~300 lines |
| Error handling try/catch | 21 files | 19 | ~400 lines |
| Embedding triggers | 3 files | 20 | ~60 lines |

**Total duplicated code**: ~1,300 lines that could be consolidated

---

## chat.ts Breakdown (2,872 lines)

| Section | Lines | Purpose |
|---------|-------|---------|
| 1-100 | 100 | Imports, config, Groq client |
| 100-420 | 320 | Slash commands (SLASH_COMMANDS) |
| 420-610 | 190 | Step prompts (STEP_PROMPTS) |
| 610-770 | 160 | Interfaces + UI resource generation |
| 770-1040 | 270 | POST handler (main entry point) |
| 1040-1110 | 70 | extractDataFromMessage |
| 1110-1200 | 90 | generateStepResponse |
| 1200-1260 | 60 | getNextStep |
| 1260-1330 | 70 | Clarification messages |
| 1330-2000 | 670 | extractDataWithRegex (massive!) |
| 2000-2300 | 300 | Intent detection patterns |
| 2300-2600 | 300 | Conversation mode handlers |
| 2600-2872 | 272 | Evaluation + utilities |

**Identified modules for extraction:**
1. `extraction/patterns.ts` - All regex patterns (~700 lines)
2. `extraction/regexExtractor.ts` - Extraction logic
3. `extraction/hybridExtractor.ts` - LLM + regex combo
4. `prompts/templates.ts` - SYSTEM_PROMPTS, STEP_PROMPTS (~200 lines)
5. `prompts/interpolator.ts` - Placeholder replacement
6. `intent/patterns.ts` - Intent detection patterns (~300 lines)
7. `intent/detector.ts` - detectIntent function
8. `flow/stepMetadata.ts` - Step requirements, next step logic
9. `flow/flowController.ts` - getNextStep, flow progression
10. `commands/definitions.ts` - SLASH_COMMANDS (~320 lines)
11. `commands/executor.ts` - Command execution
12. `evaluation/feedback.ts` - Response evaluation

---

## Summary

| Category | Files | Lines | P0 Files | Action Required |
|----------|-------|-------|----------|-----------------|
| API Routes | 21 | 9,600 | 1 | Split chat.ts, add shared utilities |
| Libraries | 25 | 7,600 | 1 | Merge onboardingExtractor into chat modules |
| **Total** | **46** | **17,200** | **2** | Focus on 2 critical files first |
