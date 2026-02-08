# Data Flow Architecture

**Last Updated**: 2026-02-08

This document describes how data flows through Stride's architecture.

## Request Flow Overview

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐      ┌─────────┐
│   Browser   │ ──── │ SolidStart SSR  │ ──── │  API Routes  │ ──── │ DuckDB  │
│ (SolidJS)   │      │    (Vinxi)      │      │ routes/api/* │      │  (.db)  │
└─────────────┘      └─────────────────┘      └──────────────┘      └─────────┘
                                                     │
                                                     ├──────────────────┐
                                                     ▼                  ▼
                                              ┌──────────────┐   ┌──────────────┐
                                              │  LLM Provider │   │    Opik      │
                                              │ (OpenAI SDK)  │   │  (Tracing)   │
                                              └──────────────┘   └──────────────┘
```

LLM provider is configurable at runtime: Mistral, Groq, Gemini, OpenAI, or any OpenAI-compatible API.

## Onboarding Chat Flow (Screen 0: `/`)

```
User Message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    POST /api/chat                           │
├─────────────────────────────────────────────────────────────┤
│ 1. Parse request (message, step, context, threadId)         │
│ 2. Detect intent (lib/chat/intent/detector.ts)              │
│    ├─ Rule-based detection (37+ intent actions)             │
│    └─ LLM fallback (lib/chat/intent/llmClassifier.ts)       │
│ 3. If onboarding mode:                                      │
│    ├─ Hybrid extraction (regex + LLM)                       │
│    │   ├─ Regex patterns (lib/chat/extraction/patterns.ts)  │
│    │   └─ LLM extraction (lib/chat/extraction/groqExtractor)│
│    ├─ Merge extracted data with existing profile            │
│    ├─ Flow controller determines next step                  │
│    └─ Generate response message                             │
│ 4. Hybrid evaluation (heuristics 60% + G-Eval 40%)         │
│ 5. Log feedback scores to Opik                              │
│ 6. Return response + extractedData + nextStep               │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
OnboardingChat.tsx updates state & persists to DuckDB via profileService
```

## Profile Data Flow

```
┌─────────────────┐
│ OnboardingChat  │
│  (UI Component) │
└────────┬────────┘
         │ API calls (fetch)
         ▼
┌─────────────────┐      ┌───────────────────────────┐
│ profileService  │ ◄──► │         DuckDB            │
│ (State Manager) │      │      profiles table       │
│ debounce: 2000ms│      └───────────────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Related Tables (foreign key: profile_id)│
├─────────────────────────────────────────┤
│ • skills           • goals              │
│ • income_streams   • expenses           │
│ • inventory_items  • subscriptions      │
│ • leads            • academic_events    │
│ • energy_logs      • retroplans         │
│ • goal_achievements                     │
└─────────────────────────────────────────┘
```

**Note**: No localStorage fallback. Removed intentionally to prevent cross-profile data contamination (Sprint 2 Bug #8).

## Tab Data Flow (Screen 1: `/me`)

Each tab loads its data independently:

| Tab | API Endpoint | Service | Notes |
|-----|--------------|---------|-------|
| Profile | /api/profiles | profileService | Profile + skills (embedded) |
| Goals | /api/goals | goalService | Goals + components + achievements |
| Budget | /api/budget | budgetEngine | Budget analysis + insights |
| Trade | /api/trades, /api/inventory | tradeService, inventoryService | Items to sell/trade |
| Jobs | /api/prospection, /api/job-listings | - | Google Maps + job search |

## Swipe Flow (Screen 2: `/swipe`)

```
┌─────────────┐      ┌────────────────┐      ┌──────────────────┐
│ SwipeSession │ ──── │ /api/retroplan │ ──── │ Swipe Orchestrator│
│ (Component)  │      │ roll_dice      │      │ (MCP Agent)      │
└──────┬───────┘      └────────────────┘      └──────┬───────────┘
       │                                              │
       │ swipe left/right                             ▼
       ▼                                     ┌──────────────────┐
┌──────────────┐                             │ Guardrail Agents │
│/api/swipe-   │                             │ (4 agents)       │
│  trace       │                             └──────────────────┘
│ (+ Opik)     │
└──────────────┘
```

## Mastra Agent Flow

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│   Browser   │ ──── │   API Routes    │ ──── │ Mastra Agent │
└─────────────┘      │ /api/agent.ts   │      │   Factory    │
                     │ /api/tab-tips   │      └──────┬───────┘
                     │ /api/tips       │             │
                     └─────────────────┘  ┌──────────┼──────────┐
                                          ▼          ▼          ▼
                                   ┌───────────┐ ┌────────┐ ┌────────┐
                                   │ Budget    │ │ Job    │ │ Money  │
                                   │ Coach    │ │ Matcher│ │ Maker  │
                                   └───────────┘ └────────┘ └────────┘
                                          │          │          │
                                          └──────────┴──────────┘
                                                     │
                                              ┌──────┴──────┐
                                              │ LLM + Opik  │
                                              │(Provider-   │
                                              │ agnostic)   │
                                              └─────────────┘
```

## Opik Tracing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Opik Trace Hierarchy                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  chat.onboarding (parent trace)                             │
│  ├── chat.extraction (child span, type: llm)                │
│  │   └── LLM API call with JSON mode                       │
│  ├── chat.data_merge (child span, type: tool)               │
│  │   └── Profile merging logic                              │
│  ├── chat.generation (child span, type: llm)                │
│  │   └── Response generation                                │
│  └── chat.evaluation (child span, type: general)            │
│      └── Hybrid eval (heuristics + G-Eval)                  │
│                                                              │
│  Metadata attached to each span:                            │
│  • profile_id (NOT user_id)                                 │
│  • thread_id (conversation grouping)                        │
│  • step name                                                │
│  • token usage + cost                                       │
│  • prompt.name, prompt.version, prompt.hash                 │
│  • extraction success/failure                               │
│                                                              │
│  PII Sanitization (MCP Server):                             │
│  • Location data (lat, lon, coords) → [LOCATION_REDACTED]  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌──────────────┐
│  API Route   │
├──────────────┤
│ try {        │
│   // logic   │──────► Success: JSON response
│ } catch {    │
│   // error   │──────► Error: { error: true, message: string }
│ }            │
└──────────────┘

Status codes:
• 200: Success
• 400: Bad request (missing params)
• 500: Server error (catch-all)
```
