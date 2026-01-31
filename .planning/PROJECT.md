# Swipe-in-Chat

## What This Is

A chat-integrated Swipe experience for Stride that lets users discover and act on financial strategies without leaving the conversation flow. Desktop users see an embedded iframe, mobile users get a navigation button.

## Core Value

Users can trigger and interact with Swipe strategies directly from chat, maintaining conversational context while taking action.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can say "swipe", "actions", "stratégies" etc. to trigger Swipe in chat
- [ ] Desktop (>768px) displays Swipe component embedded via iframe
- [ ] Mobile (≤768px) displays "Swipe to plan ! →" navigation button
- [ ] Iframe communicates swipe completions back to chat via postMessage
- [ ] Chat acknowledges swipe actions with contextual feedback

### Out of Scope

- Full MCP-UI plugin modification — too heavy for this feature
- Real-time profile sync between iframe and parent — user can ask "comment va mon profil?" after swiping
- Bidirectional iframe communication — parent-to-iframe not needed

## Context

**Existing infrastructure:**
- Chat system with intent detection (regex fast-path + LLM fallback)
- MCPUIRenderer that handles bar, line, comparison chart types
- SwipeTab component in `/plan` that handles swipe logic
- UIResource pattern for chat → UI communication

**Design decision:** Hybrid A+C approach
- Option A (iframe) for desktop: seamless in-chat experience
- Option C (navigation) for mobile: avoids iframe scroll/touch issues

## Constraints

- **Tech stack**: SolidJS, SolidStart, existing chat architecture
- **Reuse**: Must use existing SwipeTab component (no duplication)
- **Performance**: Iframe overhead acceptable (~200ms), demand-loaded only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid A+C over pure iframe | Mobile iframes have touch/scroll issues | — Pending |
| postMessage for swipe feedback | Allows chat to acknowledge actions without polling | — Pending |
| 768px breakpoint | Standard tablet/mobile divide | — Pending |
| Autonomous iframe state | Simpler than shared state, profile refetch acceptable | — Pending |

---
*Last updated: 2026-01-31 after initialization*
