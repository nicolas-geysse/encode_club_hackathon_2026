# Sprint 13.8 - Fix Régression Simulateur de Dates

> **Status:** Fixed
> **Priority:** P0 (Régression bloquante)
> **Sprint:** 13.8

---

## Problème Signalé

Après Sprint 13.7, le simulateur de dates était cassé:
1. Les WeeklyProgressCards n'avançaient plus quand on simulait le temps
2. L'avancement cumulatif ne fonctionnait plus (on pouvait avancer +1j/+7j/+30j mais ça ne s'accumulait pas)

---

## Root Causes Identifiées

### Bug 1: plan.tsx - currentDate jamais mis à jour

```typescript
// plan.tsx - CHARGÉ UNE SEULE FOIS!
createEffect(() => {
  const profile = activeProfile();
  if (profile) {
    const simDate = await simulationService.getCurrentDate();
    setCurrentDate(simDate);  // ← Seulement au chargement initial
  }
});
```

**Flux cassé:**
```
SimulationControls clique +7j
  ↓
simulationService.advanceDays(7) → met à jour DB
  ↓
app.tsx reçoit onSimulationChange → met à jour simulationState local
  ↓
❌ plan.tsx NE REÇOIT PAS la notification
  ↓
currentDate reste à l'ancienne valeur
  ↓
GoalsTab/WeeklyProgressCards ne se mettent pas à jour
```

### Bug 2: GoalTimeline.tsx - Paramètres manquants

```typescript
// GoalTimeline.tsx - INCOMPLET!
fetch('/api/retroplan', {
  body: JSON.stringify({
    action: 'generate_retroplan',
    goalId,
    goalAmount: amount,
    deadline,
    academicEvents: props.academicEvents || [],
    hourlyRate: props.hourlyRate,
    monthlyMargin: props.monthlyMargin,
    // ❌ MANQUAIT: simulatedDate
    // ❌ MANQUAIT: goalStartDate
  }),
})
```

---

## Solution Implémentée

### Phase 1: SimulationContext (nouveau fichier)

**Fichier créé:** `packages/frontend/src/lib/simulationContext.tsx`

Suit le pattern de ProfileContext:
- `simulationState()` - État réactif de la simulation
- `currentDate()` - Date actuelle (simulée) comme signal
- `refreshSimulation()` - Rafraîchit depuis l'API

Le contexte écoute `SIMULATION_UPDATED` et se rafraîchit automatiquement.

### Phase 2: app.tsx - Émission de l'événement

```typescript
// app.tsx - handleSimulationChange
const handleSimulationChange = (state: SimulationState) => {
  setSimulationState(state);

  // Sprint 13.8 Fix: Émettre SIMULATION_UPDATED
  eventBus.emit('SIMULATION_UPDATED');

  // ... reste du code
};
```

L'app est wrappée avec `<SimulationProvider>`.

### Phase 3: plan.tsx et suivi.tsx

Remplacement du signal local par le contexte:

```typescript
// Avant (plan.tsx)
const [currentDate, setCurrentDate] = createSignal<Date>(new Date());
createEffect(() => { ... simulationService.getCurrentDate() ... });

// Après
const { currentDate } = useSimulation();
```

### Phase 4: GoalTimeline.tsx et RetroplanPanel.tsx

Ajout des paramètres manquants à l'appel API:

```typescript
body: JSON.stringify({
  // ... autres params
  simulatedDate: simDate?.toISOString(),
  goalStartDate: props.goal.createdAt,  // GoalTimeline seulement
}),
```

Et tracking de `simulatedDate` dans le createEffect pour la réactivité.

---

## Nouveau Flux de Données

```
SimulationControls clique +7j
  ↓
simulationService.advanceDays(7) → DB updated
  ↓
handleSimulationChange() dans app.tsx
  ↓
eventBus.emit('SIMULATION_UPDATED')
  ↓
SimulationContext.refreshSimulation()
  ↓
simulationState signal mis à jour
  ↓
✅ plan.tsx/suivi.tsx re-render automatiquement (réactivité SolidJS)
  ↓
✅ GoalsTab/WeeklyProgressCards reçoivent nouvelle date
  ↓
✅ API retroplan appelée avec nouvelle simulatedDate
```

---

## Fichiers Modifiés

| Fichier | Modification |
|---------|--------------|
| `frontend/src/lib/simulationContext.tsx` | **CRÉÉ** - Contexte SolidJS pour simulation |
| `frontend/src/app.tsx` | Wrapper avec SimulationProvider + émettre SIMULATION_UPDATED |
| `frontend/src/routes/plan.tsx` | Utiliser useSimulation() au lieu du signal local |
| `frontend/src/routes/suivi.tsx` | Utiliser useSimulation() au lieu du signal local |
| `frontend/src/components/GoalTimeline.tsx` | Ajouter simulatedDate + goalStartDate + dépendance |
| `frontend/src/components/RetroplanPanel.tsx` | Ajouter simulatedDate + dépendance |

---

## Tests de Vérification

| Scénario | Attendu |
|----------|---------|
| Créer un goal, avancer +7 jours | WeeklyProgressCards passe à Week 2 |
| Avancer +7 jours encore | WeeklyProgressCards passe à Week 3 (cumulatif) |
| Ouvrir GoalTimeline | Affiche la bonne semaine courante |
| Reset simulation | Revient à Week 1 |
| Changer d'onglet (plan → suivi) | Date synchronisée partout |
