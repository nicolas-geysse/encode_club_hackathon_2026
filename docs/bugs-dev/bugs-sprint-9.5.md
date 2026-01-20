# Sprint 9.5: Single Active Goal Enforcement

## Sprint 9.5 Status: ✅ COMPLETE

**Date**: 2026-01-19
**Focus**: Enforce single active goal policy to prevent inconsistent states

---

## Summary

| Type | Count | Status |
|------|-------|--------|
| Bug Fix | 1 | ✅ Fixed |
| Features | 4 | ✅ Implemented |

---

## Problem Statement

### Bug Identified
After completing a goal and creating a new one, `/suivi` could display inconsistent states:
- Completed goal remains visible if no new active goal
- Multiple active goals create confusion
- No clear link between "My Goals" and "Tracking"

### Root Cause
- `getPrimaryGoal()` filters `status='active'` but nothing prevents 0 or N active goals
- No constraint "one active goal at a time"
- Creating a new goal doesn't deactivate the old one

### User Expectation
> "Un seul objectif à la fois, une seule page Tracking"

---

## Solution: Single Active Goal Policy

### Principle
- **1 profile = 1 active goal maximum**
- Creating a new goal → automatically archives the old one
- Explanatory popup before archiving
- Onboarding: same rule (archives existing goal)

### Revised Goal Statuses
| Status | Meaning | Visible in Tracking |
|--------|---------|---------------------|
| `active` | Current goal (max 1) | ✅ Yes |
| `completed` | Goal achieved | ❌ No |
| `paused` | Archived (replaced) | ❌ No |
| `waiting` | Conditional goal | ❌ No |

---

## Phase 1: GoalsTab - Auto-archive with ConfirmDialog

### Problem
Creating a new goal didn't check for existing active goals.

### File
`packages/frontend/src/components/tabs/GoalsTab.tsx`

### Implementation

**New signal for confirmation state:**
```typescript
const [replaceGoalConfirm, setReplaceGoalConfirm] = createSignal<Goal | null>(null);
```

**Archive helper function:**
```typescript
const archiveActiveGoals = async () => {
  const activeGoals = goals().filter((g) => g.status === 'active');
  for (const oldGoal of activeGoals) {
    await goalService.updateGoal({
      id: oldGoal.id,
      status: 'paused', // Archived, not deleted
    });
  }
};
```

**Modified handleSave() to check for active goals:**
```typescript
const handleSave = async () => {
  if (!goalName() || goalAmount() <= 0 || !goalDeadline() || !profileId()) return;

  // Check for existing active goals before creating (not when editing)
  if (!editingGoalId()) {
    const activeGoals = goals().filter((g) => g.status === 'active');
    if (activeGoals.length > 0) {
      setReplaceGoalConfirm(activeGoals[0]);
      return;
    }
  }

  await performSave();
};
```

**ConfirmDialog with warning variant:**
```tsx
<ConfirmDialog
  isOpen={!!replaceGoalConfirm()}
  title="Replace current goal?"
  message={`You already have an active goal: "${replaceGoalConfirm()?.name}". Creating a new goal will archive it. Continue?`}
  confirmLabel="Replace"
  variant="warning"
  onConfirm={handleReplaceGoalConfirm}
  onCancel={() => setReplaceGoalConfirm(null)}
/>
```

### Verification
- [x] Creating a new goal shows confirmation dialog
- [x] Confirming archives old goal (status='paused')
- [x] New goal becomes the only active goal

---

## Phase 2: Onboarding - Archive vs Delete

### Problem
`persistGoal()` deleted ALL existing goals before creating a new one, losing history.

### File
`packages/frontend/src/lib/onboardingPersistence.ts`

### Implementation

**Before:**
```typescript
// Delete existing goals to prevent duplicates
await fetch(`/api/goals?profileId=${profileId}`, { method: 'DELETE' });
```

**After:**
```typescript
// Archive existing active goals instead of deleting all
const existingGoalsResponse = await fetch(
  `/api/goals?profileId=${profileId}&status=active`
);
if (existingGoalsResponse.ok) {
  const existingGoals = await existingGoalsResponse.json();
  for (const goal of existingGoals) {
    await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: goal.id, status: 'paused' }),
    });
  }
}
```

### Verification
- [x] Onboarding archives existing goals (not deletes)
- [x] Goal history preserved for potential reactivation

---

## Phase 3: Visual Badges and Reactivate Button

### Problem
- No visual distinction for "paused" (archived) goals
- No way to reactivate an archived goal

### Files
- `packages/frontend/src/components/GoalTimeline.tsx`
- `packages/frontend/src/components/tabs/GoalsTab.tsx`

### Implementation

**Added "Archived" section in GoalTimelineList:**
```tsx
<Show when={goalsByStatus().paused.length > 0}>
  <div>
    <h3 class="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">
      Archived ({goalsByStatus().paused.length})
    </h3>
    <div class="space-y-4 opacity-50">
      <For each={goalsByStatus().paused}>
        {(goal) => <GoalTimeline goal={goal} ... />}
      </For>
    </div>
  </div>
</Show>
```

**Updated goal icon for paused status:**
```tsx
<span class="text-2xl">
  {props.goal.status === 'completed'
    ? '✅'
    : props.goal.status === 'waiting'
      ? '⏳'
      : props.goal.status === 'paused'
        ? '📦'
        : '🎯'}
</span>
```

**Updated toggle button for paused goals:**
```tsx
<Show
  when={props.goal.status === 'completed' || props.goal.status === 'paused'}
  fallback={<Check class="h-4 w-4" />}
>
  <RotateCcw class="h-4 w-4" />
</Show>
```

**Updated handleToggleStatus to enforce single active goal:**
```typescript
const handleToggleStatus = async (goal: Goal) => {
  let newStatus: 'active' | 'completed' | 'paused';

  if (goal.status === 'active') {
    newStatus = 'completed';
  } else {
    // Both 'completed' and 'paused' goals can be reactivated
    newStatus = 'active';
  }

  // If reactivating, archive any current active goals first
  if (newStatus === 'active') {
    await archiveActiveGoals();
  }

  await goalService.updateGoal({
    id: goal.id,
    status: newStatus,
    progress: newStatus === 'completed' ? 100 : goal.progress,
  });
  await refreshGoals();
};
```

### Verification
- [x] Badge "Archived" visible on paused goals
- [x] 📦 icon for archived goals
- [x] Reactivate button works for both completed and paused
- [x] Reactivating archives current active goal first

---

## Phase 4: "All Goals Completed" Message

### Problem
When no active goal exists but completed goals exist, `/suivi` showed generic "No plan yet" message.

### File
`packages/frontend/src/routes/suivi.tsx`

### Implementation

**Added state for completed goals count:**
```typescript
const [completedGoalsCount, setCompletedGoalsCount] = createSignal(0);
```

**Check for completed goals when no active goal:**
```typescript
if (primaryGoal) {
  // ... existing logic
} else {
  // No active goal - check if there are completed goals
  const allGoals = await goalService.listGoals(profile.id, { status: 'all' });
  const completedGoals = allGoals.filter((g) => g.status === 'completed');
  setCompletedGoalsCount(completedGoals.length);
}
```

**AllGoalsCompletedView component:**
```tsx
const AllGoalsCompletedView = () => (
  <Card class="max-w-md mx-auto text-center border-green-500/20 bg-green-500/5">
    <CardContent class="py-12 flex flex-col items-center">
      <div class="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
        <Trophy class="h-8 w-8 text-green-500" />
      </div>
      <h2 class="text-xl font-bold text-foreground mb-2">All goals completed!</h2>
      <p class="text-muted-foreground mb-6">
        You've completed {completedGoalsCount()} goal{completedGoalsCount() > 1 ? 's' : ''}. Create
        a new goal in "My Goals" to continue your journey.
      </p>
      <Button as="a" href="/plan?tab=goals">
        Create New Goal
      </Button>
    </CardContent>
  </Card>
);
```

**FallbackView logic:**
```tsx
const FallbackView = () => (
  <Show when={completedGoalsCount() > 0} fallback={<NoPlanView />}>
    <AllGoalsCompletedView />
  </Show>
);
```

### Verification
- [x] No active goal + completed goals → shows "All goals completed!" with Trophy
- [x] No goals at all → shows "No plan yet"
- [x] Link to create new goal points to `/plan?tab=goals`

---

## Files Changed Summary

| Action | File | Changes |
|--------|------|---------|
| MODIFY | `components/tabs/GoalsTab.tsx` | Auto-archive, ConfirmDialog, handleToggleStatus |
| MODIFY | `lib/onboardingPersistence.ts` | Archive vs delete existing goals |
| MODIFY | `components/GoalTimeline.tsx` | Paused section, icons, reactivate button |
| MODIFY | `routes/suivi.tsx` | AllGoalsCompletedView, completedGoalsCount |

---

## Quality Verification

- [x] `pnpm lint` passes (0 errors, 0 warnings)
- [x] `pnpm typecheck` passes

---

## Verification Checklist

### Core Functionality
- [x] Creating a new goal archives the old one (status='paused')
- [x] Confirmation popup before archiving
- [x] `/suivi` always displays the single active goal
- [x] Onboarding replaces/archives existing goal

### UI/UX
- [x] Status badges visible on goals (Active, Completed, Archived)
- [x] 📦 icon for archived goals
- [x] Reactivate button on archived and completed goals
- [x] "All goals completed" message with Trophy icon

### Edge Cases
- [x] No goals → "No plan yet" (unchanged)
- [x] Completed goal + new created → old stays 'completed', new is 'active'
- [x] Reactivation → archives current active, reactivates selected

---

## Out of Scope (Future)

- Multi-goal dashboard (tabs or dropdown to choose goal to track)
- Goal templates
- Goal sharing between profiles

---

## Sprint History Quick Reference

| Sprint | Focus | Key Deliverables |
|--------|-------|------------------|
| **1** | Foundation | Profile persistence, DuckDB setup |
| **2** | Core features | Skill arbitrage, retroplanning |
| **3** | Stability | Error handling, fallbacks |
| **5** | Screen 2 | Timeline, Energy, Missions |
| **6** | Architecture | Toast system, persistence extraction |
| **7** | Quality | Unit tests, cumulative savings |
| **7.5** | Polish | TD-1 console.error → toast.error |
| **8** | UX Bugs | 8 bugs + 3 features |
| **9.5** | Goal Policy | Single active goal enforcement (current) |

---

## Lessons Learned

1. **Single source of truth** for active goals prevents UI inconsistencies
2. **Archive vs Delete** preserves history and enables recovery
3. **Solid reactivity warnings** require extracting async handlers to separate functions
4. **Visual status indicators** (icons + badges) improve UX comprehension
5. **Contextual fallback messages** ("All completed" vs "No plan") provide better guidance
