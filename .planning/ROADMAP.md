# Roadmap: Stride Onboarding

## Overview

This roadmap covers two milestones: (1) Swipe-in-Chat integration (Phases 1-5, complete), and (2) Onboarding UX Polish (Phases 6-10, in progress). The onboarding sprint addresses technical debt, improves selection UX, adds visual polish, and fixes navigation flow.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

### Milestone 1: Swipe-in-Chat (Complete)

- [x] **Phase 1: Intent Detection** - Recognize swipe-related messages in chat
- [x] **Phase 2: UI Resource** - Chat API returns embed configuration
- [x] **Phase 3: Embed Route** - Standalone swipe route for iframe
- [x] **Phase 4: Responsive Rendering** - Desktop iframe vs mobile navigation
- [x] **Phase 5: Communication** - postMessage bridge for swipe feedback

### Milestone 2: Fix Onboarding

- [ ] **Phase 6: Critical Fixes** - Start My Plan button positioning, localization to English
- [ ] **Phase 7: UX Improvements** - Skills/certifications grid selection, form simplifications
- [ ] **Phase 8: Visual Polish** - Progress indicator, Bruno orbital pulse animation
- [ ] **Phase 9: Navigation Flow** - Conditional nav visibility, post-onboarding shortcuts
- [ ] **Phase 10: Debug** - Investigate runtime errors

## Phase Details

### Phase 1: Intent Detection
**Goal**: Chat recognizes when users want to interact with Swipe strategies
**Depends on**: Nothing (first phase)
**Requirements**: INTD-01, INTD-02, INTD-03, INTD-04, INTD-05
**Success Criteria** (what must be TRUE):
  1. User typing "swipe" in chat triggers swipe intent response
  2. User typing "actions" or "strategies" triggers swipe intent response
  3. French phrases like "que puis-je faire?" and "quelles options" trigger swipe intent
  4. Intent detection works in both regex fast-path and LLM fallback modes
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md - Add swipe intent detection (regex + LLM fallback)

### Phase 2: UI Resource
**Goal**: Chat API returns properly structured UIResource for swipe embedding
**Depends on**: Phase 1
**Requirements**: UIRS-01, UIRS-02, UIRS-03, UIRS-04
**Success Criteria** (what must be TRUE):
  1. API returns `swipe_embed` UIResource type when swipe intent detected
  2. UIResource contains embedUrl pointing to `/embed/swipe`
  3. UIResource contains fallbackUrl pointing to `/plan?tab=swipe`
  4. UIResource includes configurable height (default 450px)
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md - Add swipe_embed UIResource type and API handler

### Phase 3: Embed Route
**Goal**: Standalone swipe route renders SwipeTab without navigation chrome
**Depends on**: Phase 2
**Requirements**: EMBD-01, EMBD-02, EMBD-03
**Success Criteria** (what must be TRUE):
  1. Visiting `/embed/swipe` renders functional SwipeTab component
  2. Embed route displays no header, sidebar, or navigation elements
  3. SwipeTab component accepts and respects `embedMode` prop
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md - Create embed route and add embedMode to SwipeTab
- [x] 03-02-PLAN.md - Fix layout exclusion for embed routes (gap closure)

### Phase 4: Responsive Rendering
**Goal**: Chat displays appropriate UI based on viewport size
**Depends on**: Phase 3
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. On desktop (>768px), chat message includes iframe with Swipe component
  2. On mobile (<=768px), chat message shows "Swipe to plan !" navigation button
  3. Resizing viewport dynamically updates rendering mode
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md - Add SwipeEmbedResource with responsive iframe/button rendering

### Phase 5: Communication
**Goal**: Swipe actions in iframe are acknowledged in chat
**Depends on**: Phase 4
**Requirements**: COMM-01, COMM-02, COMM-03
**Success Criteria** (what must be TRUE):
  1. Swiping left/right in embed mode sends postMessage to parent window
  2. OnboardingChat receives and processes swipe_completed messages
  3. Chat displays contextual acknowledgment (e.g., "Strategy accepted!" or "Skipped strategy")
**Plans**: 1 plan

Plans:
- [x] 05-01-PLAN.md - Add postMessage bridge for swipe acknowledgments

### Phase 6: Critical Fixes
**Goal**: Fix broken UX that impacts first impression
**Depends on**: Phase 5
**Requirements**: Start My Plan button stability, English localization
**Success Criteria** (what must be TRUE):
  1. "Start my plan" button stays in place when new messages are added
  2. No duplicate "Start my plan" button in sidebar
  3. All chat responses and UI text are in English
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md - Remove in-chat Start My Plan button (keep stable sidebar/mobile CTAs)
- [x] 06-02-PLAN.md - Translate all French strings to English

### Phase 7: UX Improvements
**Goal**: Improve selection UX for skills and forms
**Depends on**: Phase 6
**Requirements**: Grid multi-select for skills/certifications, form simplifications
**Success Criteria** (what must be TRUE):
  1. Skills selection uses scrollable grid with clickable chips (not dropdown)
  2. Professional certifications use same grid pattern
  3. "Items to sell" form has no category field
  4. "Borrow" form has no "from whom" field
  5. Subscriptions can add multiple items with "Add subscription" button
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md - Create GridMultiSelect component for skills/certifications
- [ ] 07-02-PLAN.md - Simplify forms (sell, borrow, subscriptions)

### Phase 8: Visual Polish
**Goal**: Add visual feedback and animations to onboarding
**Depends on**: Phase 7
**Requirements**: Progress indicator improvements, Bruno animation
**Success Criteria** (what must be TRUE):
  1. Progress indicator connector lines are clearly visible
  2. Active step has subtle pulse animation with slight enlargement
  3. "Generating Plan" step text turns green when complete
  4. Bruno avatar has orbital pulse breathing animation
**Plans**: TBD

Plans:
- [ ] 08-01-PLAN.md - Enhance progress indicator (lines, pulse, green state)
- [ ] 08-02-PLAN.md - Add Bruno orbital pulse animation

### Phase 9: Navigation Flow
**Goal**: Progressive disclosure of navigation based on onboarding state
**Depends on**: Phase 8
**Requirements**: Conditional nav visibility, post-onboarding shortcuts
**Success Criteria** (what must be TRUE):
  1. During onboarding, only "Onboarding" link is visible in nav
  2. After completion, "My Plan", "Tracking", "Debug" appear with reveal animation
  3. Post-onboarding shows quick links (Budget, Savings, Goals, Energy) below Bruno
**Plans**: TBD

Plans:
- [ ] 09-01-PLAN.md - Implement conditional nav visibility with reveal animation
- [ ] 09-02-PLAN.md - Add post-onboarding quick link shortcuts

### Phase 10: Debug
**Goal**: Investigate and fix runtime errors
**Depends on**: Phase 9
**Requirements**: Fix async listener error in certifications
**Success Criteria** (what must be TRUE):
  1. No runtime.lastError warnings during certification selection
  2. No noticeable lag during selection interactions
**Plans**: TBD

Plans:
- [ ] 10-01-PLAN.md - Investigate and fix runtime errors

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> ... -> 10

### Milestone 1: Swipe-in-Chat

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Intent Detection | 1/1 | Complete | 2026-01-31 |
| 2. UI Resource | 1/1 | Complete | 2026-01-31 |
| 3. Embed Route | 2/2 | Complete | 2026-01-31 |
| 4. Responsive Rendering | 1/1 | Complete | 2026-01-31 |
| 5. Communication | 1/1 | Complete | 2026-01-31 |

### Milestone 2: Fix Onboarding

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Critical Fixes | 2/2 | Complete | 2026-01-31 |
| 7. UX Improvements | 0/2 | Not Started | — |
| 8. Visual Polish | 0/2 | Not Started | — |
| 9. Navigation Flow | 0/2 | Not Started | — |
| 10. Debug | 0/1 | Not Started | — |
