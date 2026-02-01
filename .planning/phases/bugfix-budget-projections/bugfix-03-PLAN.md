---
phase: bugfix-budget-projections
plan: 03
type: execute
wave: 2
depends_on: ["bugfix-01"]
files_modified:
  - packages/frontend/src/components/suivi/TimelineHero.tsx
  - packages/frontend/src/components/tabs/GoalsTab.tsx
autonomous: false

must_haves:
  truths:
    - "TimelineHero shows breakdown tooltip: Earned X, Sold Y, Borrowed Z"
    - "User understands where their progress comes from"
    - "GoalsTab progress percentage includes one-time gains"
    - "Paused subscriptions appear in breakdown display"
  artifacts:
    - path: "packages/frontend/src/components/suivi/TimelineHero.tsx"
      provides: "Breakdown tooltip on earned metric"
      contains: "Sold|Borrowed|breakdown"
    - path: "packages/frontend/src/components/tabs/GoalsTab.tsx"
      provides: "Progress calculation with oneTimeGains"
      contains: "oneTimeGains|calculateTotalProgress"
  key_links:
    - from: "packages/frontend/src/components/suivi/TimelineHero.tsx"
      to: "props.oneTimeGains"
      via: "breakdown display"
      pattern: "oneTimeGains\\.(tradeSales|tradeBorrow)"
---

<objective>
Add UI clarity to show users the breakdown of their progress sources.

Purpose: Users should understand that their progress includes not just mission earnings, but also trade sales, borrowed item savings, and paused subscriptions.

Output: Visual breakdown on Suivi page and correct progress on Goals tab.
</objective>

<execution_context>
@/home/nico/.claude/get-shit-done/workflows/execute-plan.md
@/home/nico/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/bugs-dev/fix-budget-projections.md (see Phase 3: UI Clarity section)
@packages/frontend/src/components/suivi/TimelineHero.tsx (modified in Plan 01)
@packages/frontend/src/components/tabs/GoalsTab.tsx (target: progress display ~L1097)
@.planning/phases/bugfix-budget-projections/bugfix-01-SUMMARY.md (Plan 01 outputs)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add breakdown tooltip to TimelineHero earned metric</name>
  <files>packages/frontend/src/components/suivi/TimelineHero.tsx</files>
  <action>
The TimelineHero component already has an "earned" metric card (around line 222-257). Enhance it to show a breakdown when oneTimeGains exist.

1. Create a helper to compute breakdown:
```typescript
const hasOneTimeGains = () => {
  const otg = props.oneTimeGains;
  return otg && (otg.tradeSales > 0 || otg.tradeBorrow > 0 || otg.pausedSavings > 0);
};

const breakdownText = () => {
  if (!hasOneTimeGains()) return null;
  const otg = props.oneTimeGains!;
  const parts: string[] = [];
  if (props.currentAmount > 0) parts.push(`Earned: ${formatCurrency(props.currentAmount, props.currency)}`);
  if (otg.tradeSales > 0) parts.push(`Sold: ${formatCurrency(otg.tradeSales, props.currency)}`);
  if (otg.tradeBorrow > 0) parts.push(`Borrowed: ${formatCurrency(otg.tradeBorrow, props.currency)}`);
  if (otg.pausedSavings > 0) parts.push(`Paused: ${formatCurrency(otg.pausedSavings, props.currency)}`);
  return parts.join(' + ');
};
```

2. Update the "earned" metric card to show breakdown. Replace the simple display with a conditional:

When `hasOneTimeGains()` is true:
- Show total amount prominently
- Show breakdown text in smaller font below
- Consider using a tooltip or expanding on hover

Example JSX update for the earned card:
```tsx
<div class="...">
  <div class="text-lg font-bold tabular-nums ...">
    {formatCurrency(totalAmount(), props.currency, { showSign: goalAchieved() })}
  </div>
  <Show when={hasOneTimeGains()}>
    <div class="text-[10px] text-muted-foreground mt-0.5 leading-tight">
      {breakdownText()}
    </div>
  </Show>
  <Show when={!hasOneTimeGains()}>
    <div class="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
      {/* existing "earned" label */}
    </div>
  </Show>
</div>
```

3. Update the label to say "total" instead of "earned" when oneTimeGains exist.
  </action>
  <verify>
`pnpm typecheck` passes.
Navigate to `/suivi` with completed trades - breakdown text appears below the total.
  </verify>
  <done>
TimelineHero shows breakdown of earnings sources when one-time gains exist.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update GoalsTab progress to include oneTimeGains</name>
  <files>packages/frontend/src/components/tabs/GoalsTab.tsx</files>
  <action>
The GoalsTab shows `goal().progress` which comes directly from the database (~L1097). This needs to be recalculated with oneTimeGains.

1. Import the progress calculator:
```typescript
import { calculateTotalProgress, type OneTimeGains, getEmptyOneTimeGains } from '~/lib/progressCalculator';
```

2. The GoalsTab needs access to oneTimeGains. Since plan.tsx does NOT fetch budget data at the parent level, use Option B - fetch within GoalsTab:

**Option B Implementation:**
```typescript
// At component level, create a resource to fetch budget data
const [budgetData] = createResource(
  () => props.profileId,
  async (profileId) => {
    if (!profileId) return null;
    const response = await fetch(`/api/budget?profileId=${profileId}`);
    if (!response.ok) return null;
    return response.json();
  }
);

// Extract oneTimeGains from budget response
const oneTimeGains = () => {
  const budget = budgetData()?.budget;
  if (!budget?.oneTimeGains) return getEmptyOneTimeGains();
  return {
    tradeSales: budget.oneTimeGains.tradeSales || 0,
    tradeBorrow: budget.oneTimeGains.tradeBorrow || 0,
    pausedSavings: budget.oneTimeGains.pausedSavings || 0,
  };
};
```

3. Create a computed for the adjusted progress:
```typescript
const adjustedProgress = () => {
  const baseProgress = goal()?.progress || 0;
  const goalAmount = goal()?.amount || 0;
  const currentAmount = (baseProgress / 100) * goalAmount; // Reverse calculate current amount
  const totalProgress = calculateTotalProgress(currentAmount, oneTimeGains());
  return goalAmount > 0 ? Math.min(100, Math.round((totalProgress / goalAmount) * 100)) : 0;
};
```

Note: This is approximate since we're reverse-calculating. A cleaner approach would be to store/fetch the actual currentAmount. Check if GoalsTab has access to followupData.currentAmount.

4. Update the progress display (line ~1097):
```tsx
<p class="text-lg font-bold text-primary-600 dark:text-primary-400">
  {adjustedProgress()}%
</p>
```

5. If the current amount is available directly (from props or context), use that instead of reverse calculation.
  </action>
  <verify>
`pnpm typecheck` passes.
Navigate to `/plan` Goals tab - progress % should match Suivi page when trades exist.
  </verify>
  <done>
GoalsTab progress percentage includes one-time gains.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete progress tracking integration across Suivi and Goals pages:
1. TimelineHero shows total progress with breakdown tooltip
2. GoalsTab progress includes one-time gains
3. Visual indication of where progress comes from
  </what-built>
  <how-to-verify>
1. Start dev server: `pnpm dev`
2. Create or use existing profile with:
   - Active goal (e.g., 1000 EUR vacation)
   - Some mission earnings (e.g., 50 EUR)
   - A completed trade sale (e.g., 100 EUR)

3. Navigate to `/suivi`:
   - Progress bar should show ~15% (150/1000)
   - Earned card should show "150 EUR" with breakdown below
   - Breakdown text: "Earned: 50 + Sold: 100"

4. Navigate to `/plan` -> Goals tab:
   - Same goal should show 15% progress (matching Suivi)

5. Test without trades:
   - Create new profile with just mission earnings
   - Earned card should show simple "earned" label (no breakdown)

6. **Test paused subscriptions:**
   - Pause a 15 EUR/month subscription for 2 months
   - Verify progress increases by 30 EUR
   - Verify breakdown shows "Paused: 30 EUR"
  </how-to-verify>
  <resume-signal>Type "approved" if progress matches across pages and paused subscriptions appear correctly, or describe discrepancies</resume-signal>
</task>

</tasks>

<verification>
Full test scenario:
1. Profile with goal = 1000 EUR
2. Mission earnings = 100 EUR
3. Trade sale completed = 150 EUR
4. Borrow active = 50 EUR
5. Paused subscription = 30 EUR (15/month x 2 months)

Expected:
- Total progress = 100 + 150 + 50 + 30 = 330 EUR = 33%
- TimelineHero: 330 EUR (Earned: 100 + Sold: 150 + Borrowed: 50 + Paused: 30)
- GoalsTab: 33% progress

Run `pnpm typecheck` - no errors
Run `pnpm lint` - no errors in modified files
</verification>

<success_criteria>
- TimelineHero shows breakdown when multiple income sources exist
- GoalsTab progress matches Suivi page progress
- Visual is clean and non-cluttered for users with only mission earnings
- All numbers are consistent across the application
- Paused subscription savings appear in breakdown (Paused: X EUR)
</success_criteria>

<output>
After completion, create `.planning/phases/bugfix-budget-projections/bugfix-03-SUMMARY.md`
</output>
