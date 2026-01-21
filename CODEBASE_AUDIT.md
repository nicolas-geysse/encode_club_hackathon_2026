# Codebase Audit & Roadmap to Victory

> **Status**: B+ → A-. Foundation excellent, Opik integration needs completion for maximum impact.

---

## 1. Executive Summary

Le codebase `Stride` est exceptionnellement propre pour un hackathon.

**Forces**:
- ✅ Architecture cohérente (SolidStart + Mastra + DuckDB + Opik)
- ✅ 4 killer features implémentées (Skill Arbitrage, Swipe, Comeback, Energy Debt)
- ✅ 114+ tests algorithms avec couverture complète
- ✅ Opik traces sur tous les tools Mastra
- ✅ Demo script fonctionnel (`pnpm demo:opik`)
- ✅ Guardian hybridEvaluation = LLM-as-Judge showcase

**Gaps identifiés**:
- 🔴 Swipe Preferences: 0% Opik tracing (interactions utilisateur invisibles)
- 🔴 RAG System: 90% implémenté, 0% connecté aux agents
- 🟡 User Feedback: Pas de thumbs up/down → opik.logFeedback()

---

## 2. Deep Dive Findings

### ✅ Backend (Mastra Agents)
| Agent | LOC | Status | Opik Traced |
|-------|-----|--------|-------------|
| budget-coach | 336 | ✅ Active | ✅ 100% |
| job-matcher | 566 | ✅ Active | ✅ 100% |
| strategy-comparator | 596 | ✅ Active | ✅ 100% |
| guardian | 475 | ✅ Active | ✅ 100% |
| onboarding | 455 | ✅ Active | ✅ 100% |
| money-maker | 709 | ✅ Active | ✅ 100% |
| projection-ml | 251 | ⚠️ Orphelin | - |

**Finding**: `projection-ml` défini mais jamais instancié. Le workflow utilise des fonctions inline.

### ✅ Algorithms (100% Tested)
- `skill-arbitrage.ts` - 471 tests, dinero.js precision
- `comeback-detection.ts` - 434 tests, gamification
- `energy-debt.ts` - 496 tests, severity levels

### ⚠️ RAG System (90% Complete, 0% Wired)
**Fichiers existants**:
- `embeddings.ts` - BGE-M3 model (1024 dims) via @xenova/transformers
- `vectorstore.ts` - @mastra/duckdb avec HNSW indexing
- `rag.ts` + `rag-tools.ts` - 6 tools définis avec Opik tracing

**Gap**: `RAG_TOOLS` importé mais jamais appelé par les agents.

### ❌ Swipe Tracing (0% Coverage)
- `SwipeTab.tsx` et `SwipeSession.tsx` fonctionnent
- Preference learning via `adjustWeights()` fonctionne
- **Aucun span Opik** pour les interactions swipe

---

## 3. Roadmap Priorisée

### 🔴 TIER 1: MUST DO (Impact Opik Maximum) - 35 min

#### 1.1 Swipe Preference Tracing (15 min)
**Fichier**: `packages/frontend/src/components/tabs/SwipeTab.tsx`

```typescript
import { trace } from '~/lib/opik';

const handleSwipe = async (direction: 'left' | 'right') => {
  await trace('swipe_preference_update', async (span) => {
    span.setAttributes({
      'swipe.scenario_id': selectedScenario.id,
      'swipe.direction': direction,
      'swipe.scenario_type': selectedScenario.type,
      'swipe.old_weights': JSON.stringify(preferences),
      'swipe.new_weights': JSON.stringify(updatedPrefs)
    });
    return updatePreferences(...);
  });
};
```

**Impact**: Chaque swipe visible dans Opik = "user behavior tracking"

#### 1.2 Thumbs Up/Down Feedback (20 min)
**Fichier**: `packages/frontend/src/components/Chat.tsx`

```typescript
import { logFeedback } from '~/lib/opik';

// Après réponse LLM
<div class="flex gap-2 mt-2">
  <button
    onClick={() => logFeedback(message.traceId, 1, 'helpful')}
    class="text-green-500 hover:text-green-700"
  >👍</button>
  <button
    onClick={() => logFeedback(message.traceId, 0, 'not_helpful')}
    class="text-red-500 hover:text-red-700"
  >👎</button>
</div>
```

**Impact**: Human-in-the-loop = argument massue pour prix Opik

### 🟡 TIER 2: SHOULD DO (Feature Différenciante) - 30 min

#### 2.1 RAG Integration
**Fichiers**:
- `packages/frontend/src/routes/api/profiles.ts`
- `packages/mcp-server/src/agents/budget-coach.ts`

**Action 1**: Auto-indexer profils à création
```typescript
// profiles.ts - après création profil
import { indexStudentProfile } from '../../../mcp-server/src/tools/rag';
indexStudentProfile(profileId, profileData).catch(console.error);
```

**Action 2**: RAG dans budget-coach
```typescript
// budget-coach.ts - dans generateAdvice tool
import { getRAGContext } from '../tools/rag';

const ragContext = await getRAGContext({
  queryText: `${profile.diploma} ${profile.skills?.join(' ')}`,
  maxProfiles: 3,
  maxAdvice: 5
});

// Enrichir system prompt
const enrichedPrompt = `${systemPrompt}\n\nContexte similaire:\n${ragContext.formattedContext}`;
```

**Impact**: "On utilise des embeddings pour trouver des étudiants similaires"

### 🟢 TIER 3: NICE TO HAVE (Polish) - 50 min

#### 3.1 Demo Seed Data (20 min)
**Fichier**: `scripts/demo-seed-data.ts`

5 profils pour demo consistante:
- Marie (Comeback): energy [30,35,85], déficit 500€
- Lucas (Energy Debt): 5 semaines <40%
- Emma (Équilibrée): margin +200€
- Théo (Multi-skills): 4 skills variés
- Léa (Onboarding): nouveau profil

#### 3.2 Micro-interactions (30 min)
- Confetti sur achievement unlock (canvas-confetti)
- Son "ka-ching" sur goal saved
- Skeleton loaders au lieu de spinners

---

## 4. Ce qu'on NE FAIT PAS

| Item | Raison |
|------|--------|
| TabPFN/ML burnout | Energy Debt couvre déjà |
| Console→Logger (183x) | Invisible en demo |
| SQL files extraction | Tech debt, pas d'impact |
| Shared types package | Refactoring |
| E2E Playwright tests | Tests algo suffisent |
| SessionManager DuckDB | Overkill pour demo |

---

## 5. Vérification

```bash
# Test TIER 1
pnpm dev
# 1. /plan → Trade tab → Swiper → Opik: "swipe_preference_update"
# 2. / → Chat → 👍/👎 → Opik: feedback logged

# Test TIER 2
# Créer profil → budget-coach → Opik: "rag.getContext"

# Dashboard
https://www.comet.com/opik/nickoolas/projects/019bc76e-527e-768c-89e9-51dc169d6dfd/traces
```

---

## 6. Demo Script Rappel

```bash
pnpm demo:opik              # Full demo (traces + evaluators + queues)
pnpm demo:opik --setup-only # Setup seulement
pnpm demo:opik --traces-only # Traces seulement
```
