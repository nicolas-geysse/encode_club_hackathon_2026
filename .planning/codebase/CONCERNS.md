# Codebase Concerns

**Analysis Date:** 2026-01-31

## Tech Debt

**Opik SDK Bug - Metadata Persistence:**
- Issue: The Opik TypeScript SDK (v1.9.98+) has a documented bug where `trace.update({ metadata })` does not persist metadata to the trace. Metadata passed to `setPromptAttributes()` is lost.
- Files: `packages/mcp-server/src/services/opik.ts` (lines 114-139)
- Impact: Prompt version tracking for regression detection fails silently. Traces lack prompt metadata in Opik dashboard, breaking ability to correlate quality metrics with specific prompt versions.
- Fix approach: Pass metadata in initial `traceOptions` instead of using `trace.update()`. The CLAUDE.md documents the correct pattern with code example (lines 114-139) - follow this pattern for all new traced tools.

**DuckDB Version Discrepancy:**
- Issue: CLAUDE.md states "Frontend and backend use different DuckDB versions (1.4.1 vs 1.0.0)" but both `packages/frontend/package.json` and `packages/mcp-server/package.json` specify `"duckdb": "1.4.1"`. Additionally, `@mastra/duckdb` is pinned to `^1.0.0` which may pull incompatible versions.
- Files: `packages/frontend/package.json:31`, `packages/mcp-server/package.json:31, 24`
- Impact: Version mismatch could cause subtle compatibility issues (WAL file format differences, API changes, serialization incompatibilities). The note in CLAUDE.md suggests versions were different at some point but reconciliation wasn't documented.
- Fix approach: Audit actual compatibility between `duckdb@1.4.1` and `@mastra/duckdb@1.0.0`. If truly incompatible, align versions or document minimum requirement for `@mastra/duckdb`.

**Native Module Loading Complexity:**
- Issue: Vite SSR's ESM import transformation breaks native Node.js modules (`.node` bindings). Workaround requires custom `createRequire` helper in `src/lib/nativeModule.ts` and external dependency configuration in `app.config.ts`.
- Files: `packages/frontend/src/lib/nativeModule.ts`, `packages/frontend/src/types/duckdb.d.ts`, `packages/frontend/app.config.ts`
- Impact: Fragile coupling between build config and database layer. Any Vite upgrade could break this pattern. New developers must understand non-standard module loading pattern.
- Fix approach: Document the pattern in CLAUDE.md (already done) and consider migration to pure JavaScript alternatives or native ESM modules as Vite and Node improve native module support.

**Profile Duplication Design Complexity:**
- Issue: System supports parent-child profile relationships (`parent_profile_id`, `profile_type`) for exploring alternate scenarios. Logic scattered across multiple files with unclear ownership of sync/conflicts.
- Files: `packages/frontend/src/lib/profileContext.tsx`, `packages/frontend/src/lib/profileService.ts`, `packages/frontend/src/routes/api/profiles.ts`
- Impact: Risk of stale parent-child data, unclear which profile is authoritative when both exist, complex scenarios handling (scenario switching, rollback, merge).
- Fix approach: Consolidate profile hierarchy logic into single service. Document expected behavior when switching between parent/child profiles. Add integration tests for multi-profile scenarios.

**Debounced Auto-Save Fallback Pattern:**
- Issue: `profileService.ts` implements debounced saves (500ms) with localStorage fallback "if API is down". However, this creates data consistency risk: localStorage state may diverge from server state during API downtime or recovery.
- Files: `packages/frontend/src/lib/profileService.ts` (lines 200+)
- Impact: User sees stale profile data after API recovery. Cross-device sync breaks. Potential data loss if browser crashes while offline.
- Fix approach: Implement explicit sync queue with conflict resolution. Track "last seen API state" to detect divergence. Consider IndexedDB for more robust offline storage instead of localStorage.

**Unused TODO/FIXME Comments - Development Residue:**
- Issue: Codebase contains numerous "BUG X FIX" comments (e.g., "BUG J FIX", "BUG 3 FIX", "BUG F FIX") in comments and code. These appear to reference resolved issues but remain as noise. Also explicit TODOs in critical paths.
- Files: `packages/frontend/src/components/chat/OnboardingChat.tsx` (75 instances), `packages/frontend/src/lib/chat/ActionExecutor.ts` (lines 28, 35), `packages/frontend/src/routes/api/analytics.ts` (line 478)
- Impact: Reduces code clarity. Developers cannot distinguish resolved issues from incomplete features. Makes search/grep for actual problems harder.
- Fix approach: Remove all "BUG X FIX" comments and replace with brief /* Sprint Y: Issue name */ comments or remove if fix is now clear. Convert remaining TODOs to GitHub issues with links.

---

## Known Bugs

**Swipe Scenarios in Iframe (Mobile UX Issue):**
- Symptoms: Swipe functionality embedded in iframe on desktop works, but mobile navigation required as fallback. Hybrid A+C approach planned but not fully implemented.
- Files: `docs/bugs-dev/swipe-iframe.md`, `packages/frontend/src/components/chat/MCPUIRenderer.tsx`
- Trigger: User says "swipe" in chat on mobile device
- Workaround: Navigate to `/plan?tab=swipe` via button instead of showing embedded component

**Profile Context Data Clearing on Profile Switch (BUG L FIX):**
- Symptoms: Stale data visible briefly when switching profiles. Goals/skills/inventory from previous profile flash before new profile data loads.
- Files: `packages/frontend/src/lib/profileContext.tsx` (lines 158-159, 309)
- Trigger: User switches active profile via profile selector
- Current mitigation: `BUG L FIX` clears goals/inventory immediately on profile ID change. Goals specifically designed NOT to clear on error (lines 200-204) to preserve view during API hiccups.

**Skills Loading State Race Condition (BUG Q FIX):**
- Symptoms: UI shows "no skills" message during initial load, then skills appear. Template gallery appears before skills load.
- Files: `packages/frontend/src/components/tabs/SkillsTab.tsx` (lines 285-296, 597, 610)
- Trigger: Opening Skills tab for first time
- Current mitigation: Separate loading state to distinguish "still loading" from "no skills added yet". Templates only show after skills load.

**Energy/Comeback Mode State Machine Not Enforced:**
- Symptoms: Code comments state "Energy Debt and Comeback Mode are mutually exclusive" but no validation prevents both states from being true simultaneously.
- Files: `packages/mcp-server/src/algorithms/energy-debt.ts` (lines 12-14), `packages/mcp-server/src/agents/tips-orchestrator.ts` (lines 230-236)
- Trigger: Edge case in energy history where recovery detection and debt detection both trigger
- Workaround: Comments indicate mutual exclusivity but code doesn't enforce it. Tips orchestrator has fallback logic (line 236: debt takes priority) but this is implicit.

---

## Security Considerations

**SQL Injection Protection via Escaping (Well-Implemented):**
- Risk: Mitigated. Custom `escapeSQL()` function properly handles backslashes before single quotes (Sprint 13.13 fix documented in code).
- Files: `packages/frontend/src/routes/api/_db.ts` (lines 305-311), used throughout API routes
- Current mitigation: All string values escaped. JSON uses Dollar Quoting (`$STRIDE_JSON$...`) to avoid SQL parser interference.
- Recommendations: Good. Continue using escape helpers. Consider adding lint rule to detect unescaped SQL string concatenation.

**Environment Variable Exposure:**
- Risk: Required env vars (`GROQ_API_KEY`, `OPIK_API_KEY`, `OPIK_WORKSPACE`) are documented in CLAUDE.md and example `.env.example` exists. No obvious hardcoded secrets in codebase reviewed.
- Files: `.env.example`, `packages/mcp-server/src/services/opik.ts` (lines 118-152)
- Current mitigation: Lazy loading of env vars (not at module import time) to avoid premature initialization.
- Recommendations: Verify `.env` file is in `.gitignore`. Audit CI/CD pipelines for secret leakage in logs.

**API Endpoint Authorization:**
- Risk: Server functions in `packages/frontend/src/routes/api/` lack visible authentication checks. Any user with browser access to frontend can call any API endpoint.
- Files: All files in `packages/frontend/src/routes/api/`
- Current mitigation: Appears to be browser-only application (no multi-user authentication visible). Assumes single student user per browser.
- Recommendations: If deployed as web app, add session/token validation to all API routes. Profile ID should be validated against current user's ID, not just passed from client.

**Google Maps API Key Optional but Exposed:**
- Risk: `GOOGLE_MAPS_API_KEY` in environment could be exposed if frontend code is accessed. Not critical if key has low rate limits or IP restrictions.
- Files: CLAUDE.md (line 155), likely used in Prospection tab
- Current mitigation: Key is optional - Prospection tab gracefully degrades if key is missing
- Recommendations: Add API key restrictions (IP whitelist, HTTP referrer) in Google Cloud console. Monitor usage for unusual patterns.

---

## Performance Bottlenecks

**Large Component Files (Complexity Hot Spots):**
- Problem: Multiple components exceed 2000 lines, making refactoring and testing difficult.
  - `OnboardingChat.tsx`: 2635 lines (main chat logic, state management, message handling)
  - `GoalsTab.tsx`: 2049 lines (goal CRUD, timeline rendering, async operations)
  - `chat.ts`: 2161 lines (chat API route, extraction, prompting, response generation)
- Files: `packages/frontend/src/components/chat/OnboardingChat.tsx`, `packages/frontend/src/components/tabs/GoalsTab.tsx`, `packages/frontend/src/routes/api/chat.ts`
- Cause: Multiple features bundled into single files. State management, UI rendering, business logic not clearly separated.
- Improvement path:
  1. Extract state management (profile, goals, chat history) into separate hooks/context
  2. Break chat component into sub-components: `ChatMessages`, `ChatInput`, `ChatActions`, `ChatUI`
  3. Break chat API into handlers: `onboardingHandler.ts`, `intentDetector.ts`, `responseGenerator.ts`
  4. This reduces per-file size to <1000 lines, enabling faster developer iteration and testing

**Database Query Performance (DuckDB):**
- Problem: No visible query optimization, indexes, or query plan analysis. Full table scans likely for frequently accessed tables (profiles, goals, expenses).
- Files: `packages/frontend/src/routes/api/_db.ts`, all API routes using `query()` function
- Cause: DuckDB single-file database with no schema optimization for query patterns. No prepared statements visible.
- Improvement path:
  1. Add `EXPLAIN` query plan logging to identify slow queries
  2. Index frequently filtered columns: `profiles.id`, `goals.profileId`, `expenses.profileId`, `energy_logs.profileId`
  3. Use prepared statements for parameterized queries instead of string concatenation
  4. Consider caching frequently accessed data (profile, goals) with invalidation on update

**Profile Loading - Multiple Sequential Requests:**
- Problem: `ProfileProvider.refreshAll()` in `profileContext.tsx` calls multiple independent async API requests sequentially in separate functions, not parallelized.
- Files: `packages/frontend/src/lib/profileContext.tsx` (lines 174-280)
- Cause: Each `refresh*` function awaits independently. Could parallelize with `Promise.all()`.
- Improvement path: Implement `refreshAll()` to call all endpoints in parallel:
  ```typescript
  await Promise.all([
    refreshGoals(),
    refreshSkills(),
    refreshInventory(),
    refreshLifestyle(),
    refreshIncome(),
    refreshTrades()
  ]);
  ```

**Opik Tracing Overhead:**
- Problem: Every tool call and LLM operation wrapped with Opik tracing. Network latency for trace submission could slow down critical paths.
- Files: `packages/mcp-server/src/services/opik.ts` (lines 200+), all tool implementations
- Cause: Comprehensive observability for debugging, but tracing is not batched or async-flushed properly
- Improvement path:
  1. Implement trace batching to reduce API calls to Opik
  2. Use non-blocking flush (async, not awaited) for non-critical traces
  3. Add sampling: trace 100% in development, 10% in production

---

## Fragile Areas

**Chat Extraction Pipeline (Multiple Fallbacks):**
- Files: `packages/frontend/src/lib/chat/extraction/`, `packages/frontend/src/routes/api/chat.ts`
- Why fragile: Multiple extraction methods in sequence (Mastra LLM → Groq fallback → regex extractor → manual user input). Each fallback adds special cases and validation. Changes to one extractor could cascade through pipeline.
- Safe modification:
  1. Add comprehensive integration tests for each extraction method
  2. Test all fallback transitions (LLM fails → Groq, Groq fails → regex, regex fails → prompt user)
  3. Log extraction method used for each message to enable debugging
  4. Before modifying, ensure tests pass for all extraction paths

**Profile State Synchronization (Across Tabs/Components):**
- Files: `packages/frontend/src/lib/profileContext.tsx`, `packages/frontend/src/lib/profileService.ts`, multiple tab components
- Why fragile: Profile data flows through context, but manual refresh calls required in multiple places (GoalsTab.tsx, SkillsTab.tsx, etc.). Easy to forget refresh after create/update, leaving UI out of sync.
- Safe modification:
  1. Create a single "profile mutation" hook that auto-refreshes context on change
  2. Replace all direct API calls in components with this hook
  3. Add assertions in tests to verify context updates after mutations

**DuckDB Connection Management (Race Conditions):**
- Files: `packages/frontend/src/routes/api/_db.ts` (lines 35-200)
- Why fragile: Singleton pattern with async init, synchronous guard, and concurrent request handling. Complex state machine with multiple conditions (initializing, initialized, initPromise). WAL files can cause lock contention.
- Safe modification:
  1. Add logging for all state transitions (before reviewing changes)
  2. Test with concurrent request stressers (100+ simultaneous API calls)
  3. Verify WAL file cleanup on startup/shutdown
  4. Before adding features, review connection pool limits and timeout values

**Energy History Analysis (Multi-Week State):**
- Files: `packages/mcp-server/src/algorithms/energy-debt.ts`, `packages/mcp-server/src/algorithms/comeback-detection.ts`
- Why fragile: Algorithms rely on consistent energy history format and date calculations. Gaps in data, missing entries, or date parsing errors cascade into wrong debt/comeback detection.
- Safe modification:
  1. Add validation: ensure energy entries are sorted, no duplicates, cover expected date range
  2. Test with synthetic histories: 3-week low period, recovery, multiple cycles
  3. Before changing debt/comeback logic, run evaluation against past user data to verify no false positives/negatives

**Test Coverage Gaps:**
- Untested area: Profile duplication (parent/child relationships). No visible tests for scenario creation, switching, rollback.
- Files: `packages/frontend/src/lib/profileService.ts` (profile loading/saving), `packages/frontend/src/routes/api/profiles.ts` (create/read/update)
- Risk: Parent profile updates could silently fail to propagate to children. Child profile deletion could orphan parent state.
- Priority: **High** - Profile scenarios are core feature for "exploring alternate scenarios"

---

## Scaling Limits

**Single-File DuckDB Database:**
- Current capacity: ~1000 profiles × 100 goals × 50 energy logs each = ~5-10 million rows
- Limit: DuckDB file will grow to 500MB-1GB. Query performance degrades significantly after 1GB due to memory pressure during aggregations.
- Scaling path:
  1. Implement archival: move old profiles/completed goals to archive table/file
  2. Consider PostgreSQL with DuckDB connector for larger deployments
  3. Add data compression: consolidate old energy logs into weekly/monthly summaries

**LLM Token Usage (Groq/Google):**
- Current capacity: Onboarding chat uses ~1000-5000 tokens per conversation. 100 concurrent users = 100k-500k tokens/hour.
- Limit: Groq free tier or paid tier rate limits. Google Gemini pricing scales with usage.
- Scaling path:
  1. Implement token budgeting: warn users when approaching budget limits
  2. Add caching for repetitive LLM calls (skill recommendations, goal suggestions)
  3. Consider cheaper models (Llama 3.1 8B vs 70B) for less complex tasks

**Opik Trace Storage:**
- Current capacity: ~10-50 traces per user session × 1000 profiles = 10k-50k traces/day
- Limit: Opik Cloud storage/query limits. Self-hosted instance CPU/disk constraints.
- Scaling path:
  1. Implement trace sampling (10% production, 100% development)
  2. Archive old traces to S3 instead of keeping in hot storage
  3. Pre-aggregate common span types (LLM calls, tool executions) to reduce query load

---

## Dependencies at Risk

**Opik SDK Bug Affects Prompt Versioning:**
- Risk: `trace.update({ metadata })` does not persist. Documented in code but not fixed upstream (as of v1.9.98).
- Impact: Cannot track prompt versions for regression detection. Correlating quality changes with prompt changes breaks.
- Migration plan: Monitor Opik SDK releases for fix. Meanwhile, enforce pattern of passing metadata in `traceOptions` on init (documented in CLAUDE.md).

**Mastra Agent Orchestration Library:**
- Risk: `@mastra/core` at `^1.0.4`. Early version (<2.0). API surface may change. Community/support may be limited.
- Impact: If breaking changes in v1.1+, multiple tool implementations and agents would need updates.
- Migration plan: Pin to exact version (`1.0.4`) to prevent accidental breakage. Evaluate v2.0 when released. Have fallback plan: pure Groq SDK if Mastra abandoned.

**SolidStart SSR Framework:**
- Risk: `@solidjs/start` at `^1.1.0`. Solid.js is less mature than React/Vue. Build tools (Vinxi) are custom.
- Impact: HMR issues (already documented in code with DuckDB singleton pattern). SSR edge cases could appear. Dependency on Vite/Vinxi updates.
- Migration plan: Monitor SolidStart GitHub for breaking changes. If SSR issues continue, consider server-side API-only approach (remove SSR, use client-side hydration only).

**DuckDB-PGQ Graph Extension:**
- Risk: `@seed-ship/duckdb-mcp-native` with `duckdb-pgq` extension. Optional feature (gracefully degrades per CLAUDE.md). May not be maintained if seed-ship project abandoned.
- Impact: Skill→job graph queries fail, fallback to flat job matching.
- Migration plan: If extension breaks, implement fallback job matching without graph queries (simpler but slower). Monitor package maintainability.

---

## Missing Critical Features

**Profile Authorization / Multi-User Support:**
- Problem: No user authentication visible. Application assumes single student per browser. In production, this would leak profiles between users if shared device/browser.
- Blocks: Multi-user deployment, shared classroom scenario, parental/advisor access
- Recommendation: Add session-based or token-based auth before production deployment. Validate profile ownership on every API call.

**Offline-First Sync:**
- Problem: Debounced auto-save with localStorage fallback is not true offline support. No sync queue, no conflict resolution.
- Blocks: Mobile app, intermittent connectivity, nomadic students
- Recommendation: Implement sync queue with timestamp-based conflict resolution. Use IndexedDB for larger datasets.

**Data Export / GDPR Compliance:**
- Problem: No visible data export functionality. GDPR requires right to data portability.
- Blocks: GDPR compliance, user trust, data migration to other services
- Recommendation: Add `/api/export` endpoint returning JSON dump of all user data (profile, goals, energy logs, etc.). Add delete account functionality.

**Prompt Version History / A/B Testing:**
- Problem: System traces prompts to Opik for observability, but no systematic way to A/B test different prompts or compare recommendations quality across versions.
- Blocks: Iterative improvement of LLM recommendations. Cannot measure impact of prompt changes.
- Recommendation: Implement prompt registry with versioning. Track which prompt version produced each recommendation. Add evaluation endpoint comparing quality metrics across versions.

---

## Test Coverage Gaps

**Profile Scenario Duplication and Switching:**
- What's not tested: Parent profile + child profile creation, switching between profiles, data consistency between parent/child
- Files: `packages/frontend/src/lib/profileService.ts`, `packages/frontend/src/routes/api/profiles.ts`
- Risk: Profile data corruption when switching, parent updates not propagating to children, orphaned child profiles
- Priority: **High**

**Chat Extraction Fallback Chain:**
- What's not tested: Full pipeline of extraction methods (LLM → Groq → regex → user input). Transition between methods when one fails.
- Files: `packages/frontend/src/routes/api/chat.ts`, `packages/frontend/src/lib/chat/extraction/`
- Risk: Silent failures in extraction leading to incomplete profile data. Fallback method might not be invoked when expected.
- Priority: **High**

**Energy Debt and Comeback Mode State Machine:**
- What's not tested: Transition between no-debt → debt → comeback states. Edge cases where both conditions true simultaneously.
- Files: `packages/mcp-server/src/algorithms/energy-debt.ts`, `packages/mcp-server/src/algorithms/comeback-detection.ts`
- Risk: Incorrect state causing wrong recommendations or notifications
- Priority: **High**

**DuckDB Concurrent Access Under Load:**
- What's not tested: Multiple simultaneous API requests (100+ concurrent). WAL file lock contention. Connection pool exhaustion.
- Files: `packages/frontend/src/routes/api/_db.ts`
- Risk: Database locks, timeouts, data corruption under load
- Priority: **Medium**

**Profile Time-Simulation (Energy Debt Testing):**
- What's not tested: Simulation state table (`simulation_state`) triggering correct energy debt/comeback detection across weeks. Time offset math.
- Files: `packages/frontend/src/lib/timeAwareDate.ts`, `packages/frontend/src/routes/api/simulation.ts`
- Risk: Energy debt not triggering at correct simulated time, making testing impossible
- Priority: **Medium**

---

*Concerns audit: 2026-01-31*
