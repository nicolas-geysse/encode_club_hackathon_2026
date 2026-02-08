# The Stride Development Story: From Chaos to Clarity

> *In the beginning, there was a hackathon idea. Then came the 10 AI Agents, the single-file database, and the race conditions.*
>
> This document records the significant technical hurdles and architectural challenges encountered during the development of Stride. Instead of a dry list of bugs, this is the story of how we tamed the complexity of an Agentic AI application.

---

## Chapter 1: The Foundations & The Sync Nightmare (Sprint 1-3)

### The Challenge: "Who owns the truth?"
We started with a simple premise: A Chatbot (Onboarding Agent) extracts data, and the UI displays it.
**Reality:** The Chatbot ran on the server (Mastra), the UI ran in the browser (SolidStart), and the state lived in... both? And `localStorage`? And DuckDB?

### The Battle: The Silent Failures
In Sprint 1, we hit the **"Step Flow Mismatch"**. The Frontend thought step 2 was "Region", the Backend thought it was "Name". Users were asked "Where do you live?" and when they answered "France", the backend yelled "I didn't catch your name!".
Then came the **"Silent Failures"**. A user would type their skills, the LLM would extract them, the code would *try* to save them... and fail silently. The UI would just show "No skills added".

### The Resolution: Single Source of Truth
We made three critical decisions that saved the project:
1.  **Kill localStorage**: It was causing "Cross-Profile Contamination" (seeing Dylan's goals on Nicolas's profile). We moved strictly to DuckDB as the single source of truth.
2.  **Promise.allSettled**: We stopped "hoping" saves would work. We implemented robust parallel saving with explicit feedback to the user if *any* part of the extraction failed.
3.  **Strict Typing**: We customized the backend logic to match the frontend flow step-by-step, unifying the definition of the "Onboarding Journey".

---

## Chapter 2: The Database Concurrency Headache (Sprint 5-10)

### The Challenge: Multi-Process Madness
Stride grew. We added a Vector Store for RAG. We added background agents.
Suddenly, we had:
- **Process A (Frontend)** trying to read the DB.
- **Process B (MCP Server)** preaching to the Vector Store.
- **Process C (User)** asking "Why is the app spinning?"

### The Battle: `SQLITE_BUSY` & The Race
DuckDB is amazing, but it interacts with the file system.
When the Frontend tried to save a profile *at the exact same millisecond* the MCP Server tried to update the Vector Store embedding for that profile, we hit hard locks.
We also faced the **"Vector Store Race"**: two identical requests to "Embed Profile" would launch, race, and trigger generic "Constraint Violations" deep in the Mastra library.

### The Resolution: The "Good Enough" Architecture
We didn't rewrite the world. We got pragmatic:
1.  **Deduplication Layer**: We added an `inFlightEmbeddings` map. If a request to embed "Profile 123" is already running, the second one just waits. Simple. Effective. (Eliminated 90% of clashes).
2.  **Debounce Everything**: We realized we didn't need to save/embed on *every keystroke*. A 2000ms debounce on the embedding trigger calmed the system down.
3.  **Retry with Backoff**: For the 1% of collisions remaining, we implemented exponential backoff. The app doesn't crash; it just waits a blink and tries again.

---

## Chapter 3: The Reactivity War (Sprint 11-12)

### The Challenge: "It flickers!"
SolidJS is fine-grained and fast. Sometimes *too* fast.
We wanted real-time updates: You change your budget in the Chat, the Budget Tab updates instantly.

### The Battle: The Infinite Loop
We implemented an **Event Bus** (`DATA_CHANGED`). Great!
But...
1. UI receives `DATA_CHANGED`.
2. UI fetches new data.
3. UI updates local state `setGoal(...)`.
4. `createEffect` sees state change, thinks "User updated goal!", and fires a Save.
5. Save completes -> Emits `DATA_CHANGED`.
6. **GOTO 1**.

Results: infinite loops, flickering inputs, and an API getting hammered.

### The Resolution: Smarter Reactivity
We learned to "Untrack".
- We implemented **Value Comparison** checks: Only update state if the data *actually* changed (`JSON.stringify` checks).
- We separated "Server-Driven Updates" from "User Interactions".
- We polished the UX with animations (like the "Orbital Pulse" for Bruno) to hide the few milliseconds of latency, making the app *feel* instant.

---

## Chapter 4: Taming Chaos with Observability (Sprint 13-Current)

### The Challenge: "Why did it say that?"
With 10 Agents (Budget Coach, Job Matcher, Guardian...), when the app gave bad advice, we had no idea *who* to blame.
Was it the prompt? The context? The model (Groq vs Mistral)?

### The Resolution: Opik Integration
We didn't just add logging; we added **Forensics**.
1.  **Full Tracing**: Every agent call, every tool execution, every LLM token is traced in Opik.
2.  **Prompt Versioning**: We now know that *Trace 812* used *Budget Coach Prompot v1.2*. If a regression happens, we know exactly which prompt change caused it.
3.  **Automated Benchmarking**: We created `stride_benchmark_v1`. Before we deploy a new prompt, we run it against 36 test cases (Safety, Intent, Onboarding). If the score drops below 86%, we don't ship.

---

## Chapter 5: Remaining Dragons (Future Limitations)

### 1. TabPFN (The Missing Brain)
**Status:** Deferred.
We planned to use TabPFN for "zero-shot tabular prediction" (detecting burnout risk mathematically). We built the architecture (`TabPFN-turbov2.md`), but for the Hackathon, we stuck to heuristic rules. It remains the next big step for "True AI Intelligence".

### 2. Multi-User Scale
**Status:** Solved (Architecture).
Stride operates on a single-file DuckDB architecture. To scale to 10,000 concurrent users or beyond, our strategy is **MotherDuck**.
*   **Why not Postgres?** Postgres doesn't support our `DuckPGQ` graph extension (knowledge graph) without heavy plugins.
*   **Why MotherDuck?** It's "Zero-Rewrite" — we just change the connection string. It keeps the "Local First" dev experience while giving Cloud scalability. Ideally suited for our hybrid architecture.

### 3. The Browser Extension Ghost
**Status:** Wontfix (External).
We spent days debugging "Runtime Errors" in form inputs. Turns out, it was password managers and ad-blockers fighting our DOM. We optimized our code (`GridMultiSelect`), but some ghosts are in the machine (the user's browser).

### 4. The Vercel Deployment Wall
**Status:** Incompatible by Design.
We list Vercel as a partner (Next.js creators), but we cannot deploy Stride on Vercel's Edge/Serverless infrastructure.
*   **The Constraint:** DuckDB (in our "Local First" mode) requires a **persistent, writable file system** to store the `.duckdb` file and its Write-Ahead Log (WAL).
*   **The Blocker:** Vercel Serverless Functions have an **ephemeral file system**. You can write to `/tmp`, but it vanishes securely after the function executes.
*   **The Impact:** Every user request would start with a blank database.
*   **The Solution:** We deploy on a **VPS (Virtual Private Server)** or a containerized environment (Docker/Railway/Fly.io) where we can mount a persistent Volume for the data folder. This is the trade-off for true Data Sovereignty.

---

## Chapter 5: The Architect's Victory (Open Source & Innovation)

Despite the chaos, 3 major innovations emerged from the Hackathon and were released as Open Source:

### 1. The Knowledge Graph (DuckPGQ)
We didn't just use a database; we built a **semantic brain** inside DuckDB.
*   **The Innovation:** Using `DuckPGQ` to model "Skill Arbitrage" (Python -> Freelance) and "Career Paths" (L3 Info -> Master -> Tech Lead) directly in SQL.
*   **The Value:** We perform complex graph queries ("Find jobs enabled by my skills with high ROI") without a separate Neo4j instance. Single file, infinite complexity.

### 2. Native Voice Integration
We implemented a **Local-First Voice Interface** (`VoiceInput.tsx`).
*   **The Gap:** Most web-apps rely on cloud APIs for voice.
*   **The Win:** By processing audio chunks locally and streaming them to our optimized inference engine, we achieved near-real-time conversation capability for accessibility.

### 3. The "Seed Ship" Open Source Ecosystem
Stride wasn't just built *with* tools; it *created* tools. To solve our "Chaos", we extracted and published:
*   **`@seed-ship/duckdb-mcp-native`**: The bridge that connects DuckDB to the MCP ecosystem. [NPM Link](https://www.npmjs.com/package/@seed-ship/duckdb-mcp-native)
*   **`@seed-ship/mcp-ui-solid`**: The component library that powers our "Chat Item Cards". [NPM Link](https://www.npmjs.com/package/@seed-ship/mcp-ui-solid)
*   **`deposium_embeddings-turbov2`**: Our high-performance inference engine, now free for the community. [GitHub Link](https://github.com/theseedship/deposium_embeddings-turbov2)

We didn't just build an app; we advanced the ecosystem.

---

## Chapter 6: The Final Architecture (Hackathon Synopsis)

For the judges and technical reviewers, here is the "Box View" of Stride as it stands today.

### 1. The Multi-Model Brain
We don't rely on a single LLM. We route tasks to the best model for the job:
*   **Groq (Llama 3 70B)**: Used for **Speed**. Powers the Chat, Intent Detection, and UI generation. "Instant" feel.
*   **Mistral (Large)**: Used for **Reasoning**. Powers the complex "Budget Coach" and "Strategy Comparator" analysis.
*   **Google Gemini (Pro 1.5)**: Used for **Context**. Powers the RAG synthesis and heavy document reading (PDFs).

### 2. The Agent Swarm
Stride is not one bot. It is a swarm of **12 Specialized Agents** working in concert via the `Mastra` framework:
*   **Orchestrators**: `TipsOrchestrator`, `SwipeOrchestrator`, `TabTipsOrchestrator`.
*   **Specialists**:
    *   `BudgetCoach`: Financial analysis & margin optimization.
    *   `JobMatcher`: Skill arbitrage & opportunity finding.
    *   `MoneyMaker`: Gig economy strategy generator.
    *   `AssetPivot`: Long-term wealth planning.
*   **Guardrails**: `Guardian` (Safety), `GhostObserver` (Privacy/Ethical checks).

### 3. The Data Layer (Local & Semantic)
*   **Storage**: **DuckDB** (Local-First). No cloud DB latency.
*   **Semantics**: **DuckPGQ**. We model Skills and Jobs as a Graph.
    *   *Query Example:* `MATCH (s:Student)-[:HAS]->(skill)-[:ENABLES]->(job) WHERE job.rate > 20 RETURN job`
*   **Vector Store**: **@mastra/rag** with our custom `deposium_embeddings` model.

### 4. Observability via Opik
We don't guess; we measure.
*   **Tracing**: Every agent interaction is traced in Opik.
*   **Evaluation**: We run **Hybrid Evaluation** (Heuristic + LLM-as-a-Judge) on every piece of advice given.
*   **Optimization**: We use Opik Datasets to regression-test our prompts against "Dangerous" or "Ambiguous" user inputs.


