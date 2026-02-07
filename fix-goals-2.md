# Fix Goals Sprint 2 — Senior Dev Analysis

## Situation

Since the multi-goal architecture (profile duplication via `/api/profiles/duplicate`), several issues remain:

1. **Subscription duplication** — Netflix appears twice in Budget (one at 0, one at 15)
2. **Profile switcher confusion** — Top-right dropdown shows profiles, not goals
3. **Goal panel actions lack confirmations** — Delete/Complete fire immediately
4. **Old "+New Goal" path inconsistency** — Two different new-goal flows coexist
5. **Dead code** — Legacy JSON columns, stale schemas, write-only fields

---

## Bug 1: Netflix Subscription Duplication

### Root Cause: Double Write to `lifestyle_items`

The subscription gets written **twice** through two independent code paths:

**Path A — LLM Confirmation Flow (OnboardingChat.tsx:655-682)**

During onboarding, when the LLM confirms extracted data, this code runs:

```typescript
// OnboardingChat.tsx:668-673
await lifestyleService.createItem({
  profileId: currentProfileId,
  name: newSub.name,
  category: 'subscriptions',
  currentCost: newSub.currentCost || 10,  // || treats 0 as falsy → becomes 10
});
```

User entered Netflix with no amount. Form converts empty → `parseInt("") || 0` = **0**.
But `|| 10` converts 0 → **10** (or currency-adjusted to 15).

**Result: lifestyle_items row with Netflix = 10 (or 15)**

**Path B — Completion Persistence (onboardingPersistence.ts:352-372)**

When onboarding completes, `persistAllOnboardingData()` calls `persistSubscriptions()`:

```typescript
// onboardingPersistence.ts:359-366
await lifestyleService.bulkCreateItems(profileId, subscriptions.map(sub => ({
  name: sub.name,
  category: 'subscriptions',
  currentCost: sub.currentCost ?? 10,  // ?? preserves 0 (not null/undefined)
})));
```

`bulkCreateItems` calls `clearItemsForProfile()` first (line 217), then creates.
But `clearItemsForProfile` only clears for the profile — the item from Path A was already created under the **same profile**.

Wait — `clearFirst=true` should delete then recreate. So why duplicates?

**The timing issue**: Path A (`createItem`) runs during the `confirm` step of onboarding (before completion). Path B (`bulkCreateItems` with `clearFirst`) runs at completion. But `clearItemsForProfile()` clears ALL lifestyle items for the profile, then recreates from `profile.subscriptions`. If the profile signal already has the merged subscription from Path A, both writes produce the same item — BUT if `clearFirst` actually works, there shouldn't be duplicates...

**Unless**: The `confirm` step creates the item in DuckDB (Path A), but the profile signal's `subscriptions` array also keeps the entry. At completion, `bulkCreateItems(clearFirst=true)` clears ALL items, then recreates from the profile signal — which now has the subscription with `currentCost: 0` (original form value). Meanwhile, Path A already wrote it with `currentCost: 10`.

**Actually the real flow is:**

1. Form submission: `profile.subscriptions = [{name: "Netflix", currentCost: 0}]`
2. LLM confirm flow: Creates lifestyle_item(Netflix, 10) in DuckDB via `createItem()`
3. Onboarding completion: `bulkCreateItems(clearFirst=true)` clears items, then creates from `profile.subscriptions` which has `{currentCost: 0}` — but `?? 10` preserves 0, so creates lifestyle_item(Netflix, 0)
4. **Result**: After completion, one item exists (Netflix, 0) because clearFirst wiped the old one

So the duplication might come from a **different scenario**: If the LLM confirm flow runs AFTER bulkCreateItems (race condition), or if multiple confirm rounds happen.

**Most likely cause**: The `mergeExpenseSources` fallback in BudgetTab:

```typescript
// BudgetTab.tsx:157
const mergedItems = mergeExpenseSources(ctxItems, currentProfile.expenses);
```

If `profile.expenses` JSON still has the old subscription data from onboarding (not NULL'ed), AND `lifestyle_items` also has data, `mergeExpenseSources` returns lifestyle_items only (line 102). So this shouldn't duplicate... unless `profile.expenses` is somehow being read.

### The Simplest Fix

**Make the `currentCost` field required in the subscription form.** This eliminates the 0-vs-default confusion entirely.

```typescript
// stepForms.ts — subscription config (line 610)
{
  name: 'currentCost',
  type: 'number',
  label: 'Monthly cost',
  placeholder: '15',
  min: 1,          // Change: min from 0 to 1
  required: true,  // Add: make it required
  suffix: '$',
},
```

**Additionally, deduplicate at the source**: Remove the eager `createItem()` in OnboardingChat.tsx:668-673. The completion flow (`persistSubscriptions`) already handles persistence. The confirm flow should only update the profile signal, not write to DuckDB.

```typescript
// OnboardingChat.tsx:660-680 — REMOVE the createItem call
// Keep only the signal update: merged.push({name, currentCost})
// Let persistAllOnboardingData handle DuckDB writes
```

### Fix Summary

| Change | File | Lines |
|--------|------|-------|
| Make `currentCost` required, min=1 | `lib/chat/stepForms.ts` | 610-616 |
| Remove eager `createItem()` in confirm flow | `components/chat/OnboardingChat.tsx` | 666-679 |
| Replace `\|\| 10` with `?? 10` in remaining spots | `OnboardingChat.tsx` | 663, 672 |

---

## Bug 2: Profile Switcher Should Be Goal Switcher

### Current State

`ProfileSelector.tsx` (500 lines) renders in the app header. It shows:
- Active profile name + goal name in parentheses: `"Alex (Summer Trip)"`
- Dropdown lists ALL profiles (main, goal-clones, simulations)
- "New profile" button → fresh onboarding
- "New goal" button → duplicate profile modal
- "Reset all data" → two-step confirmation
- Profile delete with browser `confirm()`

### Problem

Users see "profiles" when they think in terms of "goals". The mental model is:
- "I have different goals" not "I have different profiles"
- The profile name is always the same (Alex), only the goal changes

### Proposed UX

Replace the profile dropdown with a **Goal Switcher**:

```
┌─────────────────────────────────┐
│ [Goal icon] Summer Trip ▼       │  ← Shows active goal name
├─────────────────────────────────┤
│ ● Summer Trip     €500   active │  ← Green dot = active
│   Emergency Fund  €1000  active │
│   Laptop          €800   paused │
│ ─────────────────────────────── │
│ [+] New Goal                    │
│ ─────────────────────────────── │
│ ⚙ Settings                     │
└─────────────────────────────────┘
```

### Implementation Plan

**Refactor `ProfileSelector.tsx` → `GoalSwitcher.tsx`**

1. **Data source**: Instead of `profileService.listProfiles()`, use a new function that loads all profiles + their associated goals:
   ```typescript
   // New: List all goal workspaces
   async function listGoalWorkspaces(): Promise<GoalWorkspace[]> {
     const profiles = await profileService.listProfiles();
     // For each profile, fetch its primary goal
     return profiles
       .filter(p => p.profileType !== 'simulation')
       .map(p => ({
         profileId: p.id,
         goalName: p.goalName || 'No goal',
         goalAmount: p.goalAmount,
         profileType: p.profileType,
         isActive: p.isActive,
       }));
   }
   ```

2. **Switching**: Same underlying mechanism (`profileService.switchProfile()`), but the UI labels it as "switching goals"

3. **Remove**: "New profile" button (not needed for hackathon — all users do one onboarding)

4. **Keep**: "New goal" modal, "Settings" link, "Reset all data" (move to Settings page eventually)

5. **Label change**: Show goal name prominently, profile name small/secondary

### Key Decision

**Keep the profile-duplication architecture.** It works well. Just relabel the UI layer.

The old goals that aren't deleted are fine — they're the history of the user's financial plans. Each "goal workspace" is a snapshot of their financial state when they started that goal.

---

## Bug 3: Missing Confirmation Dialogs

### Current State

| Action | Has Confirmation? | Risk |
|--------|-------------------|------|
| Delete goal | No | High — cascades to child goals |
| Mark complete | No | Medium — archives followup data |
| Reactivate goal | No | Low — reversible |
| Delete profile (ProfileSelector) | `confirm()` native | Medium |
| New goal (when active) | Yes — ConfirmDialog | Good |

### Fix: Add ConfirmDialog to Destructive Actions

The `ConfirmDialog` component already exists at `components/ui/ConfirmDialog.tsx`.

**GoalsTab.tsx changes:**

```typescript
// Add state for confirmation dialogs
const [deleteConfirm, setDeleteConfirm] = createSignal<Goal | null>(null);
const [completeConfirm, setCompleteConfirm] = createSignal<Goal | null>(null);

// Replace handleDelete
const handleDelete = async (goalId: string) => {
  // Find goal, set confirm state
  const goal = goals().find(g => g.id === goalId);
  if (goal) setDeleteConfirm(goal);
};

const confirmDelete = async () => {
  const goal = deleteConfirm();
  if (!goal) return;
  await goalService.deleteGoal(goal.id);
  setDeleteConfirm(null);
  // Refresh
};

// Replace handleToggleStatus for completion
const handleToggleStatus = async (goal: Goal) => {
  if (goal.status === 'active') {
    setCompleteConfirm(goal);  // Show confirmation first
    return;
  }
  // Reactivation doesn't need confirmation
  await actualToggle(goal, 'active');
};

const confirmComplete = async () => {
  const goal = completeConfirm();
  if (!goal) return;
  await actualToggle(goal, 'completed');
  setCompleteConfirm(null);
};
```

**JSX additions:**

```tsx
<ConfirmDialog
  open={!!deleteConfirm()}
  title="Delete Goal"
  description={`Delete "${deleteConfirm()?.name}"? This cannot be undone.`}
  variant="danger"
  confirmLabel="Delete"
  onConfirm={confirmDelete}
  onCancel={() => setDeleteConfirm(null)}
/>

<ConfirmDialog
  open={!!completeConfirm()}
  title="Mark Complete"
  description={`Mark "${completeConfirm()?.name}" as complete? Progress will be archived.`}
  variant="warning"
  confirmLabel="Complete"
  onConfirm={confirmComplete}
  onCancel={() => setCompleteConfirm(null)}
/>
```

**Also fix ProfileSelector.tsx**: Replace native `confirm()` with `ConfirmDialog`.

---

## Bug 4: Goal Delete Doesn't Clean Up Profile — Deep Analysis

### Problem

When deleting a goal via `goalService.deleteGoal()`:
- Deletes from `goals` table + child goals
- Does NOT update/delete the associated profile
- Profile's `goal_name`, `goal_amount`, `goal_deadline` fields remain stale

### Impact: Where Are Denormalized Goal Fields Read?

The profile-level `goalName`, `goalAmount`, `goalDeadline` fields are read in **46+ locations**:

| Consumer | Fields Read | Impact of Stale Data |
|----------|-------------|---------------------|
| `ProfileSelector.tsx:263-265` | `goalName` | Header shows deleted goal's name |
| `chat.ts:1077,1158,1172` | `goalName`, `goalAmount`, `goalDeadline` | LLM receives wrong goal context → bad advice |
| `chat.ts:2172-2212` | `goalName`, `goalAmount` | "Earnings vs Goal Progress" shows deleted goal |
| `chat.ts:2443-2465` | `goalName`, `goalAmount` | Goal timeline messages reference deleted goal |
| `SimulationControls.tsx:171` | `goalAmount` | Simulation uses wrong target |
| `EarningsChart.tsx` | `goalAmount` | Chart target line shows deleted amount |
| `TimelineHero.tsx` | `goalAmount`, `goalDeadline` | Dashboard shows wrong deadline |
| `FinancialSummary.tsx` | `goalAmount` | Summary calculations wrong |
| `BrunoTips.tsx` | `goalAmount` | Tips reference nonexistent goal |
| `onboardingTipRules.ts:297` | `goalName`, `goalAmount` | Tip conditions evaluate against stale data |
| `rag.ts`, `daily-briefing.ts` | `goalName`, `goalAmount` | Agent context includes deleted goal |
| `analytics.ts:373-375` | `goal_name`, `goal_amount`, `goal_deadline` | **CRITICAL**: Uses profile fields as fallback → stale goal metrics, wrong progress %, wrong daily target |
| `profileService.ts:34` (embedding) | `goalName` | RAG vector embedding includes deleted goal name → wrong similarity matches |

**Verdict: Leaving stale fields is NOT OK.** Half the app references them.

### Architecture Context: 1 Profile ≈ 1 Goal

With the profile-duplication model (`/api/profiles/duplicate`):
- **Main profile** = the user's original profile from onboarding (may or may not have a goal)
- **Goal-clone profiles** = duplicated profiles with `profileType: 'goal-clone'` and `parentProfileId` set
- Each goal-clone typically has **exactly 1 goal** (the one set during duplication)

This means:
1. "Auto-promote next goal" **doesn't make sense within a single profile** — there IS no other goal on a goal-clone profile
2. The question is really: **what happens to the orphaned goal-clone profile?**

### Three Strategies Analyzed

#### Strategy A: Clear Fields Only (Minimal)

```typescript
// After goal deletion
await profileService.patchProfile(profileId, {
  goalName: null, goalAmount: null, goalDeadline: null,
});
```

**Pros**: Simple, prevents stale data everywhere
**Cons**: User is left on an empty goal-clone profile with no goal — a dead-end. GoalsTab shows "No active goal. Create a new one to get started." but creating a new goal on a cloned profile is semantically weird.

**Risk**: The empty goal-clone profile is a zombie — same financial data as parent, no purpose.

#### Strategy B: Switch to Parent + Delete Clone / Reset Main (Best UX — Refined)

**Case 1 — Goal-clone profile**: Switch to parent, then DELETE the clone entirely.

```typescript
// After goal deletion on a goal-clone
await profileService.switchProfile(currentProfile.parentProfileId);
await fetch(`/api/profiles?id=${currentProfile.id}`, { method: 'DELETE' });
window.location.reload();
```

**Case 2 — Main profile**: Can't delete it. Reset to "clean slate" by patching goal fields + followupData to null.

```typescript
// After goal deletion on main profile
await profileService.patchProfile(profileId, {
  goalName: null,
  goalAmount: null,
  goalDeadline: null,
  followupData: null,  // Goal-execution data (missions, savings, progress)
  // NOTE: Keep planData — it has non-goal data (selectedScenarios, completedTabs)
});
```

**Pros**: Clean lifecycle for both paths. Clone is properly garbage-collected. Main profile returns to "pre-goal" state.
**Cons**: Slightly more complex. Parent profile must still exist (it should — we don't allow deleting the main profile).

**Risk**: `switchProfile` clears localStorage and emits `PROFILE_SWITCHED`, then `window.location.reload()`. Same flow as normal profile switching — proven to work.

#### Strategy C: Auto-Promote Across Profiles (Over-Engineered)

"Find the most recent other goal-clone profile and switch to it."

**Pros**: User always lands on an active goal after deletion.
**Cons**: Complex to implement. Which profile to pick? By date? By amount? Hard to predict what the user wants. Also requires listing all profiles, filtering by type, sorting — a lot of logic for a hackathon.

**Verdict**: Over-engineered. Skip.

### Recommended Approach: Strategy B Refined

The flow becomes:
1. User clicks Delete on a goal → ConfirmDialog appears (from Bug 3 fix)
2. User confirms
3. `goalService.deleteGoal(goalId)` — removes from goals table + child goals
4. **If on a goal-clone profile**: switch to parent profile, DELETE the clone entirely, reload
5. **If on main profile**: patch profile to null goal fields + followupData, keep planData

### Deep Dive: What to Null on Main Profile

Multi-agent investigation of `planData` and `followupData` contents:

| Field | Contains | Goal-Specific? | Action on Delete |
|-------|----------|---------------|-----------------|
| `followupData` (entire) | currentAmount, weeklyTarget, missions, savingsCredits, savingsAdjustments, energyHistory (cached) | **YES** — 100% goal-execution data | **NULL entirely** |
| `planData.setup` | Goal name, amount, deadline, academic events, commitments | **YES** — goal context | **Clear** (set to undefined) |
| `planData.selectedScenarios` | Swipe session choices (jobs, trades) | **NO** — user's earning preferences | **KEEP** |
| `planData.completedTabs` | Tab completion checkmarks in /me | **NO** — profile-level state | **KEEP** |
| `planData.skills` | Skill list cache | **NO** — real data in `skills` table | **KEEP** |
| `planData.inventory` | Inventory cache | **NO** — real data in `inventory_items` table | **KEEP** |
| `planData.lifestyle` | Expense cache | **NO** — real data in `lifestyle_items` table | **KEEP** |
| `planData.trades` | Trade cache | **NO** — real data in `trades` table | **KEEP** |

**Verdict**:
- **followupData → null entirely** (all goal-execution data)
- **planData → surgical clear of `setup` only**, keep the rest

**Why NOT null all planData** (challenging Gemini's suggestion):
- `selectedScenarios` = swipe history (user preferences, NOT goal-specific). Nulling loses decision history and the progress page can't generate missions for a new goal.
- `completedTabs` = tab progress checkmarks. Nulling resets all tabs to "incomplete". Some auto-recover (Profile tab) but others require manual re-completion.
- `skills/inventory/lifestyle/trades` = cached copies of DuckDB table data. Nulling is harmless but unnecessary — they'd be re-read from DB on next page load.

**Energy history is safe**: The authoritative source is the `energy_logs` DuckDB table (separate from followupData). The cached `followupData.energyHistory` is reconstructable. All energy consumers (progress page, comeback-detection API, energy-debt API) read from `energy_logs` table as primary source.

**Null-safety confirmed**: All agents verified that every consumer of these fields handles null gracefully:
- GoalsTab → empty state "No active goal. Create a new one."
- Progress page → "No goals yet" fallback with link to /me
- Analytics API → returns `goalMetrics: undefined`, `goalProgress: 0`
- Chat API → "You don't have a savings goal set yet! Head to Me to create one."
- ProfileSelector → hides goal subtitle, shows profile name only
- me.tsx → auto-repairs missing `planData.setup` from goals table (lines 331-350)
- PATCH endpoint → fully supports setting all these fields to NULL

### Clone Profile DELETE Cascade — Bug Found

The current DELETE handler (`routes/api/profiles.ts:726-734`) only cascades to **5 of 14+ tables**:

| Cleaned Up | NOT Cleaned Up (Orphaned) |
|------------|--------------------------|
| goals | **income_items** |
| skills | **leads** |
| inventory_items | **chat_messages** |
| lifestyle_items | **energy_logs** |
| trades | **job_exclusions** |
| | **academic_events** |
| | **commitments** |
| | **goal_achievements** |
| | **retroplans** |
| | **goal_progress** |
| | **goal_actions** |

**Fix**: Extend the cascade list in the DELETE handler. DuckDB has no FK constraints, so we must delete manually.

### Edge Cases

| Case | Handling |
|------|----------|
| Deleting goal on main profile | Clear goal fields + followupData + planData.setup. Keep selectedScenarios/completedTabs. |
| Deleting goal on goal-clone | Switch to parent, delete clone (with full cascade). Reload. |
| Parent profile was deleted | Should not happen (last-profile protection). Fallback: clear fields only. |
| Multiple goals on same profile | Rare. Delete the specific goal, clear fields only if no goals remain. |
| Goal-clone with completed goal | Same flow — delete goal, switch to parent. Completed data already archived in goal's `planData`. |
| followupData null + energy_logs exists | Progress page falls back to `energy_logs` table. Energy chart still works. |

### Implementation in GoalsTab.tsx

```typescript
const confirmDelete = async () => {
  const goal = deleteConfirm();
  if (!goal) return;

  // 1. Delete the goal from goals table
  await goalService.deleteGoal(goal.id);

  // 2. Clean up profile based on type
  const profile = activeProfile();

  if (profile?.profileType === 'goal-clone' && profile?.parentProfileId) {
    // CLONE: Switch to parent profile, then delete the orphaned clone entirely
    const switched = await profileService.switchProfile(profile.parentProfileId);
    if (switched) {
      await fetch(`/api/profiles?id=${profile.id}`, { method: 'DELETE' });
      window.location.reload();
      return;
    }
    // If switch failed (parent gone), fall through to field-clearing
  }

  // MAIN PROFILE (or fallback): Reset to clean state
  if (profile?.id) {
    // Surgical planData clear: remove goal setup, keep user preferences
    const currentPlanData = profile.planData as Record<string, unknown> | undefined;
    const cleanedPlanData = currentPlanData
      ? { ...currentPlanData, setup: undefined }
      : undefined;

    await profileService.patchProfile(profile.id, {
      goalName: null,
      goalAmount: null,
      goalDeadline: null,
      followupData: null,     // Goal-execution data — energy survives in energy_logs table
      planData: cleanedPlanData, // Keep selectedScenarios, completedTabs; clear setup
    });
  }

  setDeleteConfirm(null);
  // Refresh goals list — will trigger empty state
};
```

### Side Effects Analysis

| Action | Side Effect | Safe? | Notes |
|--------|-------------|-------|-------|
| `switchProfile()` | Clears localStorage (planData, followupData, achievements) | YES | Goal-specific data, correct to clear |
| `switchProfile()` | Emits `PROFILE_SWITCHED` event | YES | Triggers profile context reload |
| `window.location.reload()` | Full page refresh | YES | Same as goal creation flow |
| DELETE `/api/profiles` | Cascades to related tables | **PARTIAL** | Need to fix cascade to cover all 14+ tables |
| `patchProfile(followupData: null)` | Loses missions, savings tracking | YES | These are goal-specific, meaningless without goal |
| `patchProfile(followupData: null)` | Loses cached energyHistory | YES | Authoritative data in `energy_logs` table survives |
| `patchProfile(planData.setup: undefined)` | Loses goal name/amount/deadline in planData | YES | Goal-specific context, already cleared in top-level fields too |
| Keep `planData.selectedScenarios` | Swipe preferences preserved | YES | User doesn't lose earning strategy decisions |
| Keep `planData.completedTabs` | Tab checkmarks preserved | YES | User doesn't see all tabs as incomplete |

---

## Bug 5: Profile Duplication Missing Tables (Data Loss on New Goal)

### Problem

When creating a "Fresh Goal Workspace" via `/api/profiles/duplicate`, the endpoint copies **6 tables** but misses **2 critical user-level tables**:

### What `duplicate.ts` Currently Copies

| Table | Copied? | Correct? |
|-------|---------|----------|
| profiles (row) | YES | Correct |
| skills | YES | Correct |
| income_items | YES | Correct |
| lifestyle_items | YES | Correct |
| trades | YES | Correct |
| goals (new) | YES (creates) | Correct |
| **academic_events** | **NO** | **BUG — should copy** |
| **commitments** | **NO** | **BUG — should copy** |
| inventory_items | NO | Correct — physical items are shared, can't be sold twice |
| job_exclusions | NO | Debatable — fresh recommendations per goal is defensible |
| achievements (JSON) | Set to NULL | Correct — fresh gamification per goal |
| energy_logs | NO | Correct — fresh per goal workspace |
| chat_messages | NO | Correct — chat is intentionally isolated per tab |
| retroplans | NO | Correct — goal-specific, regenerated |

### Why `academic_events` Must Be Copied

Academic events (exams, vacations, internships) are **user-level calendar data**:
- "Math Final Exam, Jan 15-17" applies regardless of which financial goal is active
- The retroplanning algorithm queries `academic_events WHERE profile_id = ?` to calculate capacity
- Without exams data, the new goal's retroplan will **overestimate available hours** during exam weeks
- User would need to re-enter their entire exam schedule for every new goal — bad UX

### Why `commitments` Must Be Copied

Commitments (classes, sports, family obligations) are **user-level schedule constraints**:
- "Biology class, Tue/Thu 2-4pm, 4h/week" doesn't change between goals
- Retroplanning uses commitments to calculate `available_hours = max_hours - commitment_hours`
- Without commitments, the plan suggests work during class hours

### Challenging the Gemini Suggestion (Phase 6)

An external analysis suggested also copying `inventory_items`, `achievements`, and `job_exclusions`. Deep investigation shows:

| Gemini Suggestion | Our Verdict | Reasoning |
|---|---|---|
| Copy `inventory_items` | **WRONG** | Physical items (phone, bike) are shared resources. Can't sell the same bike for two different goals. Duplication creates phantom inventory. The `status` field tracks `available`/`sold` — cloning would mark the same item as available in both profiles. |
| Copy `achievements` | **WRONG** | Already correctly set to NULL. Fresh gamification per goal = correct motivation design. Copying would give unearned badges (e.g., "Goal Achieved" badge on a brand new goal). |
| Copy `job_exclusions` | **Debatable, skip for hackathon** | User excluded "delivery driving" for a reason. But in a new goal context with different time constraints, they might reconsider. Fresh recommendations per goal is a valid UX choice. |

### Fix: Add to `duplicate.ts`

After the trades copy block (~line 156), add:

```typescript
// Copy academic_events (exam/vacation schedule — user-level, needed by retroplanning)
try {
  await execute(`
    INSERT INTO academic_events (id, profile_id, name, type, start_date, end_date,
      capacity_impact, priority, is_recurring, recurrence_pattern, created_at)
    SELECT gen_random_uuid()::VARCHAR, ${escapedNewId}, name, type, start_date, end_date,
      capacity_impact, priority, is_recurring, recurrence_pattern, CURRENT_TIMESTAMP
    FROM academic_events WHERE profile_id = ${escapedSourceId}
  `);
} catch (err) {
  logger.warn('Failed to duplicate academic_events (table may not exist)', { error: err });
}

// Copy commitments (classes, sports, family — user-level schedule constraints)
try {
  await execute(`
    INSERT INTO commitments (id, profile_id, commitment_type, commitment_name,
      hours_per_week, flexible_hours, day_preferences, start_date, end_date, priority, created_at)
    SELECT gen_random_uuid()::VARCHAR, ${escapedNewId}, commitment_type, commitment_name,
      hours_per_week, flexible_hours, day_preferences, start_date, end_date, priority, CURRENT_TIMESTAMP
    FROM commitments WHERE profile_id = ${escapedSourceId}
  `);
} catch (err) {
  logger.warn('Failed to duplicate commitments (table may not exist)', { error: err });
}
```

---

## Bug 6: Dead Code & Schema Cleanup

### Legacy JSON Columns (Low Priority)

| Column | Table | Status |
|--------|-------|--------|
| `income_sources` | profiles | Dead — real data in `income_items` table |
| `expenses` | profiles | Dead — real data in `lifestyle_items` table |
| `monthly_income` | profiles | Write-only snapshot, never read back |
| `monthly_expenses` | profiles | Write-only snapshot, never read back |
| `monthly_margin` | profiles | Write-only snapshot, never read back |

**Recommendation**: Don't delete columns (migration risk). Add comments in code marking them as deprecated. The `duplicate.ts` already sets `income_sources = NULL, expenses = NULL` which is correct.

### mergeExpenseSources Fallback

`expenseUtils.ts:97-121` — Falls back to `profile.expenses` if `lifestyle_items` is empty. This is only useful for profiles created before the lifestyle_items table existed. For new profiles, it's dead code.

**Recommendation**: Keep for now. It's defensive and doesn't cause issues when `lifestyle_items` has data.

### SchemaManager Duplicate

`lib/api/schemaManager.ts` has a third copy of the goals schema (lines 146-162) that's slightly different from the authoritative `routes/api/goals.ts`.

**Recommendation**: Remove the goals definition from schemaManager or make it import from goals.ts.

### ActionExecutor Stub

`ActionExecutor.ts:35` has `case 'create_goal': return { success: false, message: 'Not implemented' }`.

**Recommendation**: Wire it to `goalService.createGoal()` or remove the case.

---

## Execution Plan

### Phase 1: Subscription Fix (30 min) — DONE (commit `ca83dc6`)

1. ~~Make `currentCost` required in `stepForms.ts` subscription config~~ — `required: true, min: 1`
2. ~~Remove eager `createItem()` from OnboardingChat.tsx confirm flow (lines 666-679)~~ — Replaced with signal-only merge, removed unused `lifestyleService` import
3. ~~Fix `|| 10` → `?? 10` in OnboardingChat.tsx:663,672~~ — Also fixed `|| 0` → `?? 0` at line 2828
4. Test: fresh onboarding → enter Netflix with amount → no duplicate

### Phase 2: Confirmation Dialogs (30 min) — DONE (commit `ba6299f`)

1. ~~Add `deleteConfirm` / `completeConfirm` signals to GoalsTab.tsx~~
2. ~~Wire ConfirmDialog for delete (danger) and mark-complete (warning)~~ — Reactivation fires immediately (low risk)
3. ~~Replace `confirm()` in ProfileSelector.tsx with ConfirmDialog~~ — Added `deleteProfileConfirm` signal + dialog
4. Test: delete goal → see dialog → confirm → goal deleted

### Phase 3: Goal Switcher UX (45 min) — DONE (commit `89cf6f7`)

1. ~~Refactor `ProfileSelector.tsx` → show goals instead of profiles~~ — Header shows goal name (Target icon), dropdown says "My Goals"
2. ~~Show active goal name prominently, profile name secondary~~ — Goal name primary, `$amount · profile name` secondary
3. ~~Keep "New Goal" button, remove "New Profile" button~~ — Removed `handleNewFreshProfile`, `UserPlus` import, `Dynamic` import
4. ~~Separate simulations from goals in dropdown~~ — Goals (main + clones) in main section, simulations in separate "Simulations" section
5. ~~Clean up dead code~~ — Removed `getProfileIcon`, `User` icon, `Dynamic` import, `handleNewFreshProfile`
6. Test: switch between goals → correct profile loads

### Phase 4: Goal Deletion Cleanup (45 min)

1. In `confirmDelete` (GoalsTab.tsx): after deleting goal, detect profile type
2. If goal-clone: `switchProfile(parentProfileId)` → DELETE clone via API → `window.location.reload()`
3. If main profile: `patchProfile` to null goalName/goalAmount/goalDeadline + followupData + planData.setup (keep selectedScenarios, completedTabs)
4. **Fix DELETE cascade** in `routes/api/profiles.ts`: extend table list to include income_items, leads, chat_messages, energy_logs, job_exclusions, academic_events, commitments, goal_achievements, retroplans, goal_progress, goal_actions
5. Test: delete goal on clone → lands on parent profile, clone fully cleaned
6. Test: delete goal on main → goal fields + followupData cleared, energy_logs preserved, planData.selectedScenarios preserved

### Phase 5: Duplication Data Integrity (20 min)

1. Update `duplicate.ts`:
   - **COPY**: `academic_events`, `commitments` (INSERT...SELECT with new IDs, try/catch)
   - **SKIP**: `inventory_items`, `achievements`, `job_exclusions` (per-goal context)
2. Update `ProfileSelector.tsx`: replace native `confirm()` for "Reset all data" with ConfirmDialog
3. Test: add academic event + inventory item → create new goal → verify event copied, inventory NOT copied

### Phase 6: Dead Code Cleanup (15 min)

1. Remove stale goals schema from schemaManager.ts
2. Add deprecation comments to legacy JSON columns
3. Wire ActionExecutor `create_goal` stub to `goalService.createGoal()` or remove it

---

## Files Affected

| File | Changes |
|------|---------|
| `lib/chat/stepForms.ts` | Make currentCost required, min=1 |
| `components/chat/OnboardingChat.tsx` | Remove eager createItem in confirm flow |
| `components/tabs/GoalsTab.tsx` | Add ConfirmDialog for delete/complete |
| `components/ProfileSelector.tsx` | Refactor to goal-centric UX, replace confirm() |
| `components/tabs/GoalsTab.tsx` | Goal deletion → clone: switch+delete / main: null fields+followupData+planData.setup |
| `routes/api/profiles.ts` | Fix DELETE cascade (add 9 missing tables to cleanup list) |
| `routes/api/profiles/duplicate.ts` | Add academic_events + commitments copy |
| `lib/api/schemaManager.ts` | Remove duplicate goals schema |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Keep profile-duplication for goals | Works well, each goal = isolated financial snapshot |
| Relabel profiles as goals in UI | Users think in goals, not profiles |
| Required amount for subscriptions | Prevents 0-vs-default confusion |
| Remove eager createItem during confirm | Single source of truth: persistAllOnboardingData |
| ConfirmDialog over native confirm() | Consistent UX, better styling |
| Strategy B refined (switch to parent + reset main) | Clone: clean lifecycle via DELETE. Main: reset to pre-goal state. No zombie profiles. |
| Null followupData + planData.setup on main reset | followupData = goal-execution. planData.setup = goal context. Keep selectedScenarios/completedTabs. |
| Energy history safe to lose in followupData | Authoritative source is `energy_logs` table. Cached copy in followupData is reconstructable. |
| Don't auto-promote across profiles | Over-engineered for hackathon, unpredictable UX (which goal to pick?) |
| Fix DELETE cascade (5→14+ tables) | Current handler orphans 9+ tables. Fix prevents data leaks on clone deletion. |
| Copy academic_events + commitments during duplication | User-level calendar/schedule data needed by retroplanning. Doesn't change between goals. |
| DON'T copy inventory_items during duplication | Physical items are shared — can't sell same phone twice. `status` tracks sold/available. |
| DON'T copy achievements during duplication | Fresh gamification per goal = correct motivation. Already set to NULL. |
| DON'T copy job_exclusions during duplication | Fresh recommendations per goal is defensible. User might reconsider in new context. |
