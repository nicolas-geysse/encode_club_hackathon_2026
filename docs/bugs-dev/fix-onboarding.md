# Fix Onboarding - Sprint Documentation

**Created:** 2026-01-31
**Priority:** High (UX polish before demo)
**Scope:** Onboarding flow improvements, technical debt cleanup

---

## Table of Contents

1. [Navigation Visibility](#1-navigation-visibility)
2. [Progress Indicator](#2-progress-indicator)
3. [Skills Selection UX](#3-skills-selection-ux)
4. [Form Simplifications](#4-form-simplifications)
5. [Start My Plan Button](#5-start-my-plan-button)
6. [Bruno Avatar Animation](#6-bruno-avatar-animation)
7. [Post-Onboarding Shortcuts](#7-post-onboarding-shortcuts)
8. [Localization](#8-localization)
9. [Runtime Errors](#9-runtime-errors)

---

## 1. Navigation Visibility

### Current Behavior
All navigation links (Onboarding, My Plan, Tracking, Debug) are always visible.

### Expected Behavior
- **During onboarding**: Only show "Onboarding" menu link
- **After onboarding completion**: Reveal other links with animated effect

### Implementation Details

| State | Visible Links |
|-------|---------------|
| Onboarding in progress | Onboarding only |
| Onboarding complete | My Plan, Tracking, Debug |

### Animation Effect
Links should appear with a stylish reveal animation (fade-in + slide, or staggered appearance).

### Files to Modify
- `src/components/layout/Sidebar.tsx` or equivalent navigation component
- Need to track onboarding completion state (localStorage or profile)

---

## 2. Progress Indicator

### Current Issues
1. Lines between bubbles (Who are you -> Money -> Your goal -> Generating Plan) are too faint
2. No visual indication of active step
3. "Generating Plan" step lacks completion styling

### Expected Behavior

#### 2.1 Connector Lines
- Increase visibility (higher contrast, thicker or different color)

#### 2.2 Active Step Pulse Effect
```css
@keyframes subtle-pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  50% {
    transform: scale(1.1);
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
  }
}

.step-active {
  animation: subtle-pulse 2s ease-in-out infinite;
}
```

#### 2.3 Generating Plan State
- Text color: green (`text-green-500` or `#22c55e`)
- Indicates successful completion/generation

### Files to Modify
- Component rendering the 4-step progress indicator
- Likely in `src/components/chat/` or `src/components/onboarding/`

---

## 3. Skills Selection UX

### Current Issues
1. Dropdown format is not adapted for multiple selection
2. Skills list feels too restricted
3. Same issue for "Professional Certifications"

### Expected Behavior

#### 3.1 Grid Layout
- Replace dropdown with a scrollable grid
- 2-3 items per row (responsive)
- Each skill is a clickable button/chip

#### 3.2 Selection Behavior
```
+------------------+------------------+------------------+
| [ ] JavaScript   | [x] Python       | [ ] React        |
+------------------+------------------+------------------+
| [x] Node.js      | [ ] SQL          | [ ] TypeScript   |
+------------------+------------------+------------------+
| ... (scrollable) ...                                   |
+------------------+------------------+------------------+

Selected: 2 skills
```

#### 3.3 Visual States
| State | Style |
|-------|-------|
| Unselected | Light background, neutral border |
| Selected | Primary color background, checkmark or different color |

#### 3.4 Counter
- Display total selected count: "Selected: X skills"
- Position: Below grid or in header

#### 3.5 Scrollable Container
- Max height with overflow scroll
- Allow browsing all available skills

### Apply Same Pattern To
- Professional Certifications selection

### Files to Modify
- Skill selection component in chat flow
- Create reusable `GridMultiSelect` component if needed

---

## 4. Form Simplifications

### 4.1 Items to Sell
**Current:** Has category field
**Change:** Remove category - just need item name and price
**Reason:** "On vend juste un truc, on s'en fout du reste"

### 4.2 Borrow
**Current:** Has "from whom" field
**Change:** Remove borrower source field
**Reason:** Doesn't matter who lends the money

### 4.3 Subscriptions
**Current:** Can only add one subscription
**Change:** Allow multiple subscriptions with "Add subscription" button
**Pattern:** Follow same pattern as other multi-item inputs

```
Subscription 1: Netflix - $15/month  [x]
Subscription 2: Spotify - $10/month  [x]
[+ Add subscription]
```

### Files to Modify
- Chat form components for each category
- API handlers if validation changes needed

---

## 5. Start My Plan Button

### Current Issues
1. Button reappears as last message when user types new messages
2. Duplicate button exists in left sidebar (near Bruno)

### Expected Behavior

#### 5.1 Chat Position
- "Start my plan" should stay fixed in chat history
- Should NOT move/reappear when new messages are added
- Treat as a regular message, not a floating element

#### 5.2 Remove Sidebar Duplicate
- Remove "Start my plan" button from left sidebar
- Keep only the one in chat flow
- Avoids confusion and redundancy

### Technical Notes
- Check if button is being re-rendered on state change
- May need to assign stable message ID
- Check message list rendering logic

### Files to Modify
- `src/components/chat/OnboardingChat.tsx`
- Sidebar component (remove duplicate button)

---

## 6. Bruno Avatar Animation

### Current State
Static round avatar image

### Expected Behavior
Add "Orbital Pulse" breathing animation effect around Bruno icon.

### Animation Reference (Orbital Pulse)

```css
/* Container for Bruno avatar with orbital effect */
.bruno-avatar-container {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.bruno-avatar {
  position: relative;
  z-index: 2;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

/* Orbital rings */
.orbital-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(59, 130, 246, 0.3);
  animation: orbital-pulse 3s ease-in-out infinite;
}

.orbital-ring:nth-child(1) {
  width: 52px;
  height: 52px;
  animation-delay: 0s;
}

.orbital-ring:nth-child(2) {
  width: 58px;
  height: 58px;
  animation-delay: 0.5s;
}

.orbital-ring:nth-child(3) {
  width: 64px;
  height: 64px;
  animation-delay: 1s;
}

@keyframes orbital-pulse {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.7;
  }
}
```

### Alternative: Canvas-based Animation
If more complex animation needed, implement canvas-based orbital pulse from provided JS reference.

### Files to Modify
- Bruno avatar component in sidebar
- Add CSS animation or canvas element

---

## 7. Post-Onboarding Shortcuts

### Context
After onboarding completes:
- 4 progress steps (Who are you, Money, Your goal, Generating Plan) disappear
- Need quick navigation to key features

### Expected Behavior
Display shortcut links below "Bruno Financial Coach" text:

```
+---------------------------+
|     [Bruno Avatar]        |
|   Bruno Financial Coach   |
|                           |
|   Quick Links:            |
|   > Budget Overview       |
|   > Saving Progress       |
|   > Goal Projection       |
|   > Energy Timeline       |
+---------------------------+
```

### Link Destinations
| Shortcut | Target |
|----------|--------|
| Budget Overview | `/plan?tab=budget` or budget section |
| Saving Progress | Savings tracking view |
| Goal Projection | Goals/projection chart |
| Energy Timeline | `/suivi` energy history |

### Conditional Display
- Only show after onboarding is marked complete
- Replace the 4-step progress indicator

### Files to Modify
- Sidebar component
- Add onboarding completion check

---

## 8. Localization

### Current Issue
Some response messages appear in French instead of English.

### Expected Behavior
All UI text and bot responses should be in English.

### Areas to Check
- Chat bot responses
- Form labels and placeholders
- Error messages
- Success messages
- Tooltips

### Action Items
1. Audit all hardcoded French strings
2. Ensure LLM prompts specify English output
3. Check i18n configuration if exists

### Files to Audit
- All components in `src/components/chat/`
- API response handlers
- Agent prompts in `packages/mcp-server/src/agents/`

---

## 9. Runtime Errors

### Reported Error
```
Unchecked runtime.lastError: A listener indicated an asynchronous response
by returning true, but the message channel closed before a response was received
```

### Context
- Occurs during professional certifications selection
- Accompanied by slowness/lag

### Investigation Results

**Status:** External Issue - Not Actionable

**Root Cause:** This error originates from browser extensions, not application code. The "runtime.lastError" message occurs when extensions using Chrome's message passing API (password managers, React DevTools, Grammarly, ad blockers, etc.) fail to receive responses in time during DOM interaction events like clicking chips.

**Evidence:**
- Grep search for `chrome.runtime`, `browser.runtime`, `chrome.tabs` APIs: **No matches found in app code**
- Grep search for `chrome.` pattern: **No matches found in frontend/src**
- Grep search for `browser.` pattern: **No matches found in frontend/src**

**App Performance Analysis - GridMultiSelect Component:**

The `GridMultiSelect.tsx` component used for certifications selection is performant:
- **Filter function:** O(n) simple string filter with `toLowerCase().includes()` - no expensive operations
- **toggleItem function:** O(n) for `includes()` check, standard array filter/spread for updates
- **No unnecessary re-renders:** SolidJS fine-grained reactivity handles this efficiently
- **No async operations:** All interactions are synchronous state updates
- **Minimal DOM nodes:** Grid layout with For loop, no heavy virtualization needed

**OnboardingFormStep.tsx Analysis:**
- Uses GridMultiSelect for certifications (lines 835-850)
- No async handlers in the selection flow
- Standard SolidJS patterns with createSignal for state

**Conclusion:** Any perceived lag during certification selection is caused by browser extension interference, not app code. Extensions intercept DOM events and their message passing can cause this warning when the extension's background script doesn't respond quickly enough.

### Workaround

If the error is bothersome during development:
1. **Test in incognito mode** (extensions disabled by default) to confirm no errors
2. **Disable extensions** that monitor form inputs:
   - Password managers (LastPass, 1Password, Bitwarden)
   - React DevTools
   - Grammarly
   - Ad blockers with form protection
3. **Use Chrome's DevTools filtering** to hide `runtime.lastError` messages

### Resolution

No code changes required. This is a known browser extension behavior, not an application bug.

---

## Implementation Priority

### Phase 1 - Critical Fixes
1. [ ] Start My Plan button positioning (#5)
2. [ ] Remove sidebar duplicate button (#5.2)
3. [ ] Localization to English (#8)

### Phase 2 - UX Improvements
4. [ ] Skills grid selection (#3)
5. [ ] Professional certifications grid (#3)
6. [ ] Form simplifications (#4)
7. [ ] Multiple subscriptions (#4.3)

### Phase 3 - Visual Polish
8. [ ] Progress indicator visibility (#2.1)
9. [ ] Active step pulse effect (#2.2)
10. [ ] Generating Plan green text (#2.3)
11. [ ] Bruno orbital pulse animation (#6)

### Phase 4 - Navigation Flow
12. [ ] Conditional nav visibility (#1)
13. [ ] Post-onboarding shortcuts (#7)
14. [ ] Nav reveal animation (#1)

### Phase 5 - Debug
15. [ ] Investigate runtime errors (#9)

---

## Technical Debt Notes

- Consider creating reusable `GridMultiSelect` component
- Onboarding completion state needs central management
- Animation effects should be extracted to shared CSS/utils
- May need message ID system for stable chat positioning

---

*Document created: 2026-01-31*
*Last updated: 2026-01-31*
