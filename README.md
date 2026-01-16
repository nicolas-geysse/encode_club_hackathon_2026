# Stride

> Navigate student life, one smart step at a time

## 30 Second Pitch

Stride aide les étudiants à gérer leur budget avec 4 features intelligentes:

1. **Skill Arbitrage** - Trouve le job qui ne te cramera pas (SQL à 22€/h bat Python à 25€/h)
2. **Swipe Scenarios** - Choisis tes stratégies comme sur Tinder
3. **Comeback Mode** - Détecte quand tu récupères après les exams et crée un plan de rattrapage
4. **Energy Debt** - Réduit tes objectifs quand tu es épuisé et récompense le self-care

Tout est tracé dans Opik - tu peux voir exactement pourquoi on te recommande ce job.

**Track**: Financial Health - Encode Club Hackathon 2026
**Sponsor**: Comet (Opik)

---

## Comment ça marche

### Onboarding (Chat avec Bruno)
- Dis ton objectif en langage naturel
- Bruno te pose des questions pour comprendre ta situation
- Profil créé automatiquement

### Mon Plan (6 tabs)

| Tab | Ce que tu fais |
|-----|----------------|
| Setup | Objectif, deadline, événements académiques |
| Skills | Voir le scoring multi-critères de tes jobs |
| À Vendre | Ajouter des objets à vendre via chat |
| Lifestyle | Optimiser tes dépenses récurrentes |
| Trade | Emprunter/troquer au lieu d'acheter |
| Swipe | Roll the Dice → Swipe tes stratégies |

### Suivi (Dashboard)
- Timeline avec progression temps + charge de travail
- Alerte Comeback si tu peux rattraper
- Historique énergie + détection fatigue
- Valider/supprimer tes missions

---

## 4 Features Clés

### Skill Arbitrage
Le job le mieux payé n'est pas toujours le meilleur.
Score multi-critères: taux horaire × demande × effort × repos nécessaire.

### Swipe Scenarios
Swipe right = intéressé, left = pas intéressé.
L'app apprend tes préférences après 4 swipes.

### Comeback Mode
Détecte quand ton énergie remonte après une période difficile.
Crée un plan de rattrapage réaliste.

### Energy Debt
3 semaines à basse énergie = objectif réduit automatiquement.
Badge "Self Care Champion" débloqué.

---

## Architecture

### 4 Agents

| Agent | Rôle |
|-------|------|
| Budget Coach | Analyse budget + chat onboarding |
| Job Matcher | Skill Arbitrage + scoring |
| Guardian | Validation 2 couches |
| Energy Calculator | Comeback + Energy Debt |

### Stack

| Composant | Technologie |
|-----------|-------------|
| Tracing | Opik self-hosted |
| LLM | Groq (llama-3.3-70b) |
| Agents | Mastra Framework |
| Frontend | SolidStart + TailwindCSS |
| Storage | DuckDB |

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

## Observability avec Opik

Chaque recommandation est tracée:
- Pourquoi ce job? → `score_calculation` trace
- Pourquoi cet objectif réduit? → `energy_debt_check` trace
- Comment mes swipes influencent? → `preference_learning` trace

Détails: [docs/OPIK.md](docs/OPIK.md)

---

## Documentation

- [OPIK.md](docs/OPIK.md) - Intégration Opik + traces
- [SCREENS_AND_EVALS.md](docs/SCREENS_AND_EVALS.md) - Détail des écrans
- [PLAN.md](docs/PLAN.md) - Architecture complète

---

## License

MIT
