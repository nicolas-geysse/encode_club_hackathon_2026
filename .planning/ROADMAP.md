# Roadmap: Swipe-in-Chat

## Overview

This roadmap delivers chat-integrated Swipe functionality in 5 phases. Starting with intent detection to recognize user requests, then building the API response structure, embed route infrastructure, responsive rendering logic, and finally the communication bridge between iframe and chat. Each phase delivers a complete, verifiable capability that enables the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Intent Detection** - Recognize swipe-related messages in chat
- [x] **Phase 2: UI Resource** - Chat API returns embed configuration
- [ ] **Phase 3: Embed Route** - Standalone swipe route for iframe
- [ ] **Phase 4: Responsive Rendering** - Desktop iframe vs mobile navigation
- [ ] **Phase 5: Communication** - postMessage bridge for swipe feedback

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
**Plans**: TBD

Plans:
- [ ] 03-01: [TBD during planning]

### Phase 4: Responsive Rendering
**Goal**: Chat displays appropriate UI based on viewport size
**Depends on**: Phase 3
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. On desktop (>768px), chat message includes iframe with Swipe component
  2. On mobile (<=768px), chat message shows "Swipe to plan !" navigation button
  3. Resizing viewport dynamically updates rendering mode
**Plans**: TBD

Plans:
- [ ] 04-01: [TBD during planning]

### Phase 5: Communication
**Goal**: Swipe actions in iframe are acknowledged in chat
**Depends on**: Phase 4
**Requirements**: COMM-01, COMM-02, COMM-03
**Success Criteria** (what must be TRUE):
  1. Swiping left/right in embed mode sends postMessage to parent window
  2. OnboardingChat receives and processes swipe_completed messages
  3. Chat displays contextual acknowledgment (e.g., "Strategy accepted!" or "Skipped strategy")
**Plans**: TBD

Plans:
- [ ] 05-01: [TBD during planning]

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Intent Detection | 1/1 | Complete | 2026-01-31 |
| 2. UI Resource | 1/1 | Complete | 2026-01-31 |
| 3. Embed Route | 0/TBD | Not started | - |
| 4. Responsive Rendering | 0/TBD | Not started | - |
| 5. Communication | 0/TBD | Not started | - |
