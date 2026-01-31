# Phase 4: Responsive Rendering - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Render appropriate UI in chat based on viewport size. Desktop (>768px) shows an iframe with the SwipeTab component. Mobile (<=768px) shows a navigation button to `/plan?tab=swipe`. The system responds to viewport changes.

Communication between iframe and chat (postMessage) is Phase 5 — not in scope here.

</domain>

<decisions>
## Implementation Decisions

### Iframe Presentation
- Full width within chat message, 450px height (from UIResource config)
- Minimal styling: rounded corners only, no shadows
- No border — seamless integration with chat
- Always visible when rendered (no collapse/expand)

### Mobile Button Design
- Button text: "Swipe to plan ! →" (exact text from requirements)
- Button styling: Claude's discretion (match existing chat action patterns)
- Icon usage: Claude's discretion (appropriate iconography)
- Button positioning: Claude's discretion (based on chat layout)

### Breakpoint Handling
- Breakpoint threshold: Claude's discretion (768px from requirements is default)
- Transition style: Claude's discretion (hard swap vs fade)
- Iframe state on resize: Claude's discretion (destroy vs hide)
- Resize debouncing: Claude's discretion (based on UX best practices)

### Loading Experience
- Loading indicator: Claude's discretion (spinner, skeleton, or nothing)
- Error handling: Show fallback button if iframe fails to load
- Minimum load time: Claude's discretion (prevent flash if needed)
- Load timeout: Claude's discretion (appropriate timeout behavior)

### Claude's Discretion
- Mobile button styling, icon, and positioning
- Breakpoint threshold (default 768px)
- Transition effects between modes
- Iframe state management during resize
- Resize debouncing
- Loading indicator style
- Minimum load time / timeout handling

</decisions>

<specifics>
## Specific Ideas

- Iframe should feel seamlessly embedded in chat — minimal chrome, rounded corners only
- Error case shows fallback button (same as mobile) to maintain functionality

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-responsive-rendering*
*Context gathered: 2026-01-31*
