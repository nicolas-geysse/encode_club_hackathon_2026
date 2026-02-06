# Progress & Multi-Goal Architecture Audit

## Executive Summary

**The app has TWO conflicting "New Goal" paths:**

| Path | What it does | Isolation |
|------|-------------|-----------|
| **Menu "New Goal"** (ProfileSelector) | Clones entire profile via `duplicateProfileForGoal()` | GOOD: fresh `followupData`, separate profile |
| **GoalsTab "New Goal"** button | Creates goal record on SAME profile | BAD: shared `followupData`, earnings bleed |

**The profile-clone approach (menu) is architecturally correct** for single-goal-per-profile. But `duplicateProfileForGoal()` has a critical bug: it doesn't copy ~10 important fields (currency, certifications, coordinates, subscriptions, etc.).

**Strategy: Single active goal per profile. Consolidate both "New Goal" paths to use the profile-clone approach. Fix the field copy bug.**

---

## Current Architecture

### The Profile = Financial Identity Model

The user's insight is correct: the profile represents a **financial identity** with stable inputs/outputs:

```
PROFILE (stable, personal)
├── Income sources, expenses, monthly margin
├── Skills, certifications, diploma
├── Location (city, coordinates)
├── Work preferences (max hours, min rate)
├── Subscriptions, inventory, trades
├── Swipe preferences (learned from swiping)
└── Energy history (about the person)

GOAL (variable, per-objective)
├── Name, amount, deadline
├── Retroplan milestones (computed)
├── Missions (from swipe scenarios)
├── Savings progress (monthly credits)
└── followupData (progress tracking state)
```

### What's Per-Goal vs Per-Profile

| Entity | Scope | Table/Location | `goal_id`? |
|--------|-------|---------------|------------|
| Goals | Per-goal | `goals` table | IS the goal |
| Goal Components | Per-goal | `goal_components` table | YES |
| Retroplan milestones | Per-goal | Computed on-the-fly | YES |
| **Missions** | **PROFILE** | `profile.followupData.missions` | **NO** |
| **Savings credits** | **PROFILE** | `profile.followupData.savingsCredits` | **NO** |
| **Energy logs** | **PROFILE** | `energy_logs` table | **NO** |
| **Trade opportunities** | **PROFILE** | `trade_opportunities` table | **NO** |
| **Inventory items** | **PROFILE** | `inventory_items` table | **NO** |
| **Swipe scenarios** | **PROFILE** | `profile.planData.selectedScenarios` | **NO** |
| **Job exclusions/leads** | **PROFILE** | `job_exclusions` / `leads` tables | **NO** |
| **Budget** | **PROFILE** | `profiles` table | **NO** |

### The Cross-Domain Problem

```
Goal A: "Save 500€ for laptop"
  → Sold textbooks (trade) → 45€ → items GONE
  → Babysitting missions (swipe) → 120€
  → Monthly savings auto-credited → 240€
  → Paused Netflix → 13€/month saved

If user creates Goal B on SAME profile:
  → Textbooks? Already sold. Can't re-sell.
  → Babysitting earnings? Still in followupData.currentAmount.
  → Netflix? Already paused. Can't re-pause.
  → Goal B starts with Goal A's accumulated 418€ (BUG)
```

**But with profile-clone (menu "New Goal"):**
  → New profile gets fresh `followupData` (missions=[], currentAmount=0)
  → Budget (income/expenses) correctly copied — same financial reality
  → Trades/inventory NOT copied — correct, you can't re-sell
  → Energy continues separately — each profile tracks its own

---

## The Two "New Goal" Paths (Conflict)

### Path 1: Menu "New Goal" → Profile Clone (CORRECT approach)

**ProfileSelector.tsx** → `handleDuplicateForGoal()` → `profileService.duplicateProfileForGoal()`

Creates a new profile with:
- `profileType: 'goal-clone'`
- `parentProfileId: sourceProfileId`
- Fresh `followupData: undefined` (clean start)
- Fresh `planData: undefined` (no old swipe scenarios)
- Copies: name, diploma, skills, city, citySize, incomeSources, expenses, maxWorkHoursWeekly, minHourlyRate, hasLoan, loanAmount

**BUG: Missing fields** (not copied from source):
- `currency` (defaults to undefined → breaks currency display)
- `certifications` (lost → breaks job matching boost)
- `latitude`, `longitude`, `address` (lost → breaks prospection/maps)
- `incomeDay` (lost → breaks savings week calculation)
- `swipePreferences` (lost → resets learned preferences)
- `subscriptions` (lost → can't show subscription optimization)
- `inventoryItems` (lost → items to sell disappear)
- `field` (study field lost)
- `skippedSteps` (onboarding context lost)
- `monthlyIncome`, `monthlyExpenses`, `monthlyMargin` (computed fields lost)

### Path 2: GoalsTab "New Goal" → Same Profile (PROBLEMATIC)

**GoalsTab.tsx** → `GoalForm` in create mode → `goalService.createGoal()`

Creates a goal record in the `goals` table on the SAME profile. If an active goal exists:
- Shows "Replace current goal?" dialog
- Old goal → `status: 'paused'`
- Profile `followupData` **NOT reset** → earnings bleed

### Path 3: Progress Page CTA → Redirects to GoalsTab

`navigate('/me?tab=goals&action=new')` → same as Path 2

### Path 4: Chat "new goal" intent → Same Profile

`goalService.createGoal()` → same as Path 2

---

## Hackathon Strategy: Single Goal per Profile

### Principle

> One profile = one financial situation = one active goal.
> Want a different goal? Clone your profile (preserves your financial base, resets progress).
> Completed a goal? Archive it, start fresh.

### Sprint: 4 Quickwins (~1.5h total)

#### QW1: Fix `duplicateProfileForGoal()` missing fields + energy history (20 min)

**File**: `packages/frontend/src/lib/profileService.ts`

Add ALL missing fields to the clone + seed energy history from source:

```typescript
const newProfile = {
  // Currently copied (keep)
  name: `${source.name} - ${goalConfig.goalName}`,
  diploma: source.diploma,
  skills: source.skills,
  city: source.city,
  citySize: source.citySize,
  incomeSources: source.incomeSources,
  expenses: source.expenses,
  maxWorkHoursWeekly: source.maxWorkHoursWeekly,
  minHourlyRate: source.minHourlyRate,
  hasLoan: source.hasLoan,
  loanAmount: source.loanAmount,

  // ADD THESE (currently missing):
  field: source.field,
  currency: source.currency,
  certifications: source.certifications,
  latitude: source.latitude,
  longitude: source.longitude,
  address: source.address,
  incomeDay: source.incomeDay,
  swipePreferences: source.swipePreferences,
  subscriptions: source.subscriptions,
  monthlyIncome: source.monthlyIncome,
  monthlyExpenses: source.monthlyExpenses,
  monthlyMargin: source.monthlyMargin,
  skippedSteps: source.skippedSteps,
  // NOTE: Do NOT copy inventoryItems — items are consumable
  // NOTE: followupData/planData fresh EXCEPT energy history (see below)

  // Seed energy history from source (energy = person attribute, not goal)
  followupData: source.followupData?.energyHistory
    ? { energyHistory: source.followupData.energyHistory }
    : undefined,

  // Goal-specific (already correct)
  profileType: 'goal-clone',
  parentProfileId: sourceProfileId,
  goalName: goalConfig.goalName,
  goalAmount: goalConfig.goalAmount,
  goalDeadline: goalConfig.goalDeadline,
  planData: undefined,
  achievements: undefined,
};
```

#### QW2: Redirect GoalsTab "New Goal" to profile-clone flow (20 min)

**File**: `packages/frontend/src/components/tabs/GoalsTab.tsx`

When user has an active goal and clicks "New Goal":
- Instead of showing `GoalForm` → show the profile-clone modal (same as menu)
- OR: replace "New Goal" button with "Edit Goal" when active goal exists
- Keep "New Goal" only when no active goal (first goal setup)

**Approach**: When active goal exists, "New Goal" button opens a dialog:
> "Start a fresh goal workspace? Your current financial setup (income, expenses, skills) will carry over, but progress tracking starts fresh. Your current goal stays accessible via the profile selector."
> [Start Fresh Goal] [Edit Current Goal] [Cancel]

**UX notes** (from peer review):
- Use "Start Fresh Goal" / "Fresh Goal Workspace" terminology, NOT "Clone" or "Duplicate"
- Add note: "Note: Items already sold or traded stay with your current goal."
- "Start Fresh Goal" → trigger same flow as `handleDuplicateForGoal()` from ProfileSelector.

#### QW3: Also redirect Progress page "New Goal" CTA (10 min)

**File**: `packages/frontend/src/routes/progress.tsx`

The `NoPlanView` and `CompletedGoalsSummary` components have "Create New Goal" buttons that navigate to `/me?tab=goals&action=new`.

When no goal exists → keep current behavior (create goal on current profile, first goal setup).
When goals are completed → redirect to profile-clone flow instead.

#### QW4: Archive followupData on goal completion (20 min)

**File**: `packages/frontend/src/routes/progress.tsx`

When goal reaches 100% and user confirms completion:
1. Save current `followupData` into `goal.plan_data.archivedProgress`
2. Update goal `status: 'completed'`
3. Reset profile's `followupData` to clean state
4. Show `CompletedGoalsSummary` with archived data

**File**: `packages/frontend/src/components/suivi/CompletedGoalsSummary.tsx`

Read archived progress from `goal.planData.archivedProgress` to show:
- Total earned, mission count, duration, energy average

---

### Files Summary

| Quickwin | File | Change |
|----------|------|--------|
| QW1 | `lib/profileService.ts` | Add 12 missing fields to `duplicateProfileForGoal()` |
| QW2 | `components/tabs/GoalsTab.tsx` | Redirect "New Goal" to profile-clone when active goal exists |
| QW2 | `components/tabs/GoalsTab.tsx` | Add profile-clone dialog (reuse ProfileSelector modal logic) |
| QW3 | `routes/progress.tsx` | Redirect post-completion "New Goal" to profile-clone |
| QW4 | `routes/progress.tsx` | Archive followupData on goal completion |
| QW4 | `components/suivi/CompletedGoalsSummary.tsx` | Show archived progress data |

---

### What NOT to Do

- Don't add `goal_id` to existing tables (too invasive for hackathon)
- Don't try concurrent goals on same profile (architectural mismatch)
- Don't remove "New Goal" from menu (it already works correctly!)
- Don't copy `inventoryItems` or `trade_opportunities` to cloned profile (items are consumable)
- Don't use technical jargon ("clone", "duplicate") in user-facing text

### What's Naturally Correct Already

- Budget (income/expenses) is shared → correctly copied to clone
- Monthly margin applies to active goal → works per-profile
- Trades are consumable → NOT copied to clone, correct
- Energy is personal → seeded from source profile's history (last 12 weeks)
- Profile selector shows all profiles → user can switch between goal-profiles
- Goal-clone profiles show target icon + goal name in dropdown

### Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| Copy energy history to clone | Energy = person attribute, not goal. User shouldn't look "new" |
| Don't copy inventory/trades | Consumable items — can't re-sell what's already sold |
| "Fresh Goal Workspace" wording | User-centric, not technical. Gemini review suggestion |
| Add inventory note in dialog | Manages expectation: "items stay with current goal" |
| followupData partially seeded | Only energyHistory copied; missions/savings/credits start at 0 |

---

## Post-Hackathon Roadmap

1. **Phase 1**: Copy academic_events and commitments to cloned profile (they affect retroplanning)
2. **Phase 2**: Add "goal_id" to leads table (which goal was this job lead found for?)
3. **Phase 3**: Shared inventory across profiles (items sold on one profile = gone on all clones)
4. **Phase 4**: Goal comparison view (side-by-side feasibility analysis)
5. **Phase 5**: Budget scenario modeling (what if I increase hours for Goal B?)
