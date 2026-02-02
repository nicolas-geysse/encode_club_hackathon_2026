# Project Milestones: Stride Onboarding

## v3.0 Early Engagement (Shipped: 2026-02-02)

**Delivered:** Privacy-first location handling and real Google Places API integration for job discovery

**Phases completed:** 16-17 (6 plans total)

**Key accomplishments:**
- Privacy consent flow with FERPA/GDPR compliance
- Fuzzy coordinate storage (city-level only, 2 decimal precision)
- PII sanitization in Opik traces
- Google Maps service export for direct frontend imports
- Photo billing control (opt-in to avoid API costs)
- Job scoring utilities and category-to-place-type mapping
- Star rating display and Top Pick badges on job cards

**Deferred to v4.1:**
- Background prefetch during onboarding (PREF-01 to PREF-03)
- Commute time display and radius slider (COMM-01 to COMM-03)

**Stats:**
- 8 files modified
- +1200 / -300 lines (net +900)
- 6 plans executed
- 2 days sprint (2026-02-01 to 2026-02-02)

**Git range:** `docs(16-01)` → `docs(17-03)`

**What's next:** v4.0 Goals Tab Fix

---

## v2.1 Bugfixes (Shipped: 2026-01-31)

**Delivered:** Fixed all critical bugs from demo testing — charts render correctly, forms display properly, state persists, dark mode visible

**Phases completed:** 11-15 (5 plans total)

**Key accomplishments:**
- Quick links render actual charts via `__action:` prefix pattern (bypasses intent detection)
- Form data displays correctly (subscription serialization, dynamic currency symbols)
- Onboarding state persists across navigation (hydration-safe localStorage pattern)
- "Start My Plan" button in chat completion message (better UX flow)
- Bruno avatar and progress pulse visible in dark mode (emerald gradient)
- GridMultiSelect variant prop with flexible column layouts and full-width titles

**Stats:**
- 8 files modified
- +189 / -107 lines (net +82)
- 5 phases, 5 plans
- 1 day sprint (2026-01-31)

**Git range:** `docs(11)` → `docs(15)`

**What's next:** Production release ready

---

## v2.0 Stride Onboarding (Shipped: 2026-01-31)

**Delivered:** Complete onboarding UX with Swipe-in-Chat integration, visual polish, and navigation flow improvements

**Phases completed:** 1-10 (15 plans total)

**Key accomplishments:**
- Swipe-in-Chat: Intent detection, responsive iframe/button rendering, postMessage communication
- GridMultiSelect component for skills/certifications selection (replaces dropdown)
- Bruno orbital pulse animation and progress indicator enhancements
- Conditional navigation visibility during onboarding flow
- Quick links triggering charts directly in chat (Budget, Goals, Energy)
- English localization (translated all French strings)

**Stats:**
- 69 files created/modified
- ~60,849 lines of TypeScript
- 10 phases, 15 plans
- 1 day sprint (2026-01-31)

**Git range:** `feat(01-01)` → `docs(10)`

**What's next:** Production demo and user testing

---
