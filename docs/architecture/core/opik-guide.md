# Guide Opik : Audit, Consolidation & Usage Optimal

**Objectif** : Garantir que chaque interaction utilisateur génère une trace riche, auditable et exploitable pour l'apprentissage.

---

## 1. Philosophie : "If it's not traced, it didn't happen"

Dans Stride, Opik n'est pas juste un logger passif. C'est le **cerveau** qui mémorise les décisions.
Si une trace manque ou est incomplète, l'apprentissage (Swipe Preferences, Energy Debt) échoue silencieusement.

### Le Cycle de Vie d'une Trace Parfaite

1.  **Contexte** : Qui fait quoi ? (User ID, Thread ID)
2.  **Action** : L'input complet (Prompt, paramètres)
3.  **Exécution** : Le travail réel, chronométré et segmenté (Spans)
4.  **Résultat** : L'output structuré (JSON, réponse textuelle)
5.  **Audit** : Feedback explicite (Score, succès/échec)

---

## 2. Consolider les Envois (Methodologie)

Pour être "certain que ce qui est envoyé est ensuite audité", il faut suivre ce pattern strict, surtout pour les Server Functions ou API Routes.

### 🔴 Le Pattern "Fire-and-Forget" Sécurisé

Jusqu'à présent, nous faisions souvent :
```typescript
// ❌ Risqué : Si ça échoue, on ne le sait jamais
trace(...).catch(() => {});
```

### ✅ Le Pattern "Audit-Loop"

Il faut capturer le `traceId` généré et le renvoyer au client pour fermer la boucle d'audit.

**Côté Serveur (API Route) :**
```typescript
// Retourner toujours l'identité de la trace
const traceData = await trace('swipe.decision', async (span) => {
  // ... logique ...
  return { result: 'ok' };
});

return {
  success: true,
  traceId: trace.getTraceId(), // Crucial pour l'audit
  traceUrl: trace.getTraceUrl()
};
```

**Côté Client (Frontend) :**
```typescript
const response = await fetch('/api/swipe-trace', ...);
const logs = await response.json();

if (logs.traceId) {
  // ✅ LOG DE SUCCÈS : On a la preuve que Opik a reçu la donnée à cet ID
  console.debug(`[Audit] Trace enregistrée : ${logs.traceUrl}`);
  // Optionnel : Afficher un "toast" de debug en mode DEV
} else {
  // ⚠️ ALERTE : Le serveur a répondu, mais sans Trace ID
  console.warn(`[Audit] Trace perdue ou non-générée !`);
}
```

---

## 3. Checklist de Validation "Anti-Vibe Coding"

Avant de considérer une feature comme "terminée", vérifiez ces 5 points dans le dashboard Opik :

### 1. La Hiérarchie est-elle lisible ?
*   **Mauvais** : Une seule trace plate `trace_swipe` qui dure 500ms.
*   **Bon** :
    *   Trace `swipe_session` (Parent)
    *   Span `calculate_score` (100ms)
    *   Span `update_db` (50ms)
    *   Span `llm_analysis` (350ms)

### 2. Les Inputs/Outputs sont-ils exacts ?
Ne jamais mettre de gros objets JSON dans `metadata`. Utilisez :
*   `span.setInput({ ... })`
*   `span.setOutput({ ... })`
*   **Check** : Dans l'UI Opik, les onglets "Input" et "Output" doivent être peuplés proprement, pas vides.

### 3. Les Coûts sont-ils réels ?
Les spans de type `llm` doivent avoir :
*   `usage`: `{ prompt_tokens: 120, completion_tokens: 40 }`
*   `totalEstimatedCost`: `$0.004` (Calculé via le helper `calculateCost`)
*   **Test** : Si le coût est à $0.00, c'est buggé.

### 4. Le Threading fonctionne-t-il ?
Pour un chat (Onboarding, BrunoTips) :
*   Toutes les bulles de la même conversation doivent partager le même `thread_id`.
*   **Test** : Cliquer sur une trace → Voir "View Thread". Si le bouton est absent ou montre une seule trace, le threading est cassé.

### 5. Y a-t-il un "Feedback Loop" ?
Pour les features d'apprentissage (Swipe) :
*   La trace doit contenir l'état **AVANT** et l'état **APRÈS**.
*   Exemple : `old_weights` vs `new_weights`.
*   Sans ça, impossible de debugger pourquoi l'algorithme a divergé.

---

## 3b. PII Sanitization (FERPA/GDPR)

Le MCP Server sanitize automatiquement les donnees de localisation dans les traces Opik pour la conformite FERPA/GDPR.

**Champs sanitizes** (`packages/mcp-server/src/services/opik.ts`) :
- `latitude`, `longitude`, `lat`, `lon`, `coords`, `coordinates`
- Remplace par `[LOCATION_REDACTED]`
- S'applique recursivement aux objets imbriques

```typescript
// Exemple: Les donnees de localisation sont automatiquement masquees
// Input trace: { latitude: 48.8566, longitude: 2.3522 }
// Stored trace: { latitude: '[LOCATION_REDACTED]', longitude: '[LOCATION_REDACTED]' }
```

**Important** : Cette sanitization est transparente. Les traces Opik n'affichent jamais de coordonnees GPS reelles.

---

## 4. Debugging : "Pourquoi ma trace est vide ?"

Si vous voyez une trace brisée (durée 0ms, pas de spans enfants), voici les coupables habituels :

1.  **Await manquant** :
    ```typescript
    // ❌ La fonction parente finit avant l'enfant
    ctx.createChildSpan('child', async (s) => { ... });

    // ✅ Toujours await
    await ctx.createChildSpan('child', async (s) => { ... });
    ```

2.  **Output après End** :
    ```typescript
    // ❌ Trop tard
    span.end();
    span.setOutput({...});

    // ✅ Avant
    span.setOutput({...});
    span.end();
    ```

3.  **Swallowed Errors** :
    Si votre code fait `try { ... } catch (e) { return null }`, la trace pensera que tout va bien.
    **Solution** : Dans le catch, faites toujours `span.setAttributes({ error: e.message })`.

---

## 5. Outils de Développement Intégrés

Deux outils sont disponibles dans `frontend/src/lib/opik.ts` pour vous aider :

1.  `getTraceUrl()` : Génère l'URL directe vers la trace courante. À logger systématiquement en dev.
2.  `logFeedbackScores()` : Permet d'attacher un score explicite à une trace *a posteriori*.

**Astuce Dev** :
Ajoutez `DEBUG=opik:*` dans vos variables d'environnement locales pour voir passer chaque création de span dans la console.

---

## 6. Statut de l'Implémentation Audit-Loop

### ✅ Pattern Audit-Loop Consolidé (Janvier 2026)

Le pattern "Audit-Loop" est maintenant implémenté sur toutes les routes API et composants :

**Côté Serveur (API Routes) :**

| Route | Retourne `traceId` | Retourne `traceUrl` |
|-------|-------------------|---------------------|
| `/api/chat.ts` | ✅ | ✅ |
| `/api/tips.ts` | ✅ | ✅ |
| `/api/swipe-trace.ts` | ✅ | ✅ |
| `/api/budget.ts` | ✅ | ✅ |

**Helper disponible dans `frontend/src/lib/opik.ts` :**

```typescript
import { createAuditInfo, type AuditInfo } from '../../lib/opik';

// Dans une trace, inclure l'audit info dans la réponse :
const result = await trace('my.operation', async (ctx) => {
  // ... logique ...
  return { data: myData, ...createAuditInfo(ctx) };
});
```

**Côté Client (Composants) :**

| Composant | Log Audit | Feedback avec `traceId` |
|-----------|-----------|-------------------------|
| `SwipeSession.tsx` | ✅ `console.debug` | N/A |
| `OnboardingChat.tsx` | ✅ stocke dans messages | ✅ via `ChatMessage` |
| `ChatMessage.tsx` | ✅ affiche lien | ✅ thumbs up/down |
| `BrunoTips.tsx` | ✅ callback | ✅ thumbs up/down |

**Résultat** : Chaque interaction utilisateur génère une trace vérifiable et auditable.
