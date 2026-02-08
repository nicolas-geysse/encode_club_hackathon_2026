# Architecture Documentation

This directory contains the technical documentation for Stride.

## 📂 Structure

**Product Guide**: For high-level features and quick start, see the [Project README](../../README.md).

### `core/` (Current Implementation)
The living documentation of the current system.
*   [system-overview.md](./core/system-overview.md): High-level architecture and quick stats.
*   [data-flow.md](./core/data-flow.md): How data moves between Chat, DuckDB, and Services.
*   [technical-context.md](./core/technical-context.md): Tech stack, patterns, and critical rules.
*   [database-guide.md](./core/database-guide.md): Deep dive into DuckDB integration and patterns.
*   [chat-architecture.md](./core/chat-architecture.md): Design of the Agentic Chat and Action Pipeline.
*   [agent-registry.md](./core/agent-registry.md): List of implemented Agents and their Tools.
*   [swipe-agents.md](./core/swipe-agents.md): Comprehensive Agent Orchestration and Pull Architecture for Swipe.
*   [ui-ux-design.md](./core/ui-ux-design.md): Detailed 3-Screen design, Agents, and Evaluation logic.
*   [feature-specifications.md](./core/feature-specifications.md): Detailed logic for the 4 Killer Features (Crunch, Arbitrage, Swipe, Debt).
*   [realtime-reactivity.md](./core/realtime-reactivity.md): Event Bus and Anti-Flickering architecture.
*   [skills-engine.md](./core/skills-engine.md): The Knowledge Graph and Skill Arbitrage engine.
*   [skills-graph-structure.md](./core/skills-graph-structure.md): Detailed connection logic of the Skills Knowledge Graph.
*   [llm-stack.md](./core/llm-stack.md): Gemini / Groq / Opik abstraction guidelines.
*   [llm-provider-agnostic.md](./core/llm-provider-agnostic.md): Architecture for switching between Groq, Mistral, and OpenAI.
*   [opik-guide.md](./core/opik-guide.md): Best practices for Observability and Auditing.
*   [opik-technical-reference.md](./core/opik-technical-reference.md): Deep dive into Opik Traces, SDK configuration, and Advanced Metrics.
*   [tools-reference.md](./core/tools-reference.md): Documentation of implemented MCP Tools (Prospection, Google Maps).

### `guides/` (How-To)
*   [hackathon-demo-guide.md](./guides/hackathon-demo-guide.md): Script for the Hackathon Demo.

### `planning/` (Roadmap & Analysis)
Strategic documents, refactoring plans, and status reports.
*   [chat-sprint.md](./planning/chat-sprint.md): Plan for Conversational Intelligence & Proactive Delivery.
*   [skills-boost.md](./planning/skills-boost.md): Plan for consolidating the Skills pipeline.
*   [refactoring-priorities.md](./planning/refactoring-priorities.md): Execution order for tech debt cleanup.
*   [mastra-migration.md](./planning/mastra-migration.md): Plan for moving logic to Mastra Agents.
*   [file-inventory.md](./planning/file-inventory.md): detailed file stats.
*   [INDICATORS.md](./planning/INDICATORS.md): KPI definitions.

### `legacy/` (Archive)
Design documents for features that were deferred or implemented differently.
*   [find-jobs-concept.md](./legacy/find-jobs-concept.md): Original workflow-based design for Job Search (now Tool-based).
*   [TabPFN-turbov2.md](./legacy/TabPFN-turbov2.md): ML integration plan (Deferred).
*   [report-railway-duplication.md](./legacy/report-railway-duplication.md): Incident report on Railway deployment issues (Jan 2026).

## 🔑 Key Constraints
*   **Database**: Single-file DuckDB (`.db`).
*   **State**: `profileService` is the source of truth, synced from `localStorage`.
*   **Observability**: All LLM calls must be traced via **Opik**.
