# Stride Onboarding

## What This Is

A student financial health navigator with an LLM-powered onboarding chat experience. Bruno, the financial coach, guides users through profile setup while Swipe strategies can be triggered directly from chat. Desktop users see embedded iframes, mobile users get navigation buttons.

## Core Value

Frictionless onboarding that keeps users in the conversation flow while taking financial planning actions.

## Current Milestone: v3.0 Early Engagement

**Goal:** Exploit geolocation from onboarding step 1 to show real job opportunities during profile setup.

**Target features:**
- Privacy-first location consent (allow GPS or enter city)
- Real Google Places API results (replace mocks)
- Skill-based job matching from onboarding skills
- Background prefetch during onboarding
- Commute time display and radius slider
- Star rating with scoring algorithm

**Key insight:** The infrastructure exists (MCP tools, Google Maps service) but wasn't connected. This milestone wires the frontend to real data.

## Previous Milestones

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

### Active

See `.planning/REQUIREMENTS.md` for v3.0 requirements:
- Privacy & Consent (PRIV-01 to PRIV-04)
- Real Job Search (JOBS-01 to JOBS-05)
- Background Prefetch (PREF-01 to PREF-03)
- Commute & Distance (COMM-01 to COMM-03)
- UI Enhancements (UI-01 to UI-03)

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
*Last updated: 2026-02-01 after v3.0 milestone initialization*
