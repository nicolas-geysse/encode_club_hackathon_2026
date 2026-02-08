# Agent & Tool Registry

> This document details the specific Agents and Tools implemented in the MCP Server.

## Agent Architecture

### Agent Factory Pattern (`packages/mcp-server/src/agents/factory.ts`)

Agents are created from configuration objects using a centralized factory:

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;  // System prompt
  toolNames: string[];   // Registered tool IDs
}
```

### Available Agents

| Agent | ID | Purpose | Tools |
|-------|-----|---------|-------|
| **Budget Coach** | `budget-coach` | Analyze budget, give advice | `analyze_budget`, `generate_advice`, `find_optimizations` |
| **Job Matcher** | `job-matcher` | Find compatible jobs | `match_jobs`, `explain_job_match`, `compare_jobs` |
| **Projection ML** | `projection-ml` | Predict graduation balance | `predict_graduation_balance`, `simulate_scenarios` |
| **Guardian** | `guardian` | Validate recommendations | `validate_calculation`, `check_risk_level` |
| **Money Maker** | `money-maker` | Side hustles, item selling | `analyze_sellable_objects`, `estimate_item_price`, `calculate_sale_impact`, `suggest_side_hustles`, `money_maker_analysis` |
| **Strategy Comparator** | `strategy-comparator` | Compare options | `compare_strategies`, `quick_strategy_comparison` |
| **Goal Planner** | `goal-planner` | Create savings plans | `create_goal_plan`, `update_goal_progress`, `goal_risk_assessment` |

### Additional Agents (Post-Launch)

| Agent | ID | Purpose |
|-------|----|---------|
| **Onboarding Agent** | `onboarding-agent` | Conversational onboarding |
| **Lifestyle Agent** | `lifestyle-agent` | Subscription optimization (`analyze_subscriptions`, `suggest_pause_strategy`, `calculate_savings_impact`) |
| **Swipe Orchestrator** | `swipe-orchestrator` | Scenario generation + ranking |
| **Daily Briefing** | `daily-briefing` | Daily financial briefing |
| **Tab Tips Orchestrator** | `tab-tips-orchestrator` | Tab-specific AI tips |
| **Tips Orchestrator** | `tips-orchestrator` | General tips engine |
| **Agent Executor** | `agent-executor` | Agent dispatch coordinator |

### Guardrail Agents (Swipe Pipeline)

| Agent | ID | Purpose |
|-------|----|---------|
| **Essential Guardian** | `essential-guardian` | Detect naive suggestions, propose structural alternatives |
| **Ghost Observer** | `ghost-observer` | Detect rejection patterns, filter by behavioral insights |
| **Asset Pivot** | `asset-pivot` | Detect productive assets, suggest monetization platforms |
| **Cash Flow Smoother** | `cashflow-smoother` | Detect timing mismatches, suggest timing solutions |

### Tool Registry

Tools are registered globally and referenced by name. This decoupling allows dynamic tool assignment to agents.

```typescript
// Register
registerTool('analyze_budget', analyzeBudgetTool);

// Lookup
const tools = getToolsByNames(['analyze_budget', 'generate_advice']);
```
