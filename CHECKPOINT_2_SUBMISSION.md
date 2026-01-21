# Checkpoint 2 Submission: Stride

## The "Vibe Coding" Story
This project is a **solo "Vibe Coding" experiment**: just me, one vision, and a modern AI-agentic stack. My goal is to build a complete "Student Financial GPS" from scratch, moving from pure ideation to a fully instrumented multi-agent system. This is an **ongoing process**, but the core architecture is now alive.

**My Process:**
1.  **Design & Ideation**: I didn't just want a budget app. I wanted a "Financial Waze" that navigates life's bumps (exams, burnout).
2.  **Tech Architecture**: I chose a local-first, high-performance stack (SolidJS + DuckDB) coupled with powerful AI orchestration (Mastra).
3.  **Observability First**: I integrated Opik from Day 1 to trace *why* the AI recommends what it recommends.

## Prize Categories
I am targeting:

1.  **Financial Health** (Primary): Because Stride addresses the root cause of student financial anxiety. It doesn't just track pennies; it optimizes the student's entire "economic engine" (skills, energy, trade-offs).
2.  **Best Use of Opik** (Technical): Because I fully implemented an "LLM-as-a-Judge" safety pipeline that evaluates every piece of financial advice before it reaches the student.
3.  **Health, Fitness & Wellness** (Cross-Category Appeal): Stride is arguably a **"Financial Wellness"** app. By treating mental energy as a hard currency (via the "Energy Debt" algorithm), it actively prevents burnout. It aligns financial goals with physical/mental reality, proving that good health is the best asset.

## What I Am Building: Stride
Stride is an intelligent financial companion with **4 Killer Features** in active development:

1.  **Skill Arbitrage Agents**: Instead of "get a job", my agent analyzes the student's skills and suggests the highest-leverage work (e.g., "Don't do Python dev for $25/h if it exhausts you; do SQL coaching for $22/h and save your energy").
2.  **Swipe Scenarios**: A "Tinder for Finance" interface where students swipe on potential trade-offs. I'm using this to let the AI learn hidden preferences (Risk vs. Effort) from user actions.
3.  **Comeback Mode**: The system detects "Recovery Windows" after exams or burnout periods. I'm implementing algorithms to auto-generate realistic catch-up plans.
4.  **Energy Debt Gamification**: Treating mental energy as a currency. If a student checks in with low energy for 3 weeks, Stride *automatically* reduces their financial targets.

## Open Source Contributions & Tech Stack
I am not just using libraries; I am building the ecosystem I need. For this Hackathon, I developed and used my own open-source packages:

*   **@seed-ship/duckdb-mcp-native**: A high-performance bridge I created to connect DuckDB directly to MCP agents (used here for local analytics).
*   **@seed-ship/mcp-ui-solid**: A UI component library I built specifically for this event to render agentic UI (Generative UI) in SolidJS.
*   **@seed-ship/mcp-ui-spec**: The Zod specifications that define the "language" my agents speak to generate UIs.

**Core Stack:**
-   **Observability**: **Opik** (Self-Hosted) - Fully integrated via the official TypeScript SDK.
-   **Agent Framework**: **Mastra** (`v1.0.0-beta.23`) - Orchestrating 4 distinct agents (*Budget Coach, Job Matcher, Guardian, Energy Calculator*).
-   **LLM**: **Groq** via Vercel AI SDK - Running **Llama 3.3 70B** for sub-second inference.
-   **Frontend**: **SolidStart** - For a reactive, glitch-free user experience.

## Deep Dive: Best Use of Opik
I implemented a sophisticated **Hybrid Evaluation Pipeline** (`packages/mcp-server/src/evaluation`) that uses Opik to guarantee safety:
*   **Full Trace Hierarchy**: Every interaction is traced from the UI click down to the agent's thought process using a custom `opik.ts` service with `maybeTrace` for noise control.
*   **LLM-as-a-Judge**: I implemented a G-Eval system where an LLM evaluates the agent's response against 4 specific criteria (*Appropriateness, Safety, Coherence, Actionability*) defined in `criteria.ts`.
*   **Safety Guardrails**: If the "Guardian" agent assigns a safety score < 3/5 in Opik, the advice is vetoed before the user ever sees it.
*   **Cost Tracking**: Every call tracks token usage and cost in Opik, allowing me to monitor the "financial health" of the agents themselves.

## Context
This submission represents a functional vertical slice of the platform. I have a working onboarding chat (powered by Llama 3.3), dynamic planning tabs (rendering my `mcp-ui` components), and the core "Suivi" dashboard powered by simulation data to demonstrate the "Comeback Mode" algorithms I am refining.
