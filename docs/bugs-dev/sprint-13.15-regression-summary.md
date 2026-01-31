# Sprint 13.15 Regression Fixes: Summary

This document summarizes the critical fixes applied to resolve regressions blocking the Onboarding and Simulation flows.

## 1. Fixed: Chat History 500 Error
**Issue**: `POST /api/chat-history` failed with `500 Internal Server Error` (Malformed JSON) at the end of onboarding.
**Diagnosis**: The error was caused by a conflict between DuckDB's SQL parser and JSON parser when handling escaped characters (backslashes and quotes) inside standard SQL string literals (`'...'`). The SQL parser consumed the backslashes intended for the JSON string, corrupting the JSON data.
**Fix**:
- Updated `packages/frontend/src/routes/api/_db.ts` to use **Dollar Quoting** (`$STRIDE_JSON$ ... $STRIDE_JSON$`) for the `escapeJSON` function.
- This bypasses SQL string escaping entirely, passing the raw JSON string directly to DuckDB's JSON parser, which is robust against special characters.
**Verification**: Confirmed via `debug_chat_history.ts` script against the live server. Note: Requires a server restart to take effect if cached.

## 2. Fixed: Chat History Duplicate Key Error
**Issue**: `POST /api/chat-history` failed with `500 Internal Server Error` (Duplicate key "id: greeting").
**Diagnosis**: The initial onboarding message had a hardcoded ID `"greeting"`. Since `id` is the Primary Key of the global `chat_messages` table, this caused a collision whenever a second profile/user tried to save their chat history.
**Fix**:
- Updated `packages/frontend/src/components/chat/OnboardingChat.tsx` in `migrateOnboardingMessages`.
- The migration logic now detects static IDs (like `'greeting'`) and regenerates them into unique IDs (`msg_timestamp_random`) before saving to the database.
**Verification**: Code inspection confirms IDs are now unique before `fetch`.

## 3. Fixed: "Day 3" Start Issue
**Issue**: The simulation was starting on "Day 3" (Wednesday) instead of "Day 1" (Monday/Goal Start).
**Diagnosis**: The `retroplan.ts` backend logic was forcefully aligning the start date to the *Monday* of the current week. Since the current day was Wednesday, the simulation appeared to be 2 days ahead.
**Fix**:
- Modified `packages/frontend/src/routes/api/retroplan.ts` to remove the Monday alignment logic.
- The simulation now starts exactly on the `goalStartDate` (which defaults to `createdAt` or "Today").
**Verification**: User confirmed the interface now shows "Jour 1" immediately after onboarding.

## 3. Fixed: Simulation Reset (Financials)
**Issue**: Resetting the simulation or rewinding time was not reverting the accumulated financial "Auto-Credits" (income/savings).
**Diagnosis**: The `checkAndApplyAutoCredit` function in `suivi.tsx` only logic for *adding* credits when moving forward in time. It ignored time reversals.
**Fix**:
- Refactored `checkAndApplyAutoCredit` in `packages/frontend/src/routes/suivi.tsx` to handle bi-directional time travel.
- It now calculates the *exact set of valid months* for the current simulation date and removes any credits that belong to "future" months (relative to the new date).
**Verification**: Validated by user ("annulation fonctionne bien maintenant").

## Next Steps
- **Hard Restart**: If the 500 error persists despite code changes, perform a full server restart (`ctrl+c`, then `pnpm run dev`) to clear Vite/ESM caches.
- **Onboarding Test**: Complete a full onboarding flow to verify the end-to-end fix.
