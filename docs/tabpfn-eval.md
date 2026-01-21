# TabPFN 2.5 Evaluation for Stride

**Date**: 2026-01-21
**Type**: Technical Evaluation / R&D Exploration
**Model**: [TabPFN 2.5](https://huggingface.co/Prior-Labs/tabpfn_2_5) by Prior Labs

---

## Executive Summary

**Verdict**: ⚠️ **INTÉRESSANT MAIS PRÉMATURÉ**

TabPFN 2.5 est un modèle transformer révolutionnaire pour les données tabulaires, mais son adoption dans Stride nécessite:
1. Plus de données historiques (goals terminés, outcomes réels)
2. Une stratégie de licensing claire (gratuit pour R&D, payant pour production)
3. Une intégration via Python MCP Server (pattern deposium_geoai)

**Recommandation**: Utiliser **Option D (Python MCP Server via FastMCP)** - le même pattern que deposium_geoai. Node.js (Mastra) appelle TabPFN comme un outil MCP standard, isolant les dépendances lourdes (PyTorch) dans un container Python séparé.

---

## 1. Qu'est-ce que TabPFN 2.5 ?

### Architecture
- **Transformer pré-entraîné** sur 130M+ de datasets synthétiques
- **In-context learning**: pas d'entraînement itératif, une seule forward pass
- **Zero-shot inference**: fonctionne immédiatement sur nouvelles données

### Capacités
| Aspect | Limite |
|--------|--------|
| Samples max | 50,000 rows |
| Features max | 2,000 colonnes |
| Tasks | Classification + Régression |
| Types de données | Numériques, catégoriels, valeurs manquantes |

### Différenciateurs vs XGBoost/LightGBM
| Critère | TabPFN | Tree-based |
|---------|--------|------------|
| Training time | ~0 (pré-entraîné) | Minutes-heures |
| Few-shot | ✅ Excellent | ❌ Besoin de données |
| Uncertainty | ✅ Natif (Bayesian) | ❌ Calibration manuelle |
| Interprétabilité | SHAP intégré | SHAP externe |
| Cold start | ✅ Fonctionne | ❌ Problématique |

---

## 2. Données Stride: Compatibilité Excellente

### Volume de données typique
```
Par utilisateur (1 semestre):
├── profiles:        1-5 rows      (~1 KB)
├── goals:           1-3 rows      (~1 KB)
├── goal_progress:   52 rows/an    (~5 KB)
├── energy_logs:     52-365 rows   (5-30 KB)
├── academic_events: 5-10 rows     (~2 KB)
├── commitments:     3-7 rows      (~2 KB)
└── TOTAL:           ~150-400 rows (~40-70 KB)

Plateforme entière:
├── 100 users:   ~5-25 MB
├── 1,000 users: ~50-250 MB  ✅ Dans les limites TabPFN
└── 10,000 users: ~500 MB - 2.5 GB
```

### Features déjà disponibles
| Feature | Type | Disponible |
|---------|------|------------|
| energy_level | Numérique (1-5) | ✅ energy_logs |
| mood_score | Numérique (1-5) | ✅ energy_logs |
| stress_level | Numérique (1-5) | ✅ energy_logs |
| hours_slept | Numérique | ✅ energy_logs |
| monthly_income | Numérique (€) | ✅ profiles |
| monthly_expenses | Numérique (€) | ✅ profiles |
| goal_amount | Numérique (€) | ✅ goals |
| goal_deadline | Date | ✅ goals |
| academic_event_type | Catégoriel | ✅ academic_events |
| commitment_hours | Numérique | ✅ commitments |

### Features à créer (feature engineering)
- `days_until_deadline`: goal_deadline - today
- `rolling_avg_energy_7d`: moyenne mobile 7 jours
- `semester_week`: semaine dans le semestre (1-16)
- `exam_proximity`: jours jusqu'au prochain exam
- `capacity_utilization`: heures_travaillées / max_hours

---

## 3. Cas d'Usage Potentiels

### 🎯 **Tier 1: High Value, Réalisable**

#### A. Energy Level Prediction
```
Input:  30 jours d'historique (energy, mood, stress, sleep, events)
Output: Niveau d'énergie prédit pour la semaine prochaine (1-5)
Value:  Alimenter Comeback/Debt detection, capacity planning
Data:   ✅ Déjà collectée dans energy_logs
```

**ROI**: Permet d'anticiper les baisses d'énergie AVANT qu'elles arrivent, au lieu de réagir après 3 semaines de dette.

#### B. Goal Feasibility Scoring
```
Input:  goal_amount, deadline, profil (income/expenses), energy history, calendar
Output: Probabilité de succès (0-1) + intervalle de confiance
Value:  Remplacer l'heuristique actuelle par un modèle appris
Data:   ⚠️ Nécessite goals avec status='completed'/'failed'
```

**ROI**: "Tu as 73% de chances d'atteindre ton objectif" vs "C'est faisable" (actuel).

### 🔄 **Tier 2: Medium Value, Données Manquantes**

#### C. Monthly Savings Prediction
```
Input:  income, expenses par catégorie, indicateurs saisonniers
Output: Épargne réelle prédite (avec variance)
Value:  Projections financières plus précises
Data:   ⚠️ Nécessite historique mensuel (pas encore tracké)
```

#### D. Job Success Prediction
```
Input:  skill match, market demand, user effort patterns
Output: Revenus réels prédits pour un job
Data:   ⚠️ Nécessite outcomes de jobs (did student earn predicted amount?)
```

### ❌ **Tier 3: Pas Adapté**

- **Skill Arbitrage**: 4 facteurs, heuristique déjà optimisée
- **Knowledge Graph**: Pas tabulaire, DuckPGQ mieux adapté
- **Retroplanning**: Problème de contraintes, pas de prédiction

---

## 4. Options d'Intégration

### Option A: MindsDB + DuckDB (❌ Pas recommandé)

**Status**: MindsDB a une intégration DuckDB, mais **PAS de handler TabPFN**.

```sql
-- Ce que MindsDB supporte:
CREATE MODEL energy_predictor
FROM duckdb (SELECT * FROM energy_logs)
PREDICT energy_level
USING ENGINE = 'lightwood';  -- ❌ Pas TabPFN

-- Ce qu'il faudrait (n'existe pas):
USING ENGINE = 'tabpfn';  -- ❌ Non disponible
```

**Effort**: Créer un custom ML handler MindsDB (~2-3 semaines de dev).

### Option B: DuckDB Extension (❌ Pas disponible)

**Extensions ML existantes**:
- [Infera](https://github.com/CogitatorTech/infera): ONNX models only
- [quackML](https://github.com/parkerdgabel/quackML): XGBoost/LightGBM, pas TabPFN

**Problème**: TabPFN n'est pas exportable en ONNX (architecture custom).

### Option C: Python Service + DuckDB (⚠️ Fonctionnel mais pas optimal)

```
┌─────────────────────────────────────────────────────┐
│                    Architecture                      │
├─────────────────────────────────────────────────────┤
│  Frontend (SolidStart)                              │
│       │                                             │
│       ▼                                             │
│  API Route (/api/predict/energy)                    │
│       │                                             │
│       ▼                                             │
│  Python Microservice (FastAPI)                      │
│  ┌─────────────────────────────────────────┐       │
│  │  from tabpfn import TabPFNClassifier    │       │
│  │  clf = TabPFNClassifier()               │       │
│  │  clf.fit(X_train, y_train)  # ~100ms    │       │
│  │  pred = clf.predict(X_test)             │       │
│  └─────────────────────────────────────────┘       │
│       │                                             │
│       ▼                                             │
│  DuckDB (data/stride.duckdb)                        │
│  - SELECT * FROM energy_logs WHERE user_id = ?     │
│  - Feature extraction via SQL                       │
└─────────────────────────────────────────────────────┘
```

**Avantages**:
- ✅ Contrôle total sur le pipeline
- ✅ TabPFN natif (pip install tabpfn)
- ✅ DuckDB Python bindings excellents

**Inconvénients**:
- ❌ API REST custom (non standard)
- ❌ Pas d'intégration avec l'écosystème MCP existant
- ❌ Déploiement séparé du reste de l'infra

### Option D: Python MCP Server via FastMCP (✅ RECOMMANDÉ)

**Pattern validé sur**: [deposium_geoai](file:///home/nico/code_source/tss/deposium_geoai)

Node.js (Mastra) appelle le Python MCP Server (TabPFN) comme un simple outil MCP.
Isole les dépendances lourdes (PyTorch/TabPFN) dans un container Python séparé.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Architecture MCP-Native                       │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (SolidStart)                                          │
│       │                                                         │
│       ▼                                                         │
│  Stride MCP Server (Node.js/Mastra)                             │
│  ├── analyze_budget, generate_advice, etc.                      │
│  └── 🔗 MCP Client → TabPFN MCP Server                          │
│            │                                                     │
│            ▼  (HTTP transport, port 5002)                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  TabPFN MCP Server (Python/FastMCP)                 │       │
│  │  ┌─────────────────────────────────────────────┐   │       │
│  │  │  @router.tool()                             │   │       │
│  │  │  async def predict_energy(                  │   │       │
│  │  │      user_id: str,                          │   │       │
│  │  │      horizon_days: int = 7                  │   │       │
│  │  │  ) -> dict:                                 │   │       │
│  │  │      clf = TabPFNClassifier()               │   │       │
│  │  │      features = load_from_duckdb(user_id)   │   │       │
│  │  │      return clf.predict(features)           │   │       │
│  │  └─────────────────────────────────────────────┘   │       │
│  │  Port 5002, Dockerized                              │       │
│  └─────────────────────────────────────────────────────┘       │
│            │                                                     │
│            ▼                                                     │
│  DuckDB (data/stride.duckdb) ←─ volume partagé                  │
└─────────────────────────────────────────────────────────────────┘
```

**Structure du service (pattern deposium_geoai)**:
```
stride-tabpfn-mcp/
├── pyproject.toml
├── Dockerfile
├── src/
│   ├── server.py          # FastMCP entry point
│   ├── config.py          # Pydantic BaseSettings
│   ├── tools/
│   │   ├── __init__.py
│   │   └── energy.py      # predict_energy tool
│   └── services/
│       └── tabpfn.py      # Model singleton + inference
```

**server.py (FastMCP)**:
```python
from fastmcp import FastMCP
from src.tools import energy

mcp = FastMCP(
    "Stride TabPFN",
    version="0.1.0",
    description="ML predictions pour Stride via TabPFN",
)

mcp.include_router(energy.router, prefix="ml")

if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=5002)
```

**tools/energy.py**:
```python
from fastmcp import APIRouter
from src.services.tabpfn import get_tabpfn_service

router = APIRouter()

@router.tool()
async def predict_energy(
    user_id: str,
    horizon_days: int = 7,
) -> dict:
    """Prédire le niveau d'énergie futur d'un étudiant.

    Args:
        user_id: ID de l'étudiant
        horizon_days: Nombre de jours à prédire (défaut: 7)

    Returns:
        predicted_energy: Niveau prédit (1-5)
        confidence: Intervalle de confiance
        risk_of_debt: Probabilité de dette énergétique
    """
    service = await get_tabpfn_service()
    features = await service.load_features(user_id, horizon_days)
    prediction = await service.predict(features)

    return {
        "user_id": user_id,
        "horizon_days": horizon_days,
        "predicted_energy": prediction["value"],
        "confidence_interval": prediction["ci"],
        "risk_of_debt": prediction["debt_risk"],
        "model": "TabPFN-2.5",
    }
```

**Avantages**:
- ✅ **Standard MCP**: Mastra peut appeler comme n'importe quel autre outil
- ✅ **Isolation complète**: PyTorch/CUDA dans son propre container
- ✅ **Pattern éprouvé**: Même architecture que deposium_geoai
- ✅ **Scalabilité**: Container Python indépendant (GPU dédié possible)
- ✅ **Traceable via Opik**: Spans MCP automatiquement tracés
- ✅ **Réutilisable**: Peut être appelé par d'autres clients MCP (Claude Desktop, etc.)

**Inconvénients**:
- ⚠️ Container Python séparé à maintenir
- ⚠️ Latence réseau (~50-200ms) - acceptable pour prédictions batch

**Comparaison des options**:

| Critère | Option C (FastAPI) | Option D (FastMCP) |
|---------|-------------------|-------------------|
| Protocole | REST custom | MCP standard |
| Intégration Mastra | fetch() manuel | Client MCP natif |
| Observabilité | Custom Opik | Spans MCP auto |
| Réutilisabilité | Stride seulement | Tout client MCP |
| Complexité | Medium | Medium |

---

## 5. Licensing ⚠️ ATTENTION

| Usage | Licence | Coût |
|-------|---------|------|
| Recherche / Interne | `tabpfn-2.5-license-v1.0` | **Gratuit** |
| Hackathon / Prototype | ✅ Couvert | **Gratuit** |
| Production / Commercial | Enterprise License | **Payant** (contacter sales@priorlabs.ai) |

**Pour Stride (Hackathon)**: ✅ OK pour la démo et le prototype.

**Post-hackathon**: Si Stride devient un produit, il faudra:
1. Contacter Prior Labs pour tarification
2. OU utiliser un modèle alternatif (XGBoost + calibration)

---

## 6. Comparaison avec Approche Actuelle

### Projection de Savings (actuel vs TabPFN)

**Actuel** (`projection-ml.ts`):
```typescript
// Formule linéaire simple
finalBalance = currentSavings + (projectedMonthlyMargin × months);
probability = baseProbability + marginImpact;  // Heuristique
confidenceInterval = ±20%;  // Statique!
```

**Avec TabPFN**:
```python
# Modèle appris sur historique
clf = TabPFNRegressor()
clf.fit(X_train, y_train)  # Apprend des patterns réels
pred, uncertainty = clf.predict(X_test, return_std=True)
# uncertainty = intervalle de confiance data-driven
```

### Energy Debt Detection (actuel vs TabPFN)

**Actuel** (`energy-debt.ts`):
```typescript
// Règle fixe: ≥3 semaines avec energy < 40%
if (consecutiveLowWeeks >= 3) triggerDebtMode();
```

**Avec TabPFN**:
```python
# Prédiction: dans 2 semaines, quelle sera l'énergie?
predicted_energy = clf.predict(features_next_2_weeks)
if predicted_energy < 40:
    showPreventiveAlert("Tu risques une période difficile...")
```

---

## 7. Plan de POC Proposé

### Phase 1: Collecte de Ground Truth (2-4 semaines)
1. Ajouter tracking de `goal_outcome` (succès/échec/partiel)
2. Collecter ~50-100 goals terminés avec leurs outcomes
3. Enrichir energy_logs avec plus de contexte

### Phase 2: POC Energy Prediction (1 semaine)

See `scripts/tabpfn-poc.py` for implementation.

### Phase 3: Intégration (si POC positif) - Option D

1. Créer Python MCP Server (`stride-tabpfn-mcp/`) suivant le pattern deposium_geoai
2. Exposer `predict_energy` comme outil MCP via FastMCP
3. Configurer Mastra pour appeler le MCP Server Python (HTTP transport, port 5002)
4. Traces MCP automatiquement capturées par Opik
5. Déployer via Docker avec volume partagé pour DuckDB

---

## 8. Verdict Final

### Contexte: R&D / Exploration (>1 semaine avant deadline)

**Décision**: ✅ **DOCUMENTER POUR RÉFÉRENCE FUTURE**

Ce document sert de référence technique pour une intégration future. TabPFN reste une option intéressante pour:
- Post-hackathon si Stride évolue vers un produit
- Améliorer les prédictions une fois qu'on a assez de données historiques

### Livrables

| Livrable | Status | Fichier |
|----------|--------|---------|
| Document d'évaluation | ✅ Complété | `docs/tabpfn-eval.md` |
| Script POC | ✅ Complété | `scripts/tabpfn-poc.py` |

### Next Steps (Post-Hackathon)

1. **Court terme**: Collecter des `goal_outcome` (succès/échec) pendant 2-3 mois
2. **Moyen terme**: Quand ~100 goals terminés, lancer le POC energy prediction
3. **Long terme**: Si ROI prouvé, évaluer licensing Prior Labs vs alternatives open-source

---

## Sources

- [TabPFN 2.5 - HuggingFace](https://huggingface.co/Prior-Labs/tabpfn_2_5)
- [TabPFN GitHub](https://github.com/PriorLabs/tabPFN)
- [MindsDB DuckDB Integration](https://docs.mindsdb.com/integrations/data-integrations/duckdb)
- [Infera DuckDB Extension](https://github.com/CogitatorTech/infera)
- [quackML DuckDB Extension](https://github.com/parkerdgabel/quackML)
