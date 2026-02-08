# Agentic Action Architecture: "The Operational Chat"

> **Goal:** Transform the chat from a text-response engine into an *Action Execution Interface*.
> **Core Concept:** "Generative UI" - The AI doesn't just ask questions; it renders the specific UI tools (sliders, selectors, confirm cards) needed to complete a user's intent.

## 1. The Core Loop: Intent -> Slot Filling -> Action

Instead of simple text responses, every user message flows through an Action Pipeline:

1.  **Intent Detection (Router):** What does the user want? (e.g., `pause_subscription`, `create_goal`, `update_budget`).
2.  **Slot Filling (Extractor):** What parameters do we have? (e.g., Resource: "Spotify", Duration: "??").
3.  **UI Resolution (Renderer):**
    *   *If complete:* Show "Confirmation Card".
    *   *If missing info:* Show "Input Widget" (e.g., Month Selector for duration).
4.  **Execution (Service):** Perform the DB update.
5.  **Feedback (Reporter):** Confirm success with visual summary.

---

## 2. Architecture Components

### 2.1 The Action Registry
A type-safe definition of all possible actions.

```typescript
// types/actions.ts

type ActionType = 'pause_subscription' | 'add_expense' | 'update_budget' | 'create_goal';

interface ActionDefinition {
  intent: ActionType;
  requiredFields: string[];
  uiComponent: string; // The component to render for missing info
}

const ACTIONS: Record<ActionType, ActionDefinition> = {
  pause_subscription: {
    intent: 'pause_subscription',
    requiredFields: ['resourceName', 'durationMonths'],
    uiComponent: 'PauseSubscriptionCard' // Handles duration selection + confirm
  },
  // ...
};
```

### 2.2 The Generic Action Handler (`ActionEngine`)
A centralized logic in `api/chat.ts` (or strict Mastra agent) that:
1.  Receives extracted data.
2.  Checks against `ActionDefinition`.
3.  Decides: **EXECUTE** or **REQUEST_INFO**.

### 2.3 The Generative UI Protocol
Extending our `UIResource` type to support input collection.

```typescript
// types/chat.ts (Extended)

interface UIResource {
  type: 'confirmation' | 'input_form' | 'selector' | 'success_card';
  params: {
    actionId: string; // To correlate response
    fields: {
      name: string;
      type: 'text' | 'number' | 'date' | 'select';
      options?: string[];
      label: string;
      currentValue?: any;
    }[];
  };
}
```

---

## 3. Scenarios (The User's Vision)

### Scenario A: "Pause Spotify" (Missing Duration)
1.  **User:** "Je veux mettre spotify en pause."
2.  **Agent:**
    *   Intent: `pause_subscription`
    *   Extracted: `{ resourceName: 'Spotify' }`
    *   Missing: `durationMonths`
3.  **System:** Detects missing field.
4.  **Bot Response:** "Spotify en pause. Pour combien de temps ?"
5.  **UI Render:**
    *   **Component:** `DurationSelector` (Slider: 1-12 months).
    *   **Context:** `resource: Spotify`.
6.  **User Action:** Slides to "3 months", clicks "Valider".
7.  **System:** Executes `lifestyleService.updateItem({ pausedMonths: 3 })`.
8.  **Bot Response:** "C'est noté. Spotify est en pause pour 3 mois (économie: 30€)."

### Scenario B: "Augmente mon budget bouffe" (Ambiguous Amount)
1.  **User:** "Augmente le budget courses."
2.  **Agent:**
    *   Intent: `update_expense`
    *   Extracted: `{ category: 'food' }`
    *   Missing: `amount` or `delta`
3.  **Bot Response:** "De combien voulez-vous l'augmenter ?"
4.  **UI Render:**
    *   **Component:** `BudgetAdjuster` (Current: 200€ -> New: [Input]).
5.  **User Action:** Types "+50" -> 250€.
6.  **System:** Updates profile.

### Scenario C: Proactive Suggestions (Merged from Sprint 14)
1.  **Trigger:** App Start.
2.  **Agent:** Scans db, finds active Goal "Vacances". detects "Savings too low".
3.  **Bot Message:** "Pour atteindre 'Vacances', vous devriez mettre 'Netflix' en pause."
4.  **UI Render:** `ActionCard` (Button: "Pause Netflix (3 mo)").

---

## 4. Implementation Roadmap (New Sprint Plan)

### Sprint 15: The Action Engine
1.  **Refactor `api/chat.ts`**: Move switch-case logic into a scalable `ActionDispatcher`.
2.  **UI Component Library**: Create generic `ChatWidget` components (`DurationSlider`, `BudgetStepper`, `DateRangePicker`).
3.  **MCPUIRenderer Upgrade**: Handle the new `input_form` resource type.

### Sprint 16: "Pause" & "Update" Workflows
1.  Implement the **Pause Subscription** full flow (as requested).
2.  Implement the **Update Income/Expense** flow.
3.  Connect to `lifestyleService` (already done for creation, now for updates).

---

## 5. Benefits
- **Transparent:** User sees exactly what parameters are being set via UI.
- **Fast:** No multi-turn text ping-pong ("How long?", "3 months", "Are you sure?"). One UI widget handles the specific input.
- **Scalable:** Adding "Cancel Subscription" is just defining a new Action + UI.
