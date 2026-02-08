# Stratégie de Temps Réel & Réactivité (SolidJS + DuckDB)

Ce document décrit l'architecture de réactivité **déjà implémentée** dans Stride, garantissant que toute modification en base de données (DuckDB) se reflète instantanément sur l'UI, sans rafraîchissement manuel.

---

## Architecture Actuelle (Implémentée ✅)

### Event Bus + BroadcastChannel

Stride utilise un système d'événements global qui synchronise l'état entre tous les composants et onglets.

```
┌─────────────────┐     emit()      ┌──────────────┐
│  goalService    │ ─────────────── │              │
│  profileService │ ─────────────── │   eventBus   │ ──► BroadcastChannel
│  skillService   │ ─────────────── │              │     (autres onglets)
│  inventoryService│ ────────────── │              │
│  lifestyleService│ ────────────── └──────────────┘
│  incomeService  │                        │
│  tradeService   │                        │ on()
└─────────────────┘                        ▼
                                  ┌──────────────────┐
                                  │  ProfileContext  │
                                  │  refreshAll()    │
                                  └──────────────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │   Signals (UI)   │
                                  │  profile(), goals() │
                                  └──────────────────┘
```

### Fichiers Clés

| Fichier | Rôle |
|---------|------|
| `src/lib/eventBus.ts` | Singleton EventBus avec BroadcastChannel |
| `src/lib/profileContext.tsx` | Écoute les événements et met à jour les signals |
| `src/lib/*Service.ts` | Émettent `DATA_CHANGED` après chaque mutation |

### Types d'Événements

```typescript
type AppEvent =
  | 'DATA_CHANGED'       // Toute modification de données
  | 'PROFILE_SWITCHED'   // Changement de profil actif
  | 'SIMULATION_UPDATED' // Avancement du temps simulé
```

---

## Flux de Données

### Exemple: Création d'un Goal

```
1. GoalsTab appelle goalService.createGoal()
2. goalService fait POST /api/goals
3. API insère en DuckDB, renvoie succès
4. goalService appelle eventBus.emit('DATA_CHANGED')
5. eventBus notifie:
   - ProfileContext (local) → refreshAll()
   - BroadcastChannel → autres onglets
6. ProfileContext recharge goals depuis API
7. Signal goals() mis à jour
8. SolidJS re-render les composants abonnés
```

---

## Points Forts de l'Implémentation

### 1. Synchronisation Multi-Onglets
```typescript
// eventBus.ts
this.channel = new BroadcastChannel('stride_event_bus');

emit(type: AppEvent) {
  this.notifyListeners(type);      // Local
  this.channel.postMessage(type);  // Autres onglets
}
```

### 2. Cleanup Automatique
```typescript
// profileContext.tsx
onMount(() => {
  const unsubData = eventBus.on('DATA_CHANGED', refreshAll);
  return () => unsubData(); // Cleanup on unmount
});
```

### 3. Fine-Grained Reactivity (SolidJS)
Les signals SolidJS ne re-render que les composants qui utilisent les données modifiées:
```typescript
const [goals, setGoals] = createSignal<Goal[]>([]);
// Seuls les composants appelant goals() sont re-rendus
// Seuls les composants appelant goals() sont re-rendus
```

### 4. Anti-Scintillement (Anti-Flickering) 🚀
Pour éviter les clignotements désagréables lors de mises à jour rapides (ex: onboarding) :

1.  **Silent Refresh** : Les mises à jour via Event Bus se font avec `refreshProfile({ silent: true })`. Cela évite d'afficher le spinner de chargement (`loading=true`) si des données sont déjà présentes. L'interface reste stable pendant le rafraîchissement.
2.  **Debouncing (150ms)** : Le listener `DATA_CHANGED` utilise un *debounce* de 150ms. Si 10 événements arrivent en rafale (ex: création de 10 trades), un seul appel API global est déclenché à la fin.

### 5. Patterns UX & Réactivité (Lessons Learned)
Deux bonnes pratiques ont été intégrées lors de l'affinage :

#### A. Soft Navigation pour le Reset
Au lieu d'utiliser `window.location.reload()` pour réinitialiser l'application (ce qui est lent et visuellement agressif), nous utilisons désormais :
1.  `eventBus.emit('DATA_CHANGED')` -> Notifie les autres onglets.
2.  `refreshProfile()` -> Vide l'état local immédiatement (profile devient null).
3.  `navigate('/')` -> Transition fluide via le routeur client.

#### B. Modals via Portals
Pour les boîtes de dialogue critiques (ex: Confirmation de suppression), nous utilisons `<Portal>` de SolidJS. Cela garantit que la modal est :
- Rendu dans `document.body` (hors de l'arbre DOM du composant).
- Toujours au-dessus de tout le reste (`z-index` global).
- Centrée correctement par rapport à la vue (Viewport), et non par rapport au composant parent.

---

## Améliorations Possibles (Backlog)

### 1. Événements Granulaires
**Problème**: `DATA_CHANGED` déclenche un `refreshAll()` même si seuls les goals ont changé.

**Solution**:
```typescript
type AppEvent =
  | 'GOALS_CHANGED'
  | 'SKILLS_CHANGED'
  | 'INVENTORY_CHANGED'
  // etc.

// Dans profileContext
eventBus.on('GOALS_CHANGED', refreshGoals);
eventBus.on('SKILLS_CHANGED', refreshSkills);
```

### 3. Optimistic Updates
**Problème**: L'UI attend la réponse serveur avant de se mettre à jour.

**Solution**: Mettre à jour le signal immédiatement, puis confirmer:
```typescript
async function createGoal(goal: Goal) {
  // Optimistic: update UI immediately
  setGoals(prev => [...prev, { ...goal, id: 'temp-id' }]);

  try {
    const created = await api.createGoal(goal);
    // Replace temp with real
    setGoals(prev => prev.map(g => g.id === 'temp-id' ? created : g));
  } catch {
    // Rollback on error
    setGoals(prev => prev.filter(g => g.id !== 'temp-id'));
  }
}
```

### 4. Fallback pour Navigateurs Anciens
**Problème**: BroadcastChannel n'existe pas sur tous les navigateurs.

**Solution** (déjà partiellement gérée):
```typescript
constructor() {
  if (typeof BroadcastChannel !== 'undefined') {
    this.channel = new BroadcastChannel('stride_event_bus');
    this.channel.onmessage = (e) => this.notifyListeners(e.data);
  }
  // Sans BroadcastChannel, sync locale uniquement (acceptable)
}
```

### 5. Indicateur de Sync
Afficher un indicateur quand les données se synchronisent:
```typescript
const [syncing, setSyncing] = createSignal(false);

eventBus.on('DATA_CHANGED', async () => {
  setSyncing(true);
  await refreshAll();
  setSyncing(false);
});
```

---

## Comparaison des Options (Référence)

| Option | Complexité | Temps Réel | Multi-Onglets | Status |
|--------|-----------|------------|---------------|--------|
| **Event Bus + BroadcastChannel** | ⭐ Faible | ✅ Perçu | ✅ Oui | **Implémenté** |
| Polling (SWR) | ⭐ Faible | ❌ Délai 5s | ✅ Oui | Non retenu |
| Server-Sent Events (SSE) | ⭐⭐⭐ Élevée | ✅ Vrai | ✅ Oui | Overkill pour hackathon |
| WebSockets | ⭐⭐⭐⭐ Très élevée | ✅ Vrai | ✅ Oui | Overkill |

---

## Conclusion

L'architecture "Event Bus + BroadcastChannel" est **le bon choix** pour Stride:
- ✅ Simple et maintenable
- ✅ Réactivité instantanée pour les actions utilisateur
- ✅ Synchronisation multi-onglets native
- ✅ Compatible avec SolidJS fine-grained reactivity
- ✅ Pas de dépendance serveur complexe

Les améliorations (debouncing, événements granulaires) sont du **polish** à considérer post-hackathon si des problèmes de performance apparaissent.
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
