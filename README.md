# Stride

> **Navigate student life, one smart step at a time**

AI-powered financial navigation for students — combining budget coaching, smart job matching, goal-driven planning, and predictive insights with full observability.

**Track**: Financial Health ($5,000 prize) - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

## The Problem

Students face a complex juggling act:
- **Budget constraints**: 800€/month average, 50€ margin
- **Job hunting**: Finding work that doesn't hurt grades
- **Future uncertainty**: "Will I graduate debt-free?"
- **Variable capacity**: Exams, projects, and energy levels fluctuate

Most apps offer generic budgeting. None combine **job matching based on skills** + **capacity-aware goal planning** + **multi-agent orchestration** + **full explainability**.

## Our Solution

### The Core Stack

| Component | Technology | Role |
|-----------|------------|------|
| **LLM** | Groq (llama-3.3-70b) | Budget coaching, personalized advice |
| **Graph** | DuckDB + DuckPGQ | Skills → Jobs matching with co-benefits |
| **Projections** | Formula-based | Graduation balance, loan payoff timeline |
| **Voice** | Groq Whisper | Speech-to-text for hands-free input |
| **Agents** | 6 Mastra Agents | Multi-agent orchestration |
| **Evaluation** | Hybrid 4-Layer | Heuristics → G-Eval → Aggregation → Opik |
| **Observability** | **Opik** | 10+ spans/request, full traceability |

### 6 Mastra Agents

| Agent | Role | Tools |
|-------|------|-------|
| **Budget Coach** | Analyzes income/expenses, generates advice | `analyze_budget`, `generate_advice`, `find_optimizations` |
| **Job Matcher** | Finds jobs matching skills via graph | `match_jobs`, `explain_job_match`, `compare_jobs` |
| **Projection** | Projects financial balance at graduation | `predict_graduation_balance`, `simulate_scenarios` |
| **Guardian** | Validates recommendations, prevents hallucinations | `validate_calculation`, `check_risk_level`, `hybrid_evaluation` |
| **Money Maker** | Suggests side hustles, estimates item prices | `analyze_image`, `estimate_price`, `suggest_hustles` |
| **Strategy Comparator** | Cross-evaluates money strategies | `compare_strategies`, `quick_comparison` |

### Goal Mode with Smart Retroplanning

Stride's unique feature: **capacity-aware goal planning** that adapts to your life.

```
Student: "Je veux économiser 1000€ pour un nouvel ordi d'ici 3 mois"

→ STEP 1: Set exams, vacations, commitments
  - Partiels S1: capacity ×0.2 (protected weeks)
  - Vacances Noël: capacity ×1.5 (boost weeks)
  - 15h cours/semaine: reduces available time

→ STEP 2: Generate retroplan with variable targets
  - Week 1: 150€ (high capacity)
  - Week 2: 30€ (exam week - protected)
  - Week 3: 180€ (vacation boost)
  ...

→ STEP 3: Track with gamification
  - Achievements: "First Blood", "On Fire", "Speed Racer"
  - Relative goals: beat YOUR capacity, not arbitrary targets
```

### Hybrid Evaluation System

4-layer pipeline ensuring quality responses:

```
Input → [Layer 1: Heuristics] → [Layer 2: G-Eval LLM-as-Judge]
                                         ↓
Output ← [Layer 4: Opik Logging] ← [Layer 3: Aggregation]
```

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| **Heuristics** | Fast sanity checks | Math validation, range checks |
| **G-Eval** | LLM-as-Judge scoring | Coherence, relevance, safety |
| **Aggregation** | Combine scores | Weighted average |
| **Opik** | Full observability | Traces, metrics, feedback |

## Demo Scenario

```
Student: "I'm in L2 Computer Science, 800€/month, how can I save 500€ for a trip?"

→ SPAN 1: budget_analysis (Budget Coach)
  "Income: 800€, Expenses: 750€, Margin: 50€"

→ SPAN 2: graph_job_matching (Job Matcher + DuckPGQ)
  "Python → Freelance Dev (25€/h, CV++) vs Tutoring (20€/h)"

→ SPAN 3: graph_optimizations (Budget Coach)
  "Roommate (-30% rent), CROUS (-50% food)"

→ SPAN 4: goal_retroplan (Goal Tools)
  "8 weeks plan: 62€/week average, adjusted for exams"

→ SPAN 5: guardian_validation (Guardian)
  "Validation: PASSED (confidence: 94%)"

→ SPAN 6: strategy_comparison (Strategy Comparator)
  "Best strategy: Freelance 8h/week + CROUS = goal in 7 weeks"
```

## Why Opik is Essential

- **Multi-agent tracing**: 6 agents coordinating = complex traces to debug
- **Goal planning iterations**: Retroplan recalculations visible
- **Hybrid evaluation scores**: See why "94% confidence"
- **Custom metrics**: `job_match_score`, `budget_optimization_score`, `feasibility_score`
- **Explainability link**: "See how AI found this job for you"

## Tech Stack

| Component | Technology |
|-----------|------------|
| Tracing | **Opik self-hosted** |
| LLM | Groq (llama-3.3-70b) |
| Voice | Groq Whisper (whisper-large-v3-turbo) |
| Graph | DuckDB + DuckPGQ |
| Agents | Mastra Framework |
| Frontend | SolidStart + TailwindCSS |
| MCP Server | TypeScript |

## Project Structure

```
stride/
├── README.md
├── packages/
│   ├── mcp-server/              # MCP tools + agents
│   │   ├── src/
│   │   │   ├── index.ts         # MCP server entry
│   │   │   ├── tools/           # 33 MCP tools
│   │   │   │   ├── index.ts     # Core tools (budget, graph, ML)
│   │   │   │   ├── voice.ts     # Voice input tools
│   │   │   │   └── goal.ts      # Goal + retroplan tools
│   │   │   ├── agents/          # 6 Mastra agents
│   │   │   │   ├── budget-coach.ts
│   │   │   │   ├── job-matcher.ts
│   │   │   │   ├── projection-ml.ts
│   │   │   │   ├── guardian.ts
│   │   │   │   ├── money-maker.ts
│   │   │   │   └── strategy-comparator.ts
│   │   │   ├── algorithms/      # Retroplanning algorithm
│   │   │   ├── services/        # DuckDB, Opik, Groq
│   │   │   ├── workflows/       # Multi-agent workflows
│   │   │   └── graph/           # Knowledge graph SQL
│   │   └── package.json
│   └── frontend/                # SolidStart UI
│       ├── src/
│       │   ├── app.tsx
│       │   ├── components/      # 5 reusable components
│       │   │   ├── VoiceInput.tsx
│       │   │   ├── GoalProgress.tsx
│       │   │   ├── MilestoneCard.tsx
│       │   │   ├── AchievementBadge.tsx
│       │   │   └── EnergyTracker.tsx
│       │   └── routes/
│       │       ├── index.tsx         # Onboarding
│       │       ├── dashboard.tsx     # Results dashboard
│       │       ├── chat.tsx          # Interactive chat
│       │       └── goal-mode/        # Goal tracking
│       │           ├── setup.tsx     # Goal + events setup
│       │           ├── plan.tsx      # Strategies view
│       │           ├── calendar.tsx  # Retroplan calendar
│       │           └── track.tsx     # Weekly tracking
│       └── package.json
├── opik/                        # Opik self-hosted (git clone)
└── docs/
    ├── PLAN.md                  # Architecture plan
    └── SCREENS_AND_EVALS.md     # Screens + evaluation docs
```

## Quick Start

```bash
# 1. Setup Opik (self-hosted)
cd opik/deployment/docker-compose
docker compose --profile opik up -d
# Available at http://localhost:5173

# 2. Build MCP Server
cd packages/mcp-server
npm install && npm run build

# 3. Start Frontend
cd packages/frontend
npm install && npm run dev
# Available at http://localhost:3000
```

## MCP Tools (33 total)

### LLM / Budget Coaching (6 tools)
| Tool | Description |
|------|-------------|
| `analyze_budget` | Budget analysis with recommendations |
| `generate_advice` | Personalized financial coaching |
| `find_optimizations` | Expense reduction strategies |
| `suggest_related_jobs` | Field-specific job suggestions |
| `validate_recommendation` | Guardian validation layer |
| `analyze_student_profile` | Full multi-agent workflow |

### Graph / DuckPGQ (4 tools)
| Tool | Description |
|------|-------------|
| `match_jobs` | Skills → Jobs with co-benefits |
| `career_projection` | Diploma → Career paths |
| `explain_recommendation` | Graph path explainability |
| `compare_jobs` | Side-by-side job comparison |

### Projections (3 tools)
| Tool | Description |
|------|-------------|
| `predict_graduation_balance` | End-of-studies financial projection |
| `predict_loan_payoff` | Loan repayment timeline |
| `simulate_scenarios` | What-if scenario modeling |

### Voice Input (2 tools)
| Tool | Description |
|------|-------------|
| `transcribe_audio` | Speech-to-text via Whisper |
| `voice_to_analysis` | Speech + contextual analysis |

### Goal Mode (5 tools)
| Tool | Description |
|------|-------------|
| `create_goal_plan` | Create goal with milestones |
| `update_goal_progress` | Track weekly progress |
| `get_goal_status` | View goal status |
| `goal_risk_assessment` | Analyze goal risk |
| `list_user_goals` | List all goals |

### Retroplanning (7 tools)
| Tool | Description |
|------|-------------|
| `add_academic_event` | Add exams, vacations, etc. |
| `add_commitment` | Add recurring commitments |
| `log_energy` | Log daily energy/mood/stress |
| `generate_retroplan` | Generate capacity-aware plan |
| `get_week_capacity` | Get week's capacity score |
| `list_academic_events` | List academic events |
| `list_commitments` | List commitments |

### Money Maker (4 tools)
| Tool | Description |
|------|-------------|
| `analyze_image` | Analyze item for selling |
| `estimate_price` | Estimate selling price |
| `budget_impact` | Calculate budget impact |
| `suggest_hustles` | Suggest side hustles |

### Visualization & Opik (2 tools)
| Tool | Description |
|------|-------------|
| `create_budget_chart` | Budget pie/doughnut chart |
| `get_traces` | Link to Opik dashboard |
| `log_feedback` | User thumbs up/down |

## Frontend Screens (7 screens)

1. **Onboarding** - Student profile questionnaire
2. **Dashboard** - Budget overview + recommendations
3. **Chat** - Interactive AI assistant with voice input
4. **Goal Setup** - Define goal + academic events
5. **Goal Plan** - View strategies + milestones
6. **Goal Calendar** - Retroplan with capacity visualization
7. **Goal Track** - Weekly progress + achievements

## UI Components

| Component | Purpose |
|-----------|---------|
| `VoiceInput` | Microphone button with Whisper transcription |
| `GoalProgress` | Animated progress bar with colors |
| `MilestoneCard` | Weekly milestone with status |
| `AchievementBadge` | Gamification badge with unlock state |
| `EnergyTracker` | Daily energy/mood/stress check-in |

## Knowledge Graph Schema

```sql
-- 3 domains combined
-- Skills → Jobs (enables, pays)
-- Diplomas → Careers (leads_to)
-- Solutions → Expenses (reduces)

INSERT INTO student_nodes VALUES
  ('python', 'skill', 'Python', '{"demand": 0.9}'),
  ('freelance_dev', 'job', 'Freelance Malt', '{"hourly_rate": 25}'),
  ('coloc', 'solution', 'Roommate', '{"savings_pct": 0.30}');

INSERT INTO student_edges VALUES
  ('python', 'freelance_dev', 'enables', 0.9, '{"co_benefit": "CV++"}'),
  ('coloc', 'rent', 'reduces', 0.30, '{"condition": "good roommate"}');
```

## Hackathon Criteria Match

| Criteria | Our Response |
|----------|--------------|
| **Functionality** | Chat + job matching + budget optis + goal planning + retroplan |
| **Real-world** | **Student niche** = concrete immediate problems |
| **LLM/Agents** | **6 Mastra agents** + multi-agent workflows |
| **Opik** | **10+ spans/request**, custom metrics, feedback loop, hybrid eval |
| **Goal alignment** | Help students manage budget + find jobs + achieve goals |

## Why We Win

1. **Clear niche** → students = highly engaged audience, few adapted apps
2. **Unique multi-agent architecture** → 6 specialized agents, not just a chatbot
3. **Smart Retroplanning** → capacity-aware goal planning (exams, energy, life)
4. **Hybrid Evaluation** → 4-layer validation ensures quality
5. **Opik integration** → Complex multi-agent traces need observability
6. **Voice-first** → Hands-free budget tracking via Whisper

## 30-Second Pitch

> "**Stride** helps students navigate between studies, jobs and budget. It has 6 AI agents that work together: one finds jobs matching your skills via a knowledge graph (Python → Freelance Dev → 25€/h + CV++), another creates capacity-aware plans that adapt to your exam schedule and energy levels, and a Guardian agent validates everything. All traced in Opik — you can see exactly how AI found that job and why it recommends this goal plan."

## License

MIT
