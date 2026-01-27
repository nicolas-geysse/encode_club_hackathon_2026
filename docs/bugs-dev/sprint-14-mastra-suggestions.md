# Sprint 14: Proactive Suggestions via Mastra Agents

> **Status:** Planned (Deferred from Sprint 13)
> **Prerequisite:** Sprint 13 Timeline Consolidation complete
> **Focus:** AI-powered proactive suggestions at app startup

## Objective

Provide intelligent, context-aware suggestions when users open the app:
- New job opportunities matching their skills
- Budget tips based on spending patterns
- Energy/comeback alerts from recent history
- Weekly progress summaries

---

## Phase 4: Suggestions via Mastra Agents

### 4.1 Job Crawler (Periodic)

**New file:** `packages/mcp-server/src/jobs/job-crawler.ts`

```typescript
export async function crawlJobsForProfile(profileId: string) {
  // 1. Load profile and skills
  // 2. Call job-matcher agent with skills
  // 3. Store results in DuckDB (table job_suggestions)
  // 4. Return top 5 opportunities
}
```

**DuckDB Table:**

```sql
CREATE TABLE job_suggestions (
  id VARCHAR PRIMARY KEY,
  profile_id VARCHAR,
  job_title VARCHAR,
  hourly_rate DECIMAL,
  match_score DECIMAL,
  source VARCHAR,
  created_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

### 4.2 Startup Suggestions API

**New file:** `packages/frontend/src/routes/api/startup-suggestions.ts`

```typescript
// Endpoint called on app load
export async function POST({ request }) {
  const { profileId } = await request.json();

  // 1. Check last suggestion (24h cache)
  // 2. If expired, call tips-orchestrator
  // 3. Return formatted suggestions for chat
}
```

### 4.3 Chat Integration

**New file:** `packages/frontend/src/lib/chat/startupSuggestions.ts`

```typescript
export async function getStartupSuggestions(
  profile: FullProfile
): Promise<ChatMessage[]> {
  // Call /api/startup-suggestions
  // Format as chat messages with uiResource
  // Types: job_opportunity, budget_tip, energy_alert, comeback_suggestion
}
```

**Integration point:** `packages/frontend/src/routes/index.tsx`

```typescript
onMount(async () => {
  if (profile && !isNewUser) {
    const suggestions = await getStartupSuggestions(profile);
    // Add to chat or show as notifications
  }
});
```

### 4.4 Suggestion Types

| Type | Agent Source | Trigger |
|------|--------------|---------|
| `job_opportunity` | job-matcher | New jobs matched since last visit |
| `budget_tip` | budget-coach | Recent spending analysis |
| `energy_alert` | tips-orchestrator | Energy debt or comeback detection |
| `weekly_recap` | strategy-comparator | Previous week summary |
| `goal_milestone` | - | Goal progress milestones |

---

## Implementation Order

1. **4.1** - Job crawler with DuckDB storage
2. **4.2** - API endpoint with caching
3. **4.3** - Chat integration
4. **4.4** - Additional suggestion types

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/mcp-server/src/jobs/job-crawler.ts` | Periodic job matching |
| `packages/frontend/src/routes/api/startup-suggestions.ts` | Suggestions API |
| `packages/frontend/src/lib/chat/startupSuggestions.ts` | Chat formatting |

---

## Testing

### Manual Tests

1. **Fresh app open:** Verify suggestions appear
2. **24h cache:** Verify no duplicate API calls within window
3. **Job suggestions:** Verify relevance to user skills
4. **Energy alerts:** Verify comeback/debt detection triggers

### Automated Tests

- `startupSuggestions.test.ts` - Mock API responses
- `job-crawler.test.ts` - Skill matching logic

---

## Dependencies

- Sprint 13 Timeline complete (for consistent week detection)
- tips-orchestrator agent functional
- job-matcher agent functional
- DuckDB running with profiles table
