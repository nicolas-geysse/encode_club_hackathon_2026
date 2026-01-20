# Sprint 12 - Opik/Mastra Optimizations (TIER 1)

## Status: ✅ COMPLETED

**Date**: 2026-01-19
**Source**: Brainstorm document - Quick wins for hackathon demo

---

## Summary

Implementation of TIER 1 (Quick Wins) from the Opik/Mastra optimization brainstorm:
1. Fix URL parsing error for `/api/embed` (server-side fetch)
2. Opik Feedback Loop for Intent Detection
3. Verify Online Evaluators are active
4. Add "Explain This Recommendation" button with Opik trace links
5. Add EMBEDDINGS_ENABLED guard for graceful degradation

---

## Changes

### 1. Fix URL `/api/embed` - Server-side Absolute URL

**Problem**: Server-side `fetch('/api/embed')` uses relative URL - no browser context available.

**File**: `packages/frontend/src/routes/api/goals.ts:18-28`

**Solution**: Added helper function and feature flag:

```typescript
/**
 * Get API base URL for server-side fetch
 * Server-side fetch requires absolute URLs (no browser context)
 */
function getApiBaseUrl(): string {
  // EMBEDDINGS_ENABLED feature flag (default: true)
  if (process.env.EMBEDDINGS_ENABLED === 'false') {
    return ''; // Will skip embedding
  }
  return process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3000}`;
}
```

Usage:
```typescript
const baseUrl = getApiBaseUrl();
if (!baseUrl) {
  logger.debug('Goal embedding skipped (EMBEDDINGS_ENABLED=false)');
  return;
}
await fetch(`${baseUrl}/api/embed`, { ... });
```

---

### 2. Opik Feedback Loop for Intent Detection

**Purpose**: Log confidence and intent in Opik for debugging fallback issues.

**File**: `packages/frontend/src/routes/api/chat.ts:2051-2070`

**Changes**: Enhanced feedback logging with two scores:

```typescript
// Log intent detection feedback scores for evaluation and dashboard
const isFallback = intent._matchedPattern === 'default_fallback' || !intent.action;
const traceIdForFeedback = ctx.getTraceId();
if (traceIdForFeedback) {
  logFeedbackScores(traceIdForFeedback, [
    {
      name: 'intent_detection_confidence',
      value: isFallback ? 0.2 : 1.0,
      reason: isFallback
        ? `Fallback: "${message.substring(0, 50)}..."`
        : `Pattern: ${intent._matchedPattern}, action: ${intent.action}`,
    },
    {
      name: 'intent_is_fallback',
      value: isFallback ? 0 : 1, // 0 = fallback (bad), 1 = detected (good)
      reason: intent._matchedPattern || 'no_pattern',
    },
  ]).catch(() => {});
}
```

**Dashboard Visibility**:
- Filter traces by `intent_is_fallback = 0` to find unmatched intents
- Use `intent_detection_confidence` for quality monitoring

---

### 3. Online Evaluators (Already Active)

**Verification**: Evaluators are already auto-initialized via `ensureOpikSetup()`.

**File**: `packages/frontend/src/routes/api/chat.ts:68-84`

**Existing Setup**:
```typescript
async function ensureOpikSetup(): Promise<void> {
  if (opikInitialized) return;
  const { isOpikRestAvailable, initializeStrideOpikSetup } = await import('../../lib/opikRest');
  if (await isOpikRestAvailable()) {
    await initializeStrideOpikSetup(projectName);
    opikInitialized = true;
  }
}
```

**Active Evaluators** (from `opikRest.ts:824-958`):

| Evaluator | Sampling Rate | Purpose |
|-----------|---------------|---------|
| `intent_detection` | 30% | LLM-judged quality of intent detection |
| `safety` | 100% | Check for risky financial advice |
| `appropriateness` | 100% | Verify advice fits student context |
| `actionability` | 50% | Evaluate if advice has concrete steps |

---

### 4. "Explain This Recommendation" Button

**Purpose**: Show users the AI reasoning behind recommendations (hackathon wow factor).

#### New Component: `OpikTraceLink.tsx`

**File**: `packages/frontend/src/components/ui/OpikTraceLink.tsx`

```typescript
export function OpikTraceLink(props: OpikTraceLinkProps) {
  const url = () => props.traceUrl || (props.traceId ? getOpikTraceUrl(props.traceId) : null);

  return (
    <Show when={url()}>
      <a href={url()!} target="_blank" rel="noopener noreferrer"
         class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <Sparkles class="w-3 h-3" />
        <span>{props.label || 'Why this?'}</span>
        <ExternalLink class="w-3 h-3" />
      </a>
    </Show>
  );
}
```

#### Updated Files:

1. **`chat.ts`** - Added `traceUrl` to response:
   ```typescript
   import { getTraceUrl } from '../../lib/opik';

   // In return statements:
   const traceUrl = traceId ? getTraceUrl(traceId) : undefined;
   return { response, extractedData, traceId, traceUrl, ... };
   ```

2. **`types/chat.ts`** - Added `traceUrl` to interfaces:
   ```typescript
   export interface ChatMessage {
     // ... existing fields
     traceUrl?: string; // Opik trace URL for "Explain This" feature
   }

   export interface ChatResponse {
     // ... existing fields
     traceUrl?: string;
   }
   ```

3. **`ChatMessage.tsx`** - Display trace link:
   ```typescript
   import { OpikTraceLinkInline } from '~/components/ui/OpikTraceLink';

   // After message bubble:
   <Show when={isAssistant() && props.traceUrl}>
     <div class="px-1 mt-1">
       <OpikTraceLinkInline traceUrl={props.traceUrl} label="Why this response?" />
     </div>
   </Show>
   ```

4. **`OnboardingChat.tsx`** - Pass traceUrl to messages:
   ```typescript
   const assistantMsg: Message = {
     id: `assistant-${Date.now()}`,
     role: 'assistant',
     content: result.response,
     source: result.source,
     traceUrl: (result as { traceUrl?: string }).traceUrl,
   };
   ```

---

### 5. EMBEDDINGS_ENABLED Guard

**Purpose**: Allow app to run without Sharp/RAG dependencies.

**File**: `packages/frontend/src/routes/api/goals.ts`

**Usage**:
```bash
# Disable embeddings (app works without Sharp)
EMBEDDINGS_ENABLED=false pnpm dev

# Enable embeddings (default)
pnpm dev
```

**Behavior**:
- When `EMBEDDINGS_ENABLED=false`: Goal embedding calls are skipped
- When enabled (default): Embeddings work normally if Sharp is available

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `EMBEDDINGS_ENABLED` | `true` | Feature flag to disable embeddings |
| `INTERNAL_API_URL` | `http://localhost:3006` | Base URL for server-side fetch |
| `VITE_OPIK_BASE_URL` | `https://www.comet.com/opik` | Opik dashboard URL (frontend) |
| `VITE_OPIK_WORKSPACE` | `default` | Opik workspace (frontend) |
| `VITE_OPIK_PROJECT` | `stride` | Opik project name (frontend) |

---

## Verification

- **TypeScript**: ✅ Passed
- **Build**: ✅ Successful
- **Lint**: 4 preexisting warnings (not from these changes)

---

## Next Steps (TIER 2)

From the brainstorm document, future improvements:

1. **Conversation Context in Intent Detection** - Pass last 3 messages for better understanding
2. **Opik Annotation Queue** - Route fallbacks to human review
3. **Mastra Agent for Intent Detection** - Replace regex with LLM agent
4. **Streaming Responses** - Better UX with SSE
