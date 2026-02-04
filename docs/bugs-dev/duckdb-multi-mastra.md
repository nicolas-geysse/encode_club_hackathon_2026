# DuckDB Multi-Process Concurrency Strategy

> Document de réflexion sur les problèmes de concurrence DuckDB dans Stride
> Context: Hackathon Encode Club 2026 - besoin d'un équilibre pragmatisme/robustesse

## 1. État des lieux

### Architecture actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                   Frontend Process (SolidStart)                 │
│                   (Multiple concurrent HTTP requests)           │
├──────────────────────┬──────────────────────────────────────────┤
│   DuckDB Connection  │        Vector Store (Mastra)             │
│   stride.duckdb      │        stride-vectors.duckdb             │
│  ┌────────────────┐  │     ┌─────────────────────────────────┐  │
│  │  Write Queue   │  │     │  NO QUEUE - relies on Mastra    │  │
│  │  (Serialized)  │  │     │  upsert = DELETE + INSERT       │  │
│  └────────────────┘  │     └─────────────────────────────────┘  │
└──────────────────────┴──────────────────────────────────────────┘
           ↓ FILE                              ↓ FILE
    stride.duckdb                    stride-vectors.duckdb
           ↑ FILE                              ↑ FILE
┌──────────────────────────────────────────────────────────────────┐
│                   MCP Server Process (stdio)                     │
│                   (Mastra agents, tools)                         │
├──────────────────────┬───────────────────────────────────────────┤
│   DuckDB Connection  │        Vector Store (shared code)         │
│  ┌────────────────┐  │     ┌─────────────────────────────────┐   │
│  │  Write Queue   │  │     │  Same Mastra DuckDBVector       │   │
│  │  + File Lock   │  │     │  NO coordination with frontend  │   │
│  └────────────────┘  │     └─────────────────────────────────┘   │
└──────────────────────┴───────────────────────────────────────────┘
```

### Ce qui fonctionne

| Mécanisme | Scope | Efficacité |
|-----------|-------|------------|
| Write Queue (frontend) | Intra-process | ✅ Empêche WAL locks |
| Write Queue + File Lock (MCP) | Intra-process | ✅ Empêche WAL locks |
| Embedding deduplication | Intra-process, par type/id | ✅ Empêche upserts concurrents |
| Retry avec backoff (MCP) | Erreurs transitoires | ✅ Récupère des locks temporaires |
| Checkpoints périodiques | WAL management | ✅ Réduit corruption |

### Ce qui ne fonctionne PAS

| Risque | Impact | Fréquence estimée |
|--------|--------|-------------------|
| **Vector store concurrent upserts** | Transaction conflict errors | ÉLEVÉE - vu en prod |
| Frontend ↔ MCP write collision | WAL timeout (5s) puis erreur | MOYENNE - si agents actifs |
| Cascade delete sans transaction | Orphaned records | BASSE - rare en pratique |
| Read-modify-write race | Last write wins, data loss | BASSE - single user |
| Multi-instance frontend | Dedup map pas partagée | N/A pour hackathon |

---

## 2. Options architecturales

### Option A: Patches locaux (approche actuelle)

**Principe**: Ajouter des guards ad-hoc là où on observe des problèmes.

```typescript
// Exemple: embed.ts avec inFlightEmbeddings Map
const inFlightEmbeddings = new Map<string, Promise<void>>();

if (inFlightEmbeddings.has(key)) {
  return { skipped: true };
}
```

**Avantages**:
- Implémentation rapide
- Pas de refactoring majeur
- Suffisant pour single-user hackathon

**Inconvénients**:
- Whack-a-mole: chaque nouveau bug = nouveau patch
- Pas de garantie systémique
- Code dupliqué entre frontend/MCP

**Verdict**: ✅ Acceptable pour hackathon si on documente les limitations

---

### Option B: Write Coordinator Service

**Principe**: Un service centralisé qui sérialise TOUTES les écritures.

```typescript
// Hypothétique write-coordinator.ts
class WriteCoordinator {
  private queue = new Map<string, Promise<void>>();

  async write<T>(
    resource: string,  // "profile:123", "goal:456", "vector:profile:123"
    operation: () => Promise<T>
  ): Promise<T> {
    const existing = this.queue.get(resource);
    if (existing) await existing;

    const promise = operation();
    this.queue.set(resource, promise.then(() => {}).catch(() => {}));

    try {
      return await promise;
    } finally {
      this.queue.delete(resource);
    }
  }
}

// Usage
await coordinator.write('profile:123', () => db.execute(sql));
await coordinator.write('vector:profile:123', () => vectorstore.upsert(...));
```

**Avantages**:
- Sérialisation garantie par ressource
- Peut couvrir DuckDB + VectorStore
- Pattern réutilisable

**Inconvénients**:
- Ne fonctionne que intra-process (même limitation)
- Overhead de coordination
- Refactoring de toutes les écritures

**Verdict**: ⚠️ Amélioration marginale, effort significatif

---

### Option C: Database-Level Locking (DuckDB transactions)

**Principe**: Utiliser les transactions DuckDB avec isolation.

```typescript
// DuckDB supporte BEGIN TRANSACTION / COMMIT / ROLLBACK
async function atomicCascadeDelete(profileId: string) {
  await execute('BEGIN TRANSACTION');
  try {
    await execute(`DELETE FROM goals WHERE profile_id = ?`, [profileId]);
    await execute(`DELETE FROM skills WHERE profile_id = ?`, [profileId]);
    await execute(`DELETE FROM profiles WHERE id = ?`, [profileId]);
    await execute('COMMIT');
  } catch (e) {
    await execute('ROLLBACK');
    throw e;
  }
}
```

**Avantages**:
- Garanties ACID natives
- Rollback automatique
- Pas besoin de coordination applicative

**Inconvénients**:
- DuckDB single-writer: une transaction bloque toutes les autres écritures
- Pas de row-level locking (table-level)
- Ne résout pas le multi-process (Frontend ↔ MCP)
- VectorStore (Mastra) n'expose pas les transactions

**Verdict**: ✅ Utile pour cascade deletes, mais limité

---

### Option D: Single Writer Process

**Principe**: UN SEUL process écrit dans DuckDB. Les autres passent par lui.

```
┌─────────────────┐     HTTP/IPC     ┌─────────────────────────┐
│    Frontend     │ ───────────────→ │   Write Service         │
│  (Read-only DB) │                  │   (Single writer)       │
└─────────────────┘                  │   - DuckDB writes       │
                                     │   - VectorStore writes  │
┌─────────────────┐     HTTP/IPC     │                         │
│   MCP Server    │ ───────────────→ │                         │
│  (Read-only DB) │                  └─────────────────────────┘
└─────────────────┘
```

**Avantages**:
- Élimine TOUS les problèmes de concurrence multi-process
- Pattern simple à comprendre
- Peut avoir un write queue interne

**Inconvénients**:
- **Refactoring majeur** (toutes les écritures)
- Latence supplémentaire (IPC)
- Single point of failure
- Complexité déploiement

**Verdict**: ❌ Trop lourd pour hackathon, mais c'est LA solution propre

---

### Option E: Optimistic Locking avec version

**Principe**: Chaque record a une `version`. UPDATE échoue si version a changé.

```sql
-- Schema
ALTER TABLE profiles ADD COLUMN version INTEGER DEFAULT 1;

-- Update avec check
UPDATE profiles
SET name = 'New', version = version + 1
WHERE id = ? AND version = ?;
-- Si rowcount = 0, conflict détecté → retry ou erreur
```

**Avantages**:
- Standard pattern pour concurrence
- Détecte les conflits plutôt que de les ignorer
- Fonctionne avec multi-process

**Inconvénients**:
- Nécessite migration schema
- Code de retry partout
- Ne résout pas VectorStore (pas de version dans Mastra)

**Verdict**: ⚠️ Bon pattern mais effort migration + pas applicable à VectorStore

---

### Option F: Idempotent Operations + Event Sourcing lite

**Principe**: Chaque opération a un `request_id`. Rejeu = no-op.

```typescript
async function idempotentWrite(requestId: string, operation: () => Promise<void>) {
  // Check if already processed
  const exists = await query(`SELECT 1 FROM processed_requests WHERE id = ?`, [requestId]);
  if (exists.length > 0) return { skipped: true };

  await operation();
  await execute(`INSERT INTO processed_requests (id, timestamp) VALUES (?, ?)`,
    [requestId, Date.now()]);
}
```

**Avantages**:
- Permet retry safe
- Auditabilité
- Découple intention d'exécution

**Inconvénients**:
- Overhead stockage (table de requests)
- Nettoyage périodique nécessaire
- Pas applicable au VectorStore facilement

**Verdict**: ⚠️ Overkill pour hackathon, mais intéressant pour prod

---

## 3. Analyse spécifique: Mastra VectorStore

### Le problème fondamental

Mastra `DuckDBVector.upsert()` fait internement:
```sql
DELETE FROM vectors WHERE id = ?;
INSERT INTO vectors (id, embedding, metadata) VALUES (?, ?, ?);
```

Deux appels concurrents pour le même ID:
1. Thread A: DELETE (acquiert lock)
2. Thread B: DELETE (attend lock... ou conflit!)
3. Thread A: INSERT
4. Thread B: INSERT (duplicate key ou conflit)

### Solutions possibles pour VectorStore

#### F1: Deduplication layer (ce qu'on a fait)

```typescript
const inFlight = new Map<string, Promise<void>>();

async function safeUpsert(id: string, data: any) {
  if (inFlight.has(id)) {
    await inFlight.get(id); // Wait for existing
    return; // Skip, existing will have latest data
  }
  const promise = vectorstore.upsert(id, data);
  inFlight.set(id, promise);
  try { await promise; }
  finally { inFlight.delete(id); }
}
```

**Limitation**: Single process only.

#### F2: Debounce at source

```typescript
// profileService.ts - augmenter le delay
const EMBEDDING_DEBOUNCE_MS = 2000; // Au lieu de 500ms

// Ou: ne trigger embedding qu'à des moments précis
// - Après save explicite (bouton)
// - Après navigation away
// - Pas à chaque keystroke
```

**Avantage**: Réduit drastiquement la fréquence de conflits.

#### F3: Queue externe (Redis, BullMQ)

```typescript
// Si on avait Redis...
await embeddingQueue.add('embed-profile', { id, data }, {
  jobId: `profile:${id}`, // Dedupe automatique par jobId
  removeOnComplete: true,
});
```

**Verdict**: Overkill pour hackathon sans Redis.

#### F4: Accept-and-retry

```typescript
async function resilientUpsert(id: string, data: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await vectorstore.upsert(id, data);
      return;
    } catch (e) {
      if (e.message.includes('Conflict') && i < maxRetries - 1) {
        await sleep(100 * (i + 1)); // Backoff
        continue;
      }
      throw e;
    }
  }
}
```

**Avantage**: Simple, robuste pour erreurs transitoires.

---

## 4. Recommandation pour le Hackathon

### Stratégie "Good Enough"

```
┌─────────────────────────────────────────────────────────────────┐
│                    NIVEAU 1: Deduplication                      │
│    - inFlightEmbeddings Map (déjà fait)                        │
│    - Augmenter debounce à 1000-2000ms                          │
│    - Log warnings plutôt que crash                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    NIVEAU 2: Retry avec backoff                 │
│    - Wrapper resilientUpsert pour VectorStore                   │
│    - 3 retries, exponential backoff                             │
│    - Absorbe les conflits transitoires                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    NIVEAU 3: Transactions DuckDB                │
│    - Pour cascade deletes uniquement                            │
│    - BEGIN/COMMIT/ROLLBACK                                      │
│    - Évite orphaned records                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Actions concrètes

| Action | Effort | Impact | Priorité |
|--------|--------|--------|----------|
| ✅ Dedup embedding (fait) | 30min | Élimine 90% des conflits vector | P0 |
| Augmenter debounce 500→1500ms | 5min | Réduit fréquence conflicts | P1 |
| Retry wrapper VectorStore | 30min | Absorbe conflits résiduels | P1 |
| Transactions pour deletes | 1h | Évite orphans (rare) | P2 |
| Logging/monitoring conflicts | 30min | Visibilité problèmes | P2 |

### Ce qu'on accepte de NE PAS faire

- ❌ Single writer architecture (trop de refactoring)
- ❌ Optimistic locking (migration schema)
- ❌ Event sourcing (overkill)
- ❌ Cross-process coordination (complexité)
- ❌ Multi-instance support (pas le use case hackathon)

---

## 5. Code snippets prêts à l'emploi

### Retry wrapper pour VectorStore

```typescript
// packages/mcp-server/src/services/vectorstore.ts

async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; context?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100, context = 'operation' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isConflict = error instanceof Error &&
        error.message.includes('Conflict');

      if (isConflict && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.debug(`${context}: conflict on attempt ${attempt}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable');
}

// Usage
export async function embedProfile(...) {
  return withRetry(
    () => store.upsert({ indexName: 'student_profiles', ... }),
    { context: 'embedProfile' }
  );
}
```

### Transaction wrapper pour DuckDB

```typescript
// packages/frontend/src/routes/api/_db.ts

export async function transaction<T>(
  operations: () => Promise<T>
): Promise<T> {
  await execute('BEGIN TRANSACTION');
  try {
    const result = await operations();
    await execute('COMMIT');
    return result;
  } catch (error) {
    await execute('ROLLBACK');
    throw error;
  }
}

// Usage dans profiles.ts
await transaction(async () => {
  await execute(`DELETE FROM goals WHERE profile_id = ?`, [id]);
  await execute(`DELETE FROM skills WHERE profile_id = ?`, [id]);
  await execute(`DELETE FROM profiles WHERE id = ?`, [id]);
});
```

---

## 6. Risques acceptés (documentation)

Pour le hackathon, on accepte explicitement:

1. **Frontend + MCP concurrent writes**: Peut causer des WAL timeouts si agents très actifs pendant que l'utilisateur sauvegarde. Mitigation: retry + user single.

2. **VectorStore multi-process**: Si MCP et Frontend embedent le même profil simultanément, conflit possible. Mitigation: dedup frontend + retry.

3. **Read-modify-write races**: Si deux requests modifient simulation_state simultanément, last-write-wins. Mitigation: single user, acceptable.

4. **No distributed locking**: On ne supporte pas multiple frontend instances. Mitigation: pas le use case.

---

## 7. Analyse complémentaire (via Perplexity)

### Insights additionnels

#### Read Pool Pattern (non exploité actuellement)

DuckDB supporte **multiple concurrent readers**. Notre code actuel utilise la même connexion pour read et write, ce qui est sous-optimal.

```typescript
// ACTUEL: Une connexion pour tout
const db = await Database.create(path);
await db.all('SELECT ...'); // Bloque si write en cours

// AMÉLIORATION: Séparer read/write
const writer = await Database.create(path);
const readers = await Promise.all([
  Database.create(path, { access_mode: 'READ_ONLY' }),
  Database.create(path, { access_mode: 'READ_ONLY' }),
]);
// Readers ne bloquent NI entre eux NI le writer
```

**Impact**: La majorité de nos opérations sont des reads. Un pool de readers améliore la performance sans complexité.

#### p-queue vs Promise chain

Notre write queue manuelle:
```typescript
// Actuel
let writeQueue = Promise.resolve();
writeQueue = writeQueue.then(() => operation());
```

Avec `p-queue`:
```typescript
import PQueue from 'p-queue';
const queue = new PQueue({ concurrency: 1, timeout: 30000 });
await queue.add(() => operation());
// + timeout, priorité, events, meilleur error handling
```

**Verdict**: p-queue est plus robuste, mais ajoute une dépendance. Pour hackathon, notre Promise chain suffit.

---

## 8. Options architecturales alternatives

### Option G: Database Ownership Separation

Au lieu de coordonner, **clarifier la propriété**:

```
┌─────────────────┐              ┌─────────────────┐
│    Frontend     │              │   MCP Server    │
│  OWNS writes:   │              │  OWNS writes:   │
│  - profiles     │              │  - vectors      │
│  - goals        │              │  - advice       │
│  - trades       │              │  - (rag data)   │
└────────┬────────┘              └────────┬────────┘
         │                                │
         ▼                                ▼
   stride.duckdb                 stride-vectors.duckdb
```

**Avantages**:
- ✅ Pas de coordination inter-process
- ✅ Chaque DB a UN seul writer
- ✅ Clear separation of concerns
- ✅ Pas de refactoring lourd

**C'est déjà partiellement le cas!** On a 2 DBs séparées. Le problème c'est que:
- Frontend appelle `/api/embed` qui écrit dans vectors
- MCP tools peuvent aussi écrire dans vectors

**Solution**: Faire en sorte que SEUL MCP écrive dans vectors.

### Option H: Lazy/Batched Embedding

Au lieu d'embedder à chaque profile save:

```typescript
// ACTUEL: Embedding immédiat (500ms debounce)
setTimeout(() => triggerEmbedding(profile), 500);

// ALTERNATIVE: Embedding différé
// 1. Marquer le profile comme "needs_embedding"
// 2. Batch job toutes les 30s qui embed tous les pending
// 3. Ou: embed seulement quand RAG est appelé (lazy)
```

**Avantages**:
- ✅ Élimine 99% des conflits (plus de concurrence)
- ✅ Réduit charge serveur
- ✅ Embeddings "eventually consistent" (OK pour demo)

**Implémentation**:
```typescript
// Option lazy: embed on-demand
async function getRAGContext(profileId: string) {
  // Check if embedding exists and is fresh
  const embedding = await vectorstore.get(profileId);
  if (!embedding || embedding.stale) {
    await indexStudentProfile(profileId, profile);
  }
  return vectorstore.search(...);
}
```

### Option I: Unified Coordinator (si on veut être propre)

Inspiré de Perplexity, un coordinator partagé:

```typescript
// packages/shared/db-coordinator.ts
import PQueue from 'p-queue';

class DBCoordinator {
  private writeQueue = new PQueue({ concurrency: 1 });
  private writer: Database;
  private readers: Database[];

  async write(query: string, params?: any[]) {
    return this.writeQueue.add(() => this.writer.run(query, params));
  }

  async read(query: string, params?: any[]) {
    const reader = this.readers[Math.floor(Math.random() * this.readers.length)];
    return reader.all(query, params);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.writeQueue.add(async () => {
      await this.writer.run('BEGIN');
      try {
        const result = await fn();
        await this.writer.run('COMMIT');
        return result;
      } catch (e) {
        await this.writer.run('ROLLBACK');
        throw e;
      }
    });
  }
}
```

**Limite**: Ne résout pas le multi-process. Le coordinator est par-process.

---

## 9. Recommandation finale révisée

### Pour le Hackathon: Approche "Good Enough" v2

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 0: Ownership Clarity (déjà en place)                   │
│  - Frontend → stride.duckdb (profiles, goals)                  │
│  - MCP → stride-vectors.duckdb (embeddings)                    │
│  - MAIS: Frontend appelle /api/embed qui écrit dans vectors    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 1: Deduplication (fait)                                │
│  - inFlightEmbeddings Map dans /api/embed                      │
│  - Skip les requêtes dupliquées                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 2: Debounce agressif (à faire)                         │
│  - Passer de 500ms à 2000ms                                    │
│  - Réduit drastiquement la fréquence                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 3: Retry avec backoff (à faire)                        │
│  - Wrapper vectorstore.upsert avec retry                       │
│  - 3 retries, exponential backoff                              │
│  - Absorbe les conflits résiduels                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 4: Silent failure for non-critical (à considérer)      │
│  - Embedding failures → log warning, continue                  │
│  - Ne pas crasher pour du RAG optionnel                        │
└─────────────────────────────────────────────────────────────────┘
```

### Actions concrètes mises à jour

| Action | Effort | Impact | Status |
|--------|--------|--------|--------|
| ✅ Dedup embedding | 30min | Élimine 90% conflits | FAIT |
| ✅ Debounce 500→2000ms | 5min | Réduit fréquence | FAIT |
| ✅ Retry wrapper vectorstore | 30min | Absorbe résiduels | FAIT |
| Silent failure embedding | 10min | Robustesse | OPTIONNEL |
| Read pool (optionnel) | 1h | Performance reads | POST-HACKATHON |
| p-queue (optionnel) | 30min | Robustesse queue | POST-HACKATHON |

### Fichiers modifiés

1. **`packages/frontend/src/routes/api/embed.ts`** - Deduplication avec `inFlightEmbeddings` Map
2. **`packages/frontend/src/lib/profileService.ts`** - `SAVE_DEBOUNCE_MS` = 2000
3. **`packages/mcp-server/src/services/vectorstore.ts`** - `withRetry()` wrapper avec exponential backoff

### Trade-off accepté

Pour le hackathon single-user:
- ✅ Dedup + Debounce + Retry = suffisant
- ❌ Pas de coordination multi-process parfaite
- ❌ Pas de transactions ACID partout
- ✅ Embedding failures = warning, pas crash

---

## 10. Pour aller plus loin (post-hackathon)

Si Stride devient un produit:

1. **Option cloud**: MotherDuck (concurrent writes natifs)
2. **Option self-hosted**: PostgreSQL + pgvector
3. **Option queue**: BullMQ + Redis pour embeddings async
4. **Option architecture**: Single writer service avec IPC

Le choix dépendra du scale et des contraintes ops.

---

## Références

- [DuckDB Concurrency](https://duckdb.org/docs/connect/concurrency)
- [Mastra Vector Store](https://mastra.ai/docs/rag/vector-databases)
- [WAL Mode](https://duckdb.org/docs/sql/pragmas#wal_autocheckpoint)
- [MotherDuck Multi-threading](https://motherduck.com/docs/key-tasks/authenticating-and-connecting-to-motherduck/multithreading-and-parallelism/)
- [p-queue](https://github.com/sindresorhus/p-queue)
