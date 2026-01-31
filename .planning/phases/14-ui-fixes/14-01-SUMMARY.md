# Summary: 14-01 — UI Fixes (Button Placement and Dark Mode)

**Phase:** 14-ui-fixes
**Status:** COMPLETE
**Date:** 2026-01-31

## Changes Made

### Task 1: Add Start My Plan button to chat area
- Added a completion CTA section in the chat messages area
- Shows after `For each={messages()}` loop when `isComplete() && step() === 'complete'`
- Includes Bruno avatar (emerald gradient), completion message, and GlassButton
- Commit: `bf21807`

### Task 2: Remove Start My Plan from Bruno sidebar
- Removed the animated "Start My Plan" button from the left sidebar bottom area
- Only the Restart button remains in the sidebar footer
- Commit: `5b88285`

### Task 3: Remove Start My Plan from mobile input area
- Removed the mobile CTA section from the bottom input area
- Simplified the `<Show when={isComplete()}>` block to just contain ChatInput
- Commit: `5ad1348`

### Task 4: Fix Bruno avatar dark mode visibility
- Changed avatar gradient from `from-primary to-primary/60` to emerald colors
- Updated orbital rings from `border-primary/XX` to emerald colors with dark mode variants
- Colors now visible in both light and dark modes
- Commit: `e7c58b7`

### Task 5: Fix progress indicator pulse in dark mode
- Updated CSS `subtle-pulse` keyframes from blue (59, 130, 246) to emerald (16, 185, 129)
- Added dark mode media query with brighter emerald (52, 211, 153) for visibility
- Updated OnboardingProgress.tsx current step styling to use emerald colors
- Updated active glow ping animation to emerald
- Commit: `0145165`

## Files Modified

| File | Changes |
|------|---------|
| `packages/frontend/src/components/chat/OnboardingChat.tsx` | Added completion CTA in chat, removed sidebar button, removed mobile button, updated Bruno avatar to emerald |
| `packages/frontend/src/components/chat/OnboardingProgress.css` | Changed pulse animation to emerald, added dark mode variant |
| `packages/frontend/src/components/chat/OnboardingProgress.tsx` | Updated current step dot and glow to emerald colors |

## Requirements Verified

- [x] PLAC-01: Start my plan button appears in chat area after completion
- [x] PLAC-02: Start my plan button removed from Bruno sidebar
- [x] DARK-01: Bruno avatar visible in dark mode with emerald gradient
- [x] DARK-02: Progress indicator pulse visible in dark mode with emerald colors

## Testing Notes

To verify changes:
1. Complete onboarding flow or set localStorage `onboardingComplete` to `'true'`
2. Check "Start My Plan" button appears in chat messages area (not sidebar or mobile bottom)
3. Toggle dark mode and verify Bruno avatar "B" is visible against emerald gradient
4. During onboarding, verify progress indicator dots are emerald with visible pulse animation
