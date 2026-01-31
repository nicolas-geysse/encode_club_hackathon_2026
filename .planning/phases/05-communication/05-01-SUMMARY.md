---
phase: 05-communication
plan: 01
status: completed
completed_at: 2026-01-31
---

# Phase 05-01 Summary: postMessage Communication

## Objective

Add postMessage communication between SwipeSession (in iframe) and OnboardingChat (parent window) so that swipe actions in the embed are acknowledged in the chat.

## Changes Made

### 1. SwipeSession.tsx

**File**: `/packages/frontend/src/components/swipe/SwipeSession.tsx`

- Added `embedMode?: boolean` to `SwipeSessionProps` interface (line 37)
- Added postMessage call in `handleSwipe` function after the Opik trace fetch block (lines 257-268)

```tsx
// Notify parent window if in embed mode (Phase 5: Communication)
if (props.embedMode && typeof window !== 'undefined') {
  window.parent.postMessage(
    {
      type: 'swipe_completed',
      direction,
      scenarioTitle: scenario.title,
      scenarioId: scenario.id,
    },
    '*'
  );
}
```

### 2. SwipeTab.tsx

**File**: `/packages/frontend/src/components/tabs/SwipeTab.tsx`

- Added `embedMode={props.embedMode}` prop to SwipeSession component (line 320)

### 3. OnboardingChat.tsx

**File**: `/packages/frontend/src/components/chat/OnboardingChat.tsx`

- Added message listener at start of `onMount` (lines 938-974)
- Listener adds acknowledgment messages to chat based on swipe direction
- Includes `onCleanup` for removing the listener on unmount

```tsx
const handleSwipeMessage = (event: MessageEvent) => {
  if (event.data?.type === 'swipe_completed') {
    const { direction, scenarioTitle } = event.data;
    // Generate acknowledgment based on direction
    let acknowledgment: string;
    switch (direction) {
      case 'right':
      case 'up':
        acknowledgment = `Strategy accepted: ${scenarioTitle}`;
        break;
      case 'left':
        acknowledgment = `Skipped: ${scenarioTitle}`;
        break;
      case 'down':
        acknowledgment = `Noted: ${scenarioTitle} isn't for you`;
        break;
      default:
        acknowledgment = `Swipe recorded: ${scenarioTitle}`;
    }
    // Add acknowledgment as assistant message
    const ackMsg: Message = {
      id: `swipe-ack-${Date.now()}`,
      role: 'assistant',
      content: acknowledgment,
    };
    setMessages((prev) => [...prev, ackMsg]);
  }
};
window.addEventListener('message', handleSwipeMessage);
onCleanup(() => {
  window.removeEventListener('message', handleSwipeMessage);
});
```

## Message Format

```ts
{
  type: 'swipe_completed',
  direction: 'left' | 'right' | 'up' | 'down',
  scenarioTitle: string,
  scenarioId: string
}
```

## Acknowledgment Messages

| Direction   | Message Format                         |
|-------------|----------------------------------------|
| right / up  | Strategy accepted: {title}             |
| left        | Skipped: {title}                       |
| down        | Noted: {title} isn't for you           |

## Verification

- `pnpm typecheck` passes with no errors

## Success Criteria Met

- COMM-01: SwipeTab in embed mode sends postMessage
- COMM-02: OnboardingChat listens for swipe_completed messages
- COMM-03: Chat displays acknowledgment when swipe is completed
