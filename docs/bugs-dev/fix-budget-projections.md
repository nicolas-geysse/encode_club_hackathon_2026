# Fix: Budget & Projection Integration with Trades

**Date:** 2026-02-01
**Status:** Analysis Complete - Peer Reviewed ✅
**Priority:** High - Core financial tracking is incomplete
**Recommended Solution:** Option 2 (Calcul Dynamique)

---

## Executive Summary

Les montants des trades (ventes complétées, emprunts actifs) ne sont **pas intégrés** dans le calcul du progress vers l'objectif. L'application a deux systèmes de tracking parallèles qui ne communiquent pas :

1. **Budget API** (`/api/budget`) - Calcule correctement les one-time gains (trades)
2. **FollowupData** (`currentAmount`) - Tracking manuel qui ignore les trades

Résultat : Un utilisateur qui vend un iPhone à 100€ voit l'argent dans l'onglet Trade mais PAS dans son progress vers l'objectif vacation.

---

## Symptomes Observés

### 1. Trade Tab → Suivi Page (Timeline Hero)
| Action | Attendu | Actuel |
|--------|---------|--------|
| Borrow item (50€) | Progress +50€ | Progress inchangé |
| Sell item (100€) | Progress +100€ | Progress inchangé |

### 2. Trade Tab → Goals Tab
| Métrique | Attendu | Actuel |
|----------|---------|--------|
| Progress % | Inclut trades | Exclut trades |
| Earnings vs Goal chart | Base inclut trades | Base exclut trades |

### 3. Chat → Progress/Projection Charts
| Chart | Attendu | Actuel |
|-------|---------|--------|
| Budget breakdown (Savings) | Monthly + trades | Monthly only |
| Progress chart | currentSaved + trades | currentSaved only |
| Projection chart | Inclut one-time gains | Partiellement (dépend du contexte) |

### 4. Simulation Temporelle
| Scénario | Attendu | Actuel |
|----------|---------|--------|
| +37 jours, sold 100€ | Savings = base + 100 + (37/7)*weekly | Savings = base + (37/7)*weekly |

---

## Architecture Actuelle (Problème Root Cause)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BUDGET API (/api/budget)                     │
│  ✅ Calcule correctement:                                            │
│  - oneTimeGains.tradeSales (completed sells)                         │
│  - oneTimeGains.tradeBorrow (active/completed borrows)               │
│  - goalProjection.totalProjected (monthly + oneTimeGains)            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ (jamais utilisé pour currentAmount)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FOLLOWUP DATA (profile.followupData)              │
│  ❌ currentAmount ne contient QUE:                                   │
│  - Mission earnings (earningsCollected)                              │
│  - Manual adjustments (SavingsAdjustModal)                           │
│  - JAMAIS: tradeSales, tradeBorrow, pausedSavings                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONSOMMATEURS DE currentAmount                    │
│  - TimelineHero.tsx → amountProgress = currentAmount / goalAmount    │
│  - GoalsTab.tsx → goal.progress (calculé depuis currentAmount)       │
│  - suivi.tsx → progressPercent = currentAmount / goalAmount          │
│  - chat.ts → buildProgressChart(projectedSaved, ...)                 │
│  - budgetEngine.ts → currentProjected = currentSaved + margin*months │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Fichiers Impliqués

### Sources de Données

| Fichier | Rôle | Ligne Clé |
|---------|------|-----------|
| `routes/api/budget.ts` | Calcul budget consolidé | L284-328: oneTimeGains, goalProjection |
| `routes/api/trades.ts` | CRUD trades | L31-46: schema trades table |
| `lib/tradeService.ts` | Helpers trades | L228-251: getSoldValue, getBorrowedValue |

### Stockage & State

| Fichier | Rôle | Problème |
|---------|------|----------|
| `routes/suivi.tsx` | Gestion followupData | L540: `currentAmount: existingFollowup?.currentAmount ?? 0` - jamais incrémenté par trades |
| `lib/profileContext.tsx` | Context global | Stocke followupData sans intégrer trades |

### Affichage Progress

| Fichier | Composant | Problème |
|---------|-----------|----------|
| `components/suivi/TimelineHero.tsx` | Hero avec progress bar | L38: `amountProgress = currentAmount / goalAmount` - exclut trades |
| `components/tabs/GoalsTab.tsx` | Goals list | L1097: `goal().progress` vient de DB, calculé sans trades |
| `components/EarningsChart.tsx` | Chart cumulative | L68-69: `currentSaved` depuis followupData |

### Projections & Charts

| Fichier | Fonction | Problème |
|---------|----------|----------|
| `lib/budgetEngine.ts` | calculateProjection | L113: `currentProjected = currentSaved + margin * months` - pas de one-time gains |
| `lib/chatChartBuilder.ts` | buildProgressChart | L175: accumule weekly seulement |
| `routes/api/chat.ts` | show_progress_chart | L1857: passe projectedSaved sans trades |

---

## Détail des Calculs Actuels

### Budget API (Correct)
```typescript
// routes/api/budget.ts:312-317
const fromMonthlyMargin = monthlyMargin * monthsUntilDeadline;
const fromOneTimeGains = oneTimeGains.total; // trades + pausedSavings
const totalProjected = fromMonthlyMargin + fromOneTimeGains;
const progressPercent = (totalProjected / goalAmount) * 100;
```

### Suivi Page (Incorrect)
```typescript
// routes/suivi.tsx:540
const newFollowupData = {
  currentAmount: existingFollowup?.currentAmount ?? 0, // ❌ Jamais += trades
  ...
};

// routes/suivi.tsx:657-659
const progressPercent = Math.round((updated.currentAmount / goalAmount) * 100);
await goalService.updateGoalProgress(goal.id, progressPercent); // ❌ Exclut trades
```

### Budget Engine (Incorrect)
```typescript
// lib/budgetEngine.ts:113
const currentProjected = data.currentSaved + currentMargin * monthsRemaining;
// ❌ Manque: + data.oneTimeGains
```

### Chat Progress Chart (Incorrect)
```typescript
// routes/api/chat.ts:1857-1865
const progressChartResource = buildProgressChart(
  projectedSaved, // ❌ N'inclut pas trades
  goalAmount,
  weeksRemaining,
  weeklySavings,
  currSymbol,
  { isSimulating, offsetDays, simulatedDate }
);
```

---

## Scénarios de Test Détaillés

### Scénario A: Borrow (Emprunt)
```
Initial:
  - Goal: Vacation 1000€
  - currentAmount: 0€
  - Monthly margin: 300€

Action: Borrow laptop from friend (value: 50€, status: active)

Expected After:
  - trades.borrow: 50€ (actif)
  - currentAmount: 0€ + 50€ = 50€ ❌ (actuellement: 0€)
  - Progress: 5% ❌ (actuellement: 0%)
  - Suivi → earned panel: "Borrowed: 50€" ❌ (actuellement: rien)
  - Goals → progress bar: 5% ❌ (actuellement: 0%)
```

### Scénario B: Sell (Vente)
```
Initial:
  - Goal: Vacation 1000€
  - currentAmount: 200€ (from missions)
  - Monthly margin: 300€

Action: Sell iPhone (value: 100€, status: completed)

Expected After:
  - trades.sell: 100€ (completed)
  - currentAmount: 200€ + 100€ = 300€ ❌ (actuellement: 200€)
  - Progress: 30% ❌ (actuellement: 20%)
  - Suivi → TimelineHero: 300€ / 1000€ ❌ (actuellement: 200€)
  - Goals → Earnings chart base: 300€ ❌ (actuellement: 200€)
  - Chat → Budget savings: +100€ ✅ (fonctionne car utilise budgetContext)
```

### Scénario C: Simulation Temporelle
```
Initial:
  - currentAmount: 0€
  - Weekly margin: 75€ (300€/4.33)
  - Sold iPhone: 100€

Action: Simulate +37 days

Expected Calculation:
  - Weeks elapsed: 37/7 = 5.29
  - From margin: 5.29 * 75€ = 396€
  - From trades: 100€
  - projectedSaved: 0 + 396 + 100 = 496€ ❌

Actual Calculation:
  - projectedSaved: 0 + 396 = 396€ (trades ignorés dans projection)
```

### Scénario D: Pause Expense
```
Initial:
  - Expense: Netflix 15€/month (active)

Action: Pause Netflix for 2 months

Expected:
  - pausedSavings: 30€
  - Counted in progress ❌ (actuellement: non)
```

---

## Solution Proposée

### Option 1: Intégration dans currentAmount (Non Recommandé)
Quand suivi.tsx charge les données, ajouter les trades au currentAmount.

```typescript
// routes/suivi.tsx - Dans loadData()
const budgetResponse = await fetch(`/api/budget?profileId=${profile.id}`);
const budgetData = await budgetResponse.json();

const tradeGains =
  (budgetData.budget?.oneTimeGains?.tradeSales || 0) +
  (budgetData.budget?.oneTimeGains?.tradeBorrow || 0);

const newFollowupData = {
  currentAmount: (existingFollowup?.currentAmount ?? 0) + tradeGains,
  // ...
};
```

**Problème**: Double comptage si l'utilisateur recharge la page après avoir ajouté des trades.

### Option 2: Calcul Dynamique (Recommandé ✅)
Ne pas stocker les trades dans currentAmount, mais les ajouter dynamiquement à l'affichage.

**Pourquoi cette option?** Séparer la **source de stockage** (Missions vs Trades) de la **couche présentation** (Total Progress) est le bon pattern:
- **Storage**: `followupData.currentAmount` = "Earnings from Missions"
- **Storage**: `trades` table = "Savings from Trades"
- **View**: Progress = Earnings + Savings (composable data streams)

Option 1 nécessiterait une logique de synchronisation complexe à chaque mise à jour de trade ou complétion de mission. La ligne `updateFollowup({ currentAmount: totalEarnings })` dans suivi.tsx (~L923) écraserait agressivement toute donnée "mergée".

```typescript
// Nouveau helper: lib/progressCalculator.ts
export function calculateTotalProgress(
  currentAmount: number, // Mission earnings + manual adjustments
  budgetContext: BudgetContext
): number {
  const oneTimeGains =
    (budgetContext.tradeSalesCompleted || 0) +
    (budgetContext.tradeBorrowSavings || 0) +
    (budgetContext.pausedSavings || 0);

  return currentAmount + oneTimeGains;
}
```

Puis utiliser partout:
- TimelineHero: `amountProgress = calculateTotalProgress(...) / goalAmount`
- GoalsTab: `progressPercent = calculateTotalProgress(...) / goalAmount`
- Chat charts: Passer oneTimeGains séparément

### Option 3: Source Unique de Vérité (Idéal Long Terme)
Supprimer `followupData.currentAmount` et tout calculer depuis:
- Budget API pour les totaux
- Mission table pour les earnings
- Trades table pour les ventes/emprunts

---

## Plan d'Implémentation

### Phase 1: Fix Critique (Suivi + Goals)
1. **suivi.tsx**: Charger budgetContext et ajouter trades au calcul du progress
2. **TimelineHero**: Accepter `oneTimeGains` prop et l'inclure dans amountProgress
3. **GoalsTab**: Recalculer progress avec trades avant affichage

### Phase 2: Fix Charts (Chat)
4. **chat.ts**: Dans show_progress_chart, inclure trades dans projectedSaved
5. **chatChartBuilder.ts**: Modifier buildProgressChart pour accepter oneTimeGains
6. **budgetEngine.ts**: Ajouter oneTimeGains au calcul de projection

### Phase 3: UI Clarity
7. **TimelineHero**: Afficher breakdown (Earned: X, Sold: Y, Borrowed: Z)
8. **Suivi right panel**: Section "One-Time Gains" avec détail

### Phase 4: Consolidation
9. Migrer vers Option 3 (source unique)
10. Supprimer les champs legacy de budget API

---

## Fichiers à Modifier

| Fichier | Changement | Priorité |
|---------|------------|----------|
| `routes/suivi.tsx` | Charger budget, calculer progress avec trades | P1 |
| `components/suivi/TimelineHero.tsx` | Accepter oneTimeGains, afficher breakdown | P1 |
| `routes/api/chat.ts` | Inclure trades dans projectedSaved pour charts | P2 |
| `lib/budgetEngine.ts` | Ajouter oneTimeGains au FinancialData interface | P2 |
| `lib/chatChartBuilder.ts` | Paramètre oneTimeGains pour buildProgressChart | P2 |
| `components/tabs/GoalsTab.tsx` | Recalculer progress avec budget context | P3 |
| `components/EarningsChart.tsx` | currentSaved inclut trades | P3 |

---

## Questions Résolues

1. **Borrow completed vs active**: Un emprunt "completed" (rendu) devrait-il encore compter comme gains?
   - ✅ **Réponse: OUI, garder les deux.** Un emprunt "completed" (item rendu) représente toujours de l'argent qu'on n'a *pas dépensé* pendant cette période. C'est un historique d'économies valide.

2. **Pause vs Cancel**: Une dépense "pausée" génère des pausedSavings. Quid d'une dépense "cancelled"?
   - ✅ **Réponse:** Une souscription annulée devrait être **retirée des Expenses** entièrement (augmentant la marge mensuelle) plutôt que compter comme "one-time gain". "Paused" est correctement un accumulateur de gains ponctuels.

3. **Double entry**: Si on ajoute les trades au currentAmount persisté, comment éviter le double comptage au reload?
   - ✅ **Réponse:** Calculer dynamiquement, ne pas persister. C'est pourquoi Option 2 est recommandée.

4. **Simulation + Trades**: Les trades passés pendant la simulation devraient-ils compter?
   - ✅ **Réponse:** Les `oneTimeGains` sont historiques/réalisés. Ils doivent rester **constants** pendant la simulation temporelle (sauf si on simule des trades *futurs*, ce qui est hors scope).

---

## Métriques de Succès

| Test | Critère |
|------|---------|
| Sell 100€ → Suivi progress | +100€ visible dans TimelineHero |
| Borrow 50€ → Goals progress | +5% si goal = 1000€ |
| Chat "show progress" | Savings inclut trades |
| Simulation +30j + sell 100€ | projectedSaved = base + simulation + 100€ |
| Pause expense 15€ x 2 mois | +30€ dans progress |

---

## Notes d'Implémentation

### 1. Unified `ProgressCalculator`
Le helper proposé `lib/progressCalculator.ts` doit accepter une interface générique pour être utilisable à la fois par le frontend (Suivi, Graphs) et le backend (Chat API) afin de garantir des chiffres identiques partout.

```typescript
// lib/progressCalculator.ts
export interface OneTimeGains {
  tradeSales: number;
  tradeBorrow: number;
  pausedSavings: number;
}

export function calculateTotalProgress(
  currentAmount: number,
  oneTimeGains: OneTimeGains
): number {
  return currentAmount + oneTimeGains.tradeSales + oneTimeGains.tradeBorrow + oneTimeGains.pausedSavings;
}
```

### 2. Fetch Budget dans suivi.tsx
Ajouter un fetch parallèle dans `loadData()` pour récupérer les données budget. Option A: endpoint léger dédié. Option B: fetch `/api/budget` en parallèle (acceptable).

```typescript
// Dans loadData() de suivi.tsx
const [profileData, budgetData] = await Promise.all([
  // existing profile fetch
  fetch(`/api/budget?profileId=${profile.id}`).then(r => r.json())
]);

const oneTimeGains = budgetData.budget?.oneTimeGains || { tradeSales: 0, tradeBorrow: 0, pausedSavings: 0 };
```

---

## Peer Review

**Reviewer:** Antigravity (Senior Agent)
**Date:** 2026-02-01
**Verdict:** ✅ APPROVED

> Le plan proposé est **techniquement solide** et adresse efficacement la cause racine de la divergence des données. Option 2 (Calcul Dynamique) est fortement recommandée.

### Validation du Diagnostic
- `routes/api/budget.ts`: Calcule correctement `oneTimeGains` (trades + paused savings) ✅
- `routes/suivi.tsx`: Isole bien `currentAmount` aux earnings de missions uniquement ✅
- Ligne ~923 `updateFollowup({ currentAmount: totalEarnings })` écraserait agressivement toute donnée "mergée" → Option 1 serait bug-prone ✅

### Feu Vert
Procéder avec les phases d'implémentation comme décrites:
1. Créer `lib/progressCalculator.ts`
2. Mettre à jour `suivi.tsx` pour fetch budget et utiliser le calculator
3. Mettre à jour les composants UI pour afficher le breakdown

---

## Références

- Budget API: `packages/frontend/src/routes/api/budget.ts:280-385`
- Trade Service: `packages/frontend/src/lib/tradeService.ts:228-262`
- Suivi Data Loading: `packages/frontend/src/routes/suivi.tsx:530-558`
- Budget Engine: `packages/frontend/src/lib/budgetEngine.ts:102-175`
- Timeline Hero: `packages/frontend/src/components/suivi/TimelineHero.tsx:17-50`
