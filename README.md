# Stride

> Navigate student life, one smart step at a time

**Live Demo**: [https://encodeclubhackathon2026-production.up.railway.app/](https://encodeclubhackathon2026-production.up.railway.app/)

**Track**: Financial Health - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

---

## 30 Second Pitch

Stride helps students manage their budget with 4 intelligent features:

1. **Skill Arbitrage** - Finds the job that won't burn you out (SQL at $22/h beats Python at $25/h when you factor in effort and demand)
2. **Swipe Scenarios** - Choose your strategies like on Tinder, the app learns your preferences
3. **Comeback Mode** - Detects when you recover after exams and creates a catch-up plan
4. **Energy Debt** - Reduces your goals when exhausted and rewards self-care with achievements

Everything is traced in Opik - you can see exactly why we recommend that job.

---

## How It Works

### 4 Screens

| Screen | Route | Description |
|--------|-------|-------------|
| **Onboarding** | `/` | Chat with Bruno to set up your profile |
| **Me** | `/me` | 5 tabs to manage your finances |
| **Swipe** | `/swipe` | Tinder-style strategy selection |
| **Progress** | `/progress` | Dashboard with timeline and missions |

### Me Page (5 Tabs)

| Tab | What you do |
|-----|-------------|
| **Profile** | Personal info, energy tracking, work preferences |
| **Goals** | Savings goal, deadline, progress chart |
| **Budget** | Monthly income/expenses, subscription optimization |
| **Trade** | Borrow/lend/swap items instead of buying |
| **Jobs** | Job search with Google Places, save leads |

### Swipe Scenarios

Roll the dice to get personalized scenarios based on your profile:
- Swipe right = interested, left = not interested
- The app learns your preferences (effort sensitivity, rate priority, flexibility)
- After swiping, scenarios become missions to track

### Progress Dashboard

- **Timeline** with time progress + weekly targets
- **Comeback Alert** when you can catch up after exams
- **Energy History** with fatigue detection
- **Missions** to validate, skip, or delete
- **Bruno Tips** with contextual advice

---

## 4 Key Features

### 1. Skill Arbitrage

The highest-paying job isn't always the best. Multi-criteria scoring:

```
Score = Rate (30%) + Demand (25%) + Effort (25%) + Rest (20%)
```

A $22/h SQL job might score higher than $25/h Python if it's less exhausting and more in-demand.

### 2. Swipe Scenarios

- Swipe right = interested, left = not interested
- After 4+ swipes, the app updates your preference weights
- Weights influence future job recommendations
- All preference updates traced in Opik

### 3. Comeback Mode

- Detects when energy rises >80% after being <40%
- Creates a realistic catch-up plan
- "Comeback King" achievement unlocked

### 4. Energy Debt

- 3+ weeks at low energy = automatically reduced goal
- "Self Care Champion" badge unlocked
- Rest mode suggestions activated

---

## Achievements System

Gamification layer with bronze/silver/gold tiers:

| Achievement | Tier | Condition |
|-------------|------|-----------|
| First Euro | Bronze | First earnings collected |
| 100 Club | Silver | Reach 100 euros earned |
| Week Complete | Bronze | Complete all weekly missions |
| Goal Achieved | Gold | Reach savings goal |
| Self Care Champion | Silver | Use rest mode during energy debt |
| Comeback King | Gold | Complete comeback plan |
| Stable Energy | Silver | Maintain energy above 60% for 4 weeks |
| Budget Master | Silver | Apply 3+ optimizations |
| Skill Arbitrage Pro | Bronze | Use multi-criteria job selection |
| Diversified Income | Silver | Have 3+ active income sources |
| Swipe Master | Bronze | Complete swipe session |
| Profile Complete | Silver | Complete all 5 tabs |
| Daily Check | Bronze | 7 days consecutive energy updates |

---

## Architecture

### 10 Agents (MCP Server)

**Core Agents (Factory):**

| Agent | Role |
|-------|------|
| **Budget Coach** | Budget analysis, personalized advice |
| **Job Matcher** | Skill Arbitrage scoring, job recommendations |
| **Guardian** | 2-layer validation of recommendations |
| **Money Maker** | Income opportunity detection |
| **Strategy Comparator** | Scenario comparison and ranking |
| **Projection ML** | Future earnings projections |
| **Goal Planner** | Savings goal planning and timeline |

**Specialized Agents:**

| Agent | Role |
|-------|------|
| **Onboarding Agent** | Profile extraction from chat |
| **Daily Briefing** | Contextual daily tips generation |
| **Tips Orchestrator** | Bruno tips prioritization and routing |

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Tracing** | Opik Cloud (every recommendation traced) |
| **LLM** | Groq (llama-3.1-70b-versatile) |
| **Voice** | Groq Whisper (whisper-large-v3-turbo) |
| **Agents** | Mastra Framework |
| **Frontend** | SolidStart + SolidJS + TailwindCSS |
| **Storage** | DuckDB (single file) |
| **Job Search** | Google Places API |

### Opik Integration

Every recommendation is traced with prompt versioning:

| Trace | What it captures |
|-------|------------------|
| `chat.onboarding` | Profile extraction with prompt hash |
| `skill_arbitrage` | Job scoring breakdown |
| `swipe.preference_update` | Weight deltas after swipes |
| `guardian_validation` | Risk checks on recommendations |
| `comeback.detection` | Energy recovery detection |
| `energy_debt.check` | Fatigue threshold monitoring |
| `feedback.score` | User satisfaction from interactions |

Traces include `prompt.name`, `prompt.version`, `prompt.hash` for regression detection.

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables
cp .env.example .env
# Edit .env with:
#   GROQ_API_KEY
#   OPIK_API_KEY
#   OPIK_WORKSPACE
#   GOOGLE_MAPS_API_KEY (optional, for job search)

# 3. Run development server
pnpm dev              # Frontend → http://localhost:3006

# 4. Build for production
pnpm build
```

---

## Development

```bash
pnpm dev              # Run frontend
pnpm dev:mcp          # Run MCP server (stdio)
pnpm typecheck        # Type check all packages
pnpm lint             # Lint all packages
pnpm lint:fix         # Lint with auto-fix
pnpm format           # Format with Prettier
```

---

## Documentation

- [CLAUDE.md](CLAUDE.md) - AI assistant guidelines
- [docs/architecture/](docs/architecture/) - Architecture details
- [docs/ROADMAP.md](docs/ROADMAP.md) - Project roadmap

---

## Time Machine (Dev Feature)

For demos, the simulation controls allow:
- Fast-forward time to test energy debt triggers
- Simulate comeback scenarios
- Test achievement unlocks

Access via the clock icon in the Progress page header.

---

## License

MIT
