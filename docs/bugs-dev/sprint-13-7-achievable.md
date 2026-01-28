# Sprint 13.7 - Audit de l'Indicateur "Achievable"

> **Status:** Fixed
> **Priority:** P1 (Indicateur toujours a 100%)
> **Date:** 2026-01-28

---

## Probleme Signale

L'indicateur "Achievable" dans GoalsTab affichait toujours `100% Very achievable`, quel que soit le goal defini.

## Root Cause

### Stores In-Memory Non Persistes

Le fichier `packages/frontend/src/routes/api/retroplan.ts` utilisait des `Map` en memoire pour stocker les donnees:

```typescript
// AVANT - PERDU AU REDEMARRAGE!
const academicEventsStore: Map<string, AcademicEvent> = new Map();
const commitmentsStore: Map<string, Commitment> = new Map();
const energyLogsStore: Map<string, EnergyLog> = new Map();
```

**Consequence:** A chaque redemarrage du serveur, les stores etaient vides. Toutes les semaines avaient donc la capacite MAX, ce qui donnait un score de faisabilite de 100%.

### Fragmentation des Donnees d'Energie

| Stockage | Format | Persiste? | Utilise par |
|----------|--------|-----------|-------------|
| `followupData.energyHistory` | 0-100 array | Oui | CapacityForecast |
| `energy_logs` table (DuckDB) | 1-5 scale | Oui | MCP tools seulement |
| `energyLogsStore` (in-memory) | 1-5 scale | Non | Retroplan API |

La table `energy_logs` existait dans DuckDB mais le frontend ne l'utilisait pas!

---

## Solution Implementee

### Phase 1: Schemas DuckDB

Ajout des schemas manquants dans `packages/frontend/src/lib/api/schemaManager.ts`:

- `academic_events` - avec `capacity_impact`, `priority`
- `commitments` - avec `hours_per_week`, `flexible_hours`
- `energy_logs` - deja existante mais alignee

### Phase 2: Persistence dans retroplan.ts

Remplacement des `Map` par des requetes DuckDB:

```typescript
// APRES - Persiste dans DuckDB
await ensureRetroplanSchemas();

const eventRows = await query<AcademicEventRow>(
  `SELECT * FROM academic_events WHERE profile_id = ${escapeSQL(userId)}`
);
```

Toutes les actions CRUD (`add_academic_event`, `list_commitments`, etc.) utilisent maintenant DuckDB.

### Phase 3: Facteur Margin-Based

Integration du `monthlyMargin` (surplus mensuel) dans le calcul de faisabilite:

```typescript
// Capacite combinee: travail + epargne passive
const totalMonths = Math.max(1, Math.ceil(totalWeeks / 4.33));
const marginBasedCapacity = (monthlyMargin ?? 0) * totalMonths;
const effectiveMaxEarnings = maxTotalEarnings + marginBasedCapacity;
```

### Phase 4: Propagation du monthlyMargin

Tous les composants appelant l'API retroplan passent maintenant `monthlyMargin`:
- `GoalsTab.tsx`
- `WeeklyProgressCards.tsx`
- `RetroplanPanel.tsx`
- `GoalTimeline.tsx`

---

## Fichiers Modifies

| Fichier | Changements |
|---------|-------------|
| `packages/frontend/src/lib/api/schemaManager.ts` | Ajout schemas `commitments`, `energy_logs`, mise a jour `academic_events` |
| `packages/frontend/src/routes/api/retroplan.ts` | Remplacement in-memory par DuckDB, ajout `monthlyMargin` |
| `packages/frontend/src/components/tabs/GoalsTab.tsx` | Passage `monthlyMargin` a l'API |
| `packages/frontend/src/components/WeeklyProgressCards.tsx` | Passage `monthlyMargin` a l'API |
| `packages/frontend/src/components/RetroplanPanel.tsx` | Ajout prop + passage `monthlyMargin` |
| `packages/frontend/src/components/GoalTimeline.tsx` | Ajout prop + passage `monthlyMargin` |

---

## Tests de Verification

| Scenario | Avant | Apres |
|----------|-------|-------|
| Goal 10,000EUR, 2 semaines, margin 200EUR | 100% | < 30% (Unrealistic) |
| Goal 1,000EUR, 4 sem avec 2 sem exams | 100% | < 70% (Challenging) |
| Goal 500EUR, 8 semaines, margin 300EUR | 100% | >= 80% (Very achievable) |
| Redemarrage serveur | Perte des events | Events persistes |

### Comment Tester

1. Creer un goal avec un montant eleve et une deadline courte
2. Verifier que le score "Achievable" est < 100%
3. Ajouter des events academiques (exams)
4. Verifier que le score diminue (protected weeks)
5. Redemarrer le serveur (`pnpm dev`)
6. Verifier que les events sont toujours presents

---

## Nouvelle Formule de Faisabilite

```
effectiveMaxEarnings = maxWorkEarnings + (monthlyMargin * totalMonths)

if (goal <= effectiveRecommended):
    score = 100%
elif (goal <= effectiveMaxEarnings):
    score = 60% + 40% * (recommended / goal)
else:
    score = effectiveMaxEarnings / goal

// Facteurs secondaires
score *= 0.9 if protectedWeeks > 30%
score *= 0.95 if lowCapacityWeeks > 40%
score *= 0.9 if totalWeeks < 4
```

---

## Impact sur les Risk Factors

Les `riskFactors` retournes par l'API incluent maintenant:
- `Monthly savings: +X EUR/month (Y EUR total)` si monthlyMargin > 0
- `Goal exceeds max capacity by X EUR` si goal > capacite
- Details sur work earnings + savings dans le message

---

## Notes Techniques

1. **Pre-fetching**: Pour eviter N+1 queries, `generateRetroplanForGoal` pre-charge toutes les donnees avant de boucler sur les semaines.

2. **Upsert pour events**: Les events passes via l'API sont upserted (INSERT ... ON CONFLICT DO UPDATE) pour eviter les doublons.

3. **Backward compatibility**: Si aucun event n'est persiste, le calcul fonctionne toujours (capacite max par defaut).
