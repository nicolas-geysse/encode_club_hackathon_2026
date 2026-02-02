# Stride Onboarding

## What This Is

A student financial health navigator with an LLM-powered onboarding chat experience. Bruno, the financial coach, guides users through profile setup while Swipe strategies can be triggered directly from chat. Desktop users see embedded iframes, mobile users get navigation buttons.

## Core Value

Frictionless onboarding that keeps users in the conversation flow while taking financial planning actions.

## Current Milestone: v4.0 Goals Tab Fix

**Goal:** Unify the Goals tab calculation systems and fix data consistency issues through architectural refactoring.

**Target features:**
- `useGoalData` hook centralizing all goal data orchestration
- Unified capacity-aware calculations (replace linear approximations)
- All earnings sources aggregated (missions + savings + trades)
- EarningEvent type with proper date attribution
- Configurable status thresholds
- Avatar display fix and label clarity improvements

**Key insight:** Two parallel calculation systems (capacity-aware in WeeklyProgressCards, linear in EarningsChart) create user confusion. A centralized hook will ensure consistency across all components.

**Reference:** [docs/bugs-dev/goals-fix.md](../docs/bugs-dev/goals-fix.md)

## Previous Milestones

### v3.0 (shipped 2026-02-02)

**Status:** Partial completion — Privacy infrastructure and real API integration

**Shipped:**
- ✓ Privacy consent flow with FERPA/GDPR compliance
- ✓ Fuzzy coordinate storage (city-level only)
- ✓ PII sanitization in Opik traces
- ✓ Google Maps service export for frontend
- ✓ Photo billing control (opt-in)
- ✓ Job scoring utilities and category mapping

**Deferred to v4.1:**
- Background prefetch during onboarding
- Commute time display
- Radius slider UI

### v2.1 (shipped 2026-01-31)

**Status:** Production ready — all critical bugs fixed

**Shipped:**
- ✓ Quick links render actual charts (Budget, Goals, Energy, Savings)
- ✓ Form data displays correctly (subscriptions, dynamic currency)
- ✓ Onboarding state persists across navigation
- ✓ "Start My Plan" in chat completion message
- ✓ Dark mode visibility (emerald gradient)
- ✓ GridMultiSelect with flexible layouts

### v2.0 (shipped 2026-01-31)

**Shipped:**
- ✓ Swipe-in-Chat integration with responsive rendering
- ✓ GridMultiSelect for skills/certifications
- ✓ Bruno orbital pulse animation and progress indicator polish
- ✓ Conditional navigation visibility during onboarding
- ✓ Quick links triggering charts in chat
- ✓ English localization throughout

**Tech stack:** SolidStart, SolidJS, TailwindCSS, ~60,917 LOC TypeScript

## Requirements

### Validated

- ✓ Intent detection for swipe triggers — v2.0
- ✓ Chat API returns swipe_embed UIResource — v2.0
- ✓ /embed/swipe route renders chrome-free SwipeTab — v2.0
- ✓ Responsive rendering: iframe (desktop) / button (mobile) — v2.0
- ✓ postMessage communication for swipe acknowledgments — v2.0
- ✓ Start My Plan button stability — v2.0
- ✓ English localization — v2.0
- ✓ GridMultiSelect for skills/certifications — v2.0
- ✓ Quick links render actual charts — v2.1
- ✓ Form data serialization — v2.1
- ✓ Onboarding state persistence — v2.1
- ✓ Dark mode visibility — v2.1
- ✓ Privacy consent flow — v3.0
- ✓ Fuzzy coordinate storage — v3.0
- ✓ PII sanitization — v3.0
- ✓ Google Maps service integration — v3.0

### Active

See `.planning/REQUIREMENTS.md` for v4.0 requirements:
- Data Architecture (ARCH-01 to ARCH-04)
- Calculation Unification (CALC-01 to CALC-03)
- Earnings Aggregation (EARN-01 to EARN-03)
- UX Polish (UX-01 to UX-04)

### Out of Scope

- OAuth login for job sites — high complexity
- Job application tracking — requires external integrations
- Real-time job availability — too complex for hackathon
- Mobile app — web-first approach
- Precise GPS storage — privacy by design

## Context

**Existing infrastructure:**
- Chat system with intent detection (regex fast-path + LLM fallback)
- MCPUIRenderer handling bar, line, comparison, swipe_embed chart types
- Google Maps service in MCP (findNearbyPlaces, getDistanceMatrix)
- ProspectionTab with map and cards (currently uses mocks)
- Skill arbitrage algorithm for scoring

**Key discovery:** Frontend `/api/prospection` generates mock cards instead of calling MCP tools. The pipeline exists but isn't connected.

**Privacy note:** For hackathon demo, using consent-first approach with no raw GPS storage. City-level or radius-from-point only.

## Constraints

- **Tech stack**: SolidJS, SolidStart, existing MCP architecture
- **API costs**: Google Places API requires field masking to control costs
- **Privacy**: GDPR/FERPA compliance for student data
- **Timeline**: Hackathon demo deadline

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid A+C over pure iframe | Mobile iframes have touch/scroll issues | ✓ Good |
| postMessage for swipe feedback | Allows chat to acknowledge actions without polling | ✓ Good |
| Quick links → charts in chat | User feedback: keep in conversation context | ✓ Good |
| Direct MCP import over HTTP | Same monorepo, pattern proven in agent.ts | — Pending |
| Privacy-first location consent | Legal requirement for student apps | — Pending |
| No raw GPS storage | Privacy by design for hackathon | — Pending |

---
*Last updated: 2026-02-02 after v4.0 Goals Fix milestone initialization*
