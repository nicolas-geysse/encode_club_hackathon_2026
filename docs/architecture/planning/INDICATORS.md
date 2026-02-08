# Financial Indicators Reference

> **Purpose:** Document all financial indicators used across Stride's UI to prevent confusion between metrics that appear similar but measure different things.

---

## Overview

Stride displays multiple financial indicators that can appear confusing because they use similar units (€/week, €/month) but measure fundamentally different things:

| Category | Indicator | Measures |
|----------|-----------|----------|
| **Goals** | Weekly Target | How much you need to EARN per week |
| **Budget** | Net Margin | How much you automatically SAVE per month |
| **Retroplan** | Adjusted Target | Capacity-weighted weekly target |

---

## Indicator Definitions

### 1. Weekly Target (Goal-based)

**Location:** `/suivi` TimelineHero, `suivi.tsx:330`

**Formula:**
```
weeklyTarget = Math.ceil(goal.amount / totalWeeks)
```

**Meaning:** The linear amount you need to earn each week to reach your goal on time.

**Example:**
- Goal: 1000€
- Deadline: 4 weeks from now
- Weekly Target: **250€/week**

**Important:** This assumes equal effort every week. It does NOT account for exams, vacations, or energy levels.

---

### 2. Net Margin / Monthly Margin (Budget-based)

**Location:** `/plan` Budget tab, `BudgetTab.tsx:199`

**Formula:**
```
netMargin = Σ(income_items.amount) - Σ(lifestyle_items.currentCost where pausedMonths=0)
```

**Meaning:** Your monthly budget surplus that can be saved towards your goal without any extra work.

**Example:**
- Income: 800€/month (scholarship + part-time job)
- Expenses: 600€/month (rent, food, subscriptions)
- Net Margin: **200€/month**

**Important:** This is PASSIVE savings. You don't need to "earn" this - it accumulates automatically from your budget surplus.

---

### 3. Adjusted Target (Retroplan-based)

**Location:** `/plan` Goals tab EarningsChart, `GoalsTab.tsx:897-903`

**Formula:**
```
adjustedTarget = milestone.capacity.capacityScore × targetPerCapacityPoint
avgAdjustedTarget = Σ(adjustedTargets) / count(adjustedTargets)
```

**Meaning:** The capacity-weighted weekly target that accounts for exam periods, vacations, and energy levels.

**Example:**
- Goal: 1000€, 8 weeks
- Linear weekly: 125€/week
- But you have 2 exam weeks (20% capacity)
- Adjusted targets: [150€, 150€, 150€, 150€, 150€, 150€, 25€, 25€]
- Average adjusted: **112€/week**

**Important:** The average is lower because protected weeks (exams) have reduced targets, while normal weeks have higher targets to compensate.

---

### 4. Weekly Need (EarningsChart)

**Location:** `/plan` Goals tab EarningsChart, `EarningsChart.tsx:88`

**Formula:**
```
weeklyRequired = (goalAmount - currentSaved) / Math.max(1, totalWeeks)
```

**Meaning:** Simple linear division of remaining amount by remaining weeks.

**Important:** This recalculates based on current progress, so it decreases as you save more.

---

### 5. Current Week / Total Weeks

**Location:** `/suivi` TimelineHero, `weekCalculator.ts:48`

**Formula:**
```
daysSinceStart = (now - goalStartDate) / millisecondsPerDay
weekNumber = Math.floor(daysSinceStart / 7) + 1
```

**Meaning:** How far into your goal timeline you are.

**Important:** The week number is calculated from `goal.createdAt`, not from today's date. This ensures weeks remain consistent even when navigating between pages.

---

### 6. Savings Weeks (Pig Badges)

**Location:** `/plan` Goals tab, `/suivi` WeeklyProgressCards

**Formula:**
```
savingsWeeks = calculateSavingsWeeks(goalStart, goalEnd, incomeDay, monthlyMargin)
```

**Meaning:** Which weeks receive your monthly savings based on when your income arrives.

**Example:**
- Income day: 15th of each month
- If week 2 contains the 15th → pig badge on week 2
- Amount: Your net margin (e.g., 200€)

**Important:** Can be manually adjusted via the wrench icon if actual savings differ from expected.

---

## Common Confusion Points

### "Why is my weekly target 250€ but net margin is only 200€?"

**Answer:** These are different metrics:
- **250€/week** = What you need to EARN (through work, selling, freelancing)
- **200€/month** = What you SAVE automatically (budget surplus)

If your net margin is positive, the pig badges on WeeklyProgressCards show when that passive savings will be credited to your progress.

---

### "Why is the 'Adjusted' target lower than 'Weekly Need'?"

**Answer:** The retroplan redistributes work away from protected weeks (exams, low energy) to high-capacity weeks. The average looks lower, but individual high-capacity weeks have HIGHER targets.

**Think of it like:**
- Linear: "Work equally hard every week" (not realistic during exams)
- Adjusted: "Work more when you can, rest when you can't" (sustainable)

---

### "Week 1/4 isn't changing - is it broken?"

**Answer:** The week number is calculated from `goal.createdAt`. If you just created the goal, you're in Week 1. Come back in 7 days to see Week 2/4.

To test week progression without waiting, use the simulation feature (available in debug mode).

> **Note:** This was a bug in early versions where Week 1/4 was always displayed. Fixed in Sprint 13.6 - the dashboard now correctly calculates the current week from `goal.createdAt`.

---

## Data Flow Summary

```
                    DuckDB
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼───┐       ┌─────▼─────┐     ┌─────▼─────┐
│goals  │       │income_    │     │lifestyle_ │
│table  │       │items      │     │items      │
└───┬───┘       └─────┬─────┘     └─────┬─────┘
    │                 │                 │
    │                 └────────┬────────┘
    │                          │
    ▼                          ▼
┌──────────────┐        ┌────────────────┐
│ weeklyTarget │        │ monthlyMargin  │
│ = amount /   │        │ = income -     │
│   weeks      │        │   expenses     │
└──────────────┘        └────────────────┘
    │                          │
    └──────────┬───────────────┘
               │
               ▼
        ┌─────────────┐
        │ Retroplan   │
        │ API         │
        └─────┬───────┘
              │
              ▼
        ┌─────────────┐
        │ adjustedTarget│
        │ per week     │
        └─────────────┘
```

---

## File Reference

| Indicator | Primary File | Line(s) |
|-----------|--------------|---------|
| weeklyTarget | `suivi.tsx` | 330 |
| netMargin | `BudgetTab.tsx` | 199 |
| monthlyMargin | `GoalsTab.tsx` | 143-158 |
| adjustedTarget | `retroplan.ts` | 256-278 |
| weeklyRequired | `EarningsChart.tsx` | 88 |
| weekNumber | `weekCalculator.ts` | 48 |
| savingsWeeks | `savingsHelper.ts` | 46-94 |
