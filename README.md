# Stride

> Navigate student life, one smart step at a time

## 30 Second Pitch

Stride helps students manage their budget with 4 intelligent features:

1. **Skill Arbitrage** - Finds the job that won't burn you out (SQL at $22/h beats Python at $25/h)
2. **Swipe Scenarios** - Choose your strategies like on Tinder
3. **Comeback Mode** - Detects when you recover after exams and creates a catch-up plan
4. **Energy Debt** - Reduces your goals when exhausted and rewards self-care

Everything is traced in Opik - you can see exactly why we recommend that job.

**Track**: Financial Health - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

---

## How It Works

### Onboarding (Chat with Bruno)
- State your goal in natural language
- Bruno asks questions to understand your situation
- Profile created automatically

### My Plan (6 tabs)

| Tab | What you do |
|-----|-------------|
| Setup | Goal, deadline, academic events |
| Skills | View multi-criteria scoring of your jobs |
| Inventory | Add items to sell via chat |
| Lifestyle | Optimize your recurring expenses |
| Trade | Borrow/trade instead of buying |
| Swipe | Roll the Dice → Swipe your strategies |

### Dashboard
- Timeline with time progress + workload
- Comeback alert if you can catch up
- Energy history + fatigue detection
- Validate/delete your missions

---

## 4 Key Features

### Skill Arbitrage
The highest-paying job isn't always the best.
Multi-criteria score: hourly rate × demand × effort × rest needed.

### Swipe Scenarios
Swipe right = interested, left = not interested.
The app learns your preferences after 4 swipes.

### Comeback Mode
Detects when your energy rises after a difficult period.
Creates a realistic catch-up plan.

### Energy Debt
3 weeks at low energy = automatically reduced goal.
"Self Care Champion" badge unlocked.

---

## Architecture

### 4 Agents

| Agent | Role |
|-------|------|
| Budget Coach | Budget analysis + onboarding chat |
| Job Matcher | Skill Arbitrage + scoring |
| Guardian | 2-layer validation |
| Energy Calculator | Comeback + Energy Debt |

### Stack

| Component | Technology |
|-----------|------------|
| Tracing | Opik Cloud |
| LLM | Groq (llama-3.3-70b) |
| Agents | Mastra Framework |
| Frontend | SolidStart + TailwindCSS |
| Storage | DuckDB |

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables
cp .env.example .env
# Edit .env with your GROQ_API_KEY, OPIK_API_KEY, OPIK_WORKSPACE

# 3. Run development servers
pnpm dev              # Frontend → http://localhost:3000
pnpm dev:mcp          # MCP Server (stdio)
```

---

## Observability with Opik

Every recommendation is traced:
- Why this job? → `score_calculation` trace
- Why this reduced goal? → `energy_debt_check` trace
- How do my swipes influence? → `preference_learning` trace

Details: [docs/OPIK.md](docs/OPIK.md)

---

## Documentation

- [OPIK.md](docs/OPIK.md) - Opik integration + traces
- [SCREENS_AND_EVALS.md](docs/SCREENS_AND_EVALS.md) - Screen details
- [PLAN.md](docs/PLAN.md) - Full architecture

---

## License

MIT
