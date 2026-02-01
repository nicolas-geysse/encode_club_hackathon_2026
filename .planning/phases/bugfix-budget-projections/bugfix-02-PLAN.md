---
phase: bugfix-budget-projections
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/routes/api/chat.ts
  - packages/frontend/src/lib/chatChartBuilder.ts
  - packages/frontend/src/lib/budgetEngine.ts
autonomous: true

must_haves:
  truths:
    - "Chat 'show progress' command includes trade sales in projectedSaved"
    - "Chat progress chart accumulates one-time gains in starting point"
    - "Budget engine projection includes oneTimeGains parameter"
    - "Simulation + trades scenario shows correct combined total"
  artifacts:
    - path: "packages/frontend/src/routes/api/chat.ts"
      provides: "Progress chart with oneTimeGains"
      contains: "oneTimeGains"
    - path: "packages/frontend/src/lib/chatChartBuilder.ts"
      provides: "buildProgressChart with oneTimeGains parameter"
      contains: "oneTimeGains.*number"
    - path: "packages/frontend/src/lib/budgetEngine.ts"
      provides: "FinancialData interface with oneTimeGains"
      contains: "oneTimeGains.*number"
  key_links:
    - from: "packages/frontend/src/routes/api/chat.ts"
      to: "packages/frontend/src/lib/chatChartBuilder.ts"
      via: "buildProgressChart call"
      pattern: "buildProgressChart.*oneTimeGains"
    - from: "packages/frontend/src/routes/api/chat.ts"
      to: "budgetContext.oneTimeGains"
      via: "extract from budget context"
      pattern: "budgetContext.*oneTimeGains"
---

<objective>
Fix chat progress and projection charts to include one-time gains from trades.

Purpose: When users ask Bruno "show my progress" or "show projection", the charts should reflect their actual financial position including sold items and borrowed savings.

Output: Chat charts that correctly accumulate one-time gains in savings projections.
</objective>

<execution_context>
@/home/nico/.claude/get-shit-done/workflows/execute-plan.md
@/home/nico/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/bugs-dev/fix-budget-projections.md (root cause analysis, see Phase 2 section)
@packages/frontend/src/routes/api/chat.ts (target: show_progress_chart case ~L1857)
@packages/frontend/src/lib/chatChartBuilder.ts (target: buildProgressChart function ~L161)
@packages/frontend/src/lib/budgetEngine.ts (target: FinancialData interface and calculateProjection)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add oneTimeGains to budgetEngine FinancialData</name>
  <files>packages/frontend/src/lib/budgetEngine.ts</files>
  <action>
1. Find the `FinancialData` interface (should be near top of file) and add:
```typescript
export interface FinancialData {
  // ... existing fields
  /** One-time gains from trades and paused subscriptions (optional for backward compat) */
  oneTimeGains?: number;
}
```

2. Update `calculateProjection()` function (line ~113) to include oneTimeGains:

Current (incorrect):
```typescript
const currentProjected = data.currentSaved + currentMargin * monthsRemaining;
```

Fixed:
```typescript
const oneTimeGains = data.oneTimeGains || 0;
const currentProjected = data.currentSaved + oneTimeGains + currentMargin * monthsRemaining;
```

3. Also update `currentProgress` calculation to include oneTimeGains:
```typescript
const currentProgress = data.goalAmount > 0
  ? ((data.currentSaved + oneTimeGains) / data.goalAmount) * 100
  : 0;
```

This ensures both the projected total and progress percentage include one-time gains.
  </action>
  <verify>
`pnpm typecheck` passes - no type errors in budgetEngine.ts or its consumers.
  </verify>
  <done>
FinancialData interface accepts oneTimeGains, calculateProjection uses it.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update buildProgressChart to accept oneTimeGains</name>
  <files>packages/frontend/src/lib/chatChartBuilder.ts</files>
  <action>
1. Update `buildProgressChart` function signature (line ~161):

Current:
```typescript
export function buildProgressChart(
  currentSaved: number,
  goalAmount: number,
  weeksRemaining: number,
  weeklyContribution: number,
  _currencySymbol: string = '$',
  simulationInfo?: SimulationInfo
): UIResource
```

New:
```typescript
export function buildProgressChart(
  currentSaved: number,
  goalAmount: number,
  weeksRemaining: number,
  weeklyContribution: number,
  _currencySymbol: string = '$',
  simulationInfo?: SimulationInfo,
  oneTimeGains: number = 0  // New parameter with default
): UIResource
```

2. Update the initial accumulator (line ~175):

Current:
```typescript
let accumulated = currentSaved;
```

Fixed:
```typescript
let accumulated = currentSaved + oneTimeGains;
```

**IMPORTANT:** oneTimeGains is a CONSTANT addition to the starting point. It does NOT get simulated forward - it represents already-realized gains (completed trades, current borrow savings). The weekly contribution handles future projections.

3. Update the chart title when oneTimeGains > 0 to indicate it includes trades:
```typescript
const hasOneTimeGains = oneTimeGains > 0;
const baseTitle = simulationInfo?.isSimulating
  ? `Savings Projection (Simulated +${simulationInfo.offsetDays ?? 0}d)`
  : 'Savings Projection';
const title = hasOneTimeGains ? `${baseTitle} (incl. trades)` : baseTitle;
```
  </action>
  <verify>
`pnpm typecheck` passes - no errors in chatChartBuilder.ts.
  </verify>
  <done>
buildProgressChart accepts and uses oneTimeGains parameter.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire oneTimeGains into chat.ts show_progress_chart</name>
  <files>packages/frontend/src/routes/api/chat.ts</files>
  <action>
1. In the `show_progress_chart` case (around line 1840-1885), extract oneTimeGains from budgetContext.

The BudgetContext interface (line ~82-93) has these relevant properties:
- `tradeSalesCompleted: number`
- `tradeBorrowSavings: number`
- `pausedSavings: number`

Extract the total:
```typescript
// Extract one-time gains from budget context (already-realized gains)
const oneTimeGainsTotal = (budgetContext?.tradeSalesCompleted || 0) +
                          (budgetContext?.tradeBorrowSavings || 0) +
                          (budgetContext?.pausedSavings || 0);
```

2. Update the projectedSaved calculation to include oneTimeGains:

Current (line ~1841):
```typescript
const projectedSaved = getProjectedSavings(currentSaved, weeklySavings, timeCtx);
```

Fixed:
```typescript
const projectedSaved = getProjectedSavings(currentSaved, weeklySavings, timeCtx) + oneTimeGainsTotal;
```

3. Update the buildProgressChart call (line ~1857) to pass oneTimeGains:
```typescript
const progressChartResource = buildProgressChart(
  projectedSaved,
  goalAmount,
  weeksRemaining,
  weeklySavings,
  currSymbol,
  {
    isSimulating: timeCtx.isSimulating,
    offsetDays: timeCtx.offsetDays,
    simulatedDate: timeCtx.simulatedDate,
  },
  oneTimeGainsTotal  // Add this parameter
);
```

4. Update the response text to mention trades if present:
```typescript
const tradesNote = oneTimeGainsTotal > 0
  ? ` (includes ${currSymbol}${oneTimeGainsTotal} from trades)`
  : '';
response = `📈 **Progress Towards Your Goal**\n\nSaved: **${currSymbol}${projectedSaved}** of **${currSymbol}${goalAmount}**${tradesNote}${simNote}`;
```
  </action>
  <verify>
`pnpm typecheck` passes.
Start dev server, open chat, type "show progress" - response should include trades note if trades exist.
  </verify>
  <done>
Chat progress command includes one-time gains in both the response text and the chart.
  </done>
</task>

</tasks>

<verification>
Manual test scenario:
1. Complete a trade sale (100 EUR)
2. Open chat on any tab
3. Type "show my progress" or "show progress chart"
4. Chart should show starting point = currentSaved + 100
5. Response text should mention "(includes 100 EUR from trades)"

Simulation test:
1. Complete a trade sale (100 EUR)
2. Enable time simulation (+30 days)
3. Type "show progress"
4. Chart should show: base + simulation_weeks * weekly + 100

Run `pnpm typecheck` - no errors
Run `pnpm lint` - no errors in modified files
</verification>

<success_criteria>
- Chat "show progress" includes one-time gains in displayed saved amount
- Progress chart starts at currentSaved + oneTimeGains
- Simulation mode correctly adds oneTimeGains to projected amount
- Budget engine calculateProjection includes oneTimeGains in projectedTotal
</success_criteria>

<output>
After completion, create `.planning/phases/bugfix-budget-projections/bugfix-02-SUMMARY.md`
</output>
