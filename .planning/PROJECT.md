# Stride Onboarding

## What This Is

A student financial health navigator with an LLM-powered onboarding chat experience. Bruno, the financial coach, guides users through profile setup while Swipe strategies can be triggered directly from chat. Desktop users see embedded iframes, mobile users get navigation buttons. The Goals tab provides unified, capacity-aware progress tracking with consistent calculations across all components.

## Core Value

Frictionless onboarding that keeps users in the conversation flow while taking financial planning actions.

## Current State

**Version:** v4.1 Job Search Enhancement (shipped 2026-02-03)
**Next:** v4.2 polish or new milestone

**Tech stack:** SolidStart, SolidJS, TailwindCSS, ~62,000 LOC TypeScript

## Previous Milestones

### v4.1 Job Search Enhancement (shipped 2026-02-03)

**Shipped:**
- User-configurable search radius slider (1-20km range)
- API respects user-provided radius with progressive fallback
- Commute time display in job cards (was already implemented)
- Radius display in search results header

**Deferred to future:**
- Background prefetch during onboarding (requires job cache store, high complexity)

### v4.0 Goals Tab Fix (shipped 2026-02-02)

**Shipped:**
- useGoalData hook centralizing all goal data orchestration (601 LOC)
- earningsAggregator for unified date-attributed earnings (326 LOC)
- goalStatus.ts with configurable GOAL_STATUS_THRESHOLDS
- Unified capacity-aware calculations everywhere
- Avatar display fix and label clarity improvements
- Chart legend with color-coded lines

### v3.0 Early Engagement (shipped 2026-02-02)

**Shipped:**
- Privacy consent flow with FERPA/GDPR compliance
- Fuzzy coordinate storage (city-level only)
- PII sanitization in Opik traces
- Google Maps service export for frontend
- Photo billing control (opt-in)
- Job scoring utilities and category mapping

### v2.1 Bugfixes (shipped 2026-01-31)

**Shipped:**
- Quick links render actual charts (Budget, Goals, Energy, Savings)
- Form data displays correctly (subscriptions, dynamic currency)
- Onboarding state persists across navigation
- "Start My Plan" in chat completion message
- Dark mode visibility (emerald gradient)
- GridMultiSelect with flexible layouts

### v2.0 Stride Onboarding (shipped 2026-01-31)

**Shipped:**
- Swipe-in-Chat integration with responsive rendering
- GridMultiSelect for skills/certifications
- Bruno orbital pulse animation and progress indicator polish
- Conditional navigation visibility during onboarding
- Quick links triggering charts in chat
- English localization throughout

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
- ✓ useGoalData hook centralization — v4.0
- ✓ EarningEvent type with date attribution — v4.0
- ✓ Capacity-aware calculations everywhere — v4.0
- ✓ Configurable status thresholds — v4.0
- ✓ Correct earnings week attribution — v4.0
- ✓ Avatar display fix — v4.0
- ✓ Chart clarity (tooltips, legend) — v4.0
- ✓ Radius slider for job search — v4.1
- ✓ Commute time display — v4.1

### Active

See `.planning/REQUIREMENTS.md` for next milestone requirements.

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
- ProspectionTab with map and cards
- Skill arbitrage algorithm for scoring
- Centralized useGoalData hook for goal progress

**Privacy note:** Using consent-first approach with no raw GPS storage. City-level or radius-from-point only.

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
| Direct MCP import over HTTP | Same monorepo, pattern proven in agent.ts | ✓ Good |
| Privacy-first location consent | Legal requirement for student apps | ✓ Good |
| No raw GPS storage | Privacy by design for hackathon | ✓ Good |
| Centralized useGoalData hook | Single source of truth for goal calculations | ✓ Good |
| Configurable GOAL_STATUS_THRESHOLDS | Easy tuning, consistency across components | ✓ Good |
| Native HTML tooltips | No dependencies, accessibility built-in | ✓ Good |

---
*Last updated: 2026-02-02 after v4.0 Goals Tab Fix milestone*
