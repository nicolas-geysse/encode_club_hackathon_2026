# Stride Flickering Issues - Guide de Référence

## Vue d'Ensemble du Pattern

Le flickering dans Stride est causé par un pattern récurrent:
1. Une action utilisateur trigger un save
2. Le service émet DATA_CHANGED
3. Plusieurs listeners réagissent sans coordination
4. Rafraîchissements multiples = UI instable

## Cas Documentés

### Cas 1: Energy Panel (/suivi) - CORRIGÉ

- **Symptôme**: Valeurs d'énergie changeantes
- **Cause**: Génération aléatoire non persistée
- **Fix**: Sauvegarder en DB après génération

### Cas 2: GoalsTab Buttons - CORRIGÉ ✅

- **Symptôme**: Boutons Edit/Complete/Delete flickent au hover, requêtes API en boucle permanente
- **Cause racine**: **Boucle infinie dans plan.tsx** (et non double source de vérité)
- **Fix**: Comparaison JSON avant `setPlanData()` + guard pour auto-complete

#### Tentatives échouées

1. **Tentative 1**: Debounce + suppression refreshGoals dupliqués
   - Hypothèse: Triple-refresh (listener + ProfileContext + handler)
   - Résultat: ❌ Flickering persiste

2. **Tentative 2**: Migration vers ProfileContext
   - Hypothèse: Double source de vérité
   - Résultat: ❌ Flickering persiste

#### Vraie cause racine: Boucle infinie plan.tsx

**Diagnostic clé**: Le flickering se produisait au **HOVER** et des requêtes API s'envoyaient **EN PERMANENCE** (visible dans Network tab). La page `/suivi` ne flickerait pas car elle n'utilise pas plan.tsx.

**La boucle infinie**:

```
DATA_CHANGED (n'importe quelle source)
    ↓
ProfileContext refresh → activeProfile() change
    ↓
Effect 1 (plan.tsx:182): setPlanData({ ...stored })  ← TOUJOURS nouvel objet!
    ↓
planData() change
    ↓
Effect 2 (plan.tsx:226): profileService.saveProfile()
    ↓
saveProfile émet DATA_CHANGED (profileService.ts:255)
    ↓
(boucle recommence)
```

**Pourquoi c'est une boucle**:
- **Effect 1** track `activeProfile()`, appelle `setPlanData({ ...stored })` créant TOUJOURS un nouvel objet
- **Effect 2** track `planData()`, appelle `saveProfile()` qui émet DATA_CHANGED
- Le debounce de 500ms ne fait que retarder, pas empêcher → ~2 saves/seconde en continu

#### Solution appliquée (2026-01-21)

**Fix 1: plan.tsx (lignes 181-233)** - CRITIQUE

```tsx
// AVANT (crée toujours un nouvel objet = trigger systématique)
createEffect(async () => {
  const profile = activeProfile();
  if (profile?.planData) {
    const stored = profile.planData as unknown as PlanData;
    setPlanData({ ...stored, ... }); // ⚠️ TOUJOURS trigger save effect!
  }
});

// APRÈS (compare avant de setter = casse la boucle)
createEffect(async () => {
  const profile = activeProfile();
  if (profile?.planData) {
    const stored = profile.planData as unknown as PlanData;
    const newData = { ...stored, completedTabs: stored.completedTabs || [], ... };

    // Only update if data actually changed (breaks the infinite loop)
    const current = untrack(() => planData());
    if (JSON.stringify(current) !== JSON.stringify(newData)) {
      setPlanData(newData);
    }
  }
});
```

**Fix 2: GoalsTab.tsx (lignes 204-224)** - Secondaire

```tsx
// Track processed goal IDs to prevent duplicate auto-complete calls
const processedAutoCompleteGoals = new Set<string>();

createEffect(() => {
  const currentGoals = goals();
  for (const goal of currentGoals) {
    if (goal.progress >= 100 && goal.status === 'active') {
      // Skip if already processed (prevents duplicate calls during refresh cycles)
      if (processedAutoCompleteGoals.has(goal.id)) continue;
      processedAutoCompleteGoals.add(goal.id);

      goalService.updateGoal({ id: goal.id, status: 'completed' }).then(() => {
        toast.success('Goal achieved!', `"${goal.name}" has been completed!`);
      });
    }
  }
});
```

#### Fichiers modifiés

| Fichier | Ligne | Changement |
|---------|-------|------------|
| `packages/frontend/src/routes/plan.tsx` | 181-233 | Ajout comparaison JSON avant `setPlanData()` + `untrack()` |
| `packages/frontend/src/components/tabs/GoalsTab.tsx` | 204-224 | Ajout Set pour tracker les goals auto-completed |

#### Vérification

```bash
pnpm dev
# 1. Ouvrir Network tab des DevTools
# 2. Aller sur /plan?tab=goals
# 3. Attendre 5 secondes sans rien faire
# 4. Vérifier: PAS de requêtes /api/profiles en boucle!
# 5. Hover sur les boutons Edit/Complete/Delete
# 6. Vérifier: PAS de flickering visuel
```

### Cas 3: OnboardingChat - À SURVEILLER

- **Symptômes potentiels**:
  - ProfileContext clear → refetch = blank state
  - Scroll jumping (50ms insuffisant)
  - Double refresh chains
- **Statut**: À analyser si problèmes rapportés

## Checklist Anti-Flickering

### Pour les nouveaux listeners DATA_CHANGED:
- [ ] Toujours utiliser debounce (150-200ms)
- [ ] Utiliser silent: true pour éviter les spinners
- [ ] Cleanup le timeout dans onCleanup

### Pour les handlers qui mutent des données:
- [ ] NE PAS appeler refresh() après un service call
- [ ] Le service émet déjà DATA_CHANGED
- [ ] Laisser le listener (debounced) gérer le refresh

### Pattern correct:
```tsx
// Dans onMount
let refreshTimeout: ReturnType<typeof setTimeout>;
const debouncedRefresh = () => {
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => refreshData(), 150);
};
const unsub = eventBus.on('DATA_CHANGED', debouncedRefresh);

onCleanup(() => {
  clearTimeout(refreshTimeout);
  unsub();
});

// Dans les handlers
const handleDelete = async (id: string) => {
  await myService.delete(id); // Émet DATA_CHANGED
  // PAS de refresh ici - le listener s'en charge
};
```

## Références Implémentations Correctes

| Fichier | Stratégie | Notes |
|---------|-----------|-------|
| ProfileContext.tsx:337-348 | Debounce 150ms | Listener centralisé pour DATA_CHANGED |
| suivi.tsx:400-407 | Debounce 200ms | Listener local pour pages isolées |
| GoalsTab.tsx | Utilise ProfileContext + Set guard | Pas de listener local, source unique, guard auto-complete |
| plan.tsx:181-233 | JSON compare + untrack | Compare avant setPlanData pour casser boucle infinie |

## Diagnostic Rapide

Si flickering détecté:
1. Vérifier si le composant a un listener DATA_CHANGED
2. Vérifier si le listener est debounced
3. Vérifier si les handlers appellent refresh() en plus du listener
4. Vérifier si des données sont générées à chaque reload
5. **NOUVEAU**: Vérifier les boucles infinies d'effets:
   - Ouvrir Network tab et observer si des requêtes s'envoient EN PERMANENCE
   - Si oui, chercher un pattern: Effect A → set signal → Effect B → save → DATA_CHANGED → Effect A
   - Solution: Comparer avec `JSON.stringify()` avant de setter, utiliser `untrack()` pour lire sans tracker

### Pattern anti-boucle infinie (SolidJS)

```tsx
// ⚠️ DANGEREUX: Boucle potentielle si externalSignal déclenche un save qui émet DATA_CHANGED
createEffect(() => {
  const data = externalSignal(); // Track
  setLocalSignal({ ...data });   // Trigger autre effect
});

// ✅ SÉCURISÉ: Compare avant de setter
createEffect(() => {
  const data = externalSignal(); // Track
  const current = untrack(() => localSignal()); // Lire sans tracker
  if (JSON.stringify(current) !== JSON.stringify(data)) {
    setLocalSignal(data); // Ne trigger que si vraiment différent
  }
});
```
