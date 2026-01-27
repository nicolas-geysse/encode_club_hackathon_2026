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

---

## Remaining Features - Consolidated

### 1. RAG Context dans Tips [PARTIAL 50%]
**Effort**: 2h | **Impact**: High (tips personnalisés)

#### Contexte
- **Backend prêt** : `rag.ts`, `rag-tools.ts` avec `findSimilarProfiles()`
- **Embed API prête** : `/api/embed` avec `indexStudentProfile()`, `indexGoal()`
- **Manque** :
  1. Appeler `/api/embed` quand profile/goal sauvegardé
  2. Utiliser RAG dans `tips-orchestrator.ts`

#### Cas d'usage
**Avant** (tips génériques):
> "Pense à mettre de l'argent de côté chaque semaine"

**Après** (tips contextuels avec social proof):
> "3 étudiants en informatique comme toi ont économisé en moyenne 180€/mois en faisant du freelance React. Tu as cette compétence - veux-tu qu'on explore ?"

#### Intérêt Hackathon
- **Sponsor Comet/Opik** : Démontre utilisation avancée de la plateforme (embedding + retrieval tracés)
- **Personnalisation** : Tips basés sur profils similaires = confiance utilisateur
- **Différenciateur** : Aucune app budget étudiant ne fait du RAG

#### Implémentation
```typescript
// profileService.ts - après save réussi
await fetch('/api/embed', {
  method: 'POST',
  body: JSON.stringify({ type: 'profile', id: profile.id, data: profile })
});

// tips-orchestrator.ts
const similarProfiles = await ragService.findSimilar(currentProfile, 5);
const avgSavings = similarProfiles.reduce((s, p) => s + p.monthlySavings, 0) / similarProfiles.length;
const context = `${similarProfiles.length} étudiants similaires économisent ${avgSavings}€/mois en moyenne.`;
```

---

### 2. Retroplanning Unit Tests
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

### 3. Goal Components Visual List [PARTIAL 50%]
**Effort**: 2h | **Impact**: Medium

#### Contexte
- **CRUD complet** : `/api/goal-components` existe avec create/read/update/delete
- **Types définis** : `exam_prep`, `time_allocation`, `purchase`, `milestone`
- **Manque** : Affichage visuel dans GoalsTab (actuellement seulement dans le form)

#### Cas d'usage
**Scénario** : Goal "Acheter MacBook 1500€" avec components :
- Exam prep : "Réviser AWS cert" (20h)
- Purchase : "Clavier mécanique" (80€)
- Milestone : "Avoir 750€" (50%)
- Time allocation : "4h freelance/semaine"

**Affichage** :
```
[x] Réviser AWS cert (20h) - Completed
[>] 4h freelance/semaine - In Progress
[ ] Clavier mécanique (80€) - Pending (blocked by: Avoir 750€)
[ ] Avoir 750€ - Pending
```

#### Intérêt
- **Visualisation claire** des sous-étapes
- **Motivation** : Cocher les petites victoires
- **Dépendances** : Voir ce qui bloque quoi

---

## Priority Matrix (Remaining Work)

| Feature | Status | Effort | Impact Demo | Impact User | Priority |
|---------|--------|--------|-------------|-------------|----------|
| RAG in Tips | 50% done | 2h | High | Very High | 1 |
| Goal Components UI | 50% done | 2h | Low | Medium | 2 |
| Retroplan Tests | Not started | 3-4h | None | Medium | 3 |

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
