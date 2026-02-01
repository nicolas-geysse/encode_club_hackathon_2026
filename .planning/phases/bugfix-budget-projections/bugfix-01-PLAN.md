---
phase: bugfix-budget-projections
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/lib/progressCalculator.ts
  - packages/frontend/src/routes/suivi.tsx
  - packages/frontend/src/components/suivi/TimelineHero.tsx
autonomous: true

must_haves:
  truths:
    - "Suivi page progress bar includes completed trade sales"
    - "Suivi page progress bar includes active/completed borrow savings"
    - "Suivi page progress bar includes paused subscription savings"
    - "Progress percentage reflects total earnings + one-time gains"
  artifacts:
    - path: "packages/frontend/src/lib/progressCalculator.ts"
      provides: "Unified progress calculation utility"
      exports: ["OneTimeGains", "calculateTotalProgress"]
      min_lines: 20
    - path: "packages/frontend/src/routes/suivi.tsx"
      provides: "Budget data fetching and progress calculation"
      contains: "fetch.*api/budget"
      min_lines: 400
    - path: "packages/frontend/src/components/suivi/TimelineHero.tsx"
      provides: "oneTimeGains prop handling"
      contains: "oneTimeGains"
      min_lines: 150
  key_links:
    - from: "packages/frontend/src/routes/suivi.tsx"
      to: "/api/budget"
      via: "fetch in loadData"
      pattern: "fetch.*api/budget"
    - from: "packages/frontend/src/routes/suivi.tsx"
      to: "packages/frontend/src/lib/progressCalculator.ts"
      via: "calculateTotalProgress import"
      pattern: "import.*progressCalculator"
    - from: "packages/frontend/src/components/suivi/TimelineHero.tsx"
      to: "props.oneTimeGains"
      via: "prop destructuring"
      pattern: "oneTimeGains.*tradeSales|tradeBorrow|pausedSavings"
---

<objective>
Fix progress tracking on Suivi page to include trade sales, borrow savings, and paused subscriptions.

Purpose: Users who sell items or borrow things see no progress toward their goal. This breaks the core value proposition of the Trade feature.

Output: Working progress calculation that dynamically adds one-time gains to mission earnings.
</objective>

<execution_context>
@/home/nico/.claude/get-shit-done/workflows/execute-plan.md
@/home/nico/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/bugs-dev/fix-budget-projections.md (root cause analysis and approved solution)
@packages/frontend/src/routes/suivi.tsx (target: loadData function ~L540)
@packages/frontend/src/components/suivi/TimelineHero.tsx (target: props interface + amountProgress calculation)
@packages/frontend/src/routes/api/budget.ts (source of oneTimeGains structure ~L284-289)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create progressCalculator utility</name>
  <files>packages/frontend/src/lib/progressCalculator.ts</files>
  <action>
Create a new utility file with:

1. Interface `OneTimeGains`:
```typescript
export interface OneTimeGains {
  tradeSales: number;      // Completed sell trades
  tradeBorrow: number;     // Active + completed borrow savings
  pausedSavings: number;   // Paused subscription savings
}
```

2. Function `calculateTotalProgress`:
```typescript
export function calculateTotalProgress(
  currentAmount: number,  // Mission earnings from followupData
  oneTimeGains: OneTimeGains
): number {
  return currentAmount + oneTimeGains.tradeSales + oneTimeGains.tradeBorrow + oneTimeGains.pausedSavings;
}
```

3. Helper `getEmptyOneTimeGains()` returning zeroed interface for fallback cases.

Keep it simple - this is a pure calculation utility with no side effects.
  </action>
  <verify>
`pnpm typecheck` passes with no errors in the new file.
  </verify>
  <done>
progressCalculator.ts exists with exported interface and function.
  </done>
</task>

<task type="auto">
  <name>Task 2: Integrate budget fetch and calculator into suivi.tsx</name>
  <files>packages/frontend/src/routes/suivi.tsx</files>
  <action>
Modify the `loadData()` function (around line 540) to:

1. Add a parallel fetch to `/api/budget?profileId=${profile.id}` alongside existing data loading.

2. Extract `oneTimeGains` from budget response:
```typescript
const budgetResponse = await fetch(`/api/budget?profileId=${profile.id}`);
const budgetData = await budgetResponse.json();
const oneTimeGains = budgetData.budget?.oneTimeGains || { tradeSales: 0, tradeBorrow: 0, pausedSavings: 0 };
```

3. Create a new signal to store oneTimeGains:
```typescript
const [oneTimeGains, setOneTimeGains] = createSignal<OneTimeGains>(getEmptyOneTimeGains());
```

4. In the JSX where `<TimelineHero>` is rendered, pass the new prop:
```typescript
<TimelineHero
  // ... existing props
  oneTimeGains={oneTimeGains()}
/>
```

5. Update the progress calculation in suivi.tsx where it computes `progressPercent` (~L657-659) to use `calculateTotalProgress`:
```typescript
const totalProgress = calculateTotalProgress(updated.currentAmount, oneTimeGains());
const progressPercent = Math.round((totalProgress / goalAmount) * 100);
```

Do NOT modify the stored `currentAmount` value - keep it pure (mission earnings only). The calculation happens at display time.
  </action>
  <verify>
`pnpm typecheck` passes.
Navigate to `/suivi` in browser - no console errors.
  </verify>
  <done>
suivi.tsx fetches budget data and passes oneTimeGains to TimelineHero.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update TimelineHero to use oneTimeGains</name>
  <files>packages/frontend/src/components/suivi/TimelineHero.tsx</files>
  <action>
1. Import the types from progressCalculator:
```typescript
import { type OneTimeGains, calculateTotalProgress, getEmptyOneTimeGains } from '~/lib/progressCalculator';
```

2. Extend `TimelineHeroProps` interface:
```typescript
interface TimelineHeroProps {
  // ... existing props
  /** One-time gains from trades and paused subscriptions */
  oneTimeGains?: OneTimeGains;
}
```

3. Modify `amountProgress()` computation (line 38) to include oneTimeGains:
```typescript
const totalAmount = () => calculateTotalProgress(props.currentAmount, props.oneTimeGains || getEmptyOneTimeGains());
const amountProgress = () => Math.min((totalAmount() / props.goalAmount) * 100, 100);
```

4. Update `goalAchieved()` to use totalAmount:
```typescript
const goalAchieved = () => totalAmount() >= props.goalAmount;
```

5. Update the animated amount display to show totalAmount instead of just currentAmount:
- Change target in `onMount` animation: `const targetAmount = totalAmount();`
- Update the display: use `totalAmount()` where `props.currentAmount` was shown

Keep the "earned" metric card showing `props.currentAmount` (mission earnings only) - the total is shown in the main progress display.
  </action>
  <verify>
`pnpm typecheck` passes.
Navigate to `/suivi` - progress bar shows higher % if user has completed trades.
  </verify>
  <done>
TimelineHero progress includes one-time gains. Progress % reflects total savings not just mission earnings.
  </done>
</task>

</tasks>

<verification>
Manual test scenario:
1. Create a goal of 1000 EUR
2. Complete a mission earning 50 EUR -> progress shows ~5%
3. Go to Trade tab, mark an item as sold for 100 EUR (status: completed)
4. Return to Suivi page
5. Progress should now show ~15% (50 + 100 = 150 / 1000)

Run `pnpm typecheck` - no errors
Run `pnpm lint` - no errors in modified files
</verification>

<success_criteria>
- Selling an item for 100 EUR adds 100 EUR to visible progress
- Borrowing an item worth 50 EUR adds 50 EUR to visible progress
- Pausing a 15 EUR/month subscription for 2 months adds 30 EUR to visible progress
- Progress percentage on Suivi page matches what Budget API calculates
- No double-counting when page is refreshed (calculation is dynamic, not stored)
</success_criteria>

<output>
After completion, create `.planning/phases/bugfix-budget-projections/bugfix-01-SUMMARY.md`
</output>
