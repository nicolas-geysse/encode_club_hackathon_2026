# Requirements: Swipe-in-Chat

**Defined:** 2026-01-31
**Core Value:** Users can trigger and interact with Swipe strategies directly from chat

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Intent Detection

- [x] **INTD-01**: User message "swipe" triggers swipe intent ✅
- [x] **INTD-02**: User message "actions" triggers swipe intent ✅
- [x] **INTD-03**: User message "stratégies" triggers swipe intent ✅
- [x] **INTD-04**: User message "que puis-je faire?" triggers swipe intent ✅
- [x] **INTD-05**: User message "quelles options" triggers swipe intent ✅

### UI Resource

- [x] **UIRS-01**: Chat API returns `swipe_embed` UIResource type ✅
- [x] **UIRS-02**: UIResource includes embedUrl (`/embed/swipe`) ✅
- [x] **UIRS-03**: UIResource includes fallbackUrl (`/plan?tab=swipe`) ✅
- [x] **UIRS-04**: UIResource includes configurable height (default 450px) ✅

### Embed Route

- [x] **EMBD-01**: `/embed/swipe` route renders SwipeTab component ✅
- [x] **EMBD-02**: Embed route has no header/navigation chrome ✅
- [x] **EMBD-03**: SwipeTab accepts `embedMode` prop ✅

### Responsive Rendering

- [x] **RESP-01**: Desktop (>768px) renders iframe with Swipe component ✅
- [x] **RESP-02**: Mobile (≤768px) renders "Swipe to plan ! →" navigation button ✅
- [x] **RESP-03**: Viewport changes update rendering mode ✅

### Communication

- [ ] **COMM-01**: SwipeTab in embed mode sends postMessage on swipe completion
- [ ] **COMM-02**: OnboardingChat listens for swipe_completed messages
- [ ] **COMM-03**: Chat displays acknowledgment when swipe is completed

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Communication

- **COMM-04**: Bidirectional postMessage (parent can send commands to iframe)
- **COMM-05**: Real-time profile sync between iframe and parent

### Additional Triggers

- **INTD-06**: "Quoi faire maintenant?" triggers swipe intent
- **INTD-07**: "Donne-moi des idées" triggers swipe intent

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| MCP-UI plugin modification | Too heavy, iframe approach is simpler |
| Real-time state sync | postMessage callback sufficient, user can ask for status |
| Parent-to-iframe commands | Not needed for MVP, one-way communication works |
| Inline swipe cards (no iframe) | Would require custom MCP-UI components |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| INTD-01 | Phase 1 | Intent Detection | Complete |
| INTD-02 | Phase 1 | Intent Detection | Complete |
| INTD-03 | Phase 1 | Intent Detection | Complete |
| INTD-04 | Phase 1 | Intent Detection | Complete |
| INTD-05 | Phase 1 | Intent Detection | Complete |
| UIRS-01 | Phase 2 | UI Resource | Complete |
| UIRS-02 | Phase 2 | UI Resource | Complete |
| UIRS-03 | Phase 2 | UI Resource | Complete |
| UIRS-04 | Phase 2 | UI Resource | Complete |
| EMBD-01 | Phase 3 | Embed Route | Complete |
| EMBD-02 | Phase 3 | Embed Route | Complete |
| EMBD-03 | Phase 3 | Embed Route | Complete |
| RESP-01 | Phase 4 | Responsive Rendering | Complete |
| RESP-02 | Phase 4 | Responsive Rendering | Complete |
| RESP-03 | Phase 4 | Responsive Rendering | Complete |
| COMM-01 | Phase 5 | Communication | Pending |
| COMM-02 | Phase 5 | Communication | Pending |
| COMM-03 | Phase 5 | Communication | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after roadmap creation*
