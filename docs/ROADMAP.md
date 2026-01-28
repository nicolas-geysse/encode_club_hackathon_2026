# Stride Strategic Roadmap

> **Encode Club Hackathon 2026** - Financial Health Track (Sponsor: Comet/Opik)
> **Codebase Grade**: A- (Excellent foundation, UI gaps identified)
> **Last Updated**: January 2026

---

## Executive Summary

Stride is a student financial health navigator that combines LLM-powered agents with Opik observability. The codebase is production-ready with comprehensive test coverage on core algorithms. The primary gaps are UI integrations for existing backend capabilities.

### Key Differentiators

| Feature | Status | Description |
|---------|--------|-------------|
| **Skill Arbitrage** | Production | Smart job matching: rate (30%) + demand (25%) + effort (25%) + rest (20%) |
| **Energy Debt** | Production | 3+ weeks below 40% triggers target reduction + achievement |
| **Comeback Mode** | Production | Detects recovery (>80% after <40%) and creates catch-up plans |
| **Retroplanning** | Production | Capacity-aware planning with exam protection |
| **Opik Tracing** | Full Coverage | Every recommendation traceable with user_id |

---

## Completed (Tier 1)

| Feature | Status | Files |
|---------|--------|-------|
| Retroplan UI Panel | Done | `RetroplanPanel.tsx`, `GoalsTab.tsx` |
| Voice Input | Done | `ChatInput.tsx` (built-in) |
| Swipe Feedback Toast | Done | `SwipeTab.tsx` |
| Capacity Forecast Card | Done | `CapacityForecast.tsx`, `suivi.tsx` |
| Capacity in Goal Cards | Done | `GoalTimeline.tsx` |
| Simulation Data Reload | Done | `app.tsx` (eventBus.emit) |
| Predictive Energy Alerts | Done | `PredictiveAlerts.tsx` (suivi) |
| What-If Scenario Simulator | Done | `WhatIfSimulator.tsx` |
| Jobs/Prospection Tab | Done | `ProspectionTab.tsx` + 10 sub-components |
| Chat Persistence | Done | `chat-history.ts` API + DuckDB `chat_messages` table |
| Achievement Celebrations | Done | `achievements.ts` + `confetti.ts` + triggers in suivi/swipe/skills |
| RAG in Tips | Done | `profileService.ts` → `/api/embed` + `tips-orchestrator.ts` with `indexAdvice()` |
| Goal Components UI | Done | `GoalComponentsList.tsx` rendered in `GoalsTab.tsx` active goal section |

---

## Remaining Features - Consolidated

### 1. Retroplanning Unit Tests
**Effort**: 3-4h | **Impact**: Qualité (pas visible en demo)

#### Contexte
- **Code non testé** : `retroplan.ts` (500+ lignes), seul algorithme sans tests
- **Fonctions critiques** :
  - `calculateWeekCapacity()` - calcul heures effectives
  - `generateDynamicMilestones()` - création targets ajustés
  - `assessFeasibility()` - score de faisabilité

#### Cas de test prioritaires
```typescript
describe('calculateWeekCapacity', () => {
  it('should return protected when exam period overlaps', () => {
    const events = [{ type: 'exam_period', capacityImpact: 0.2 }];
    const capacity = calculateWeekCapacity(weekStart, userId, events);
    expect(capacity.capacityCategory).toBe('protected');
  });

  it('should reduce hours when energy is low', () => {
    const energyLogs = [{ energyLevel: 2 }, { energyLevel: 2 }];
    const capacity = calculateWeekCapacity(weekStart, userId, [], energyLogs);
    expect(capacity.effectiveHours).toBeLessThan(baseHours);
  });
});
```

#### Intérêt
- **Sécurité refactoring** : Pouvoir modifier sans casser
- **Confidence** : Algo financier = doit être fiable
- **Non prioritaire hackathon** : Invisible en demo

---

## Priority Matrix (Remaining Work)

| Feature | Status | Effort | Impact Demo | Impact User | Priority |
|---------|--------|--------|-------------|-------------|----------|
| Retroplan Tests | Not started | 3-4h | None | Medium | 1 |

---

## Not Doing (Confirmed)

| Item | Reason |
|------|--------|
| TabPFN/ML burnout | Energy Debt covers use case |
| Python backend | Too risky for timeline |
| User authentication | Profile Selector sufficient |
| E2E Playwright tests | Algorithm tests enough |
| New pages | 3-screen flow complete |

---

## Verification Checklist

### Manual Testing (Current)
```bash
pnpm dev

# 1. Retroplan UI
/plan -> Goals tab -> Goal card -> "View plan" button
# Expected: Modal with capacity bars, feasibility, milestones

# 2. Capacity Forecast
/suivi -> Card "HIGH/MEDIUM/LOW CAPACITY"
# Expected: Shows week number, hours available, "View plan" button

# 3. Swipe Feedback
/plan -> Swipe tab -> Complete session -> Validate
# Expected: Toast "Preferences saved! X scenarios added"

# 4. Simulation Reload
Header -> Simulation -> +1 week
# Expected: Page data reloads (not just notifications)
```

### Opik Dashboard
`https://www.comet.com/nickoolas/stride`
- Retroplan generation traces
- Swipe session with learned preferences
- user_id on all spans

---

## Architecture Reference

```
packages/
├── frontend/          # SolidStart + SolidJS
│   └── src/
│       ├── routes/api/   # embed.ts, rag.ts, retroplan.ts
│       ├── components/
│       │   ├── RetroplanPanel.tsx    # NEW
│       │   ├── suivi/CapacityForecast.tsx  # NEW
│       │   └── GoalTimeline.tsx      # Capacity indicator
│       └── lib/
│           ├── achievements.ts  # 13 achievements, check logic
│           └── confetti.ts      # 4 celebration effects
│
└── mcp-server/
    └── src/
        ├── tools/rag.ts         # findSimilarProfiles()
        └── services/            # indexStudentProfile(), indexGoal()
```

---

## Contact

- **Project**: Stride - Student Financial Health Navigator
- **Hackathon**: Encode Club 2026 - Financial Health Track
- **Sponsor Integration**: Comet/Opik tracing on all recommendations
