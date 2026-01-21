# Evaluation: TabPFN 2.5 for Stride

## Executive Summary
**TabPFN 2.5** is a foundation model for tabular data (like an LLM but for Excel sheets). It excels at classification/regression on **small datasets** (up to 10k rows) without training (zero-shot) or hyperparameter tuning.

**Verdict**: 
- **Fit for Data**: Excellent. Stride's data (daily energy logs, budget rows) is small, tabular, and sparse.
- **Tech Fit**: **Viable via MCP Pattern**. We can deploy TabPFN as a standalone Python MCP Server (similar to `deposium_geoai`) that Stride's Mastra agent consumes as a tool.
- **Recommendation**: Plan this for the next major sprint ("The MCP ML Layer").

---

## 1. Top Use Cases in Stride

### A. "Burnout Prediction" (Energy Debt)
*   **Input**: Last 14 days of `energy_logs` (sleep hours, mood score 1-5, stress level 1-5, academic event intensity).
*   **Target**: Classification -> Will the student crash next week? (Yes/No).
*   **Why TabPFN?**: We have very little data per student. TabPFN is "priors-based", meaning it generalizes incredibly well on small sample sizes where traditional ML (XGBoost) overfits.

### B. "Grant Eligibility Scoring" (Budget)
*   **Input**: `profiles` table (income, parents' income, city size, rent).
*   **Target**: Regression -> Estimated probability of scholarship success.
*   **Why TabPFN?**: It handles categorical data (City Size) and numerical data mixed naturally.

---

## 2. Integration Pathway: The Python MCP Server Pattern

Instead of a REST microservice, we should stick to the **Model Context Protocol (MCP)** standard we are already using.

### Architecture
1.  **Node.js Monorepo** (Current Stride) -> Runs Mastra Agents.
2.  **Python MCP Server** (New `packages/ml-server`) -> Runs TabPFN.
3.  **Connection**: Mastra connects to the Python server via `stdio` (local) or `sse` (remote).

### Blueprint: `deposium_geoai`
We can reuse the `fastmcp` + `uv` structure from your parallel project:

```toml
# pyproject.toml
[project]
name = "stride-ml-mcp"
dependencies = [
    "fastmcp",
    "tabpfn",  # The heavy ML dependency is isolated here!
    "pandas"
]
```

### Tool Definition (Python)
```python
from fastmcp import FastMCP
from tabpfn import TabPFNClassifier

mcp = FastMCP("stride-ml")

@mcp.tool()
def predict_burnout(sleep_avg: float, stress_avg: float, mood_trend: float) -> float:
    """Predict burnout probability (0-1) based on recent metrics."""
    # Zero-shot inference
    X_train = [[7, 2, 4], [4, 5, 2]] # Historical examples
    y_train = [0, 1]
    
    clf = TabPFNClassifier(device='cpu')
    clf.fit(X_train, y_train)
    return clf.predict_proba([[sleep_avg, stress_avg, mood_trend]])[0][1]
```

## 3. Advantages of MCP approach
1.  **Isolation**: The massive PyTorch dependencies of TabPFN don't pollute the Node.js frontend/backend.
2.  **Composable**: The Mastra agent just sees a tool `predict_burnout`. It doesn't care if it's running on a GPU server or local.
3.  **Future Proof**: We can swap TabPFN for XGBoost or something else inside the Python server without changing the agent logic.

## 4. Strategic Advice for Submission
*   **Still too large for *this* submission** (unless you have a free half-day).
*   **Strong argument for "Future Architecture"**: "We are implementing a Python MCP Server for Foundation ML Models using the same pattern as our GeoAI project."
