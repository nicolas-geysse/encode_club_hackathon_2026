# Student Life Navigator

> A GPS for student life - navigate between studies, jobs and budget with AI-powered insights

**Track**: Financial Health ($5,000 prize) - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

## The Problem

Students face a complex juggling act:
- **Budget constraints**: 800€/month average, 50€ margin
- **Job hunting**: Finding work that doesn't hurt grades
- **Future uncertainty**: "Will I graduate debt-free?"

Most apps offer generic budgeting. None combine **job matching based on skills** + **ML predictions** + **full explainability**.

## Our Solution: The Triptych

| Component | Technology | Role |
|-----------|------------|------|
| **LLM** | Mastra + Groq | Budget coaching, personalized advice |
| **Graph** | DuckDB + DuckPGQ | Skills → Jobs matching with co-benefits |
| **ML** | MindsDB | Graduation projections, loan payoff timeline |
| **Observability** | **Opik** | 10+ spans/request, full traceability |

## Demo Scenario

```
Student: "I'm in L2 Computer Science, I have 800€/month, how can I make it work?"

→ SPAN 1: budget_analysis (LLM)
  "Income: 800€, Expenses: 750€, Margin: 50€"

→ SPAN 2: graph_job_matching (DuckPGQ)
  "Python → Freelance Dev (25€/h, CV++) vs McDonald's (11€/h, no bonus)"

→ SPAN 3: graph_budget_optis (DuckPGQ)
  "Roommate (-30% rent), CROUS (-50% food), Bike (-80% transport)"

→ SPAN 4: ml_graduation_projection (MindsDB)
  "With job 10h/week + optimizations: 82% debt-free, ~8500€ savings"

→ SPAN 5: llm_recommendation
  "Recommendation: Freelance 10h/week + roommate = +750€/month net"
```

## Why Opik is Essential (Not Just Logging)

- **Job matching iterations**: Multiple graph traversals to find the best fit
- **ML predictions with confidence**: Users can see why "82% debt-free"
- **Explainability link in UI**: "See how AI found this job for you"
- **Custom metrics**: `job_match_score`, `budget_optimization_score`

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

## Tech Stack

| Component | Technology |
|-----------|------------|
| Orchestration | Mastra |
| Tracing | **Opik self-hosted** |
| LLM | Groq (llama-3.1-70b) |
| Graph | DuckDB + DuckPGQ |
| ML | MindsDB |
| Frontend | SolidStart |

## Project Structure

```
encode_club_hackathon_2026/
├── README.md
├── packages/
│   ├── mcp-server/           # MCP tools (15 tools)
│   │   ├── src/
│   │   │   ├── tools/
│   │   │   │   ├── budget-analysis.ts
│   │   │   │   ├── job-matcher.ts
│   │   │   │   ├── graduation-predictor.ts
│   │   │   │   └── opik-tracer.ts
│   │   │   └── graph/
│   │   │       └── student-knowledge-graph.sql
│   │   └── package.json
│   └── frontend/             # SolidStart UI
│       ├── src/
│       │   ├── components/
│       │   │   ├── Chat.tsx
│       │   │   ├── RadarChart.tsx
│       │   │   └── OpikTraces.tsx
│       │   └── routes/
│       └── package.json
├── opik/                     # Opik self-hosted config
├── docs/
│   └── PLAN.md               # Detailed implementation plan
└── docker-compose.yml
```

## Quick Start

```bash
# 1. Setup Opik
git clone https://github.com/comet-ml/opik.git
cd opik && ./opik.sh
# Available at http://localhost:5173

# 2. Start the project
cd encode_club_hackathon_2026
pnpm install
pnpm dev
```

## Hackathon Criteria Match

| Criteria | Our Response |
|----------|--------------|
| **Functionality** | Chat + job matching + budget optis + projections |
| **Real-world** | **Student niche** = concrete immediate problems |
| **LLM/Agents** | Budget coach + graph traversal + ML prediction |
| **Opik** | **10+ spans/request, custom metrics, feedback loop** |
| **Goal alignment** | Help students manage budget + find compatible jobs |

## Why We Win

1. **Clear niche** → students = highly engaged audience, few adapted apps
2. **Unique LLM+Graph+ML triptych** → not just a chatbot
3. **Relevant graph** → skills → jobs with co-benefits (CV++)
4. **Predictive ML** → "Will I have enough at the end?" = universal question
5. **Opik necessary** → job matching = many visible iterations

## 30-Second Pitch

> "Student Life Navigator helps students navigate between studies, jobs and budget. It finds jobs compatible with your skills via a graph (Python → Freelance Dev → 25€/h + CV++), predicts if you'll graduate with or without debt, and helps optimize your budget. Everything is traced in Opik - you can see exactly how the AI found that job for you."

## Team

- [Your team members]

## License

MIT
