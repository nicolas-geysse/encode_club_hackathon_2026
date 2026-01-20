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
```

---

## Améliorations Possibles (Backlog)

### 1. Debouncing des Refreshes
**Problème**: Si plusieurs mutations arrivent rapidement, on fait N appels API.

**Solution**:
```typescript
// Ajouter dans profileContext.tsx
import { debounce } from './utils';

const debouncedRefreshAll = debounce(refreshAll, 100);
eventBus.on('DATA_CHANGED', debouncedRefreshAll);
```

### 2. Événements Granulaires
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
