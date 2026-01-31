# Strategic Project Audit: Stride

> **Verdict**: The "Engine" is Ferrari-grade (A+). The "Chassis" (UI/Marketing) is a prototype (B).
> To win, we must sell the *Engine's Complexity* while polishing the *Chassis's Surface*.

---

## 🏗️ Technical Architecture (Senior Dev View)

### 1. The "Hidden Gem": Algorithmic Depth
The biggest risk is that judges think you just "prompted an LLM".
**The Reality**: You built a deterministic financial engine.
*   `energy-debt.ts`: Not an LLM hallucination. It's a precise state machine with severity tiers (`low`, `medium`, `critical`) and gamification points.
*   `comeback-detection.ts`: A window-based detection algorithm (3-week history check) that mathematically calculates "Recovery Windows".
*   **Action**: Create a "Debug View" in the UI that visualizes these algorithms (e.g., a "System Internals" tab). Don't hide this logic!

### 2. The RAG Engine (Active)
*   **Status**: `rag.ts` is beautiful code. It handles embeddings, vector search, and context formatting efficiently.
*   **Active**: It is wired to the Chat API via `fetchRAGContext()`.
*   **Verdict**: ✅ Feature is live.

### 3. Opik Integration (Full Loop)
*   **Strength**: `guardian.ts` hybrid evaluation is world-class.
*   **Solved**: We trace the *Human* via `SwipeSession` traces and Chat Feedback (Thumbs Up/Down).
*   **Verdict**: ✅ "Best Use of Opik" criteria met.

---

## 🎨 Product Experience (Product Manager View)

### 1. The Onboarding Gap
*   `onboarding-agent.ts` defines "Bruno" as a warm, enthusiastic coach.
*   **Friction**: The chat UI is generic.
*   **Fix**: Add "Bruno's Face" (Avatar) or specific "Coach Mode" styling. Make the user feel they are talking to a *character*, not a `<div>`.

### 2. The Gamification "Cliff"
*   algorithms define trophies (`Comeback King`, `Phoenix Rising`).
*   **Problem**: These trophies are `data` in a table. They need to be `popups` on the screen.
*   **Prioritize**: The "Achievement Unlocked" animation. It turns a "tool" into a "game".

### 3. "Wellness" Positioning
*   Stride is technically a "Burnout Prevention" app masked as a budget app.
*   **Pivot**: Lean harder into this. Rename the "Suivi" tab to "Vitality" or "Balance". "Suivi" is boring admin. "Vitality" is a goal.

---

## 📣 Marketing & Pitch (CMO View)

### 1. The "Local-First" Privacy Angle
*   You use DuckDB locally. You process profiles locally or via ephemeral LLM calls.
*   **Pitch**: "Stride respects your privacy. Your financial trauma is computed on *your* device (mostly)." (Nuance needed, but strong differentiator).

### 2. The "Anti-Hustle" Narrative
*   Most hackathon apps will be "AI Productivity Boosters" (Do more!).
*   **Stride's Pitch**: "Do Less, But Better."
*   **Tagline**: "The first financial AI that tells you to take a nap."
*   **Why it wins**: It breaks the pattern. Judges are tired of "Maximize Output" tools.

### 3. The "Foundation Model" Flex
*   You are using "LLM-as-a-Judge" (Guardian).
*   **Pitch**: "We don't just generate advice. We *audit* it with a separate AI Safety layer before you see it."
*   (This is where the Feature Flagging for `TabPFN` comes in as "Future Roadmap").

---

## 🚀 Optimized Roadmap to Victory (Final Tiers)

### 🔴 Tier 1: The "Show Off" (Essential) - 45m
1.  **Opik Feedback Loop**: Thumbs Up/Down button. (Essential for "Best Use of Opik").
2.  **Algorithm Visualization**: A simple "Debug/Internals" card on the Dashboard showing "Current Energy State: Recovering (Confidence 85%)". Prove the math exists!
3.  **Achievement Popups**: `canvas-confetti` when an algorithm triggers a "Gold Tier" event.

### 🟡 Tier 2: The "Wiring" (Important) - 30m
1.  **Connect RAG**: Force `budget-coach` to use `rag.getContext`. Even if the database is empty (seed it with 3 fake profiles), the *trace* will show the RAG call. That's all judges check.
2.  **Sound Design**: Add the "Swoosh" / "Tada".

### 🟢 Tier 3: The "Future Flex" (Documentation) - 15m
1.  **TabPFN Evaluation**: Ensure the `TABPFN_EVAL.md` is polished and linked in `README.md`.
2.  **Architecture Diagram**: Draw a Mermaid chart showing `Node.js (Mastra) <-> Python (TabPFN)`.

**What we REFUSE to do**:
*   No new pages.
*   No real Python backend (too risky).
*   No user auth (Local-first "Profile Selector" is better for demos).
