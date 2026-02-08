# DuckDB Integration Guide

DuckDB est utilisé comme base de données embarquée pour Stride. Deux implémentations coexistent :

| Implémentation | Fichier | Environnement |
|----------------|---------|---------------|
| **Frontend** | `packages/frontend/src/routes/api/_db.ts` | Vite SSR |
| **MCP Server** | `packages/mcp-server/src/services/duckdb.ts` | Node.js pur |

---

## Pièges Critiques

### 1. Constructeur Database ASYNCHRONE

Le constructeur `duckdb.Database()` est **asynchrone** même si la syntaxe est synchrone.

```typescript
// ❌ WRONG - Ne fonctionne PAS :
const db = new duckdb.Database(path);
const conn = db.connect(); // CRASH! db pas encore prêt!
conn.all('SELECT 1', callback); // Connection undefined
```

```typescript
// ✅ CORRECT - Utiliser le callback :
const db = new duckdb.Database(path, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    return;
  }
  // Maintenant le DB est prêt
  const conn = db.connect();
  conn.all('SELECT 1', (err, result) => {
    console.log('Success:', result);
  });
});
```

**Pattern complet avec Promise :**

```typescript
function openDatabase(path: string): Promise<duckdb.Database> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(path, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

// Usage
const db = await openDatabase('./data/stride.duckdb');
const conn = db.connect(); // OK maintenant
```

---

### 2. Import natif en Vite SSR

Vite SSR transforme les imports ESM de manière incompatible avec les modules natifs Node.js (`.node` bindings).

```typescript
// ❌ WRONG - Échoue en Vite SSR :
import * as duckdb from 'duckdb'; // Error: Cannot find module
```

```typescript
// ✅ CORRECT - Utiliser createRequire :
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const duckdb = require('duckdb');

// Ou utiliser le helper Stride :
import { duckdb } from '../../lib/nativeModule';
```

**Fichiers concernés :**
- `src/lib/nativeModule.ts` - Helper générique
- `src/types/duckdb.d.ts` - Types locaux
- `app.config.ts` - Configuration `ssr.external: ['duckdb']`

---

### 3. Singleton avec globalThis pour HMR

Vite HMR (Hot Module Reload) réinitialise les variables de module à chaque changement de fichier.

```typescript
// ❌ WRONG - État perdu à chaque HMR :
let db = null; // Réinitialisé à chaque reload Vite
let conn = null;

export function getConnection() {
  if (!conn) {
    db = new duckdb.Database(path, callback);
    // Nouveau DB à chaque HMR = connexions orphelines!
  }
  return conn;
}
```

```typescript
// ✅ CORRECT - Persiste via globalThis :
const GLOBAL_KEY = '__stride_duckdb__';

interface DuckDBState {
  db: duckdb.Database | null;
  conn: duckdb.Connection | null;
  initialized: boolean;
}

function getGlobalState(): DuckDBState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      db: null,
      conn: null,
      initialized: false,
    };
    console.log('[DuckDB] Created new global state');
  }
  return g[GLOBAL_KEY] as DuckDBState;
}

export function getConnection() {
  const state = getGlobalState();
  // state persiste même après HMR
}
```

**Indicateur de debug :**
- `"Created new global state"` doit apparaître **une seule fois** au démarrage
- Si ce message apparaît plusieurs fois = problème de singleton

---

### 4. Guard synchrone contre race condition

Les appels concurrents à `initDatabase()` peuvent créer plusieurs connexions.

```typescript
// ❌ WRONG - Race condition possible :
async function initDatabase() {
  if (!state.initPromise) {
    // Deux appels simultanés peuvent passer ici!
    state.initPromise = openDatabase();
  }
  return state.initPromise;
}
```

```typescript
// ✅ CORRECT - Flag synchrone AVANT tout await :
async function initDatabase() {
  const state = getGlobalState();

  // Fast path: déjà initialisé
  if (state.initialized && state.conn) {
    return;
  }

  // Si promise existe, attendre
  if (state.initPromise) {
    return state.initPromise;
  }

  // Guard SYNCHRONE: si quelqu'un initialise, attendre et retry
  if (state.initializing) {
    await new Promise((r) => setTimeout(r, 50));
    return initDatabase(); // Retry
  }

  // Set guard IMMÉDIATEMENT (avant any await!)
  state.initializing = true;

  state.initPromise = openDatabaseInternal()
    .finally(() => {
      state.initializing = false;
    });

  return state.initPromise;
}
```

**Clé :** Le flag `initializing` est set **avant** tout `await` pour bloquer les appels concurrents.

---

### 5. Résolution de chemin

`process.cwd()` peut pointer vers différents répertoires selon le contexte Vite.

```typescript
// ❌ WRONG - process.cwd() peu fiable en SSR :
const DB_PATH = path.join(process.cwd(), 'data/db.duckdb');
// Peut pointer vers packages/frontend au lieu de la racine projet
```

```typescript
// ✅ CORRECT - Normaliser vers racine projet :
function getProjectRoot(): string {
  const cwd = process.cwd();
  // Si on est dans packages/frontend, remonter
  if (cwd.includes('packages/frontend') || cwd.endsWith('frontend')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const DB_PATH = process.env.DUCKDB_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DUCKDB_PATH)
  : path.join(PROJECT_ROOT, 'data', 'stride.duckdb');
```

---

### 6. BigInt et JSON.stringify

DuckDB retourne des `BigInt` pour `COUNT(*)`, `SUM()`, etc. Or `JSON.stringify()` ne sait pas sérialiser les BigInt.

```typescript
// ❌ WRONG - Crash "Do not know how to serialize a BigInt" :
const countResult = await query<{ count: number }>(
  `SELECT COUNT(*) as count FROM skills`
);
return JSON.stringify({ count: countResult[0].count }); // CRASH!
```

```typescript
// ✅ CORRECT - Convertir en Number :
const countResult = await query<{ count: bigint }>(
  `SELECT COUNT(*) as count FROM skills`
);
const count = Number(countResult[0]?.count || 0);
return JSON.stringify({ count }); // OK
```

**Fonctions concernées :** `COUNT(*)`, `SUM()`, `MAX()`, `MIN()` avec colonnes INTEGER/BIGINT.

---

## Debugging Checklist

### Erreur: "Connection was never established"

1. ✅ Utilisez-vous le callback du constructeur Database?
2. ✅ Attendez-vous le callback avant d'appeler connect()?
3. ✅ Le chemin de la DB est-il accessible?

### Erreur: "Could not set lock on file"

```bash
# Solution 1: Tuer les processus node orphelins
pkill -f node

# Solution 2: Supprimer les fichiers lock
rm data/*.wal data/*.lock data/*.app.lock

# Solution 3: Vérifier qu'un seul serveur tourne
lsof +D data/
```

### Erreur: "Opening database" apparaît plusieurs fois

1. ✅ Race condition - vérifiez le guard synchrone `initializing`
2. ✅ Cherchez "Created new global state" - devrait apparaître 1 seule fois
3. ✅ Vérifiez que le GLOBAL_KEY est unique

### Erreur: "Module not found" / ESM issues

1. ✅ Utilisez `createRequire`, pas import direct
2. ✅ Vérifiez `app.config.ts`: `ssr.external: ['duckdb']`
3. ✅ Les types sont dans `src/types/duckdb.d.ts` (pas d'import du package)

### Erreur: "Do not know how to serialize a BigInt"

1. ✅ Utilisez-vous `COUNT(*)`, `SUM()`, ou autre agrégation?
2. ✅ Convertissez avec `Number()` avant `JSON.stringify()`
3. ✅ Typez correctement: `query<{ count: bigint }>` pas `number`

---

## Architecture

### Write Queue (prévention lock WAL)

DuckDB utilise WAL (Write-Ahead Logging) qui peut causer des conflits si plusieurs écritures sont concurrentes.

```typescript
// Toutes les écritures passent par une queue
let writeQueue: Promise<void> = Promise.resolve();

export async function execute(sql: string): Promise<void> {
  const state = getGlobalState();

  // Chaîner l'opération à la queue
  const operation = state.writeQueue.then(async () => {
    const conn = await getConnection();
    return new Promise<void>((resolve, reject) => {
      conn.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Update queue (ne pas casser la chaîne sur erreur)
  state.writeQueue = operation.catch(() => {});

  return operation;
}
```

**Résultat :** Les écritures sont sérialisées, évitant les "WAL lock" errors.

### Retry avec backoff exponentiel (MCP Server)

```typescript
async function executeWithRetry(sql: string, retries = 3, delay = 100): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await executeInternal(sql);
      return; // Success
    } catch (err) {
      const isLockError = err.message?.includes('lock');

      if (isLockError && attempt < retries) {
        console.error(`Lock conflict, retry ${attempt}/${retries} in ${delay}ms`);
        await sleep(delay);
        delay *= 2; // Backoff exponentiel
      } else {
        throw err;
      }
    }
  }
}
```

### Application-level Lock (MCP Server)

Le MCP Server utilise un fichier lock pour empêcher plusieurs instances.

```typescript
const LOCK_PATH = `${DB_PATH}.app.lock`;

function checkAndAcquireLock(): boolean {
  if (fs.existsSync(LOCK_PATH)) {
    const lockedPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf-8'), 10);

    try {
      process.kill(lockedPid, 0); // Check si processus existe
      return false; // Bloqué par autre processus
    } catch {
      // Processus mort, lock stale
    }
  }

  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}
```

---

## Fichiers Clés

| Fichier | Rôle |
|---------|------|
| `packages/frontend/src/routes/api/_db.ts` | Singleton frontend, HMR-safe |
| `packages/mcp-server/src/services/duckdb.ts` | Singleton MCP, lock fichier |
| `packages/frontend/src/lib/nativeModule.ts` | Chargement module natif via createRequire |
| `packages/frontend/src/types/duckdb.d.ts` | Types locaux (évite conflits d'import) |
| `packages/frontend/app.config.ts` | Config Vite: `ssr.external` |
| `data/stride.duckdb` | Fichier base de données |

---

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DUCKDB_PATH` | Chemin complet vers le fichier DB | `data/stride.duckdb` |
| `DUCKDB_DIR` | Répertoire contenant la DB | `data/` |

---

## Schema Principal

La base de données contient :

### Tables Core
- `profiles` - Profils utilisateur avec données financières
- `goals` - Objectifs financiers
- `goal_progress` - Suivi hebdomadaire des objectifs
- `goal_actions` - Actions individuelles du plan

### Tables Retroplanning
- `academic_events` - Examens, vacances, stages
- `commitments` - Engagements récurrents (cours, sport)
- `energy_logs` - Suivi énergie/humeur quotidien
- `retroplans` - Plans générés avec capacité

### Tables Knowledge Graph
- `student_nodes` - Noeuds (skills, jobs, strategies)
- `student_edges` - Relations (enables, requires, co_benefit)

### Tables Simulation
- `simulation_state` - État de simulation temporelle
- `projections` - Projections financières
- `job_recommendations` - Historique des recommandations

---

## Exemple d'Utilisation

```typescript
// packages/frontend/src/routes/api/example.ts
import { query, execute, escapeSQL } from './_db';

// Lecture
const profiles = await query<{ id: string; name: string }>(
  `SELECT id, name FROM profiles WHERE is_active = true`
);

// Écriture (automatiquement sérialisée)
await execute(`
  UPDATE profiles
  SET name = ${escapeSQL(newName)},
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ${escapeSQL(profileId)}
`);

// Écriture avec retour (RETURNING)
import { queryWrite } from './_db';
const [inserted] = await queryWrite<{ id: string }>(
  `INSERT INTO goals (id, profile_id, name, amount, deadline)
   VALUES (${escapeSQL(id)}, ${escapeSQL(profileId)}, ${escapeSQL(name)}, ${amount}, ${escapeSQL(deadline)})
   RETURNING id`
);
```

---

## Différences Frontend vs MCP Server

| Aspect | Frontend (`_db.ts`) | MCP Server (`duckdb.ts`) |
|--------|---------------------|--------------------------|
| Import | `createRequire` helper | `import * as duckdb` direct |
| Singleton | `globalThis` (HMR-safe) | Module-level variables |
| Lock | Pas de lock fichier | Fichier `.app.lock` |
| Init | Callback + Promise | Sync (fonctionne en Node.js pur) |
| Retry | Non | Oui, avec backoff |
| Schema | Minimal | Complet avec DuckPGQ |

**Note :** Le MCP Server utilise `new duckdb.Database(path)` sans callback, ce qui fonctionne en Node.js pur car DuckDB synchronise l'initialisation. En Vite SSR, le callback est requis à cause du contexte d'exécution différent.

---

## Extensions

### DuckPGQ (Graph Queries)

Activé uniquement dans le MCP Server pour les requêtes de graphe :

```sql
-- Installation (une fois)
INSTALL duckpgq FROM community;
LOAD duckpgq;

-- Création du property graph
CREATE PROPERTY GRAPH student_graph
VERTEX TABLES (student_nodes)
EDGE TABLES (
  student_edges
    SOURCE KEY (source_id) REFERENCES student_nodes (id)
    DESTINATION KEY (target_id) REFERENCES student_nodes (id)
);

-- Requête de chemin
SELECT * FROM GRAPH_TABLE(student_graph
  MATCH (a:student_nodes)-[e:student_edges]->(b:student_nodes)
  WHERE a.id = 'python'
  COLUMNS (a.id as skill, b.id as job, e.edge_type)
);
```

---

### 7. Protection WAL et Checkpoints

DuckDB utilise un WAL (Write-Ahead Log) qui peut causer des corruptions si le serveur crash avant un checkpoint.

**Protections implémentées :**

1. **Seuil auto-checkpoint à 1 Mo** (au lieu de 16 Mo par défaut)
   ```sql
   SET checkpoint_threshold = '1MB';
   ```

2. **CHECKPOINT après schema changes**
   ```typescript
   // Utiliser executeSchema() au lieu de execute() pour CREATE/ALTER/DROP TABLE
   await executeSchema(`CREATE TABLE IF NOT EXISTS ...`);
   ```

3. **Graceful shutdown hooks**
   - SIGTERM et SIGINT déclenchent un CHECKPOINT avant fermeture
   - Protège les arrêts propres (Ctrl+C, docker stop, etc.)

**En cas de corruption WAL :**
```bash
# Supprimer le WAL corrompu (les données non-checkpointées seront perdues)
rm data/stride.duckdb.wal
```

**API disponible dans `_db.ts` :**

| Fonction | Usage |
|----------|-------|
| `execute(sql)` | Écritures normales (INSERT, UPDATE, DELETE) |
| `executeSchema(sql)` | Schema changes (CREATE, ALTER, DROP TABLE) |
| `query(sql)` | Lectures |
| `queryWrite(sql)` | Écritures avec RETURNING |
