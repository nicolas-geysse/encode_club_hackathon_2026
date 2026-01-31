# Sprint Graphiques - Implementation Complete

**Last Updated:** 2026-01-31
**Status:** ✅ Complete

## Problem Solved

Bruno now responds to chart requests with actual visualizations instead of text-only responses.

**Before:**
```
User: "tu aurais un graphique ?"
Bruno: "I don't have a chart I can show directly here..."
```

**After:**
```
User: "tu aurais un graphique ?"
Bruno: [Shows chart gallery with 4 clickable buttons]
```

## Implemented Features

### 1. Chart Gallery (Intent: `show_chart_gallery`)

When users ask for charts, Bruno shows a 2-column grid of available chart types:
- Budget Overview (income vs expenses vs savings)
- Savings Progress (timeline towards goal)
- Goal Projection (when you'll reach target)
- Energy Timeline (energy levels over time)

**Trigger patterns (FR/EN):**
- "Quels graphiques as-tu?"
- "Montre-moi des graphiques"
- "What charts can you show?"
- "Tu aurais un graphique?"

### 2. Specific Chart Types

#### Budget Breakdown (`show_budget_chart`)
- Bar chart: Income, Expenses, Savings
- Triggers: "montre mon budget en graphique", "budget chart"

#### Savings Progress (`show_progress_chart`)
- Line chart with goal line
- Triggers: "montre ma progression", "savings progress"

#### Goal Projection (`show_projection_chart`)
- Comparison bar chart (current vs scenario)
- Triggers: "montre mes projections", "goal projection"

#### Energy Timeline (`show_energy_chart`)
- Line chart with threshold lines (40% low, 80% recovery)
- Triggers: "montre mon énergie", "energy timeline"

### 3. Gallery Click Flow

1. User clicks a chart button in the gallery
2. `OnboardingChat` handles `show_chart` action
3. Sends synthetic message to chat API
4. Chart appears as new assistant message

## Files Modified

| File | Changes |
|------|---------|
| `lib/chat/intent/detector.ts` | Added chart intent patterns (FR/EN) |
| `lib/chatChartBuilder.ts` | Added `buildChartGallery()`, `buildEnergyChart()`, `AVAILABLE_CHARTS` |
| `types/chat.ts` | Added `ChartType`, `ActionParams` types |
| `routes/api/chat.ts` | Added handlers for all chart intents |
| `routes/api/energy-logs.ts` | **NEW** - API endpoint for energy data |
| `components/chat/OnboardingChat.tsx` | Added `show_chart` action handler |

## Intent Patterns Added

```typescript
// Gallery patterns
/\b(?:quels?|montre[rz]?|affiche[rz]?)\s+(?:les?\s+)?(?:graphiques?|charts?)/i
/\b(?:show|display)\s+(?:me\s+)?(?:available|all)\s+(?:charts?|graphs?)/i

// Specific chart patterns (checked FIRST, before generic)
CHART_SPECIFIC_PATTERNS = {
  budget: [
    /budget\s+(?:en\s+)?(?:chart|graph|graphique)/i,
    /montre.*budget.*graphique/i,  // Flexible word order
    /(?:mon|my)\s+budget.*graphique/i,  // "mon budget en graphique"
  ],
  progress: [
    /(?:progress|progression|savings|épargne)\s+(?:en\s+)?(?:chart|graphique)/i,
    /montre.*(?:progression|épargne).*graphique/i,
  ],
  projection: [
    /(?:projection|forecast|prévision|objectif)\s+(?:en\s+)?(?:chart|graphique)/i,
    /montre.*(?:projections?|objectif).*graphique/i,
  ],
  energy: [
    /(?:energy|énergie)\s+(?:en\s+)?(?:chart|graphique|timeline|historique)/i,
    /montre.*(?:énergie|energy).*graphique/i,
  ],
}

// Generic patterns (fallback to gallery)
/tu\s+(?:aurais?|as)\s+(?:un\s+)?graphique/i  // "tu aurais un graphique?"
/montre.*(?:un\s+)?graphique/i  // "montre-moi un graphique" (no specific type)
```

## Testing

```bash
pnpm dev
```

1. **Chart Gallery:** "Quels graphiques peux-tu montrer?" → Grid appears
2. **Click Button:** Click "Budget Overview" → Chart appears as message
3. **Direct FR:** "Montre-moi mon budget" → Budget chart directly
4. **Direct EN:** "Show my savings progress" → Progress chart
5. **Missing Data:** Request chart without data → Helpful error message

## Error Handling

- **No budget data:** "Je n'ai pas assez d'informations sur ton budget..."
- **No goal:** "Tu n'as pas encore défini d'objectif d'épargne..."
- **No energy logs:** "⚡ Je n'ai pas encore de données sur ton niveau d'énergie. Commence par enregistrer ton énergie sur la page de Suivi!"

**Note:** If you see an English LLM response instead of these French error messages, it means the intent wasn't detected (pattern bug). French error messages confirm the intent was detected but data is missing.

## Architecture

```
User Message
     │
     ▼
Intent Detection (detector.ts)
     │
     ├── show_chart_gallery  → buildChartGallery() → Grid UI
     ├── show_budget_chart   → buildBudgetBreakdownChart() → Bar Chart
     ├── show_progress_chart → buildProgressChart() → Line Chart
     ├── show_projection_chart → buildProjectionChart() → Comparison Chart
     └── show_energy_chart   → buildEnergyChart() → Line Chart with thresholds
     │
     ▼
MCPUIRenderer (renders chart/grid)
     │
     ▼
User clicks gallery button
     │
     ▼
handleUIAction('show_chart', { chartType }) → Synthetic chat message → Chart response
```

## Key Implementation Details

- **Mode-Independent**: Chart detection runs BEFORE mode check in `chat.ts`, so it works in onboarding, conversation, AND profile-edit modes
- **Intent Detection Order**: Specific chart patterns are checked FIRST, before generic patterns (to avoid "montre mon budget" matching generic "montre...graphique")
- **Gallery Button Flow**: Click → synthetic message → chat API → chart response
- **Error Handling**: Graceful messages when data is missing

---

## Bug Fixes Applied

### 2026-01-31: Hyphen Handling in "Montre-moi"

**Issue:** Progress, projection, and energy charts returned text instead of charts when user typed "Montre-moi" (with hyphen).

**Root Cause:** Regex patterns expected `montre` + SPACE, but "montre-moi" connects with hyphen, no space.

**Symptoms:**
- "Montre-moi ma progression" → text response ❌
- "Montre-moi mes projections" → text response ❌
- "Montre-moi mon énergie" → text response ❌
- "Montre-moi mon historique d'énergie" → text response ❌
- "Montre-moi mon budget" → chart ✅ (fallback pattern caught it)

**Fix:** Changed `\s+(?:-?moi\s+)?` to `(?:-moi)?\s+` in 5 patterns:

```javascript
// Before (buggy):
/\b(?:montre|show|affiche)\s+(?:-?moi\s+)?(?:my\s+|ma\s+)?(?:progress|progression)\b/i

// After (fixed):
/\b(?:montre|show|affiche)(?:-moi)?\s+(?:my\s+|ma\s+)?(?:progress|progression)\b/i
```

**Files Changed:** `lib/chat/intent/detector.ts` (lines 41, 50, 59, 71, 72)

### 2026-01-31: Gallery Pattern Gaps

**Issue:** "qu'as tu comme visualisations ?" and "montres moi des charts" didn't trigger chart gallery.

**Fix:** Added new patterns in `CHART_GALLERY_PATTERNS`:
```javascript
// "qu'as-tu comme visualisations", "as-tu des graphiques"
/\b(?:qu['']?as[- ]?tu|as[- ]?tu)\s+(?:comme\s+)?(?:des?\s+)?(?:graphiques?|visualisations?|charts?)/i,

// "montres moi des charts" (with or without 's', with or without hyphen)
/\b(?:montre[sz]?)(?:[- ]?moi)?\s+(?:des\s+)?(?:graphiques?|visualisations?|charts?)\b/i,
```

### 2026-01-31: Energy Data Source Mismatch

**Issue:** Energy chart showed "no data" even after logging energy on Suivi page.

**Root Cause:** Two separate data stores:
- Suivi page → `profile.followupData.energyHistory` (0-100 scale)
- Energy API → `energy_logs` table (empty, 1-5 scale)

**Fix:**
1. Added `energyHistory` to context sent by `OnboardingChat.tsx`
2. Modified `show_energy_chart` handler in `chat.ts` to check both sources

### 2026-01-31: Single-Word Triggers

**Issue:** "charts", "graphiques", "visuel" alone didn't trigger gallery.

**Fix:** Added pattern for single-word triggers:
```javascript
/^(?:charts?|graphs?|graphiques?|visualisations?|visuels?|diagrammes?)[\s?!.]*$/i
```

### 2026-01-31: SQL Injection Fix (Security)

**Issue:** `energy-logs.ts` used string interpolation for SQL query.

**Fix:** Use `escapeSQL()` helper:
```javascript
const safeProfileId = escapeSQL(profileId);
// ... WHERE profile_id = ${safeProfileId}
```

### Previous Fixes (same session)

- **Array handling for budget data**: Income/expenses are arrays, not numbers. Fixed sum calculation.
- **Energy API port**: Changed from 3000 to 3006 to match frontend dev server.

---

## Phase 2: LLM-Based Intent Detection ✅ IMPLEMENTED

**Implémenté le:** 2026-01-31

### Problème Résolu

La détection d'intent par regex était trop rigide. Chaque variation nécessitait un pattern explicite.

**Avant Phase 2:**
| Input | Résultat |
|-------|---------|
| "charts" | ✅ Gallery (regex) |
| "chart please" | ❌ Texte générique |
| "j'aimerais voir des visuels" | ❌ Texte générique |

**Après Phase 2:**
| Input | Résultat |
|-------|---------|
| "charts" | ✅ Gallery (regex fast-path) |
| "chart please" | ✅ Gallery (LLM fallback) |
| "j'aimerais voir des visuels" | ✅ Gallery (LLM fallback) |

---

### Architecture Implémentée: Hybrid Intent Detection

```
┌─────────────────────────────────────────────────────────────┐
│  User Message                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FAST PATH: Regex Detection (existant)                      │
│  Latence: ~1ms                                              │
│  Coût: $0                                                   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
        Pattern Match                   No Match (fallback)
        (return intent)                       │
                                              ▼
                        ┌─────────────────────────────────────┐
                        │  LLM INTENT CLASSIFIER (NOUVEAU)    │
                        │  Groq llama-3.1-70b                 │
                        │  Latence: ~500-800ms                │
                        │  Coût: ~$0.0001/call                │
                        │                                     │
                        │  Input: message + available_actions │
                        │  Output: { action, confidence }     │
                        └─────────────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                    Action identifiée            Pas d'action claire
                    (route to handler)          (conversation libre)
```

**Avantages**:
- Regex = fast path pour intents communs (0 latence, 0 coût)
- LLM = fallback intelligent pour variations non prévues
- Conserve le comportement existant comme base

---

### Implémentation: LLM Intent Classifier

#### Option A: Groq Direct (Recommandé - Simple)

```typescript
// lib/chat/intent/llmClassifier.ts (NOUVEAU)

import { z } from 'zod';
import Groq from 'groq-sdk';
import { trace } from '../../opik';

// ============================================================================
// SUPPORTED ACTIONS (extensible)
// ============================================================================

export const SUPPORTED_ACTIONS = [
  'show_chart_gallery',
  'show_budget_chart',
  'show_progress_chart',
  'show_projection_chart',
  'show_energy_chart',
  'whatif_work',
  'whatif_sell',
  'whatif_cut',
  'check_progress',
  'get_advice',
  'continue_onboarding',
  'conversation', // fallback for general chat
] as const;

// ============================================================================
// ZOD SCHEMA (Safe LLM Output Validation)
// ============================================================================

const LLMClassificationSchema = z.object({
  action: z.enum(SUPPORTED_ACTIONS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type LLMClassificationResult = z.infer<typeof LLMClassificationSchema>;

// ============================================================================
// CONTEXT-AWARE PROMPT
// ============================================================================

const INTENT_CLASSIFICATION_PROMPT = `Tu es un classificateur d'intentions pour Stride, une app de finances étudiantes.

CONTEXTE ACTUEL:
- Mode: {mode}
- Étape: {currentStep}
- Données utilisateur: goal={hasGoal}, budget={hasBudget}, energy={hasEnergy}

ACTIONS DISPONIBLES:
- show_chart_gallery: L'utilisateur veut voir les graphiques/visualisations disponibles
- show_budget_chart: L'utilisateur veut voir son budget en graphique
- show_progress_chart: L'utilisateur veut voir sa progression vers son objectif
- show_projection_chart: L'utilisateur veut voir des projections financières
- show_energy_chart: L'utilisateur veut voir son historique d'énergie
- whatif_work: L'utilisateur pose une question "et si je travaillais X heures"
- whatif_sell: L'utilisateur veut simuler une vente
- whatif_cut: L'utilisateur veut simuler l'arrêt d'une dépense
- check_progress: L'utilisateur veut connaître sa progression
- get_advice: L'utilisateur demande des conseils
- continue_onboarding: L'utilisateur veut continuer/reprendre l'onboarding (SEULEMENT si mode=onboarding)
- conversation: Conversation générale sans action spécifique

RÈGLES:
- "continue" en mode onboarding → continue_onboarding
- "continue" en mode conversation → conversation
- Mots simples comme "charts", "graphiques", "visuel" → show_chart_gallery
- Si incertain, utilise confidence < 0.7

Réponds UNIQUEMENT avec un JSON valide:
{"action": "nom_action", "confidence": 0.0-1.0, "reasoning": "explication courte"}

Message utilisateur: "{message}"`;

// ============================================================================
// CLASSIFICATION FUNCTION
// ============================================================================

export interface ClassificationContext {
  mode: 'onboarding' | 'conversation' | 'profile-edit';
  currentStep: string;
  hasGoal: boolean;
  hasBudget: boolean;
  hasEnergy: boolean;
}

export async function classifyIntentWithLLM(
  message: string,
  groqClient: Groq,
  context: ClassificationContext
): Promise<LLMClassificationResult | null> {
  return trace('intent.llm_classification', async (ctx) => {
    ctx.setAttributes({
      message_length: message.length,
      mode: context.mode,
      current_step: context.currentStep,
    });

    try {
      // Build context-aware prompt
      const prompt = INTENT_CLASSIFICATION_PROMPT
        .replace('{mode}', context.mode)
        .replace('{currentStep}', context.currentStep)
        .replace('{hasGoal}', String(context.hasGoal))
        .replace('{hasBudget}', String(context.hasBudget))
        .replace('{hasEnergy}', String(context.hasEnergy))
        .replace('{message}', message);

      const response = await groqClient.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Déterministe
        max_tokens: 150,
      });

      const rawContent = response.choices[0].message.content || '{}';

      // SAFE PARSING with Zod
      const parsed = LLMClassificationSchema.safeParse(JSON.parse(rawContent));

      if (!parsed.success) {
        ctx.setAttributes({ validation_error: parsed.error.message });
        return null;
      }

      const result = parsed.data;
      ctx.setOutput({ action: result.action, confidence: result.confidence });

      // Only return if confidence threshold met
      return result.confidence >= 0.7 ? result : null;

    } catch (error) {
      ctx.setAttributes({ error: String(error) });
      return null;
    }
  });
}
```

#### Option B: Mastra Agent avec Tool Use (Plus puissant)

```typescript
// Créer un agent Mastra qui a accès aux "outils" chart
const chartIntentAgent = createStrideAgent({
  id: 'chart-intent-classifier',
  name: 'Chart Intent Classifier',
  instructions: `Tu détectes si l'utilisateur veut voir un graphique.
    Si oui, appelle le tool approprié.
    Si non, réponds "no_chart_intent".`,
  toolNames: ['show_chart_gallery', 'show_budget_chart', ...],
});

// L'agent décide automatiquement quel tool appeler
const result = await chartIntentAgent.generate(message);
```

---

### Fichiers Modifiés ✅

| Fichier | Modification | Status |
|---------|--------------|--------|
| `lib/chat/intent/llmClassifier.ts` | **NOUVEAU** - LLM classification function | ✅ Created |
| `lib/chat/intent/detector.ts` | Async + LLM fallback si regex fails | ✅ Updated |
| `lib/chat/types.ts` | Ajout `_llmConfidence`, `_llmReasoning` | ✅ Updated |
| `routes/api/chat.ts` | `await detectIntent()` + pass groqClient | ✅ Updated |
| `scripts/run-daily-experiment.ts` | Async evaluateIntent() | ✅ Updated |

---

### Détails d'Implémentation

#### 1. Nouveau fichier: `lib/chat/intent/llmClassifier.ts`

Points clés implémentés:
- **Zod validation** pour sécuriser le parsing JSON (Zod 4)
- **Context-aware prompt** avec mode/step/données disponibles
- **Tracing Opik** avec `registerPrompt()` pour version tracking

#### 2. Modifié: `lib/chat/intent/detector.ts`

**BREAKING CHANGE appliqué**: La fonction est maintenant **async**

```typescript
// AVANT (sync)
export function detectIntent(
  message: string,
  _context: Record<string, unknown>
): DetectedIntent

// APRÈS (async) - NOUVEAU SIGNATURE
export async function detectIntent(
  message: string,
  context: Record<string, unknown>,
  options?: {
    groqClient?: Groq;
    mode?: 'onboarding' | 'conversation' | 'profile-edit';
    currentStep?: string;
  }
): Promise<DetectedIntent> {
  const lower = message.toLowerCase();

  // =========================================================================
  // FAST PATH: Existing regex patterns (unchanged, ~1ms)
  // =========================================================================

  // ... all existing regex patterns stay here ...

  // =========================================================================
  // SLOW PATH: LLM Classification (only if regex fails + client provided)
  // =========================================================================

  if (options?.groqClient) {
    const classificationContext: ClassificationContext = {
      mode: options.mode || 'conversation',
      currentStep: options.currentStep || 'unknown',
      hasGoal: Boolean(context.goalAmount),
      hasBudget: Boolean(context.income || context.expenses),
      hasEnergy: Array.isArray(context.energyHistory) && context.energyHistory.length > 0,
    };

    const llmResult = await classifyIntentWithLLM(
      message,
      options.groqClient,
      classificationContext
    );

    if (llmResult) {
      return {
        mode: llmResult.action === 'continue_onboarding' ? 'onboarding' : 'conversation',
        action: llmResult.action,
        _matchedPattern: 'llm_classification',
        _llmConfidence: llmResult.confidence,
        _llmReasoning: llmResult.reasoning,
      };
    }
  }

  // =========================================================================
  // DEFAULT FALLBACK (unchanged)
  // =========================================================================
  return { mode: 'conversation', _matchedPattern: 'default_fallback' };
}
```

#### 3. Modifier: `routes/api/chat.ts`

⚠️ **Tous les appels à `detectIntent` doivent maintenant utiliser `await`**

```typescript
// AVANT
const intent = detectIntent(message, context);

// APRÈS
const intent = await detectIntent(message, context, {
  groqClient,
  mode: chatMode,
  currentStep: step,
});
```

**Lignes impactées dans chat.ts:**
- ~L1078: Premier appel detectIntent (conversation mode)
- ~L1600: Chart detection (mode-independent)
- Potentiellement d'autres appels à chercher avec grep

#### 4. Modifier: `lib/chat/types.ts`

Ajouter les nouveaux champs au type `DetectedIntent`:

```typescript
export interface DetectedIntent {
  mode: ChatMode;
  action?: string;
  // ... existing fields ...

  // NEW: LLM classification metadata
  _llmConfidence?: number;
  _llmReasoning?: string;
}
```

---

### Considérations

#### Latence
- Regex: ~1ms
- LLM classification: ~500-800ms
- **Mitigation**: LLM seulement si regex fail

#### Coût
- Groq llama-3.1-70b: $0.59/$0.79 per 1M tokens
- Classification prompt: ~200 tokens input, ~50 output
- **Coût estimé**: ~$0.0001 par classification LLM
- **Volume**: Si 10% des messages need LLM → 1000 users × 10 msgs × 10% = 1000 LLM calls/jour = $0.10/jour

#### Observabilité
- Tracer chaque appel LLM classifier
- Logger: `_matchedPattern: 'llm_classification'`
- Feedback score: `llm_classification_confidence`

#### Rollback
- Feature flag: `ENABLE_LLM_INTENT_CLASSIFICATION=true`
- Si désactivé → comportement regex-only actuel

---

### Tests de Validation

Après implémentation, ces inputs doivent fonctionner:

| Input | Action Attendue |
|-------|-----------------|
| "charts" | show_chart_gallery |
| "graphiques" | show_chart_gallery |
| "chart please" | show_chart_gallery |
| "j'aimerais voir des visuels" | show_chart_gallery |
| "montre moi mon budget visuellement" | show_budget_chart |
| "how's my progress looking?" | show_progress_chart |
| "where am I at with savings?" | check_progress |
| "bonjour" | conversation |
| "merci" | conversation |

---

### Estimation

| Phase | Tâche | Effort |
|-------|-------|--------|
| 1 | Créer `llmClassifier.ts` + prompt | 2h |
| 2 | Modifier `detector.ts` (async + LLM call) | 1h |
| 3 | Modifier `chat.ts` (passer Groq client) | 30min |
| 4 | Ajouter tracing Opik | 30min |
| 5 | Tests manuels + ajustements prompt | 1h |
| **Total** | | **5h** |
