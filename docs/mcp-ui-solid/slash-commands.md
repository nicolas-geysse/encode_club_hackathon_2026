# Slash Commands - MCP-UI Integration

## Overview

Stride implements slash commands in the chat interface to trigger rich interactive UI components. Users type `/command` and receive structured UI responses rendered via `@seed-ship/mcp-ui-solid`.

**Location**: `packages/frontend/src/routes/api/chat.ts`

---

## Architecture

```
User Input (/budget)
       ↓
parseSlashCommand()    → Extracts command name
       ↓
executeSlashCommand()  → Calls handler with profile context
       ↓
SlashCommandHandler    → Returns { response, uiResource }
       ↓
MCPUIRenderer          → Renders UIResource in chat bubble
```

---

## Available Commands

| Command    | Description                        | UIResource Type |
|------------|------------------------------------|-----------------|
| `/budget`  | Budget summary with metrics        | `composite` (grid + metrics) |
| `/goal`    | Goal creation form                 | `form` |
| `/skills`  | Skills table with job matching     | `table` |
| `/swipe`   | Navigate to swipe scenarios        | `composite` (text + action) |
| `/summary` | Full profile overview              | `composite` (grid + text + action) |
| `/help`    | List available commands            | `table` |

---

## UIResource Types

Each slash command returns a `UIResource` object that MCPUIRenderer interprets:

### 1. `metric` - Key Value Display

```typescript
{
  type: 'metric',
  params: {
    title: 'Monthly Income',
    value: 1200,
    unit: '€',
    subtitle: 'After taxes',
    trend: { direction: 'up' | 'down', value: '+5%' }
  }
}
```

### 2. `form` - Input Collection

```typescript
{
  type: 'form',
  params: {
    title: 'New Savings Goal',
    fields: [
      { name: 'goalName', label: 'What are you saving for?', type: 'text', required: true, value: '' },
      { name: 'goalAmount', label: 'Target amount (€)', type: 'number', required: true },
      { name: 'goalDeadline', label: 'Target date', type: 'date', required: true }
    ],
    submitLabel: 'Set Goal'
  }
}
```

### 3. `table` - Data Display

```typescript
{
  type: 'table',
  params: {
    title: 'Your Skills',
    columns: [
      { key: 'skill', label: 'Skill' },
      { key: 'demandScore', label: 'Demand' },
      { key: 'avgRate', label: 'Avg Rate' }
    ],
    rows: [
      { skill: 'Python', demandScore: '85%', avgRate: '25€/h' },
      { skill: 'Excel', demandScore: '70%', avgRate: '18€/h' }
    ]
  }
}
```

### 4. `text` - Markdown Content

```typescript
{
  type: 'text',
  params: {
    content: '**Bold text** and *italic*',
    markdown: true
  }
}
```

### 5. `action` - Buttons

```typescript
{
  type: 'action',
  params: {
    type: 'button',
    label: 'Start Swiping',
    variant: 'primary' | 'outline' | 'ghost',
    action: 'navigate',
    params: { to: '/plan', tab: 'swipe' }
  }
}
```

### 6. `grid` - Layout Container

```typescript
{
  type: 'grid',
  params: {
    columns: 3,
    children: [
      { type: 'metric', params: { ... } },
      { type: 'metric', params: { ... } },
      { type: 'metric', params: { ... } }
    ]
  }
}
```

### 7. `composite` - Multiple Components

```typescript
{
  type: 'composite',
  components: [
    { type: 'text', params: { content: 'Header text' } },
    { type: 'grid', params: { ... } },
    { type: 'action', params: { ... } }
  ]
}
```

### 8. `link` - External Links

```typescript
{
  type: 'link',
  params: {
    label: 'View Documentation',
    url: 'https://example.com',
    description: 'Opens in new tab'
  }
}
```

---

## Implementation Details

### SlashCommandResult Interface

```typescript
interface SlashCommandResult {
  response: string;           // Text shown before UI component
  uiResource: UIResource;     // The interactive component
  extractedData?: Record<string, unknown>;  // Optional data updates
}
```

### Handler Signature

```typescript
type SlashCommandHandler = (
  context: Record<string, unknown>,  // Current profile data
  profileId?: string
) => Promise<SlashCommandResult> | SlashCommandResult;
```

### Command Parsing

```typescript
function parseSlashCommand(message: string): string | null {
  const trimmed = message.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;

  const match = trimmed.match(/^\/(\w+)/);
  return match ? match[1] : null;
}
```

---

## Adding a New Command

1. Add handler to `SLASH_COMMANDS` object:

```typescript
const SLASH_COMMANDS: Record<string, SlashCommandHandler> = {
  // ... existing commands

  /**
   * /newcmd - Description of what it does
   */
  newcmd: (context) => {
    return {
      response: 'Here is your result:',
      uiResource: {
        type: 'metric',
        params: {
          title: 'New Metric',
          value: 42,
          unit: 'units'
        }
      }
    };
  },
};
```

2. Update `/help` command to include the new command in its table.

3. The command is automatically available - no routing changes needed.

---

## MCPUIRenderer Component

**Location**: `packages/frontend/src/components/chat/MCPUIRenderer.tsx`

Renders UIResource objects using SolidJS `Switch/Match` pattern for reactivity:

```typescript
<Switch>
  <Match when={resource.type === 'metric'}>
    <MetricResource params={resource.params} />
  </Match>
  <Match when={resource.type === 'form'}>
    <FormResource params={resource.params} onAction={onAction} />
  </Match>
  // ... other types
</Switch>
```

### Form Actions

Forms trigger `onAction('form-submit', formData)` callback which can be handled in `OnboardingChat.tsx`:

```typescript
<MCPUIRenderer
  resource={message.uiResource}
  onAction={(action, data) => {
    if (action === 'form-submit') {
      // Handle form submission
    }
  }}
/>
```

---

## Example: /budget Command

**Input**: User types `/budget`

**Handler**:
```typescript
budget: (context) => {
  const income = (context.monthlyIncome as number) || 0;
  const expenses = (context.monthlyExpenses as number) || 0;
  const margin = income - expenses;
  const savingsRate = income > 0 ? Math.round((margin / income) * 100) : 0;

  return {
    response: "Here's your budget overview:",
    uiResource: {
      type: 'composite',
      components: [{
        type: 'grid',
        params: {
          columns: 3,
          children: [
            { type: 'metric', params: { title: 'Monthly Income', value: income, unit: '€' }},
            { type: 'metric', params: { title: 'Monthly Expenses', value: expenses, unit: '€' }},
            { type: 'metric', params: { title: 'Savings Rate', value: savingsRate, unit: '%' }}
          ]
        }
      }]
    }
  };
}
```

**Output**: Chat bubble with text + 3-column metric grid showing income, expenses, and savings rate.

---

## Related Files

| File | Purpose |
|------|---------|
| `routes/api/chat.ts` | Slash command handlers |
| `components/chat/MCPUIRenderer.tsx` | UIResource renderer |
| `components/chat/OnboardingChat.tsx` | Chat interface integration |
| `types/chat.ts` | ChatMessage with uiResource field |
