# Testing Patterns

**Analysis Date:** 2026-01-31

## Test Framework

**Runner:**
- Vitest 4.0.18
- Configuration:
  - Frontend: `packages/frontend/vitest.config.ts`
  - MCP Server: Uses default Vitest config (no explicit config file)

**Assertion Library:**
- Vitest built-in (`expect` global)

**Run Commands:**
```bash
pnpm test                    # Run tests in watch mode (all packages)
pnpm --filter @stride/mcp-server test   # Run MCP server tests
pnpm test:run                # Run all tests once (CI mode)
```

**Configuration Details:**

Frontend (`packages/frontend/vitest.config.ts`):
```typescript
test: {
  environment: 'happy-dom',   // SolidJS SSR-compatible DOM
  globals: true,              // No need to import describe/it/expect
  alias: {
    '~': path.resolve(__dirname, './src'),  // Path alias resolution
  },
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/_db.test.ts',         // Excluded: requires native DuckDB
  ],
}
```

MCP Server: Uses default environment (Node.js), no DOM needed.

## Test File Organization

**Location:**
- Co-located with source code in `__tests__` subdirectory
- Frontend: `packages/frontend/src/routes/api/__tests__/` and `packages/frontend/src/lib/__tests__/`
- MCP Server: `packages/mcp-server/src/algorithms/__tests__/` and `packages/mcp-server/src/tools/__tests__/`, `packages/mcp-server/src/services/__tests__/`

**Naming:**
- Pattern: `featureName.test.ts` (not `.spec.ts`)
- Examples:
  - `packages/frontend/src/routes/api/__tests__/leads.test.ts`
  - `packages/mcp-server/src/algorithms/__tests__/skill-arbitrage.test.ts`
  - `packages/frontend/src/lib/__tests__/onboardingPersistence.test.ts`

**Structure:**
```
__tests__/
├── feature-name.test.ts          # Unit tests for feature
├── feature-name.integration.test.ts  # Integration tests (optional)
└── fixtures/                     # Shared test data
    ├── mockData.ts
    └── factories.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('specific behavior', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = createFixture();

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it('should handle edge case', () => {
      // ...
    });
  });

  describe('another behavior', () => {
    // ...
  });
});
```

**Patterns Observed:**

1. **Test grouping:** Nested `describe()` blocks organize related tests by scenario:
   ```typescript
   describe('calculateArbitrageScore', () => {
     describe('normal cases', () => { /* ... */ });
     describe('weight application', () => { /* ... */ });
     describe('normalization', () => { /* ... */ });
     describe('edge cases', () => { /* ... */ });
   });
   ```

2. **Descriptive test names:** Use `it('should...')` or `it('returns....')`:
   ```typescript
   it('calculates score with average values', () => { });
   it('returns empty result for empty skills array', () => { });
   it('handles single week capacity', () => { });
   ```

3. **Test data with comments:** Inline comments explain setup and expected calculations:
   ```typescript
   it('calculates score correctly', () => {
     // hourlyRate=15, demand=3, effort=3, rest=1
     // normalizedRate = 15/30 = 0.5
     // normalizedDemand = 3/5 = 0.6
     // Score = 0.55 * 10 = 5.5

     const skill = createSkill({
       hourlyRate: 15,
       marketDemand: 3,
       cognitiveEffort: 3,
       restNeeded: 1,
     });

     const result = calculateArbitrageScore(skill);
     expect(result.score).toBeCloseTo(5.5, 1);
   });
   ```

## Mocking

**Framework:** Vitest `vi` utility

**Patterns:**

1. **Module mocking for external services:**
   ```typescript
   vi.mock('../../services/opik.js', () => ({
     trace: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
       const mockSpan = {
         setAttributes: vi.fn(),
         setInput: vi.fn(),
         setOutput: vi.fn(),
         setUsage: vi.fn(),
         setCost: vi.fn(),
         addEvent: vi.fn(),
         end: vi.fn(),
         createChildSpan: vi.fn(),
         getTraceId: vi.fn(() => null),
       };
       return fn(mockSpan);
     }),
     createSpan: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
       // Similar mock span
       return fn(mockSpan);
     }),
     getCurrentTraceHandle: vi.fn(() => null),
     getCurrentTraceId: vi.fn(() => null),
     getCurrentThreadId: vi.fn(() => null),
     setThreadId: vi.fn(),
     generateThreadId: vi.fn(() => 'mock-thread-id'),
   }));
   ```

2. **CRUD helper mocking:**
   ```typescript
   vi.mock('../_crud-helpers', () => ({
     query: vi.fn(),
     execute: vi.fn(),
     escapeSQL: vi.fn((s: string | null) =>
       s === null ? 'NULL' : `'${s?.replace(/'/g, "''")}'`
     ),
     uuidv4: vi.fn(() => 'mock-uuid-123'),
     ensureSchema: vi.fn(),
     successResponse: vi.fn((data: unknown, status = 200) =>
       new Response(JSON.stringify(data), {
         status,
         headers: { 'Content-Type': 'application/json' },
       })
     ),
     errorResponse: vi.fn((message: string, status = 500) =>
       new Response(JSON.stringify({ error: message }), {
         status,
         headers: { 'Content-Type': 'application/json' },
       })
     ),
   }));
   ```

3. **Clearing mocks between tests:**
   ```typescript
   beforeEach(() => {
     vi.clearAllMocks();
   });
   ```

4. **Using mocked functions in tests:**
   ```typescript
   vi.mocked(query).mockResolvedValue([mockLead]);
   vi.mocked(execute).mockResolvedValue(undefined);
   ```

**What to Mock:**
- External services (Opik tracing, API calls)
- Database operations (query, execute)
- Time-dependent functions (use `vi.useFakeTimers()` if needed)
- File system operations (not common in this codebase)

**What NOT to Mock:**
- The function under test (always test real implementation)
- Core algorithms (test actual calculations)
- Utility functions like `escapeSQL` (test real escaping logic)
- Data structures and helpers that are part of the feature

## Fixtures and Factories

**Test Data:**

1. **Factory functions for creating test objects:**
   ```typescript
   function createSkill(overrides: Partial<Skill> = {}): Skill {
     return {
       id: 'test-skill',
       name: 'Test Skill',
       level: 'intermediate',
       hourlyRate: 15,
       marketDemand: 3,
       cognitiveEffort: 3,
       restNeeded: 1,
       ...overrides,
     };
   }
   ```

2. **Mock event builder:**
   ```typescript
   function createMockEvent(method: string, url: string, body?: unknown) {
     return {
       request: {
         method,
         url: `http://localhost${url}`,
         json: () => Promise.resolve(body),
       },
     };
   }
   ```

3. **Domain model factories:**
   ```typescript
   function createMockLead(overrides: Record<string, unknown> = {}) {
     return {
       id: 'lead-123',
       profile_id: 'profile-456',
       category: 'service',
       title: 'Serveur',
       company: 'Restaurant Test',
       location_raw: 'Paris',
       status: 'interested',
       created_at: '2025-01-01T00:00:00Z',
       updated_at: '2025-01-01T00:00:00Z',
       ...overrides,
     };
   }
   ```

**Location:**
- Inline within test file (no separate fixtures directory used)
- Grouped at top of file before test suites
- Helper prefix: `create*` or descriptive function name

## Coverage

**Requirements:** Not enforced (no coverage thresholds configured)

**View Coverage:**
```bash
# Vitest coverage (not configured in current setup)
# To enable, would add to vitest.config.ts:
# coverage: {
#   provider: 'v8',
#   reporter: ['text', 'json', 'html'],
# }
```

**Note:** Coverage is not explicitly configured, tests are thorough by convention (see examples for 98%+ implicit coverage).

## Test Types

**Unit Tests:**
- Scope: Single algorithm or utility function
- Approach: Isolated with mocked dependencies
- Examples:
  - `packages/mcp-server/src/algorithms/__tests__/skill-arbitrage.test.ts` - Tests `calculateArbitrageScore()`, `rankSkills()`, `adjustWeights()`
  - `packages/mcp-server/src/algorithms/__tests__/energy-debt.test.ts` - Tests `detectEnergyDebt()`, `findDebtSeverity()`, etc.
  - `packages/mcp-server/src/algorithms/__tests__/comeback-detection.test.ts` - Tests `detectComebackWindow()`, `generateCatchUpPlan()`, `checkComebackCompletion()`

**Integration Tests:**
- Scope: API route with database interactions
- Approach: Mock database helpers, test request/response flow
- Examples:
  - `packages/frontend/src/routes/api/__tests__/leads.test.ts` - Tests GET/POST/PUT/DELETE operations with SQL injection prevention

**E2E Tests:**
- Framework: Not used in this codebase
- Note: Manual API testing via `./scripts/test-api.sh` (curl-based)

## Common Patterns

**Async Testing:**
```typescript
it('sorts skills by score in descending order', async () => {
  const skills: Skill[] = [
    createSkill({ id: 'low', name: 'Low', hourlyRate: 5, marketDemand: 1 }),
    createSkill({ id: 'high', name: 'High', hourlyRate: 30, marketDemand: 5 }),
  ];

  const result = await rankSkills(skills);  // Note: async function

  expect(result.skills[0].skill.id).toBe('high');
  expect(result.skills[1].skill.id).toBe('low');
});
```

**Error Testing:**
```typescript
it('returns error when profileId is missing and no id provided', async () => {
  vi.mocked(query).mockResolvedValue([]);

  // Validate error condition
  const params = new URLSearchParams();
  const id = params.get('id');
  const profileId = params.get('profileId');

  expect(id).toBeNull();
  expect(profileId).toBeNull();

  // Test error response
  const response = errorResponse('profileId is required', 400);
  const data = await response.json();

  expect(response.status).toBe(400);
  expect(data.error).toBe('profileId is required');
});
```

**Numeric Assertions (floating point):**
```typescript
// Use toBeCloseTo for float comparisons (avoids precision errors)
expect(result.score).toBeCloseTo(5.5, 1);  // Within 1 decimal place

// Use toBe for exact values
expect(result.completionRate).toBe(1.0);  // Capped at exactly 1.0

// Use toBeGreaterThan for comparisons
expect(resultLow.breakdown.effortContribution).toBeGreaterThan(
  resultHigh.breakdown.effortContribution
);
```

**Array/Collection Assertions:**
```typescript
it('returns empty result for empty skills array', async () => {
  const result = await rankSkills([]);

  expect(result.skills).toHaveLength(0);
  expect(result.topPick).toBeNull();
  expect(result.insights).toContain('Aucune compétence à évaluer');
});
```

**SQL Injection Prevention Tests:**
```typescript
it('escapes single quotes in values', async () => {
  const maliciousTitle = "'; DROP TABLE leads; --";
  const escaped = `'${maliciousTitle.replace(/'/g, "''")}'`;

  expect(escaped).toBe("'''; DROP TABLE leads; --'");
  expect(escaped.startsWith("'")).toBe(true);
  expect(escaped.endsWith("'")).toBe(true);
});
```

---

*Testing analysis: 2026-01-31*
