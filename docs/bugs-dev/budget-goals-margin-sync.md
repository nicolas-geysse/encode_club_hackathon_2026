# Analyse: Synchronisation Budget → Goals (monthlyMargin)

**Date**: 2026-02-03
**Statut**: RÉSOLU (3 fixes appliqués) + CONSOLIDATION RECOMMANDÉE
**Priorité**: Haute (impacte la cohérence UX entre onglets)

---

## Contexte

Ce bug fait partie d'un problème plus large de synchronisation réactive entre les onglets de `/plan`. Il a été résolu en trois étapes distinctes.

**Symptôme initial**: Quand l'utilisateur modifie ses revenus/dépenses dans Budget tab puis va dans Goals tab, les weekly targets et le montant par semaine ne se mettaient pas à jour.

---

## PROBLÈME 1: Réactivité SolidJS (keyed attribute)

### Cause Racine

Dans **GoalsTab.tsx**, les composants `WeeklyProgressCards` et `EarningsChart` étaient enveloppés dans des `<Show when={goal().id} keyed>`:

```tsx
<Show when={goal().id} keyed>
  {(goalId) => (
    <WeeklyProgressCards
      retroplan={weeklyCardsRetroplan()}  // ❌ Ne se met pas à jour!
    />
  )}
</Show>
```

En SolidJS, l'attribut `keyed` sur `<Show>` fait que le contenu ne se re-évalue QUE quand la valeur de `when` change, pas quand les autres signals changent.

### Solution

Retirer `keyed` des composants Show:

```tsx
<Show when={goal().id}>
  <WeeklyProgressCards
    goal={goals().find((g) => g.id === goal().id)!}
    retroplan={weeklyCardsRetroplan()}
  />
</Show>
```

---

## PROBLÈME 2: Ajustements Manuels vs Projections

### Symptôme

Même après le fix 1, les targets ne changeaient pas quand le margin changeait.

### Diagnostic

Les logs montraient:
```
monthlyMargin: 50
baseSavingsAmounts: [50, 50]     → 100€ basé sur margin actuel
adjustmentsKeys: ['4', '9']      → 2 semaines avec ajustements manuels
actualTotalSavings: 400          → Utilisait les ajustements (200€ × 2)
```

L'utilisateur avait manuellement ajusté les épargnes. Ces ajustements étaient utilisés pour calculer les targets de travail, même si le margin avait changé.

### Cause Racine

```typescript
// Avant: utilisait actualTotalSavings (avec ajustements manuels)
const actualTotalSavings = adjustedSavingsWeeks.reduce(
  (sum, s) => sum + getEffectiveSavingsAmount(s), // ← inclut les ajustements!
  0
);
// effectiveGoalForWork = 1000 - 400 = 600€ (toujours pareil)
```

### Solution

Utiliser les **projections basées sur le margin actuel** pour calculer les targets:

```typescript
// Après: utilise projectedTotalSavings (basé sur margin actuel)
const projectedTotalSavings = baseSavingsWeeks.reduce(
  (sum, s) => sum + s.amount, // ← base calculée, pas ajustée
  0
);
// effectiveGoalForWork = 1000 - 100 = 900€ (change avec margin)
```

---

## PROBLÈME 3: EarningsChart dataset order mismatch

### Symptôme

Lors de l'utilisation de la date simulée (+1 jour, +1 semaine, +1 mois):
1. Le "Goal target" (ligne rouge horizontale) devenait progressif
2. Quand on revenait au "temps réel", le goal restait progressif

### Cause Racine

Dans **EarningsChart.tsx**, le `createEffect` qui met à jour le chart avait les datasets dans le mauvais ordre:

```typescript
// Création du chart (correct):
// datasets[0] = Goal (horizontal at goalAmount)
// datasets[1] = Required Pace
// datasets[2] = Projected
// datasets[3] = Actual (optional)

// MAIS l'update faisait (INCORRECT):
if (chartData.datasets[0]) chartData.datasets[0].data = data.requiredPace;      // ❌ Goal reçoit requiredPace!
if (chartData.datasets[1]) chartData.datasets[1].data = data.projectedEarnings; // ❌ Décalé
if (chartData.datasets[2]) chartData.datasets[2].data = data.actualEarnings;    // ❌ Décalé
```

### Solution

Corriger l'ordre des datasets dans l'update:

```typescript
// [0] = Goal (horizontal), [1] = Required Pace, [2] = Projected, [3] = Actual
if (chartData.datasets[0]) chartData.datasets[0].data = data.labels.map(() => data.goalAmount);
if (chartData.datasets[1]) chartData.datasets[1].data = data.requiredPace;
if (chartData.datasets[2]) chartData.datasets[2].data = data.projectedEarnings;
if (chartData.datasets[3]) chartData.datasets[3].data = data.actualEarnings;
```

---

## Fichiers Modifiés

| Fichier | Modification |
|---------|--------------|
| `GoalsTab.tsx` | Retiré `keyed` de 2 `<Show>` components |
| `useGoalData.ts` | Utilise projections basées sur margin actuel |
| `EarningsChart.tsx` | Corrigé l'ordre des datasets |
| `WeeklyProgressCards.tsx` | Nettoyé logs de debug |

---

## Flux de Données Corrigé

```
Budget Tab modifie income/expenses
    ↓
DuckDB mis à jour → contextIncome()/contextLifestyle() signals mis à jour
    ↓
GoalsTab remonté → useGoalData instancié
    ↓
Source function calcule:
  - computedMargin = 50 (nouveau margin)
  - projectedTotalSavings = 100 (50€ × 2 mois)
    ↓
POST /api/retroplan avec margin=50, actualTotalSavings=100
    ↓
API calcule: effectiveGoalForWork = 1000 - 100 = 900€
    ↓
milestones avec adjustedTarget augmentés
    ↓
weeklyCardsRetroplan() memo recalculé
    ↓
<Show> sans keyed → re-évalue → WeeklyProgressCards reçoit nouvelles props
    ↓
EarningsChart.createEffect update les datasets DANS LE BON ORDRE
    ↓
UI mise à jour ✓
```

---

## Détails Techniques SolidJS

### `<Show>` avec et sans `keyed`

```tsx
// SANS keyed - comportement par défaut
// Le children se re-évalue quand ANY signal à l'intérieur change
<Show when={condition()}>
  <Child prop={signal()} />  // ✓ se met à jour quand signal() change
</Show>

// AVEC keyed - optimisation de performance
// Le children ne se re-évalue QUE quand la valeur exacte de when change
<Show when={condition()} keyed>
  {(value) => (
    <Child prop={signal()} />  // ❌ NE se met PAS à jour quand signal() change
  )}
</Show>
```

### Quand utiliser `keyed`

- **Utiliser `keyed`**: Quand le contenu dépend UNIQUEMENT de la valeur de `when`
- **Ne PAS utiliser `keyed`**: Quand le contenu dépend d'autres signaux réactifs

---

## Tests de Validation

### Test 1: Navigation Budget → Goals
1. Aller sur Goals tab (noter le weekly target)
2. Aller sur Budget tab
3. Ajouter une dépense de 20€/mois
4. Retourner sur Goals tab
5. **Attendu**: Weekly target a augmenté ✓

### Test 2: Vérifier le Chart sans simulation
1. Sur Goals tab, vérifier que Goal (ligne rouge) est horizontale
2. Modifier le budget
3. **Attendu**: Goal reste horizontal, Required Pace s'ajuste ✓

### Test 3: Simulation de date
1. Activer simulation +1 semaine
2. **Attendu**: Goal reste horizontal
3. Revenir au temps réel
4. **Attendu**: Goal reste horizontal ✓

---

## ⚠️ DETTE TECHNIQUE IDENTIFIÉE

### 1. Violation du Contrat API (Fix 2)

**Problème**: On passe `projectedTotalSavings` dans le paramètre nommé `actualTotalSavings`:

```typescript
// useGoalData.ts
return {
  actualTotalSavings: projectedTotalSavings, // ⚠️ Sémantiquement incorrect
};

// api/retroplan.ts attend:
actualTotalSavings?: number, // Documenté comme "ACTUAL savings after adjustments"
```

**Risque**: Un développeur futur lira `actualTotalSavings` côté backend et pensera qu'il s'agit de l'argent réellement économisé (avec ajustements manuels), alors qu'il s'agit d'une projection théorique.

### 2. Complexité du Composant GoalsTab

**Constat**: `GoalsTab.tsx` fait **2100+ lignes**. Il gère UI, formulaires, calculs complexes et orchestration de données.

**Risque**: Haute fragilité. Le bug de réactivité (Fix 1) est un symptôme d'un composant qui fait trop de choses.

### 3. Indices Hardcodés dans le Chart (Fix 3)

**Constat**: Le fix utilise des indices `[0]`, `[1]`, `[2]` qui doivent correspondre à l'ordre d'initialisation.

**Risque**: Si un nouveau dataset est ajouté (ex: "Previous Period Comparison"), la logique d'update sera silencieusement cassée.

---

## 📋 PLAN DE CONSOLIDATION

### Phase 1: Refactoring API (Effort faible / Haute valeur)

**Objectif**: Distinguer explicitement "Existing Savings" et "Projected Savings".

1. **Modifier `api/retroplan.ts`**:
   - Ajouter paramètre `projectedSavingsBasis` optionnel
   - Logique: `const savingsContribution = projectedSavingsBasis ?? actualTotalSavings ?? (margin * months);`

2. **Modifier `useGoalData.ts`**:
   - Passer `projectedTotalSavings` comme `projectedSavingsBasis`
   - Passer le vrai `actualTotalSavings` (avec ajustements) pour usage futur

### Phase 2: Tests de Non-Régression

**Objectif**: Empêcher la régression de la logique de synchronisation.

1. **Test unitaire `useGoalData`**:
   - Changer `monthlyMargin` et vérifier que les args du retroplan resource utilisent la nouvelle projection

### Phase 3: Robustesse Chart (Effort faible)

**Objectif**: Rendre `EarningsChart` robuste contre les réordonnancements de datasets.

```typescript
// Au lieu de:
if (chartData.datasets[0]) chartData.datasets[0].data = ...

// Utiliser:
const goalDataset = chart.data.datasets.find(d => d.label === 'Goal');
if (goalDataset) goalDataset.data = data.labels.map(() => data.goalAmount);
```

### Phase 4: Refactoring Long Terme

1. **Extraire composants de GoalsTab**:
   - Séparer le formulaire "Add/Edit Goal"
   - Créer un orchestrateur dédié pour WeeklyProgressCards

---

## Leçons Apprises

1. **SolidJS `keyed` est une optimisation de performance** qui peut casser la réactivité si mal utilisée
2. **Distinguer projections vs données historiques** - pour calculer des targets futurs, utiliser les projections
3. **Chart.js datasets ont un ordre fixe** - utiliser des lookups par label plutôt que des indices
4. **Nommer les paramètres clairement** - `actualTotalSavings` ne devrait pas contenir une projection
5. **Composants monolithiques** = bugs de réactivité difficiles à tracer

---

## Statut Final

- [x] Fix 1: Retirer `keyed` des Show components
- [x] Fix 2: Utiliser projections au lieu d'ajustements
- [x] Fix 3: Corriger l'ordre des datasets EarningsChart
- [x] Supprimer les logs de diagnostic
- [x] Documentation complète
- [x] **Phase 1: Refactoring API** - Ajouté `projectedSavingsBasis` distinct de `actualTotalSavings`
- [x] **Phase 2: Tests de non-régression** - 8 tests unitaires dans `useGoalData.test.ts`
- [x] **Phase 3: Lookups par label dans Chart** - Utilise `datasets.find(d => d.label === '...')`
- [x] **Phase 4: Refactoring GoalsTab** - Composants extraits (2134 → 1563 lignes)

---

## Détails des Consolidations Implémentées

### Phase 1: Refactoring API

**Fichiers modifiés:**
- `api/retroplan.ts` - Nouveau paramètre `projectedSavingsBasis`
- `useGoalData.ts` - Passe les deux valeurs distinctement

**Avant:**
```typescript
// useGoalData.ts - Sémantiquement incorrect
actualTotalSavings: projectedTotalSavings, // ❌ Projection passée comme "actual"
```

**Après:**
```typescript
// useGoalData.ts - Sémantiquement correct
projectedSavingsBasis: projectedTotalSavings,  // ✅ Pour calcul des targets
actualTotalSavings: actualTotalSavings,        // ✅ Pour tracking (futur)
```

**API retroplan.ts - Nouvelle logique:**
```typescript
// Priorité: projectedSavingsBasis > actualTotalSavings > calcul depuis margin
if (projectedSavingsBasis !== undefined) {
  savingsContribution = projectedSavingsBasis;  // Réactif au budget
} else if (actualTotalSavings !== undefined) {
  savingsContribution = actualTotalSavings;     // Backward compat
} else {
  savingsContribution = monthlyMargin * months; // Fallback
}
```

### Phase 3: Lookups par Label

**Fichier modifié:** `EarningsChart.tsx`

**Avant:**
```typescript
// Fragile - casse si ordre change
if (chartData.datasets[0]) chartData.datasets[0].data = goalData;
if (chartData.datasets[1]) chartData.datasets[1].data = paceData;
```

**Après:**
```typescript
// Robuste - fonctionne même si datasets réordonnés
const goalDataset = chartData.datasets.find(d => d.label === 'Goal');
const paceDataset = chartData.datasets.find(d => d.label === 'Required Pace');
if (goalDataset) goalDataset.data = goalData;
if (paceDataset) paceDataset.data = paceData;
```

### Phase 2: Tests de Non-Régression

**Fichier créé:** `src/hooks/__tests__/useGoalData.test.ts`

**8 tests couvrant:**
1. `projectedSavingsBasis` utilise le margin courant, pas les ajustements historiques
2. `projectedSavingsBasis` se met à jour quand le margin change
3. Margin négatif → zéro épargne projetée
4. Calcul correct de `effectiveGoalForWork` avec projections
5. Plus de travail requis quand le margin diminue
6. Zero margin → tout le goal vient du travail
7. Margin très élevé → pas de travail requis
8. Sans ajustements, projected = actual

```bash
pnpm --filter @stride/frontend test -- src/hooks/__tests__/useGoalData.test.ts
# 8 tests passing
```

### Phase 4: Refactoring GoalsTab

**Objectif:** Réduire la complexité de GoalsTab.tsx (2134 lignes → composants modulaires)

**Composants extraits vers `src/components/tabs/goals/`:**

| Composant | Lignes | Responsabilité |
|-----------|--------|----------------|
| `AcademicEventsSection` | 289 | CRUD événements académiques (exams, vacances, stages) |
| `CommitmentsSection` | 174 | CRUD engagements récurrents (cours, sport, clubs) |
| `GoalComponentsSection` | 234 | CRUD composants de goal (milestones, achats, etc.) |
| `GoalPresetsSection` | 112 | Presets rapides (Vacation, Permis, etc.) |
| `index.ts` | 22 | Re-exports et types |

**Résultat:**
- GoalsTab.tsx: **2134 → 1563 lignes** (réduction de 27%)
- Code mieux organisé avec séparation des responsabilités
- Types réutilisables exportés (`AcademicEvent`, `Commitment`, `ComponentFormItem`, `GoalPreset`)
- GoalsTab se concentre sur l'orchestration et l'affichage du goal actif
