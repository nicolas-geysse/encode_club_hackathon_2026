# Refactoring Priorities

**Last Updated**: 2026-01-21

This document defines the execution order for the API layer refactoring.

## Phase Overview

| Phase | Focus | Effort | Impact | Dependencies |
|-------|-------|--------|--------|--------------|
| **Phase 3** | Shared utilities | 1 day | -1,200 lines | None |
| **Phase 4** | chat.ts split | 3-4 days | -3,900 lines | Phase 3 |
| **Phase 5** | Mastra integration | 3-4 days | Agent-first | Phase 4 |

---

## Phase 3: Shared Utilities (1 day)

### Goal
Create reusable utilities to eliminate ~1,200 lines of duplicated code across 13 CRUD files.

### Files to Create

```
packages/frontend/src/lib/api/
├── response.ts       # jsonResponse(), errorResponse(), handleApiError()
├── schemaManager.ts  # createTableIfNotExists(), ensureSchema()
└── rowMapper.ts      # Generic RowMapper<T> for DB row conversions
```

### response.ts
```typescript
// Standard JSON response helpers
export function jsonResponse<T>(data: T, status = 200): Response;
export function errorResponse(message: string, status = 500): Response;
export function handleApiError(error: unknown): Response;
```

### schemaManager.ts
```typescript
// Database schema management
export async function ensureTable(tableName: string, schema: string): Promise<void>;
export async function runMigration(version: number, sql: string): Promise<void>;
```

### rowMapper.ts
```typescript
// Generic row-to-model mapping
export interface RowMapper<T> {
  fromRow(row: Record<string, unknown>): T;
  toRow(model: T): Record<string, unknown>;
}
```

### Files to Update
All CRUD files in `routes/api/`:
- skills.ts, inventory.ts, lifestyle.ts, income.ts
- trades.ts, goal-components.ts, goals.ts, profiles.ts
- And 5 more...

### Verification
```bash
pnpm typecheck
pnpm lint
# Manual: Test each CRUD endpoint
```

---

## Phase 4: chat.ts Refactoring (3-4 days)

### Goal
Split the monolithic 2,872-line chat.ts into focused modules. Merge overlapping code from onboardingExtractor.ts.

### Target Structure

```
packages/frontend/src/lib/chat/
├── extraction/
│   ├── patterns.ts         # All regex patterns (consolidated from chat.ts + onboardingExtractor.ts)
│   ├── regexExtractor.ts   # extractWithRegex() function
│   └── hybridExtractor.ts  # Groq JSON mode + regex fallback
├── prompts/
│   ├── templates.ts        # SYSTEM_PROMPTS, STEP_PROMPTS constants
│   └── interpolator.ts     # interpolatePrompt() for placeholder replacement
├── intent/
│   ├── patterns.ts         # Intent detection patterns (profile-edit, conversation mode)
│   └── detector.ts         # detectIntent() function
├── flow/
│   ├── stepMetadata.ts     # Step requirements, next step logic, step-to-tab mapping
│   └── flowController.ts   # getNextStep(), isStepComplete()
├── commands/
│   ├── definitions.ts      # SLASH_COMMANDS object
│   └── executor.ts         # executeSlashCommand()
├── evaluation/
│   └── feedback.ts         # runResponseEvaluation(), logFeedbackScores integration
└── index.ts                # Re-exports for clean imports
```

### Execution Order

1. **Day 1: Extraction modules**
   - Create `extraction/patterns.ts` - consolidate all regex from both files
   - Create `extraction/regexExtractor.ts` - move extractWithRegex
   - Create `extraction/hybridExtractor.ts` - move processWithGroqExtractor logic
   - Test: Extraction still works

2. **Day 2: Prompts + Intent**
   - Create `prompts/templates.ts` - move SYSTEM_PROMPTS, STEP_PROMPTS
   - Create `prompts/interpolator.ts` - extract interpolation logic
   - Create `intent/patterns.ts` - move intent detection patterns
   - Create `intent/detector.ts` - move detectIntent
   - Test: Prompts and intent detection work

3. **Day 3: Flow + Commands**
   - Create `flow/stepMetadata.ts` - move step requirements, STEP_TO_TAB
   - Create `flow/flowController.ts` - move getNextStep, getClarificationMessage
   - Create `commands/definitions.ts` - move SLASH_COMMANDS
   - Create `commands/executor.ts` - move command execution
   - Test: Flow progression and commands work

4. **Day 4: Integration + Cleanup**
   - Create `evaluation/feedback.ts` - move evaluation logic
   - Create `index.ts` - clean re-exports
   - Update `routes/api/chat.ts` to import from modules
   - Delete `lib/onboardingExtractor.ts` (merged into extraction/)
   - Final testing of complete flow

### Expected Results

| File | Before | After | Change |
|------|--------|-------|--------|
| chat.ts | 2,872 | ~600 | -79% |
| onboardingExtractor.ts | 1,646 | 0 | Deleted |
| New modules | 0 | ~3,900 | Distributed |
| **Net** | 4,518 | 4,500 | Cleaner architecture |

### Verification
```bash
pnpm typecheck
pnpm lint
pnpm dev
# Manual: Complete onboarding flow test
# Manual: Test slash commands (/budget, /goal, /help)
# Manual: Test Paris -> EUR auto-detection
# Manual: Test Reset all data
```

---

## Phase 5: Mastra Integration (Optional, 3-4 days)

### Goal
Connect the refactored chat modules to existing Mastra agents in `packages/mcp-server/src/agents/`.

### Existing Agents (Not Currently Used by Frontend)

| Agent | File | Lines | Purpose |
|-------|------|-------|---------|
| onboarding-agent | onboarding-agent.ts | 455 | Profile collection (unused!) |
| budget-coach | budget-coach.ts | 336 | Budget advice |
| job-matcher | job-matcher.ts | 566 | Skill arbitrage |
| strategy-comparator | strategy-comparator.ts | 596 | Scenario comparison |
| money-maker | money-maker.ts | 709 | Income optimization |
| guardian | guardian.ts | 475 | Risk monitoring |
| projection-ml | projection-ml.ts | 251 | Future projections |

### Integration Plan

1. **Feature flag**: `USE_MASTRA_CHAT=true|false`
2. **Adapter layer**: `lib/chat/mastraAdapter.ts`
   - Import onboarding-agent from mcp-server
   - Map chat modules as "tools" for the agent
   - Route requests through agent when flag is true
3. **Gradual rollout**:
   - Test with flag false (uses refactored modules)
   - Enable flag for specific users
   - Monitor Opik traces for comparison
4. **Full migration**: Remove legacy code path when stable

### Benefits
- Agents have built-in tool orchestration
- Consistent tracing via Mastra's Opik integration
- Easier to add new capabilities (just add tools)
- Aligns with project's stated architecture

---

## Risk Mitigation

### During Refactoring
1. Keep original files until new modules pass all tests
2. Use git branches: `refactor/phase-3`, `refactor/phase-4`
3. Run `pnpm typecheck` after every file change
4. Test manually after each module extraction

### Rollback Plan
If issues found in production:
1. Revert to previous commit
2. Feature flag Mastra integration OFF
3. Debug with Opik traces
