# Sprint 13.11 - Fix Simulation Reset & Week Calculation Bugs

> **Date:** 2026-01-28
> **Status:** Implemented
> **Priority:** P0 (Bugs critiques post-13.10)

---

## Problèmes Résolus

### Bug 1: Les valeurs "earned" ne se réinitialisent pas au reset
- **Symptôme:** Après reset simulation, `currentAmount` garde la valeur simulée
- **Cause:** Reset API ne touche que `simulation_state`, pas `followup` data
- **Impact:** Progress affiche 20% alors qu'on est revenu à semaine 1

### Bug 2: Progress "Ahead of schedule!" persiste après reset
- **Symptôme:** "20% - Ahead of schedule!" au lieu de "0%"
- **Cause:** `currentAmount` et `savingsCredits` ne sont pas effacés
- **Impact:** Données incohérentes avec la timeline

### Bug 3: Week 1 commence au Jour 3 au lieu de Jour 1
- **Symptôme:** À l'initialisation, affiche "Day 3" au lieu de "Day 1"
- **Cause:** `goal.createdAt` utilise `CURRENT_TIMESTAMP` du serveur au moment de l'appel API
- **Impact:** Si délai entre création profil et goal, les jours sont décalés

---

## Root Causes

### Reset Flow (Avant fix)
```
SimulationControls "Reset" button
  ↓
POST /api/simulation { action: 'reset' }
  ↓
✅ simulation_state: offset_days = 0, simulated_date = today
  ↓
❌ followup.savingsCredits: PAS EFFACÉ
❌ followup.currentAmount: PAS EFFACÉ
❌ followup.savingsAdjustments: PAS EFFACÉ
```

### Goal Creation Flow (Avant fix)
```
Onboarding completion
  ↓
persistGoal() dans onboardingPersistence.ts
  ↓
POST /api/goals { profileId, name, amount, deadline }
  ↓
❌ createdAt = CURRENT_TIMESTAMP (au moment de l'appel API serveur)
   (devrait être = timestamp exact côté client)
```

---

## Solution Implémentée

### Phase 1: Détecter reset et effacer followup data

**Fichier:** `packages/frontend/src/routes/suivi.tsx` (lignes 834-871)

```typescript
createEffect(
  on(
    currentDate,
    async (simDate, prevDate) => {
      if (!prevDate) return;
      if (simDate.getTime() === prevDate.getTime()) return;

      const goal = currentGoal();
      const profile = activeProfile();
      if (!goal?.deadline || !profile) return;

      // Sprint 13.11: Detect simulation reset (going backwards in time)
      const isReset = simDate < prevDate;

      if (isReset) {
        // Clear simulation-accumulated data
        await updateFollowup({
          savingsCredits: {},
          savingsAdjustments: {},
          currentAmount: 0,
        });
        logger.info('Simulation reset detected, cleared accumulated data');
      }

      await recalculateCurrentWeek();

      // Only check auto-credit if advancing, not resetting
      if (!isReset) {
        await checkAndApplyAutoCredit();
      }
    },
    { defer: true }
  )
);
```

### Phase 2: Passer createdAt explicite à la création du goal

**Fichier:** `packages/frontend/src/lib/onboardingPersistence.ts` (ligne 129-141)

```typescript
await fetch('/api/goals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    profileId,
    name: goalData.name,
    amount: goalData.amount,
    deadline: goalData.deadline || null,
    priority: 1,
    status: 'active',
    planData: Object.keys(goalPlanData).length > 0 ? goalPlanData : undefined,
    createdAt: new Date().toISOString(), // Sprint 13.11: Explicit timestamp
  }),
});
```

### Phase 3: Accepter createdAt dans l'API goals

**Fichier:** `packages/frontend/src/routes/api/goals.ts` (lignes 315-351)

```typescript
const {
  profileId,
  name,
  amount,
  deadline,
  priority = 1,
  parentGoalId,
  conditionType = 'none',
  status = 'active',
  planData,
  components = [],
  createdAt, // Sprint 13.11: Accept explicit createdAt
} = body;

// INSERT avec createdAt explicite
await execute(`
  INSERT INTO goals (
    id, profile_id, name, amount, deadline, priority,
    parent_goal_id, condition_type, status, plan_data, created_at
  ) VALUES (
    ...
    ${createdAt ? escapeSQL(createdAt) : 'CURRENT_TIMESTAMP'}
  )
`);
```

---

## Fichiers Modifiés

| Fichier | Modification |
|---------|-------------|
| `packages/frontend/src/routes/suivi.tsx` | Détecter reset (`simDate < prevDate`) et effacer `savingsCredits`, `savingsAdjustments`, `currentAmount` |
| `packages/frontend/src/lib/onboardingPersistence.ts` | Passer `createdAt: new Date().toISOString()` explicite |
| `packages/frontend/src/routes/api/goals.ts` | Accepter `createdAt` dans POST et l'utiliser dans INSERT |

---

## Vérification

| Test | Attendu | Résultat |
|------|---------|----------|
| Avancer +30j puis Reset | currentAmount revient à 0, Week 1 Day 1 | ✅ |
| Progress après reset | "0% - Need a boost" (pas 20% - Ahead) | ✅ |
| Créer nouveau goal | Week 1 Day 1 immédiatement (pas Day 3) | ✅ |
| Toast au reset | Pas de "Savings added!" erroné | ✅ |

---

## Notes Techniques

- La détection de reset utilise une comparaison simple `simDate < prevDate` qui fonctionne car le reset remet toujours la date simulée à aujourd'hui
- Le `defer: true` dans `createEffect(on(...))` évite l'exécution au mount initial
- L'effacement de `currentAmount` à 0 est correct car les missions non-complétées n'ont pas d'earnings accumulés
