# Sprint 13.19: Fix Event Overlap & userId Mismatch Bug

> **Date:** 2026-01-29
> **Status:** RESOLVED
> **Priority:** P0

---

## Symptom

- Un examen de **1 jour** (ex: 11/02/2026) ne s'affichait pas dans le retroplan
- Le popup "Capacity Retroplan" montrait **"0 Protected"** alors qu'un event existait
- Les semaines W2-W5 avaient des heures disponibles réduites (6h au lieu de 29h) mais aucune semaine "Protected"

---

## Root Cause Analysis

### Problème 1: Type mismatch DuckDB DATE -> JavaScript

DuckDB retourne les colonnes `DATE` comme des **Date objects JavaScript**, pas comme des strings.

```typescript
// Ce que le code attendait:
interface AcademicEventRow {
  start_date: string;  // "2026-02-11"
}

// Ce que DuckDB retournait réellement:
{
  start_date: Date  // 2026-02-11T00:00:00.000Z (Date object)
}
```

La fonction `getDateOnly()` dans `calculateWeekCapacity()` gérait correctement les strings et les Date objects, mais le problème était ailleurs...

### Problème 2: userId="default" (LE VRAI BUG)

Les logs de debug ont révélé le vrai problème:

```
[WARN Sprint 13.19] Action "generate_retroplan" using userId="default".
This may cause events to not appear for the actual profile.
```

**Flux du bug:**

1. L'utilisateur crée un goal avec des academic events dans GoalsTab
2. Le frontend envoie `userId: currentProfile?.id`
3. **Si `currentProfile` n'est pas encore chargé** (race condition), `userId` = `undefined`
4. Le backend utilise le fallback: `const { userId = 'default' } = body;`
5. Les events sont stockés avec `profile_id='default'`
6. Plus tard, le retroplan query avec le vrai profil ID (`41dc2430-...`)
7. La query `WHERE profile_id = '41dc2430-...'` retourne **0 events**
8. Le popup affiche "0 Protected"

**Preuve dans la DB:**

```sql
SELECT profile_id, COUNT(*) FROM academic_events GROUP BY profile_id;
-- Résultat:
-- default: 15  (zombie events!)
-- 41dc2430-3a8d-4c0e-b37a-36e2ec565d78: 0  (profil Nico)
```

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/frontend/src/routes/api/retroplan.ts` | normalizeDate(), warning, cleanup action |
| `packages/frontend/src/components/tabs/GoalsTab.tsx` | Guard before fetch, pass userId |
| `packages/frontend/src/components/RetroplanPanel.tsx` | Guard, remove 'default' fallback |
| `packages/frontend/src/components/WeeklyProgressCards.tsx` | Add userId prop, guard, pass userId |
| `packages/frontend/src/routes/suivi.tsx` | Pass userId to WeeklyProgressCards |

---

## Technical Fix Details

### 1. Date Normalization (`retroplan.ts`)

Ajouté une fonction robuste pour normaliser les dates de DuckDB:

```typescript
function normalizeDate(d: unknown): string {
  if (d instanceof Date) {
    return d.toISOString().split('T')[0];  // "2026-02-11"
  }
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  if (typeof d === 'bigint' || typeof d === 'number') {
    const ms = typeof d === 'bigint' ? Number(d) : d;
    const date = new Date(ms < 1e12 ? ms * 1000 : ms);
    return date.toISOString().split('T')[0];
  }
  console.error('[Sprint 13.19] Unexpected date type:', typeof d, d);
  return String(d);
}
```

Mise à jour des interfaces pour refléter la réalité:

```typescript
interface AcademicEventRow {
  start_date: unknown;  // DuckDB DATE - may be Date object, string, or BigInt
  end_date: unknown;
}
```

### 2. Guard Against Missing userId

**Avant (bug):**
```typescript
createEffect(() => {
  const currentProfile = profile();
  // Profile might be undefined here!
  fetch('/api/retroplan', {
    body: JSON.stringify({
      userId: currentProfile?.id,  // undefined -> backend uses 'default'
    }),
  });
});
```

**Après (fix):**
```typescript
createEffect(() => {
  const currentProfile = profile();
  // Don't fetch if profile not loaded yet
  if (!currentProfile?.id) {
    return;
  }
  fetch('/api/retroplan', {
    body: JSON.stringify({
      userId: currentProfile.id,  // Guaranteed to be defined
    }),
  });
});
```

### 3. Remove 'default' Fallback in Components

**RetroplanPanel.tsx - Avant:**
```typescript
userId: props.userId || 'default',  // DANGEROUS FALLBACK
```

**Après:**
```typescript
userId: props.userId,  // Must be defined (guard in createEffect)
```

### 4. Warning Log for Debugging

Ajouté un warning dans le backend pour détecter ce problème à l'avenir:

```typescript
if (userId === 'default') {
  console.warn(
    `[WARN Sprint 13.19] Action "${action}" using userId="default". ` +
    'This may cause events to not appear for the actual profile.'
  );
}
```

### 5. Cleanup Action for Zombie Events

Nouvelle action API pour supprimer les events orphelins:

```bash
curl -X POST http://localhost:3006/api/retroplan \
  -H 'Content-Type: application/json' \
  -d '{"action":"cleanup_events","targetUserId":"default"}'
```

---

## Testing Verification

1. **Before fix:** Popup showed "0 Protected", warning in logs
2. **After fix:**
   - No warning in logs
   - Popup correctly shows "1 Protected" for exam week
   - Events stored with correct profile_id

---

## Lessons Learned

1. **Never use fallback 'default' for userId** - Wait for profile to load
2. **DuckDB types != TypeScript types** - Always verify with `typeof` logging
3. **Race conditions in SolidJS** - `createEffect` can fire before async data is loaded
4. **Zombie data accumulates** - Events were created but never cleaned up when profiles changed

---

## Related Issues

- Sprint 13.18: Initial date comparison fix (partial solution)
- Previous "always 100% achievable" bug - Same root cause (userId mismatch)
