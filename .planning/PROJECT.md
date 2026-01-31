# Stride Onboarding

## What This Is

A student financial health navigator with an LLM-powered onboarding chat experience. Bruno, the financial coach, guides users through profile setup while Swipe strategies can be triggered directly from chat. Desktop users see embedded iframes, mobile users get navigation buttons.

## Core Value

Frictionless onboarding that keeps users in the conversation flow while taking financial planning actions.

## Current State (v2.1 shipped 2026-01-31)

**Status:** Production ready — all critical bugs fixed

**v2.1 shipped:**
- ✓ Quick links render actual charts (Budget, Goals, Energy, Savings)
- ✓ Form data displays correctly (subscriptions, dynamic currency)
- ✓ Onboarding state persists across navigation
- ✓ "Start My Plan" in chat completion message
- ✓ Dark mode visibility (emerald gradient)
- ✓ GridMultiSelect with flexible layouts

## Current State (v2.0 shipped 2026-01-31)

**Shipped features:**
- ✓ Swipe-in-Chat integration with responsive rendering
- ✓ GridMultiSelect for skills/certifications (replaces dropdown)
- ✓ Bruno orbital pulse animation and progress indicator polish
- ✓ Conditional navigation visibility during onboarding
- ✓ Quick links triggering charts in chat
- ✓ English localization throughout

**Tech stack:** SolidStart, SolidJS, TailwindCSS, ~60,917 LOC TypeScript

## Requirements

### Validated

- ✓ Intent detection for swipe triggers (swipe, actions, stratégies, etc.) — v2.0
- ✓ Chat API returns swipe_embed UIResource with embedUrl/fallbackUrl — v2.0
- ✓ /embed/swipe route renders chrome-free SwipeTab — v2.0
- ✓ Responsive rendering: iframe (desktop) / button (mobile) — v2.0
- ✓ postMessage communication for swipe acknowledgments — v2.0
- ✓ Start My Plan button stability (removed from ScrollArea) — v2.0
- ✓ English localization (all French strings translated) — v2.0
- ✓ GridMultiSelect for skills/certifications — v2.0
- ✓ Simplified forms (sell, borrow, subscriptions) — v2.0
- ✓ Progress indicator visual polish — v2.0
- ✓ Bruno orbital pulse animation — v2.0
- ✓ Conditional navigation visibility — v2.0
- ✓ Quick links for Budget/Goals/Energy — v2.0
- ✓ Quick links render actual charts (not just text) — v2.1
- ✓ 4th quick link "Savings Progress" — v2.1
- ✓ Form data serialization (subscriptions, currency) — v2.1
- ✓ Onboarding state persistence across navigation — v2.1
- ✓ "Start my plan" in chat completion message — v2.1
- ✓ Dark mode visibility (Bruno avatar, progress pulse) — v2.1
- ✓ GridMultiSelect variant prop with full-width titles — v2.1

### Active

(No active requirements — planning next milestone)

### Out of Scope

- MCP-UI plugin modification — iframe approach is simpler
- Real-time profile sync between iframe and parent — user can ask for status
- Bidirectional iframe communication — one-way sufficient
- Mobile app — web-first approach

## Context

**Existing infrastructure:**
- Chat system with intent detection (regex fast-path + LLM fallback)
- MCPUIRenderer handling bar, line, comparison, swipe_embed chart types
- SwipeTab component with embedMode support
- UIResource pattern for chat → UI communication
- Shared onboardingStateStore for cross-component state

**Known issues to address:**
- handleUIAction 'show_chart' case not returning proper UIResource for charts
- localStorage onboarding state not being read on page load
- Subscription form field serialization issue in stepForms.ts
- Hardcoded $ in inventory sell step

## Constraints

- **Tech stack**: SolidJS, SolidStart, existing chat architecture
- **Reuse**: Must use existing SwipeTab component (no duplication)
- **Performance**: Iframe overhead acceptable (~200ms), demand-loaded only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid A+C over pure iframe | Mobile iframes have touch/scroll issues | ✓ Good |
| postMessage for swipe feedback | Allows chat to acknowledge actions without polling | ✓ Good |
| 768px breakpoint | Standard tablet/mobile divide | ✓ Good |
| Autonomous iframe state | Simpler than shared state, profile refetch acceptable | ✓ Good |
| Quick links → charts in chat | User feedback: keep in conversation context | ✓ Good |
| Shared state store | Cross-component nav visibility without prop drilling | ✓ Good |
| Remove in-chat button | Button in ScrollArea moved with messages | ✓ Good |

---
*Last updated: 2026-01-31 after v2.1 milestone completion*
