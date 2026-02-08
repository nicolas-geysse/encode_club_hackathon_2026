# Data Flow Architecture

**Last Updated**: 2026-01-21

This document describes how data flows through Stride's frontend architecture.

## Request Flow Overview

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐      ┌─────────┐
│   Browser   │ ──── │ SolidStart SSR  │ ──── │  API Routes  │ ──── │ DuckDB  │
│ (SolidJS)   │      │    (Vinxi)      │      │ routes/api/* │      │  (.db)  │
└─────────────┘      └─────────────────┘      └──────────────┘      └─────────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │   Groq LLM   │
                                              │  + Opik      │
                                              └──────────────┘
```

## Onboarding Chat Flow (Screen 0)

```
User Message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    POST /api/chat                           │
├─────────────────────────────────────────────────────────────┤
│ 1. Parse request (message, step, context, threadId)         │
│ 2. Check for slash commands (/budget, /goal, /help)         │
│ 3. If onboarding mode:                                      │
│    ├─ Call processWithGroqExtractor()                       │
│    │   ├─ Groq JSON mode extraction (primary)               │
│    │   └─ Regex extraction (fallback)                       │
│    ├─ Merge extracted data with existing profile            │
│    ├─ Determine next step in flow                           │
│    └─ Generate response message                             │
│ 4. Log feedback scores to Opik                              │
│ 5. Return response + extractedData + nextStep               │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
OnboardingChat.tsx updates state & persists to DuckDB
```

## Profile Data Flow

```
┌─────────────────┐      ┌───────────────────────────┐
│ OnboardingChat  │ ──── │ localStorage (persistence)│
│  (UI Components)│      └─────────────┬─────────────┘
└────────┬────────┘                    │
         │                             ▼
         │                 ┌───────────────────────┐
         │                 │ syncLocalToDb()       │
         │                 │ (Background Service)  │
         │                 └───────────┬───────────┘
         │                             │ profile_id (ensured)
         ▼                             ▼
┌─────────────────┐      ┌───────────────────────────┐
│ profileService  │ ◄──► │         DuckDB            │
│ (State Manager) │      │      profiles table       │
└────────┬────────┘      └───────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Related Tables (foreign key: profile_id)│
├─────────────────────────────────────────┤
│ • skills           • goals              │
│ • income_streams   • expenses           │
│ • inventory_items  • subscriptions      │
│ • leads            • academic_events    │
└─────────────────────────────────────────┘
```
         │
         ▼
┌─────────────────────────────────────────┐
│  Related Tables (foreign key: profile_id)│
├─────────────────────────────────────────┤
│ • skills           • goals              │
│ • income_streams   • expenses           │
│ • inventory_items  • subscriptions      │
│ • academic_events  • trade_opportunities│
└─────────────────────────────────────────┘
```

## Tab Data Flow (Screen 1: /plan)

Each tab loads its data independently:

| Tab | API Endpoint | Service | Notes |
|-----|--------------|---------|-------|
| Setup | /api/goals | goalService | Goals + components |
| Skills | /api/skills | skillService | Skills + certifications |
| Inventory | /api/inventory | inventoryService | Items to sell |
| Lifestyle | /api/lifestyle | lifestyleService | Subscriptions |
| Trade | /api/trades | tradeService | Borrow/lend/swap |
| Swipe | /api/retroplan | - | Strategy scenarios |

## Opik Tracing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Opik Trace Hierarchy                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  agent.onboarding (parent trace)                            │
│  ├── agent.llm_extraction (child span, type: llm)           │
│  │   └── Groq API call with JSON mode                       │
│  ├── agent.data_merge (child span, type: tool)              │
│  │   └── Profile merging logic                              │
│  └── agent.response_generation (child span, type: general)  │
│      └── Response construction                              │
│                                                              │
│  Metadata attached to each span:                            │
│  • user_id (profile_id)                                     │
│  • thread_id (conversation grouping)                        │
│  • step name                                                 │
│  • token usage + cost                                        │
│  • extraction success/failure                               │
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

## Future: Mastra Agent Flow

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│   Browser   │ ──── │   API Routes    │ ──── │ Mastra Agent │
└─────────────┘      └─────────────────┘      │   Factory    │
                                               └──────┬───────┘
                                                      │
                                    ┌─────────────────┼─────────────────┐
                                    ▼                 ▼                 ▼
                            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
                            │ Onboarding  │   │ Budget      │   │ Job         │
                            │ Agent       │   │ Coach       │   │ Matcher     │
                            └─────────────┘   └─────────────┘   └─────────────┘
                                    │                 │                 │
                                    └─────────────────┴─────────────────┘
                                                      │
                                                      ▼
                                              ┌─────────────┐
                                              │   Groq +    │
                                              │   Opik      │
                                              └─────────────┘
```
