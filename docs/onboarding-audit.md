# Onboarding Audit - Stride

**Date**: 2026-01-21
**Version**: 1.1 (Optimized Flow)
**Status**: Audit Complete

> This document provides a structured audit of the onboarding implementation.
> For feature requirements and design, see [onboarding.md](./onboarding.md).

---

## Table of Contents

1. [Question Flow (13 Steps)](#1-question-flow-13-steps)
2. [Profile Data Model](#2-profile-data-model)
3. [Core Features](#3-core-features)
4. [Implemented Optimizations](#4-implemented-optimizations)
5. [Complete Audit Checklist](#5-complete-audit-checklist)
6. [Key Files Reference](#6-key-files-reference)
7. [Verification Commands](#7-verification-commands)

---

## 1. Question Flow (13 Steps)

**OPTIMIZED**: City is now asked first (step 1) to enable early background data fetching and auto-detect currency.

| # | Step ID | Question | File | Status |
|---|---------|----------|------|--------|
| 1 | `greeting` | What city do you live in? | `OnboardingChat.tsx:95` | ✅ Implemented |
| 2 | `currency_confirm` | Currency confirmation (only if not auto-detected) | `OnboardingChat.tsx:96` | ✅ Implemented |
| 3 | `name` | What's your name? | `OnboardingChat.tsx:97` | ✅ Implemented |
| 4 | `studies` | What are you studying? | `OnboardingChat.tsx:98` | ✅ Implemented |
| 5 | `skills` | What are your skills? | `OnboardingChat.tsx:99` | ✅ Implemented |
| 6 | `certifications` | Professional certifications? | `OnboardingChat.tsx:100` | ✅ Implemented |
| 7 | `budget` | Monthly income/expenses? | `OnboardingChat.tsx:101` | ✅ Implemented |
| 8 | `work_preferences` | Max hours, min rate? | `OnboardingChat.tsx:102` | ✅ Implemented |
| 9 | `goal` | Savings goal (name, amount, deadline)? | `OnboardingChat.tsx:103` | ✅ Implemented |
| 10 | `academic_events` | Exams, vacations, busy periods? | `OnboardingChat.tsx:104` | ✅ Implemented |
| 11 | `inventory` | Items to sell? | `OnboardingChat.tsx:105` | ✅ Implemented |
| 12 | `trade` | Borrow/lend opportunities? | `OnboardingChat.tsx:106` | ✅ Implemented |
| 13 | `lifestyle` | Subscriptions? | `OnboardingChat.tsx:107` | ✅ Implemented |

> **Note**: Step 2 (`currency_confirm`) is automatically skipped if the user's city is recognized (Paris → EUR, London → GBP, New York → USD).

---

## 2. Profile Data Model

| Field | Type | Collected At | File | Status |
|-------|------|--------------|------|--------|
| `id` | string | Auto | `profileService.ts` | ✅ |
| `name` | string | Step 3 | `profileService.ts:L45` | ✅ |
| `diploma` | string | Step 4 | `profileService.ts:L46` | ✅ |
| `field` | string | Step 4 | `profileService.ts:L47` | ✅ |
| `city` | string | Step 7 | `profileService.ts:L49` | ✅ |
| `citySize` | string | Auto-detect | `profileService.ts:L50` | ✅ |
| `currency` | USD/EUR/GBP | Step 1-2 | `profileService.ts:L48` | ✅ |
| `skills` | string[] | Step 5 | `profileService.ts:L51` | ✅ |
| `certifications` | string[] | Step 6 | `profileService.ts:L52` | ✅ |
| `incomeSources` | IncomeSource[] | Step 8 | `profileService.ts:L53` | ✅ |
| `expenses` | Expense[] | Step 8 | `profileService.ts:L54` | ✅ |
| `maxWorkHoursWeekly` | number | Step 9 | `profileService.ts:L58` | ✅ |
| `minHourlyRate` | number | Step 9 | `profileService.ts:L59` | ✅ |
| `goalName` | string | Step 10 | `profileService.ts:L62` | ✅ |
| `goalAmount` | number | Step 10 | `profileService.ts:L63` | ✅ |
| `goalDeadline` | string | Step 10 | `profileService.ts:L64` | ✅ |
| `academicEvents` | AcademicEvent[] | Step 11 | `profileService.ts:L66` | ✅ |
| `inventoryItems` | InventoryItem[] | Step 12 | `profileService.ts:L67` | ✅ |
| `tradeOpportunities` | TradeOpportunity[] | Step 13 | `profileService.ts:L69` | ✅ |
| `subscriptions` | Subscription[] | Step 14 | `profileService.ts:L68` | ✅ |
| `swipePreferences` | SwipePreferences | Auto-init | `plan.tsx` | ✅ |

---

## 3. Core Features

| Feature | Description | File(s) | Status |
|---------|-------------|---------|--------|
| **Single-Goal Policy** | Archive old goals before creating new | `OnboardingChat.tsx:1058-1092`, `goalService.ts` | ✅ Implemented |
| **Smart Array Merge** | Intelligent merge on re-entry | `arrayMergeUtils.ts` | ✅ Implemented |
| **Profile Completion Check** | Detect if profile is complete | `OnboardingChat.tsx:554-565` | ✅ Implemented |
| **Chat Mode Detection** | onboarding/conversation/profile-edit | `OnboardingChat.tsx:119` | ✅ Implemented |
| **Profile Switch Handling** | Reset chat on profile change | `OnboardingChat.tsx:455-551` | ✅ Implemented |
| **Fallback Responses** | Continue if API fails | `OnboardingChat.tsx:getFallbackResponse()` | ✅ Implemented |
| **Auto-Save Debounced** | 500ms debounce to DuckDB | `profileService.ts` | ✅ Implemented |
| **localStorage Fallback** | Backup if API down | `OnboardingChat.tsx:569-697` | ✅ Implemented |
| **Currency Auto-Detection** | From region selection | `OnboardingChat.tsx` | ✅ Implemented |
| **City Size Auto-Detection** | detectCityMetadata() | `profileService.ts` | ✅ Implemented |

---

## 4. Implemented Optimizations

### 4.1 Question Reordering ✅ IMPLEMENTED

| Change | Before | After | Status |
|--------|--------|-------|--------|
| City first | Region (1) → City (7) | City (1) → Currency confirm (2) | ✅ Implemented |
| Currency auto-detect | Manual selection | Auto from city via `detectCurrencyFromCity()` | ✅ Implemented |
| Skip confirmation | Always asked | Skipped if city recognized | ✅ Implemented |

**Files modified**:
- `OnboardingChat.tsx`: Flow reordered, `detectCityMetadata()` integration
- `chat.ts`: Step prompts, flow array, fallback responses updated
- `OnboardingProgress.tsx`: Step mapping updated

### 4.2 Future Optimizations (Not Implemented)

| Feature | Description | Status | Priority |
|---------|-------------|--------|----------|
| Browser Geolocation API | Request GPS permission | ❌ Not implemented | P2 |
| Reverse Geocoding | Coordinates → city, country | ❌ Not implemented | P2 |
| Cost of Living API | Numbeo or equivalent | ❌ Not implemented | P3 |
| Local Jobs Fetch | Indeed/LinkedIn scraping | ❌ Not implemented | P3 |
| Skill Rates Fetch | Local hourly rates | ❌ Not implemented | P3 |
| Personalized questions | "In Brooklyn, a tutor earns $30/h" | ❌ Not implemented | P3 |

---

## 5. Complete Audit Checklist

### 5.1 Data Collection ✅

- [x] Location - City first (`OnboardingChat.tsx:95` - greeting step)
- [x] Currency auto-detect or confirm (`OnboardingChat.tsx:96` - currency_confirm step)
- [x] Identity - Name (`OnboardingChat.tsx:97`)
- [x] Studies - Diploma, Field (`OnboardingChat.tsx:98`)
- [x] Skills - Skills array (`OnboardingChat.tsx:99`)
- [x] Professional certifications (`OnboardingChat.tsx:100`)
- [x] Budget - Income/Expenses (`OnboardingChat.tsx:101`)
- [x] Work preferences - Max hours, Min rate (`OnboardingChat.tsx:102`)
- [x] Goal - Name, Amount, Deadline (`OnboardingChat.tsx:103`)
- [x] Academic events (`OnboardingChat.tsx:104`)
- [x] Inventory items to sell (`OnboardingChat.tsx:105`)
- [x] Trade opportunities (`OnboardingChat.tsx:106`)
- [x] Subscriptions (`OnboardingChat.tsx:107`)

### 5.2 Persistence ✅

- [x] DuckDB save (`profileService.ts:saveProfile()`)
- [x] localStorage fallback (`OnboardingChat.tsx:580-590`)
- [x] Chat history persistence (`OnboardingChat.tsx:persistChatHistory()`)
- [x] 500ms debounce (`profileService.ts`)
- [x] Profile embedding (disabled) (`OnboardingChat.tsx:triggerProfileEmbedding()`)

### 5.3 Goal Management ✅

- [x] Goal creation at onboarding end (`OnboardingChat.tsx:1344-1376`)
- [x] Single-goal policy - archive before creation (`OnboardingChat.tsx:1058-1092`)
- [x] Input validation (`goalService.ts`)
- [x] Event emission DATA_CHANGED (`goalService.ts`)
- [x] UI refresh after creation (`profileContext.tsx`)

### 5.4 UX/UI ✅

- [x] MCP-UI Forms (`MCPUIRenderer.tsx:292-414`)
- [x] Field validation (required, number) (`MCPUIRenderer.tsx`)
- [x] Error display (`MCPUIRenderer.tsx`)
- [x] Slash commands (/goal, /budget, /skills) (`chat.ts`)
- [x] Dark mode calendar (`MCPUIRenderer.tsx`)
- [x] Profile selector with confirm (`profileContext.tsx`)

### 5.5 Robustness ✅

- [x] Fallback responses if API down (`OnboardingChat.tsx:getFallbackResponse()`)
- [x] Smart array merge (`arrayMergeUtils.ts`)
- [x] Profile completion detection (`OnboardingChat.tsx:554-565`)
- [x] Profile switch handling (`OnboardingChat.tsx:455-551`)
- [x] Race condition prevention (`OnboardingChat.tsx`)

### 5.6 Future Enhancements ❌

- [ ] Browser Geolocation API (auto-detect city)
- [ ] Reverse geocoding (coordinates → city)
- [ ] Background fetching (cost of living, jobs, rates)
- [ ] Personalized questions with local data
- [ ] Cache layer for fetches
- [ ] Scraping APIs (Numbeo, Indeed, etc.)

> **Note**: Question reordering and currency auto-detection are now ✅ implemented (see Section 4.1).

---

## 6. Key Files Reference

| File | Role | Key Lines |
|------|------|-----------|
| `packages/frontend/src/components/chat/OnboardingChat.tsx` | Main flow | 94-108 (steps), 803-854 (flow + fallbacks), 827-836 (currency auto-detect) |
| `packages/frontend/src/components/chat/OnboardingProgress.tsx` | Progress bar | 24-40 (step → phase mapping) |
| `packages/frontend/src/lib/cityUtils.ts` | City/currency detection | 165-190 (detectCurrencyFromCity) |
| `packages/frontend/src/routes/api/chat.ts` | Chat API | 435-449 (steps), 1200-1238 (getNextStep + skip logic) |
| `packages/frontend/src/lib/profileService.ts` | Data model | 45-70 (FullProfile) |
| `packages/frontend/src/lib/goalService.ts` | Goals CRUD | createGoal, validation |

---

## 7. Verification Commands

```bash
# Verify onboarding step type
grep -n "type OnboardingStep" packages/frontend/src/components/chat/OnboardingChat.tsx

# Verify city-first flow
grep -n "greeting.*city\|currency_confirm" packages/frontend/src/components/chat/OnboardingChat.tsx

# Verify currency auto-detection
grep -n "detectCurrencyFromCity\|detectCityMetadata" packages/frontend/src/components/chat/OnboardingChat.tsx

# Verify skip logic in chat.ts
grep -n "Skip currency_confirm" packages/frontend/src/routes/api/chat.ts

# Verify single-goal policy
grep -n "archiveGoal\|single.*goal" packages/frontend/src/components/chat/OnboardingChat.tsx
```

---

## 8. Future Implementation Phases (Optional)

### Phase 1 - Browser Geolocation (P2)
- Add `navigator.geolocation` in OnboardingChat
- Integrate reverse geocoding API (OpenStreetMap Nominatim - free)
- Auto-fill city field, let user confirm/edit

### Phase 2 - Background Fetching (P3)
- Create `services/locationData.ts`
- Integrate cost of living API
- Launch parallel fetches on city confirmation

### Phase 3 - Personalization (P3)
- Use fetched data to personalize questions
- "In Paris, tutors typically earn €20-25/h"
- Cache layer to avoid re-fetch
