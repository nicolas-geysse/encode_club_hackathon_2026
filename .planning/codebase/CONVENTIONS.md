# Coding Conventions

**Analysis Date:** 2026-01-31

## Naming Patterns

**Files:**
- API routes: kebab-case, lowercase (e.g., `chat.ts`, `chat-history.ts`, `_db.ts`)
- Components: PascalCase (e.g., `RouteProgress.tsx`, `EarningsChart.tsx`, `MissionCard.tsx`)
- Services/utilities: camelCase (e.g., `profileService.ts`, `budgetEngine.ts`, `goalService.ts`)
- Test files: use `__tests__` directory or `.test.ts` suffix (e.g., `skills/__tests__/skill-arbitrage.test.ts`)
- Private/internal files: prefix with underscore (e.g., `_crud-helpers.ts`, `_db.ts`)

**Functions:**
- Async functions: camelCase (e.g., `fetchBudgetContext`, `calculateArbitrageScore`, `generateCatchUpPlan`)
- React/SolidJS components: PascalCase (e.g., `RouteProgress`, `EarningsChart`)
- Handler functions: camelCase, suffixed with action (e.g., `createMockLead`, `generateChartData`, `ensureGoalsSchema`)
- Utility functions: descriptive camelCase (e.g., `createLogger`, `escapeSQL`, `formatEuro`)

**Variables:**
- Local variables: camelCase (e.g., `isRouting`, `profileId`, `chartInstance`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_WEIGHTS`, `SEVERITY_THRESHOLDS`, `LEADS_SCHEMA`)
- Type/interface instances: camelCase (e.g., `mockSpan`, `newLead`, `mockLeads`)
- Unused parameters: prefix with underscore (e.g., `_name`, `_format` - enforced by ESLint rule `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'`)

**Types:**
- Interfaces: PascalCase, descriptive (e.g., `EarningsChartProps`, `BudgetContext`, `LeadRow`, `SkillInternal`)
- Type aliases: PascalCase (e.g., `Money`, `Skill`, `ArbitrageWeights`, `DebtSeverity`)
- Generic types: PascalCase descriptive names (e.g., `TraceOptions`, `TraceContext`, `OnboardingStep`)
- SQL result row types: suffix with `Row` (e.g., `LeadRow`, `GoalRow`)
- Database field names: snake_case (e.g., `profile_id`, `created_at`, `salary_min`)

## Code Style

**Formatting:**
- Tool: Prettier
- Configuration (`/.prettierrc`):
  - Semi-colons: true
  - Single quotes: true
  - Tab width: 2 spaces
  - Trailing comma: "es5"
  - Print width: 100 characters
  - Bracket spacing: true
  - Arrow parens: always
- Run with `pnpm format` to auto-format all packages

**Linting:**
- Tool: ESLint (with TypeScript support)
- Configuration (`/eslint.config.js`):
  - Base: `@eslint/js` recommended + `typescript-eslint` recommended
  - `no-console: ['warn', { allow: ['warn', 'error'] }]` - Log via `createLogger()` utility instead
  - `@typescript-eslint/no-unused-vars: ['warn', { argsIgnorePattern: '^_' }]` - Prefix unused with `_`
  - `@typescript-eslint/explicit-function-return-type: 'off'` - Types inferred
  - `@typescript-eslint/no-explicit-any: 'warn'` - Avoid `any` type
  - `prefer-const: 'warn'` - Use `const` over `let`
  - `no-var: 'error'` - No `var` declarations
  - SolidJS-specific rules for frontend: `solid/reactivity`, `solid/no-destructure`, `solid/prefer-for`
- Run with `pnpm lint` and `pnpm lint:fix` for auto-fix

## Import Organization

**Order:**
1. External dependencies (e.g., `import Groq from 'groq-sdk'`, `import { createSignal } from 'solid-js'`)
2. Type imports from external (e.g., `import type { APIEvent } from '@solidjs/start/server'`)
3. Internal absolute imports using path aliases (e.g., `import { createLogger } from '~/lib/logger'`)
4. Relative imports (e.g., `import { helper } from '../helpers'`)
5. Type imports from internal (e.g., `import type { Goal } from '~/lib/goalService'`)

**Path Aliases:**
- Frontend: `~` maps to `packages/frontend/src/`
- Examples: `~/lib/logger`, `~/types/entities`, `~/components/tabs`
- No relative path crawling - always use aliases for imports across packages

**Import style:**
- Named imports for utilities: `import { createLogger } from '~/lib/logger'`
- Default imports for components: `import EarningsChart from '~/components/EarningsChart'` or `export default RouteProgress`
- Mixed imports when needed: `import Dinero, { type Money } from 'dinero.js'`
- Type imports: `import type { Span } from '../services/opik'` or inline `type Skill`

## Error Handling

**Patterns:**
- Try-catch for async operations (non-blocking preferred):
  ```typescript
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Request failed', { status: response.status });
      return null; // Graceful degradation
    }
  } catch (error) {
    logger.error('Fetch error', { error });
    return null; // Non-blocking fallback
  }
  ```

- API errors return structured Response with status code:
  ```typescript
  if (!profileId) {
    return errorResponse('profileId is required', 400);
  }
  return successResponse(data, 201);
  ```

- Database operations log with context (not throwing):
  ```typescript
  try {
    await execute(SCHEMA);
    schemaFlag.initialized = true;
    logger.info('Schema initialized');
  } catch (error) {
    logger.info('Schema init note', { error });
    schemaFlag.initialized = true;
  }
  ```

- Opik tracing wraps operations (automatic error capture):
  ```typescript
  return trace('operation-name', async (ctx) => {
    ctx.setAttributes({ input: data });
    // operation
    ctx.setOutput(result);
  }, traceOptions);
  ```

**Null/undefined handling:**
- Check explicitly: `if (!value)` or `if (value === null)`
- Provide meaningful defaults: `props.currency || 'USD'`
- Optional chaining: `goal?.deadline` instead of checking first
- Null coalescing: `currentSaved ?? 0` for numeric defaults

## Logging

**Framework:** Native `console` with structured logger utility

**Patterns:**
- Create logger instance per feature: `const logger = createLogger('FeatureName')`
- Methods: `logger.info()`, `logger.debug()`, `logger.warn()`, `logger.error()`
- Always include context object as second parameter: `logger.info('User action', { userId, step: 2 })`
- Feature name auto-added to logs: `[2026-01-16T...] [INFO] [FeatureName] message`
- Use `generateCorrelationId()` for async operation tracing

**Avoid:**
- Direct `console.log()` - ESLint warns (exception: `console.warn/error` allowed)
- Logging without context - include relevant IDs and state
- Mixing log levels (use appropriate level: debug < info < warn < error)

**Example:**
```typescript
const logger = createLogger('ChatAPI');
logger.info('Fetch started', { profileId, timeoutMs: 5000 });
logger.debug('Response received', { status, headers });
logger.warn('Fallback to default', { reason: 'API timeout' });
logger.error('Database connection lost', { error });
```

## Comments

**When to Comment:**
- Algorithm explanation: Complex formulas or multi-step logic
- Business rule clarification: Why a constraint exists (not what the code does)
- Workaround documentation: Reason for unconventional patterns
- Type explanation: Clarify non-obvious type choices

**JSDoc/TSDoc:**
- Use for public APIs and exported functions:
  ```typescript
  /**
   * Calculate score for a skill based on multiple criteria
   * @param skill The skill to evaluate
   * @param weights Optional custom weights (defaults to 30/25/25/20)
   * @returns Score object with breakdown and recommendation
   */
  export function calculateArbitrageScore(skill: Skill, weights?: ArbitrageWeights): ArbitrageResult
  ```

- Document parameters, return types, and exceptions
- Example in `skill-arbitrage.ts`:
  ```typescript
  /**
   * Create Money from euros
   * @param amount Amount in euros (e.g., 22.50)
   */
  export function euros(amount: number): Money
  ```

**Block comments:**
- Section headers for logical groupings:
  ```typescript
  // ============================================
  // TYPES
  // ============================================
  ```

- Inline comments only for non-obvious intent:
  ```typescript
  // Cap effort ratio at 1.2 to avoid unrealistic scaling
  const effortRatio = Math.min(utilizationRatio, 1.2);
  ```

## Function Design

**Size:** Aim for single responsibility; 30-50 lines typical, up to 100 for complex logic

**Parameters:**
- Prefer object/interface parameters for >2 params:
  ```typescript
  // Good
  interface SkillConfig {
    hourlyRate: number;
    marketDemand: number;
  }
  function scoreSkill(config: SkillConfig) { }

  // Avoid (hard to extend)
  function scoreSkill(rate: number, demand: number) { }
  ```

- Optional parameters via object properties (never positional optionals)
- Destructure props in component functions:
  ```typescript
  export function EarningsChart(props: EarningsChartProps) {
    const currency = () => props.currency || 'USD';
  }
  ```

**Return Values:**
- Explicit types (inferred but documented with JSDoc)
- Async functions return `Promise<T | null>` for non-blocking fallbacks
- Multiple return paths grouped (success at end, early returns for errors)
- Single exit point preferred unless early returns clarify intent

## Module Design

**Exports:**
- Named exports for utilities and functions
- Default export for components (optional)
- Group related exports (algorithm + helper + types)

**Barrel Files:**
- Use `index.ts`/`index.js` to re-export public APIs from subdirectories
- Example in mcp-server: `agents/index.js`, `services/index.js`

**File structure for algorithms:**
```typescript
// File: algorithms/skill-arbitrage.ts

// 1. Utility functions (helpers, money conversions)
// 2. Types (interfaces, types, enums)
// 3. Constants (DEFAULT_WEIGHTS, SEVERITY_THRESHOLDS)
// 4. Core algorithm (main functions: calculateArbitrageScore)
// 5. Derived functions (rankSkills, adjustWeights)
// 6. Exports
```

**File structure for API routes:**
```typescript
// File: routes/api/leads.ts

// 1. Documentation comment
// 2. Imports (external, types, internal utilities)
// 3. Logger instance
// 4. Types (interfaces specific to route)
// 5. Schema constants
// 6. Helper functions (fetch, trigger, ensure)
// 7. Main handler function
// 8. Export handler
```

---

*Convention analysis: 2026-01-31*
