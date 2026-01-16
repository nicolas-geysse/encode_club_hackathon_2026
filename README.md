# Stride

> **Navigate student life, one smart step at a time**

AI-powered financial navigation for students with **4 killer features** that make budgeting feel like a game, not a chore.

**Track**: Financial Health ($5,000 prize) - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

---

## 4 Killer Features

### 1. Crunch Intelligent (Comeback Mode)

> *"Failed a few weeks? We detect your comeback window."*

You had exams. You couldn't focus on saving. Now you're back at 90% energy.

**What happens:**
- Stride detects your "comeback window" automatically
- Creates an aggressive but realistic catch-up plan
- Redistributes your goal to high-capacity weeks
- Unlocks the "Comeback King" achievement

```
Week 1-4: 50% of target (exams)     ← Protected
Week 5:   Energy recovers to 90%    ← Comeback detected!
Week 5-7: Aggressive catch-up       ← 50€ + 45€ + 31€ = 126€ recovered
```

### 2. Skill Arbitrage (Smart Job Matching)

> *"Not just max money - the job that fits YOUR life."*

Python Dev pays 25€/h. SQL Coaching pays 22€/h. We recommend SQL Coaching. Why?

**Multi-criteria scoring:**
| Job | Rate | Demand | Effort | Rest | Score |
|-----|------|--------|--------|------|-------|
| Python Dev | 25€ | ★★★★★ | Very High | Low | 6.2/10 |
| SQL Coaching | 22€ | ★★★★ | Moderate | High | **8.7/10** |
| Data Entry | 12€ | ★★★★ | Very Low | High | 7.1/10 |

**The insight:** Highest pay ≠ best choice. Stride finds the job that won't burn you out.

### 3. Swipe Scenarios (Tinder for Strategies)

> *"Swipe through money strategies like you swipe profiles."*

Don't read walls of text. Just swipe.

**How it works:**
- See a strategy card (Freelance Dev: +120€/month, 10h/week)
- Swipe right = interested, left = not interested
- Stride learns your preferences
- Next recommendations get smarter

**The magic:** After 4 swipes, we know you prioritize flexibility over max income. Your future recommendations reflect that.

### 4. Energy Debt Gamification

> *"3 weeks at 30% energy? Time to reward self-care."*

Most apps push you harder. Stride does the opposite.

**Reverse psychology:**
- 3 weeks at low energy detected
- Target automatically reduced: 63€ → 10€
- Focus on recovery
- Unlock "Self Care Champion" achievement

```
Week 1: Energy 35% → Target kept
Week 2: Energy 30% → Target kept
Week 3: Energy 32% → Energy Debt detected!
Week 4: Target reduced to 10€ + Recovery plan activated
```

**The insight:** Rest is a strategy, not a failure.

---

## Architecture

### 4 Agents

| Agent | Role | Killer Feature |
|-------|------|----------------|
| **Budget Coach** | Analyzes income/expenses, generates advice | Foundation |
| **Job Matcher** | Skill Arbitrage + multi-criteria scoring | #2 Skill Arbitrage |
| **Guardian** | Validates recommendations (2-layer eval) | Quality control |
| **Energy Calculator** | Capacity tracking + Comeback detection | #1 & #4 |

### 5 Screens

| # | Screen | Purpose |
|---|--------|---------|
| 1 | **Onboarding** | Profile + skills + budget |
| 2 | **Goal Setup** | Define goal + exams + commitments |
| 3 | **Goal Plan** | Strategies + Swipe Scenarios |
| 4 | **Goal Calendar** | Retroplan with capacity visualization |
| 5 | **Goal Track** | Progress + Energy check-in + Achievements |

### 2-Layer Evaluation

| Layer | Purpose | Latency |
|-------|---------|---------|
| **Heuristics** | Fast sanity checks (math, risks) | ~50ms |
| **G-Eval LLM** | Quality scoring via LLM-as-Judge | ~500ms |

*Opik handles monitoring separately. See [OPIK.md](docs/OPIK.md) for full observability details.*

---

## Demo Scenario

```
Student: "I'm in L2 CS, 800€/month. I want to save 500€ for a trip in 8 weeks."

→ SPAN 1: Budget Analysis
  Income: 800€, Expenses: 750€, Margin: 50€

→ SPAN 2: Skill Arbitrage (Killer #2)
  Python → 25€/h but HIGH effort (score: 6.2)
  SQL Coaching → 22€/h, MODERATE effort (score: 8.7) ← Recommended

→ SPAN 3: Swipe Session (Killer #3)
  [Freelance] ← swipe left
  [Tutoring] → swipe right
  [Selling items] → swipe right
  Learned: prioritizes flexibility, moderate effort

→ SPAN 4: Energy Check (Killer #1 & #4)
  Current energy: 85%
  No debt detected
  Comeback mode: not needed (all good!)

→ SPAN 5: Guardian Validation
  Heuristics: PASS (math valid)
  G-Eval: 0.89 confidence
  Final: APPROVED

→ RESULT: "SQL Coaching 6h/week + sell 2 items = 500€ in 7 weeks"
```

---

## Why Opik is Essential

4 agents coordinating = complex traces to debug.

| What Opik Shows | Why It Matters |
|-----------------|----------------|
| Comeback detection logic | "Why is my target 50€ this week?" |
| Skill arbitrage scoring | "Why SQL over Python?" |
| Preference learning | "How did my swipes change recommendations?" |
| Energy debt calculations | "Why was my target reduced?" |

**Full details:** [docs/OPIK.md](docs/OPIK.md)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Tracing** | Opik self-hosted |
| **LLM** | Groq (llama-3.3-70b) |
| **Voice** | Groq Whisper |
| **Graph** | DuckDB + DuckPGQ |
| **Agents** | Mastra Framework |
| **Frontend** | SolidStart + TailwindCSS |

---

## Quick Start

```bash
# 1. Opik (self-hosted)
cd opik/deployment/docker-compose
docker compose --profile opik up -d
# → http://localhost:5173

# 2. MCP Server
cd packages/mcp-server
npm install && npm run build

# 3. Frontend
cd packages/frontend
npm install && npm run dev
# → http://localhost:3000
```

---

## Hackathon Criteria Match

| Criteria | Our Response |
|----------|--------------|
| **Functionality** | 4 killer features, not just a chatbot |
| **Real-world** | Student niche = concrete, immediate problems |
| **LLM/Agents** | 4 Mastra agents with multi-criteria intelligence |
| **Opik** | Full traceability for every recommendation |
| **Goal alignment** | Help students balance money, time, and wellness |

---

## Why We Win

1. **Laser focus** → 4 killer features, not 20 mediocre ones
2. **Reverse psychology** → Energy Debt rewards rest, not hustle
3. **Multi-criteria** → Skill Arbitrage prevents burnout
4. **Addictive UX** → Swipe Scenarios make planning fun
5. **Full transparency** → Opik traces explain every decision

---

## 30-Second Pitch

> "**Stride** helps students navigate between studies, jobs, and budget with 4 killer features:
>
> **Crunch Intelligent** detects when you recover from exams and creates catch-up plans.
> **Skill Arbitrage** finds jobs that won't burn you out (SQL at 22€/h beats Python at 25€/h).
> **Swipe Scenarios** lets you pick strategies like Tinder profiles.
> **Energy Debt** rewards self-care when you're exhausted.
>
> All traced in Opik - you can see exactly why we recommended that job."

---

## Documentation

- [OPIK.md](docs/OPIK.md) - Opik integration details
- [SCREENS_AND_EVALS.md](docs/SCREENS_AND_EVALS.md) - Screens and evaluation
- [PLAN.md](docs/PLAN.md) - Architecture and implementation

---

## License

MIT
