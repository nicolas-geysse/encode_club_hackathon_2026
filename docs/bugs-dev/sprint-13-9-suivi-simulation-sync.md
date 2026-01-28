# Sprint 13.9 - Synchronisation Suivi avec Simulation

> **Status:** ✅ Implemented
> **Priority:** P0 (UX critique)
> **Root cause:** Les données financières ne se mettent pas à jour quand le temps simulé avance

---

## 🔍 Problème Signalé

Sur l'onglet `/suivi`, quand on avance dans le temps (simulation):
1. **100€/1000€** - Le montant gagné ne change jamais
2. **4 panels** (100€ earned, jours restants, etc.) - Ne se mettent pas à jour
3. **36% behind schedule + Catch-up** - Correct! C'est un indicateur (pas un bouton interactif actuellement)
4. **La barre de progression** - Le marqueur de temps avance (✅ fonctionne)

---

## 🧠 Analyse Root Cause

### Flux de données actuel

```
SimulationControls clique +7j
  ↓
eventBus.emit('SIMULATION_UPDATED')
  ↓
SimulationContext.refreshSimulation() → currentDate() mis à jour
  ↓
ProfileContext.refreshAll() → recharge goals, skills, etc. depuis DuckDB
  ↓
❌ suivi.tsx NE REÇOIT PAS de notification directe
  ↓
❌ loadData() NE SE RELANCE PAS
  ↓
❌ followup.currentWeek reste à la valeur de l'ancien chargement
❌ followup.currentAmount ne change jamais (dépend des missions complétées)
❌ checkAndApplyAutoCredit() ne se relance pas
```

### Pourquoi certains éléments fonctionnent ?

| Élément | Fonctionne? | Raison |
|---------|-------------|--------|
| TimelineHero progress bar (time marker) | ✅ | Utilise `currentSimulatedDate` directement passé en prop |
| TimelineHero `daysRemaining` | ✅ | Calculé directement depuis `currentSimulatedDate` |
| WeeklyProgressCards weeks | ✅ | createEffect refetch retroplan avec `simulatedDate` |
| TimelineHero `Week X/Y` | ❌ | Utilise `followup().currentWeek` qui n'est jamais mis à jour |
| TimelineHero `100€/1000€` | ❌ | Utilise `followup().currentAmount` |
| 4 metric panels | ❌ | Utilisent `followup()` values |
| Behind schedule % | ✅ | Calcul: `timeProgress() - amountProgress()` - augmente car time avance mais amount non |
| Auto-credit savings | ❌ | `checkAndApplyAutoCredit()` ne tourne qu'au mount |

### Code problématique

**suivi.tsx** - `followup.currentWeek` n'est calculé que dans `loadData()`:

```typescript
// suivi.tsx:390-405 - Seulement dans loadData(), jamais réactif
const weekInfo = getCurrentWeekInfo(
  goal.createdAt || currentDate().toISOString(),
  totalWeeks,
  currentDate()  // currentDate vient du context mais n'est pas tracké comme dépendance
);
const calculatedCurrentWeek = weekInfo.weekNumber;
// ...
setFollowup({ ...existingFollowup, currentWeek: calculatedCurrentWeek });
```

**suivi.tsx** - `checkAndApplyAutoCredit()` n'est appelé qu'une fois:

```typescript
// suivi.tsx:580-588 - Seulement au mount, pas sur simulation change
onMount(async () => {
  await loadData();
  setTimeout(() => {
    checkAndApplyAutoCredit();  // ❌ Jamais rappelé quand simulation change
  }, 100);
});
```

---

## 📋 Plan d'Implémentation

### Phase 1: Ajouter listener SIMULATION_UPDATED dans suivi.tsx (10 min)

Dans le `onMount`, ajouter un listener pour `SIMULATION_UPDATED`:

```typescript
// suivi.tsx - Dans onMount, ajouter:
const unsubSimulation = eventBus.on('SIMULATION_UPDATED', async () => {
  logger.info('SIMULATION_UPDATED received, recalculating week and checking auto-credit...');

  // 1. Recalculer currentWeek
  await recalculateCurrentWeek();

  // 2. Vérifier auto-credit (si le jour d'income est passé)
  await checkAndApplyAutoCredit();
});

// Dans onCleanup, ajouter:
unsubSimulation();
```

### Phase 2: Créer fonction recalculateCurrentWeek() (15 min)

```typescript
const recalculateCurrentWeek = async () => {
  const goal = currentGoal();
  if (!goal?.deadline) return;

  const simDate = currentDate();
  const startDate = goal.createdAt || simDate.toISOString();
  const totalWeeks = Math.ceil(
    (new Date(goal.deadline).getTime() - new Date(startDate).getTime()) /
    (7 * 24 * 60 * 60 * 1000)
  );

  const weekInfo = getCurrentWeekInfo(startDate, totalWeeks, simDate);

  // Mettre à jour followup avec la nouvelle semaine
  setFollowup(prev => ({
    ...prev,
    currentWeek: weekInfo.weekNumber,
    totalWeeks: totalWeeks
  }));

  logger.info('Week recalculated', {
    week: weekInfo.weekNumber,
    totalWeeks,
    simulatedDate: simDate.toISOString()
  });
};
```

### Phase 3: Améliorer checkAndApplyAutoCredit() pour simulation (10 min)

Le problème actuel: auto-credit ne vérifie que le mois courant. Mais si on simule +60 jours, on peut traverser plusieurs mois.

```typescript
const checkAndApplyAutoCredit = async () => {
  const profile = activeProfile();
  if (!profile) return;

  const margin = monthlyMargin();
  if (!margin || margin <= 0) return;

  const incomeDay = profile.incomeDay ?? 15;
  const savingsCredits = followup().savingsCredits || {};
  const simDate = currentDate();

  // Sprint 13.9 Fix: Vérifier tous les mois entre la création du goal et la date simulée
  const goal = currentGoal();
  if (!goal) return;

  const startDate = new Date(goal.createdAt || new Date().toISOString());
  let creditedAny = false;
  let totalCredited = 0;
  const updatedCredits = { ...savingsCredits };

  // Parcourir chaque mois depuis le début jusqu'à la date simulée
  const currentMonth = new Date(startDate);
  while (currentMonth <= simDate) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

    // Si ce mois n'a pas encore été crédité et le jour d'income est passé
    const incomeDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), incomeDay);
    const hasPassedIncomeDay = simDate >= incomeDate;

    if (hasPassedIncomeDay && !updatedCredits[monthKey]) {
      updatedCredits[monthKey] = margin;
      totalCredited += margin;
      creditedAny = true;
    }

    // Passer au mois suivant
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  if (creditedAny) {
    await updateFollowup({
      savingsCredits: updatedCredits,
      currentAmount: followup().currentAmount + totalCredited,
    });

    toastPopup.success(
      'Savings added!',
      `+${formatCurrency(totalCredited, currency())} automatically credited`
    );
  }
};
```

### Phase 4: Persister le nouveau followup.currentWeek (5 min)

S'assurer que `recalculateCurrentWeek()` persiste aussi en DuckDB via `updateFollowup()`:

```typescript
// Dans recalculateCurrentWeek, après setFollowup:
await updateFollowup({ currentWeek: weekInfo.weekNumber, totalWeeks });
```

### Phase 5: Rendre le bouton Catch-up interactif (optionnel, 15 min)

Le bouton "Catch-up" est actuellement juste un indicateur. On pourrait:
- Le rendre cliquable pour ouvrir un modal avec un plan de rattrapage
- Ou afficher des tips pour rattraper le retard

```typescript
// TimelineHero.tsx - Ajouter prop onCatchupClick
<Button
  size="sm"
  class="bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs"
  onClick={() => props.onCatchupClick?.()}
>
  Catch-up plan
</Button>
```

---

## 📝 Fichiers à Modifier

| Fichier | Modification |
|---------|--------------|
| `frontend/src/routes/suivi.tsx` | Ajouter listener SIMULATION_UPDATED, créer recalculateCurrentWeek() |
| `frontend/src/routes/suivi.tsx` | Améliorer checkAndApplyAutoCredit() pour plusieurs mois |
| `frontend/src/components/suivi/TimelineHero.tsx` | (optionnel) Rendre Catch-up cliquable |

---

## 🔄 Nouveau Flux de Données

```
SimulationControls clique +30j
  ↓
eventBus.emit('SIMULATION_UPDATED')
  ↓
SimulationContext.refreshSimulation() → currentDate() mis à jour
  ↓
suivi.tsx reçoit 'SIMULATION_UPDATED'
  ↓
recalculateCurrentWeek()
  ↓
✅ followup.currentWeek passe de Week 1 à Week 5
  ↓
checkAndApplyAutoCredit()
  ↓
✅ Si le 15 du mois est passé, savings crédités
  ↓
✅ followup.currentAmount augmente (+monthlyMargin)
  ↓
✅ TimelineHero 100€/1000€ se met à jour
  ↓
✅ 4 metric panels se mettent à jour
  ↓
✅ % behind schedule recalculé
```

---

## 🧪 Tests de Vérification

| Scénario | Attendu |
|----------|---------|
| Créer goal, avancer +7j | Week 1 → Week 2, currentAmount inchangé (pas d'income day) |
| Avancer +15j (passe le jour d'income) | Savings auto-crédités, currentAmount augmente |
| Avancer +60j | Plusieurs mois de savings crédités d'un coup |
| Reset simulation | Revient à Week 1, mais savings déjà crédités restent |
| Compléter une mission | currentAmount augmente normalement |

---

## 💡 Note sur "36% behind schedule"

C'est **correct** que ce pourcentage augmente quand on avance le temps sans gagner d'argent:
- `timeProgress = currentWeek / totalWeeks = 40%`
- `amountProgress = currentAmount / goalAmount = 4%`
- `behind = 40% - 4% = 36%`

La feature "behind schedule" indique qu'il faut:
1. Compléter des missions (travail freelance)
2. Vendre des items de l'inventaire
3. Ou attendre les savings automatiques

Le bouton "Catch-up" pourrait afficher des suggestions concrètes pour rattraper.

---

## ⚡ Estimation

- Phase 1 (SIMULATION_UPDATED listener): 10 min
- Phase 2 (recalculateCurrentWeek): 15 min
- Phase 3 (checkAndApplyAutoCredit multi-mois): 10 min
- Phase 4 (persistence): 5 min
- Phase 5 (Catch-up button): 15 min (optionnel)
- **Total: ~40-55 min**
