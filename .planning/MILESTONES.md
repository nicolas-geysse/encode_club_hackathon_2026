# Project Milestones: Stride Onboarding

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
