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
| **Money Maker** | `money-maker` | Side hustles, item selling | `analyze_sellable_objects`, `estimate_item_price`, `suggest_side_hustles` |
| **Strategy Comparator** | `strategy-comparator` | Compare options | `compare_strategies`, `quick_strategy_comparison` |
| **Goal Planner** | `goal-planner` | Create savings plans | `create_goal_plan`, `update_goal_progress`, `goal_risk_assessment` |

### Tool Registry

Tools are registered globally and referenced by name. This decoupling allows dynamic tool assignment to agents.

```typescript
// Register
registerTool('analyze_budget', analyzeBudgetTool);

// Lookup
const tools = getToolsByNames(['analyze_budget', 'generate_advice']);
```
