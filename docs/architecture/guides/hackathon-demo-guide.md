# Opik Demo Guide for Hackathon Judges

## Quick Access

- **Opik Dashboard**: https://www.comet.com/opik/{workspace}/projects
- **Project**: `stride`
- **Key Traces**: `chat.onboarding`, `tips.orchestrator`

---

## Demo Use Case 1: Chat Quality Monitoring (2 min)

**Story**: "Every chat response is automatically evaluated for safety and quality"

### Demo Flow

1. **Open Opik Dashboard** → Navigate to `stride` project → Traces tab
2. **Filter by name**: `chat.onboarding`
3. **Select a recent trace** → Show nested spans:
   ```
   chat.onboarding (3.2s)
   ├─ intent_detection (0.1s)
   ├─ profile_loading (0.2s)
   ├─ llm_response (2.8s)        [type: llm, model: llama-3.1-70b]
   └─ response_evaluation (0.1s) [type: guardrail]
   ```
4. **Click on Feedback Scores tab** → Show evaluation metrics:
   - `evaluation.heuristic_score`: 0.85
   - `evaluation.llm_score`: 0.92
   - `evaluation.final_score`: 0.88
5. **Show filtering**: "Traces with score < 0.7" → Quality alerts

### Value Statement
> "Every chat response is automatically evaluated. We catch problematic responses before students see them."

---

## Demo Use Case 2: Multi-Agent Orchestration (3 min)

**Story**: "4 AI agents collaborate to generate personalized tips"

### Demo Flow

1. **Filter by name**: `tips.orchestrator`
2. **Select a full orchestration trace** (fallbackLevel: 0) → Show span tree:
   ```
   tips.orchestrator (5.2s)
   ├─ tips.energy_debt_detection (0.1s)
   ├─ tips.comeback_detection (0.05s)
   ├─ tips.parallel_agents (2.1s)
   │   ├─ agent.budget_coach (1.8s)   [type: tool]
   │   └─ agent.job_matcher (2.0s)    [type: tool]
   ├─ agent.strategy_comparator (0.9s) [type: tool]
   ├─ agent.guardian (0.5s)            [type: guardrail]
   ├─ tips.rag_context (0.3s)
   └─ tips.llm_generation (1.2s)       [type: llm]
   ```
3. **Click on parallel_agents** → Show Budget Coach + Job Matcher ran in parallel
4. **Show agent.guardian span** → Explain guardrail validation
5. **Show fallback levels**: Find traces with `fallbackLevel: 2` or `3` → Graceful degradation

### Value Statement
> "Multi-agent systems are complex. Opik gives us X-ray vision into every decision."

---

## Demo Use Case 3: User Feedback Loop (2 min)

**Story**: "Real user feedback closes the loop"

### Demo Flow

1. **Navigate to Traces with feedback** → Filter traces with feedback scores
2. **Show feedback score columns**:
   - `feedback.helpful`: 1 (thumbs up)
   - `feedback.rating`: 5/5
3. **Aggregate view**: Show which tips get better ratings
4. **Explain flow**:
   - User sees tip → Clicks 👍/👎
   - Frontend calls `/api/suggestion-feedback`
   - Opik `logFeedbackScores()` attaches to trace
   - Dashboard shows trend over time

### Value Statement
> "We know exactly which features resonate with students and which need improvement."

---

## Bonus: Prompt Version Tracking

**Story**: "Prompt engineering becomes scientific"

### Demo Flow

1. **Filter by metadata**: `prompt.name = onboarding-extractor`
2. **Show different versions**: Traces have `prompt.version` (8-char hash)
3. **Compare metrics**: "Version A: 0.85 avg score, Version B: 0.72 → Regression detected"

### Value Statement
> "When we update prompts, we detect quality regressions automatically."

---

## Trace Examples to Prepare

Before the demo, generate these traces:

### 1. Chat Trace (Good Quality)
```bash
# Ask Bruno a question that triggers full extraction
curl -X POST http://localhost:3006/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi! I am a computer science student and I want to save 500 euros for summer vacation", "profileId": "demo-profile"}'
```

### 2. Tips Orchestration (Full Pipeline)
```bash
# Trigger tips with full context
curl -X POST http://localhost:3006/api/tips \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "demo-profile",
    "currentEnergy": 75,
    "energyHistory": [60, 65, 70, 75],
    "goalProgress": 35,
    "activeMissions": [],
    "skills": ["tutoring", "python", "web development"],
    "monthlyMargin": 50,
    "hoursAvailable": 10,
    "enableFullOrchestration": true
  }'
```

### 3. Energy Debt Scenario
```bash
# Trigger energy debt detection
curl -X POST http://localhost:3006/api/tips \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "demo-profile",
    "currentEnergy": 25,
    "energyHistory": [35, 30, 28, 25],
    "goalProgress": 50,
    "activeMissions": []
  }'
```

---

## Dashboard Configuration

### Recommended Filters

1. **Chat quality monitoring**:
   - Filter: `name = chat.onboarding`
   - Show columns: duration, feedback scores, status

2. **Agent orchestration**:
   - Filter: `name = tips.orchestrator`
   - Show columns: agentsUsed, fallbackLevel, orchestrationType

3. **Error tracking**:
   - Filter: `status = error`
   - Show columns: errorMessage, duration

### Key Metrics to Highlight

| Metric | Source | Meaning |
|--------|--------|---------|
| `evaluation.final_score` | Chat traces | Combined quality score |
| `fallbackLevel` | Tips traces | 0=full, 3=static fallback |
| `agentsUsed` | Tips traces | Which agents contributed |
| `duration_ms` | All traces | Performance monitoring |

---

## Talking Points for Judges

1. **Privacy Compliance**: "All traces sanitize location data - GPS coordinates are replaced with `[LOCATION_REDACTED]` for FERPA/GDPR compliance"

2. **Graceful Degradation**: "If agents timeout, we fall back to simpler analysis - the user always gets a response"

3. **Hybrid Evaluation**: "We combine fast heuristic checks with LLM-as-judge for comprehensive quality assurance"

4. **Cost Tracking**: "Every LLM call includes token usage and cost estimates visible in Opik"

5. **Prompt Versioning**: "We track prompt hashes so we can correlate quality changes with prompt updates"

---

## Troubleshooting

### Traces not appearing?
1. Check `ENABLE_OPIK=true` in `.env`
2. Verify `OPIK_API_KEY` and `OPIK_WORKSPACE` are set
3. Traces are flushed after each request - refresh dashboard

### Feedback scores not visible?
- Scores use REST API directly (`PUT /v1/private/traces/{id}/feedback-scores`)
- Check network tab for 401/403 errors → API key issue

### Project not found?
- Default project is `stride` (configured via `OPIK_PROJECT`)
- Create it manually in Opik dashboard if needed
