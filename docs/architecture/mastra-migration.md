# Mastra Migration Plan

**Last Updated**: 2026-01-21

This document describes how to integrate the existing Mastra agents with the frontend chat system.

## Current State: Two Parallel Implementations

### Frontend (Active)
```
routes/api/chat.ts (2,872 lines)
    │
    ├── processWithGroqExtractor() ─── lib/onboardingExtractor.ts (1,646 lines)
    │   ├── Groq JSON mode extraction
    │   └── Regex fallback
    │
    └── Legacy Groq path
        ├── extractDataFromMessage()
        └── generateStepResponse()
```

### MCP Server (Unused by Frontend!)
```
packages/mcp-server/src/agents/
├── onboarding-agent.ts (455 lines) ← Mirrors frontend logic but better structured
├── budget-coach.ts (336 lines)
├── job-matcher.ts (566 lines)
├── strategy-comparator.ts (596 lines)
├── money-maker.ts (709 lines)
├── guardian.ts (475 lines)
├── projection-ml.ts (251 lines)
└── factory.ts (346 lines)
```

## Why Migrate?

| Aspect | Current Frontend | Mastra Agents |
|--------|-----------------|---------------|
| Code structure | Monolithic | Modular tools |
| Tracing | Manual Opik calls | Auto via Mastra |
| Tool orchestration | None | Built-in |
| Testing | Difficult | Tool-level tests |
| New capabilities | Edit chat.ts | Add tool |

## Migration Strategy

### Phase 1: Parallel Operation (Low Risk)

```typescript
// routes/api/chat.ts
const USE_MASTRA = process.env.USE_MASTRA_CHAT === 'true';

if (USE_MASTRA) {
  return await handleWithMastraAgent(message, step, context);
} else {
  return await handleWithRefactoredModules(message, step, context);
}
```

### Phase 2: Adapter Layer

Create `lib/chat/mastraAdapter.ts`:

```typescript
import { OnboardingAgent } from '@stride/mcp-server/agents';

export async function handleWithMastraAgent(
  message: string,
  step: string,
  context: Record<string, unknown>
): Promise<ChatResponse> {
  const agent = new OnboardingAgent({
    groqApiKey: process.env.GROQ_API_KEY,
    opikConfig: {
      apiKey: process.env.OPIK_API_KEY,
      workspace: process.env.OPIK_WORKSPACE,
    },
  });

  const result = await agent.process({
    message,
    currentStep: step,
    existingProfile: context,
  });

  return {
    response: result.response,
    extractedData: result.extractedData,
    nextStep: result.nextStep,
    source: 'mastra',
  };
}
```

### Phase 3: Chat Modules as Mastra Tools

Convert refactored modules into Mastra tools:

```typescript
// lib/chat/tools/extractionTool.ts
import { createTool } from '@mastra/core';
import { extractWithHybrid } from '../extraction/hybridExtractor';

export const extractionTool = createTool({
  id: 'extract_profile_data',
  description: 'Extract profile information from user message',
  parameters: {
    message: { type: 'string', required: true },
    step: { type: 'string', required: true },
    existingProfile: { type: 'object' },
  },
  execute: async ({ message, step, existingProfile }) => {
    return extractWithHybrid(message, step, existingProfile);
  },
});
```

### Phase 4: Full Agent Integration

Update `onboarding-agent.ts` to use frontend tools:

```typescript
// packages/mcp-server/src/agents/onboarding-agent.ts
import { extractionTool } from '@stride/frontend/lib/chat/tools/extractionTool';
import { flowControlTool } from '@stride/frontend/lib/chat/tools/flowControlTool';
import { responseGeneratorTool } from '@stride/frontend/lib/chat/tools/responseGeneratorTool';

export const onboardingAgent = new Agent({
  name: 'onboarding',
  instructions: ONBOARDING_SYSTEM_PROMPT,
  model: groq('llama-3.1-70b-versatile'),
  tools: {
    extractionTool,
    flowControlTool,
    responseGeneratorTool,
  },
});
```

## Agent Capabilities Matrix

After migration, each agent handles specific domains:

| Agent | Triggers | Tools Used |
|-------|----------|------------|
| **onboarding** | New user, incomplete profile | extraction, flow, response |
| **budget-coach** | Budget questions, /budget command | budgetAnalysis, recommendations |
| **job-matcher** | Job/skill questions, /skills command | skillArbitrage, jobMatching |
| **strategy-comparator** | Comparison requests, /swipe | scenarioComparison, preference |
| **guardian** | Risk detection, threshold breaches | riskAssessment, alerts |

## Testing Strategy

### Unit Tests (Per Tool)
```typescript
// lib/chat/extraction/__tests__/patterns.test.ts
describe('extractWithRegex', () => {
  it('extracts city from greeting', () => {
    const result = extractWithRegex('Paris', 'greeting', {});
    expect(result.city).toBe('Paris');
    expect(result.currency).toBe('EUR');
  });
});
```

### Integration Tests (Agent Level)
```typescript
// packages/mcp-server/src/agents/__tests__/onboarding-agent.test.ts
describe('OnboardingAgent', () => {
  it('completes full onboarding flow', async () => {
    const agent = new OnboardingAgent(config);

    let context = {};
    const steps = ['Paris', 'Alex', 'Master CS', '800, 600', ...];

    for (const message of steps) {
      const result = await agent.process({ message, context });
      context = { ...context, ...result.extractedData };
    }

    expect(context.name).toBe('Alex');
    expect(context.city).toBe('Paris');
  });
});
```

### A/B Testing via Feature Flag
```typescript
// Compare Opik traces between:
// - USE_MASTRA_CHAT=false (refactored modules)
// - USE_MASTRA_CHAT=true (Mastra agents)

// Metrics to compare:
// 1. Extraction success rate
// 2. Step progression accuracy
// 3. Token usage/cost
// 4. Response latency
```

## Rollout Plan

| Week | Action | Flag State |
|------|--------|------------|
| 1 | Deploy refactored modules | `false` |
| 2 | Deploy Mastra adapter | `false` |
| 3 | Enable for 10% of users | `10%` |
| 4 | Monitor + fix issues | `10%` |
| 5 | Enable for 50% | `50%` |
| 6 | Full rollout | `true` |
| 7 | Remove legacy code | N/A |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Mastra agents behave differently | A/B test with Opik traces |
| Performance regression | Monitor latency in Opik |
| Breaking changes in Mastra | Pin Mastra version |
| Tool execution failures | Fallback to direct function calls |

## Success Criteria

1. **Functional parity**: All onboarding flows complete successfully
2. **Performance**: P95 latency within 10% of current
3. **Cost**: Token usage within 20% of current
4. **Code quality**: chat.ts reduced to <600 lines
5. **Maintainability**: New features can be added as tools, not code edits
