# Gemini / Groq / Opik Architecture Guidelines

**Version**: 1.0
**Date**: 22 January 2026
**Scope**: Comprehensive reference for LLM provider abstraction and Opik observability in Stride

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Opik Configuration](#2-opik-configuration)
3. [LLM Provider Abstraction](#3-llm-provider-abstraction)
4. [Tracing Best Practices](#4-tracing-best-practices)
5. [Migration Guide: Aligning MCP Server on Frontend Pattern](#5-migration-guide)
6. [API Reference](#6-api-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (SolidStart)                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │  SwipeSession   │   │  Onboarding     │   │  BrunoTips      │       │
│  │  Components     │   │  Chat           │   │  (TTS/Voice)    │       │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
│           │                      │                      │               │
│           └──────────────────────┴──────────────────────┘               │
│                                  │                                       │
│                    ┌─────────────▼─────────────┐                        │
│                    │  lib/opik.ts (Advanced)   │                        │
│                    │  - trace() with threadId  │                        │
│                    │  - createChildSpan()      │                        │
│                    │  - setCost(), setUsage()  │                        │
│                    │  - span type: llm/tool    │                        │
│                    └─────────────┬─────────────┘                        │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │ HTTP (Server Functions)
┌──────────────────────────────────┼──────────────────────────────────────┐
│                      MCP Server Package                                 │
│                    ┌─────────────▼─────────────┐                        │
│                    │  services/opik.ts (Basic) │                        │
│                    │  - trace() / createSpan() │                        │
│                    │  - setUsage() with cost   │                        │
│                    │  ⚠️ Missing: type, model  │                        │
│                    └─────────────┬─────────────┘                        │
│                                  │                                       │
│    ┌─────────────────────────────┼─────────────────────────────────┐    │
│    │                             │                                  │    │
│    ▼                             ▼                                  ▼    │
│ ┌──────────┐            ┌──────────────┐              ┌──────────────┐  │
│ │ Mastra   │            │ services/    │              │ algorithms/  │  │
│ │ Agents   │            │ groq.ts      │              │ (comeback,   │  │
│ │ (4)      │            │ (LLM calls)  │              │  arbitrage)  │  │
│ └────┬─────┘            └──────┬───────┘              └──────────────┘  │
│      │                         │                                        │
└──────┼─────────────────────────┼────────────────────────────────────────┘
       │                         │
       ▼                         ▼
┌──────────────┐        ┌──────────────┐
│  Opik Cloud  │        │  Groq API    │
│  (Comet)     │        │  (LLM)       │
└──────────────┘        └──────────────┘
```

### Data Flow: LLM Call → Opik Trace

```
1. User interaction (chat, swipe)
        │
2. trace('operation_name', async (ctx) => { ... })
        │
3. LLM call via groq.chat() or Mastra agent
        │
4. ctx.createChildSpan('llm_call', ..., { type: 'llm', model, provider })
        │
5. span.setUsage({ prompt_tokens, completion_tokens, total_tokens })
   span.setCost(estimatedCostUsd)
   span.setOutput({ response })
        │
6. span.end() → trace.end() → opikClient.flush()
        │
7. Visible in Opik Dashboard
```

---

## 2. Opik Configuration

### 2.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPIK_API_KEY` | Yes | - | Opik Cloud API key |
| `OPIK_WORKSPACE` | Yes | - | Workspace name |
| `OPIK_PROJECT` | No | `stride` | Project name |
| `OPIK_PROJECT_ID` | No | - | UUID for dashboard URLs |
| `OPIK_BASE_URL` | No | `https://www.comet.com/opik/api` | Self-hosted URL |
| `ENABLE_OPIK` | No | `true` | Set `false` to disable |

### 2.2 SDK v1.9.92 Authentication Bug Workaround

The Opik TypeScript SDK v1.9.92 has a bug where the `apiKey` constructor parameter is documented to override the `Authorization` header, but `normalizeClientOptions()` in `BaseClient.ts` never adds it to headers.

**Workaround (already applied in codebase):**

```typescript
// packages/mcp-server/src/services/opik.ts
opikClient = new Opik({
  apiKey,
  projectName: project,
  workspaceName: workspace,
  apiUrl: effectiveApiUrl,
  headers: {
    authorization: apiKey, // Lowercase, NO "Bearer " prefix
  },
});
```

Additionally, set environment variables before creating the client:

```typescript
process.env.OPIK_API_KEY = apiKey;
process.env.OPIK_URL_OVERRIDE = effectiveApiUrl;
if (workspace) {
  process.env.OPIK_WORKSPACE = workspace;
}
```

### 2.3 Lazy Initialization Pattern

Both implementations use lazy initialization to avoid race conditions with `.env` loading in SolidStart/Vinxi:

```typescript
// ❌ WRONG - Module-level reads may get undefined
const apiKey = process.env.OPIK_API_KEY;

// ✅ CORRECT - Read at runtime
function getOpikConfig() {
  return {
    apiKey: process.env.OPIK_API_KEY?.trim(),
    workspace: process.env.OPIK_WORKSPACE?.trim(),
    // ...
  };
}
```

---

## 3. LLM Provider Abstraction

### 3.1 Current State: Groq Only

| Package | Provider | SDK |
|---------|----------|-----|
| mcp-server | Groq | `groq-sdk: ^0.37.0` |
| frontend | Groq (via AI-SDK) | `@ai-sdk/groq: ^3.0.8` |
| Mastra agents | OpenAI (configured) | `@ai-sdk/openai` |

### 3.2 Adding Gemini: Recommended Pattern

Do NOT use a magical `opik-gemini` library. Instead, wrap Gemini SDK calls with the existing `trace()` pattern from `groq.ts`.

**Step 1: Install SDK**

```bash
pnpm add @google/generative-ai
```

**Step 2: Create `services/gemini.ts`**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { trace, createSpan, getCurrentTraceHandle } from './opik.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Gemini pricing per million tokens
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  default: { input: 0.50, output: 1.50 },
};

let genAI: GoogleGenerativeAI | null = null;

export async function initGemini(): Promise<void> {
  if (!GEMINI_API_KEY) {
    console.error('Warning: GEMINI_API_KEY not set');
    return;
  }
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

export async function chat(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const executeChatCompletion = async (span: Span): Promise<string> => {
    if (!genAI) throw new Error('Gemini client not initialized');

    const model = genAI.getGenerativeModel({ model: MODEL });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);

    const response = result.response;
    const text = response.text();

    // Set Opik fields
    if (response.usageMetadata) {
      const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;
      const cost = calculateCost(MODEL, promptTokenCount || 0, candidatesTokenCount || 0);

      span.setUsage({
        prompt_tokens: promptTokenCount || 0,
        completion_tokens: candidatesTokenCount || 0,
        total_tokens: totalTokenCount || 0,
      });
      span.setCost(cost); // IMPORTANT: separate from usage
    }

    span.setOutput({ response: text.substring(0, 500) });
    return text;
  };

  const hasParentTrace = !!getCurrentTraceHandle();

  if (hasParentTrace) {
    return createSpan('gemini_chat', executeChatCompletion, {
      type: 'llm',
      model: MODEL,
      provider: 'gemini',
    });
  } else {
    return trace('gemini_chat', executeChatCompletion);
  }
}
```

### 3.3 Provider Switching via Environment

```typescript
// services/llm.ts - Unified interface
import * as groq from './groq.js';
import * as gemini from './gemini.js';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq';

export async function chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
  switch (LLM_PROVIDER) {
    case 'gemini':
      return gemini.chat(messages, options);
    case 'groq':
    default:
      return groq.chat(messages, options);
  }
}
```

### 3.4 Fallback Strategy

```typescript
export async function chatWithFallback(
  messages: ChatMessage[],
  options?: LLMOptions
): Promise<string> {
  try {
    return await groq.chat(messages, options);
  } catch (groqError) {
    console.error('Groq failed, falling back to Gemini:', groqError);
    return await gemini.chat(messages, options);
  }
}
```

---

## 4. Tracing Best Practices

### 4.1 Span Types (REQUIRED)

Always set the `type` field. Opik uses it for UI display:

| Type | Use Case | UI Display |
|------|----------|------------|
| `llm` | LLM API calls | Shows tokens, cost, model |
| `tool` | MCP tools, function calls | Shows input/output clearly |
| `general` | Business logic, calculations | Default display |
| `guardrail` | Validation, safety checks | Security-focused view |

```typescript
// ✅ CORRECT
ctx.createChildSpan('llm_call', fn, { type: 'llm', model: 'llama-3.1-70b', provider: 'groq' });
ctx.createChildSpan('skill_arbitrage', fn, { type: 'general' });
ctx.createChildSpan('safety_check', fn, { type: 'guardrail' });

// ❌ WRONG - type defaults to 'general', LLM spans won't show properly
ctx.createChildSpan('llm_call', fn);
```

### 4.2 Token Usage and Cost (SEPARATE Fields)

Cost must be set separately from usage:

```typescript
// ✅ CORRECT
span.setUsage({
  prompt_tokens: 150,
  completion_tokens: 50,
  total_tokens: 200,
});
span.setCost(0.0023); // Separate call

// ❌ WRONG - cost in usage object is ignored
span.setUsage({
  prompt_tokens: 150,
  completion_tokens: 50,
  total_tokens: 200,
  cost: 0.0023, // Won't be displayed!
});
```

### 4.3 Input/Output vs Attributes

Use dedicated fields for visibility in Opik UI:

```typescript
// ✅ CORRECT - Visible in dedicated UI columns
span.setInput({ user_id: '123', prompt: 'Hello' });
span.setOutput({ response: 'Hi there!', tokens: 42 });

// ⚠️ ACCEPTABLE - For supplementary data
span.setAttributes({ temperature: 0.7, retry_count: 1 });

// ❌ WRONG - Hidden in metadata blob
span.setAttributes({ input_user: '123', response: 'Hi there!' });
```

### 4.4 Thread ID for Conversations

Group related traces in multi-turn conversations:

```typescript
import { trace, generateThreadId } from './lib/opik';

// First turn - generate thread ID
const threadId = generateThreadId();

await trace('onboarding.turn_1', async (ctx) => {
  // ... handle first message
}, { threadId });

// Subsequent turns - reuse same thread ID
await trace('onboarding.turn_2', async (ctx) => {
  // ... handle second message
}, { threadId });
```

### 4.5 Finalization Timing

**Critical**: Set output BEFORE `span.end()`, and end child spans before parent:

```typescript
await trace('parent', async (ctx) => {
  await ctx.createChildSpan('child', async (span) => {
    const result = doWork();
    span.setOutput({ result }); // ✅ Before end()
    span.end();
    return result;
  });

  ctx.setOutput({ status: 'done' }); // ✅ After child ends
}); // Parent ends automatically
```

---

## 5. Migration Guide

### 5.1 Comparison: Frontend vs MCP Server

| Feature | Frontend `lib/opik.ts` | MCP Server `services/opik.ts` | Action |
|---------|------------------------|-------------------------------|--------|
| `setCost()` | ✅ Line 86, 298 | ❌ Only in usage.cost | **Add method** |
| Span `type` field | ✅ Line 439 | ❌ Missing | **Add to createSpan** |
| `model`/`provider` | ✅ Lines 451-457 | ❌ Only in attributes | **Add to span config** |
| `threadId` | ✅ Lines 267-269 | ❌ Missing | **Add to TraceOptions** |
| `createChildSpan()` | ✅ Lines 338-344 | ❌ Missing | **Add method** |
| Finalization timing | ✅ Immediate in end() | ⚠️ Deferred to finally | **Review** |

### 5.2 Step-by-Step Migration for MCP Server

**Step 1: Add `setCost()` to Span interface**

```typescript
// services/opik.ts
export interface Span {
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  setInput(input: Record<string, unknown>): void;
  setOutput(output: Record<string, unknown>): void;
  setUsage(usage: TokenUsage): void;
  setCost(cost: number): void; // ADD THIS
  end(): void;
}
```

**Step 2: Add `type`, `model`, `provider` to createSpan**

```typescript
export interface SpanOptions {
  input?: Record<string, unknown>;
  tags?: string[];
  type?: 'general' | 'tool' | 'llm' | 'guardrail'; // ADD
  model?: string; // ADD
  provider?: string; // ADD
}

export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  // ... existing code ...

  const spanConfig: Record<string, unknown> = {
    name,
    startTime,
    type: options?.type || 'general', // ADD DEFAULT
  };

  if (options?.model) spanConfig.model = options.model;
  if (options?.provider) spanConfig.provider = options.provider;

  // ... rest of function
}
```

**Step 3: Add `threadId` to TraceOptions**

```typescript
export interface TraceOptions {
  tags?: string[];
  metadata?: Record<string, unknown>;
  input?: Record<string, unknown>;
  threadId?: string; // ADD
}
```

**Step 4: Update groq.ts to use new options**

```typescript
// In chat() function
return createSpan('llm_chat', executeChatCompletion, {
  tags,
  input: inputData,
  type: 'llm',       // ADD
  model: MODEL,      // ADD
  provider: 'groq',  // ADD
});
```

### 5.3 Testing the Migration

```bash
# Run with Opik enabled
ENABLE_OPIK=true pnpm --filter @stride/mcp-server test

# Check Opik dashboard for:
# 1. Span types displayed correctly (llm, tool, general)
# 2. Token usage in dedicated columns
# 3. Cost in totalEstimatedCost field
# 4. Model/provider visible on LLM spans
```

---

## 6. API Reference

### 6.1 Frontend `lib/opik.ts` API

```typescript
// Tracing
trace<T>(name: string, fn: (ctx: TraceContext) => Promise<T>, options?: TraceOptions): Promise<T>
createSpan<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>

// Thread management
generateThreadId(): string
setThreadId(threadId: string): void
getCurrentThreadId(): string | null

// Trace info
getCurrentTraceId(): string | null
getTraceUrl(traceId?: string): string

// Feedback
logFeedbackScores(traceId: string | null, scores: FeedbackScore[]): Promise<boolean>
```

### 6.2 MCP Server `services/opik.ts` API

```typescript
// Initialization
initOpik(): Promise<void>

// Tracing
trace<T>(name: string, fn: (span: Span) => Promise<T>, options?: TraceOptions): Promise<T>
createSpan<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>

// Conditional tracing (for high-volume operations)
maybeTrace<T>(...): Promise<T>      // Only if ENABLE_REALTIME_OPIK=true
maybeCreateSpan<T>(...): Promise<T> // Only if ENABLE_REALTIME_OPIK=true

// Trace info
getCurrentTraceId(): string | null
getCurrentTraceHandle(): unknown
getTraceUrl(traceId?: string): string

// Feedback
logFeedback(traceId: string, feedback: 'thumbs_up' | 'thumbs_down', comment?: string): Promise<void>
```

### 6.3 Groq Service API

```typescript
// Initialization
initGroq(): Promise<void>

// Chat
chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>
chatWithJsonMode<T>(messages: ChatMessage[], options?: ChatOptions): Promise<T>

// Analysis
analyzeBudget(incomes, expenses): Promise<BudgetAnalysis>
generateAdvice(profile, context?): Promise<string>

// Voice (Whisper)
transcribeAudio(audioBuffer: Buffer, options?): Promise<TranscriptionResult>
transcribeAndAnalyze(audioBuffer: Buffer, context): Promise<TranscriptWithAnalysis>
```

### 6.4 Official Opik Documentation

- [Opik TypeScript SDK](https://www.comet.com/docs/opik/typescript/overview)
- [Tracing Concepts](https://www.comet.com/docs/opik/tracing/overview)
- [LLM as Judge](https://www.comet.com/docs/opik/evaluation/llm-as-judge)
- [REST API Reference](https://www.comet.com/docs/opik/api/overview)

---

## 7. Troubleshooting

### 7.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Traces not appearing | Missing API key | Check `OPIK_API_KEY` is set |
| 401 Unauthorized | SDK auth bug | Use `headers: { authorization: apiKey }` workaround |
| Empty `output` field | Finalization timing | Call `setOutput()` before `span.end()` |
| No token counts | Missing `setUsage()` | Add usage tracking to LLM spans |
| Cost shows 0 | Cost in wrong field | Use `setCost()` separately from `setUsage()` |
| Spans not nested | Missing parent trace | Use `createChildSpan()` within trace context |
| Thread grouping broken | Missing threadId | Pass `threadId` option to trace() |

### 7.2 Debug Logging

Enable verbose logging:

```typescript
// Set before initializing Opik
process.env.DEBUG = 'opik:*';
```

Check console for `[Opik]` prefixed messages:

```
[Opik] Initialized - project: stride, workspace: default
[Opik:chat.onboarding] Created trace with ID: abc123
[Opik:chat.onboarding] setOutput called with: {"response":"..."}
[Opik:chat.onboarding] Flushing all traces...
[Opik:chat.onboarding] Flush completed
```

### 7.3 Graceful Degradation

If Opik is unavailable, the app continues with mock tracing:

```typescript
// This is automatic - no code changes needed
// When OPIK_API_KEY is missing or API is down:
// 1. trace() returns a mock context
// 2. Operations still execute
// 3. Logs go to console instead of Opik
// 4. No crash
```

### 7.4 Performance Considerations

For high-frequency operations, use conditional tracing:

```typescript
import { maybeTrace, maybeCreateSpan } from './services/opik';

// Only traces if ENABLE_REALTIME_OPIK=true
await maybeTrace('embedding_update', async (span) => {
  // High-frequency operation
});
```

---

## 8. Implementation Status

### Sprint 1: Fire-and-Forget Fixes ✅

- [x] `SwipeSession.tsx` - HTTP error handling (checks `response.ok`)
- [x] `swipe-trace.ts` - Structured error logging with request ID
- [x] `frontend/lib/opik.ts` - Accurate feedback failure reporting (`allSucceeded` tracking)

### Sprint 2: MCP Server Opik Alignment ✅

- [x] Added `SpanType`, `SpanOptions`, `TraceContext` types
- [x] Added `setCost()` method (separate from usage)
- [x] Added `threadId` support with helpers (`getCurrentThreadId`, `setThreadId`, `generateThreadId`)
- [x] Implemented `createChildSpan()` in `TraceContext`
- [x] Updated `groq.ts` to use `type: 'llm'`, `model`, `provider`

### Sprint 3: Gemini Integration ✅

- [x] Created `gemini.ts` service with full Opik tracing
- [x] Created `llm-provider.ts` interface
- [x] Provider switching via `LLM_PROVIDER` env variable
- [x] Updated `groq.ts` to implement `LLMProvider` interface
- [x] Added `getLLMProvider()`, `initLLM()`, `llmChat()`, `llmChatWithJsonMode()` helpers

### Sprint 4: Documentation Consolidation ✅

- [x] Added implementation status section (this section)
- [x] Kept feature docs in OPIK.md, technical reference here

### KPI Dashboard

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Trace errors visible in console | 100% | ✅ | Implemented |
| HTTP errors caught | 100% | ✅ | Implemented |
| Feedback failures detected | 100% | ✅ | Implemented |
| Span types in Opik dashboard | 100% | ✅ | Implemented |
| Cost tracked separately | 100% | ✅ | Implemented |
| Model/provider visible | 100% | ✅ | Implemented |
| Thread grouping works | 100% | ✅ | Implemented |
| Gemini provider works | 100% | ✅ | Implemented |
| Provider switching | 100% | ✅ | Implemented |

---

## Appendix: Pricing Reference

### Groq Models

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| `llama-3.1-70b-versatile` | 0.59 | 0.79 |
| `llama-3.1-8b-instant` | 0.05 | 0.08 |
| `llama-3.2-90b-vision-preview` | 0.90 | 0.90 |
| `mixtral-8x7b-32768` | 0.24 | 0.24 |
| `gemma2-9b-it` | 0.20 | 0.20 |

### Gemini Models

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| `gemini-1.5-flash` | 0.075 | 0.30 |
| `gemini-1.5-flash-8b` | 0.0375 | 0.15 |
| `gemini-1.5-pro` | 1.25 | 5.00 |
| `gemini-2.0-flash` | 0.10 | 0.40 |

---

## Appendix: Environment Variables Summary

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPIK_API_KEY` | Yes | - | Opik Cloud API key |
| `OPIK_WORKSPACE` | Yes | - | Workspace name |
| `OPIK_PROJECT` | No | `stride` | Project name |
| `OPIK_BASE_URL` | No | `https://www.comet.com/opik/api` | Self-hosted URL |
| `ENABLE_OPIK` | No | `true` | Set `false` to disable |
| `GROQ_API_KEY` | For Groq | - | Groq API key |
| `GROQ_MODEL` | No | `llama-3.1-70b-versatile` | Groq model name |
| `GEMINI_API_KEY` | For Gemini | - | Google AI API key |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model name |
| `LLM_PROVIDER` | No | `groq` | `groq` or `gemini` |

---

> **See also**: [docs/0-main/OPIK.md](../0-main/OPIK.md) for feature-specific trace hierarchies and killer feature documentation.
