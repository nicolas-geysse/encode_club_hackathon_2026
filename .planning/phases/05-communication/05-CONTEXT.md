# Phase 5: Communication - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish postMessage communication between the iframe (SwipeSession) and the parent window (OnboardingChat). When a user swipes in embed mode, the iframe sends a message to the parent. The parent receives it and displays a contextual acknowledgment in chat.

This is one-way communication: iframe → parent only. Bidirectional communication is v2 scope.

</domain>

<decisions>
## Implementation Decisions

### Message Format
- Message type: `swipe_completed`
- Payload: `{ type: 'swipe_completed', direction: 'left'|'right'|'up'|'down', scenarioTitle: string }`
- Origin: Use `'*'` for postMessage (same-origin, no security concern)

### Acknowledgment Messages
- Right/Up (accept): "Strategy accepted: {title}"
- Left (reject): "Skipped: {title}"
- Down (meh): "Noted: {title} isn't for you"
- Message appears as assistant message in chat

### Integration Points
- **SwipeSession.tsx**: Add `embedMode` prop, call `window.parent.postMessage` in handleSwipe
- **SwipeTab.tsx**: Pass `embedMode` down to SwipeSession
- **OnboardingChat.tsx**: Add message listener in onMount with cleanup

### Claude's Discretion
- Exact acknowledgment text styling
- Whether to show all swipes or batch them
- Toast vs inline message for acknowledgment

</decisions>

<specifics>
## Specific Ideas

- Use existing `setMessages` pattern in OnboardingChat for adding acknowledgments
- Message listener should check `event.data.type === 'swipe_completed'`
- Clean up listener in onCleanup to prevent memory leaks

</specifics>

<deferred>
## Deferred Ideas

- Bidirectional communication (parent → iframe commands) - v2
- Real-time profile sync between windows - v2
- Batching multiple swipe acknowledgments - future optimization

</deferred>

---

*Phase: 05-communication*
*Context gathered: 2026-01-31*
