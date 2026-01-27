# Sprint 13: Weekly Timeline Consolidation

> **Status:** Implemented
> **Scope:** Phases 1-3 + 5 (Timeline, Energie, Simulateur, Animations)
> **Sprint 14 (separate):** Phase 4 (Suggestions Mastra)
> **Mascot:** Emoji simple `🚶`

## Objective

Unify the weekly timeline experience across the entire Stride app:
- Consistent visual indicator for the current week (green border + `🚶` emoji)
- Complete date simulator integration
- Energy + Earnings + Progress unified in the timeline

---

## Implementation Summary

### New Files Created

| File | Purpose |
|------|---------|
| `packages/frontend/src/lib/weekCalculator.ts` | Centralized utility for week calculations |

### Files Modified

| File | Changes |
|------|---------|
| `packages/frontend/src/app.css` | Added CSS animations for timeline |
| `packages/frontend/src/components/WeeklyProgressCards.tsx` | Added `simulatedDate` prop, current week indicator with green ring, mascot emoji, 7-day progress bar |
| `packages/frontend/src/components/suivi/EnergyHistory.tsx` | Added `currentWeek` prop, green ring highlight on current week bar |
| `packages/frontend/src/components/RetroplanPanel.tsx` | Added `simulatedDate` prop, current week highlight in capacity timeline and milestones table |
| `packages/frontend/src/components/tabs/GoalsTab.tsx` | Added `simulatedDate` prop, passes to WeeklyProgressCards and RetroplanPanel |
| `packages/frontend/src/routes/suivi.tsx` | Added WeeklyProgressCards integration, passes currentWeek to EnergyHistory, passes simulatedDate to RetroplanPanel |
| `packages/frontend/src/routes/plan.tsx` | Added simulationService import, currentDate signal, passes simulatedDate to GoalsTab |

---

## Phase 1: Timeline Consolidation (WeeklyProgressCards)

### 1.1 Added simulatedDate support

```typescript
interface WeeklyProgressCardsProps {
  goal: Goal;
  currency?: Currency;
  weeklyEarnings?: Array<{ week: number; earned: number }>;
  hourlyRate?: number;
  simulatedDate?: Date;  // NEW - defaults to current date
}
```

### 1.2 Enhanced current week indicator

- **Green ring:** `ring-2 ring-green-500 ring-offset-2 animate-pulse-subtle`
- **Mascot emoji:** `🚶` with `animate-bounce-slow` animation
- **7-day progress bar:** Visual bricks showing days elapsed in current week
  - Past days: `bg-green-500`
  - Today: `bg-green-400 animate-day-pulse`
  - Future days: `bg-muted`

### 1.3 Integrated on /suivi

WeeklyProgressCards now appears after TimelineHero on the /suivi page with:
- `weeklyEarnings` calculated from completed missions
- `simulatedDate` from currentDate signal

### 1.4 Integrated in RetroplanPanel

Both weekly capacity timeline and milestones table now highlight the current week with:
- Green ring on capacity bar
- Green background + mascot emoji in table row

---

## Phase 2: Energy in Timeline

### 2.1 Current week indicator in EnergyHistory

```typescript
interface EnergyHistoryProps {
  history: EnergyEntry[];
  threshold?: number;
  onEnergyUpdate?: (week: number, level: number) => void;
  currentWeek?: number;  // NEW - highlights this week's bar
}
```

Current week bar gets:
- `ring-2 ring-green-500 ring-offset-1`
- Mascot emoji `🚶` above the bar
- "(current)" label in tooltip

---

## Phase 3: Date Simulator Integration

### 3.1 Centralized weekCalculator.ts

```typescript
export interface WeekInfo {
  weekNumber: number;
  weekStart: Date;
  weekEnd: Date;
  isCurrentWeek: boolean;
  daysIntoWeek: number;  // 0-6
}

export function getCurrentWeekInfo(
  goalStartDate: string,
  totalWeeks: number,
  simulatedDate?: Date
): WeekInfo;

export function getWeekNumberFromDate(
  date: Date,
  goalStartDate: Date
): number;

export function isCurrentWeekNumber(
  weekNumber: number,
  goalStartDate: string,
  simulatedDate?: Date
): boolean;

export function calculateTotalWeeks(
  startDate: Date,
  endDate: Date
): number;
```

### 3.2 simulatedDate propagation

| Route/Component | Source | Propagation |
|-----------------|--------|-------------|
| `/suivi` | `simulationService.getCurrentDate()` | WeeklyProgressCards, EnergyHistory, RetroplanPanel |
| `/plan` | `simulationService.getCurrentDate()` | GoalsTab → WeeklyProgressCards, RetroplanPanel |

---

## Phase 5: Animations and Polish

### 5.1 CSS Animations (app.css)

```css
/* Subtle pulse for current week indicator */
@keyframes pulse-subtle {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

/* Slow bounce for mascot emoji */
@keyframes bounce-slow {
  0%, 100% { transform: translateY(0) translateX(-50%); }
  50% { transform: translateY(-4px) translateX(-50%); }
}
.animate-bounce-slow {
  animation: bounce-slow 1.5s ease-in-out infinite;
}

/* Day progress pulse for today indicator */
@keyframes day-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.animate-day-pulse {
  animation: day-pulse 1.5s ease-in-out infinite;
}
```

### 5.2 Mascot

Simple walking person emoji `🚶`:
- Universal and lightweight
- No external design dependencies
- Subtle CSS bounce animation to draw attention

---

## Testing

### Manual Tests

1. **Start dev server:** `pnpm dev`
2. **Complete onboarding** with a goal
3. **Navigate to /plan → Goals tab:**
   - [ ] WeeklyProgressCards shows green ring on current week
   - [ ] Mascot emoji `🚶` animates above current week
   - [ ] 7-day progress bar shows days elapsed in green
   - [ ] Current day pulses in lighter green
4. **Navigate to /suivi:**
   - [ ] WeeklyProgressCards appears after TimelineHero
   - [ ] 7-day bar synchronized with simulator
   - [ ] EnergyHistory highlights current week bar with green ring
   - [ ] Mascot emoji appears above current week energy bar
5. **Open "View plan" modal:**
   - [ ] Weekly capacity timeline highlights current week
   - [ ] Milestones table row for current week has green background + mascot
6. **Test date simulator:**
   - [ ] Open simulator → Advance +1 day
   - [ ] Verify 7-day bar advances one brick
   - [ ] Advance +6 more days (total +7) → Next week becomes current
   - [ ] Reset → Verify return to original day

### Unit Tests (future)

- `weekCalculator.test.ts` - Week calculation with various simulated dates
- `WeeklyProgressCards.test.ts` - Rendering with simulatedDate prop

---

## Phase 4: Proactive Suggestions (SPRINT 14)

Deferred to Sprint 14 to focus Sprint 13 on timeline consolidation.

See: `docs/bugs-dev/sprint-14-mastra-suggestions.md`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Week inconsistency between components | Centralized `weekCalculator.ts` |
| Visual regression in WeeklyProgressCards | Tested on /plan before touching /suivi |
| Simulator date not propagating | Each component tested individually |
| CSS animations too heavy | Subtle 2s animations, no GPU-intensive effects |
