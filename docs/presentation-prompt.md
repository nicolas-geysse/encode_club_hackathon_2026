# Prompt pour Générer la Présentation Stride — Encode Club Hackathon 2026

> Coller ce prompt dans Claude, ChatGPT, ou Gemini avec le contenu complet de `docs/difficulties.md` en pièce jointe.

---

## Le Prompt

Tu es un expert en présentations techniques pour hackathons. Tu dois créer une présentation de **15-20 slides** pour le projet **Stride** — un navigateur de santé financière étudiante basé sur l'IA agentique.

### Contexte

**Événement** : Encode Club AI Hackathon 2026 — Financial Health Track, sponsorisé par Comet/Opik.
**Public** : Juges techniques de haut niveau :
- **Comet/Opik** — sponseur principal, veut voir une intégration profonde de leur plateforme d'observabilité LLM
- **Encode Club** — organisateur, évalue innovation + complétude + impact
- **DeepMind** — juge technique, intéressé par l'architecture IA et les décisions d'ingénierie
- **Vercel** — juge infra, intéressé par le déploiement, la stack technique, et la scalabilité

**Ton** : Technique mais narratif. Pas un README — une **histoire d'ingénierie**. Les juges veulent comprendre les décisions, pas juste les features.

### Document source

Le document ci-joint (`difficulties.md`) contient l'intégralité du récit technique : 10 chapitres + 2 annexes. Utilise-le comme **source unique de vérité** — tous les chiffres, architectures, et décisions techniques en viennent.

### Structure demandée

**Slide 1 — Title**
"Stride: 17 AI Agents, 1 DuckDB File, and the Observability Stack That Saved Us"
Sous-titre : Encode Club Hackathon 2026 — Financial Health Track
Accroche visuelle : le tagline du doc ("A hackathon project. 17 AI Agents. A single-file database. Race conditions everywhere.")

**Slide 2 — The Problem**
Les étudiants gèrent leur argent avec des tableurs ou rien. Pas d'outil adapté à la réalité étudiante (revenus irréguliers, stress d'examen, économie de pairs).
3 bullet points max. Humain, pas corporate.

**Slide 3 — The Solution (30 secondes)**
Stride = LLM-powered financial coach + 4 killer features. Screenshot ou mockup.
Montrer les 4 features en une phrase chacune : Skill Arbitrage, Swipe Scenarios, Comeback Mode, Energy Debt.

**Slide 4 — Architecture Overview**
Diagramme de la stack complète (reprendre le Chapter 7) :
SolidStart (SSR) → 40+ API endpoints → 17 Mastra Agents → DuckDB + DuckPGQ + Vector Store
Montrer les 3 couches : Frontend / Agent Layer / Data Layer.
Mentionner : provider-agnostic (Mistral, Groq, Gemini), hot-swappable at runtime.

**Slide 5 — The Routing Architecture (SLIDE CLÉ pour DeepMind)**
Titre : "50 Tools, No Tool Calling"
C'est LE point d'architecture le plus original. Reprendre le Chapter 6 :
- Regex intent detection (100+ patterns, ~1ms, $0) → LLM classification fallback → switch/case dispatch
- Le LLM ne fait JAMAIS de tool calling — il ne voit jamais les tool schemas
- Comparer en tableau : LLM Tool Calling vs Deterministic Routing (reliability, cost, latency, min model size)
- Punchline : "A 3B model powers the entire app because it only generates text, never selects tools."

**Slide 6 — The Agent Swarm**
17 agents répartis en 4 catégories (reprendre 7.1) :
7 Specialists + 3 Orchestrators + 4 Guardrails + 3 Infrastructure
1-2 exemples concrets : BudgetCoach, EssentialGuardian ("blocks 'stop eating' as budget advice"), GhostObserver ("learns what user rejects").

**Slide 7 — The Chat Pipeline**
Flux complet d'un message chat (reprendre 7.2) :
Message → Intent Detection → Handler Dispatch → Action Extraction → Execution → Evaluation → Opik Logging
Montrer les 5 handlers extraits + 30+ intent types.

**Slides 8-12 — Opik Deep Dive (5 slides — SECTION CLÉ pour Comet)**

**Slide 8 — Tracing Architecture**
Tableau des trace types (chat, voice, swipe, budget, tool.*, etc.)
Span hierarchy diagram : chat.conversation → intent → extraction → evaluation → geval
"Every operation is traced. Every recommendation is auditable."

**Slide 9 — Prompt Versioning & Regression Detection**
8 prompts tracked via SHA256 hashing.
Quand un prompt change, le hash change → filtrable dans le dashboard Opik → corrélation qualité/version.
`registerPrompt('bruno-conversation', SYSTEM_PROMPT) → { version: '6beeab4c' }`

**Slide 10 — Hybrid Evaluation (LLM-as-Judge)**
Le dual-layer system :
- Layer 1 : 5 heuristics (60%, instant, $0) — risk keywords, readability, tone, disclaimers, structure
- Layer 2 : G-Eval (40%, ~500ms, ~$0.0001) — appropriateness, safety, coherence, actionability
10+ feedback scores logged per response.
Screenshot du dashboard Opik si possible.

**Slide 11 — Benchmark Dataset**
28 test cases × 5 categories (valid, subtle violations, aggressive, borderline, intent).
Chaque run = Opik Experiment avec pass/fail per test case.
Trend analysis across prompt versions.

**Slide 12 — Ce qu'on a construit au-delà du SDK**
`opikRest.ts` : 500+ lignes de REST API wrapper pour les features absentes du TypeScript SDK.
Online Evaluation Rules, Annotation Queues, Datasets/Experiments, Metrics API.
Transition vers les recommandations.

**Slide 13 — Recommendations for Opik (SLIDE CLÉ pour Comet)**
Retour constructif avec "Dream APIs" (reprendre Chapter 9) :
1. `safeParseJsonFromLLM()` — parser JSON pour petits modèles (le #1 pain point)
2. Built-in prompt versioning avec corrélation qualité/version dans le dashboard
3. Trace-level cost aggregation automatique
4. TypeScript SDK parity avec l'API REST
5. Sampling configuration (100% errors, 10% random)
Présenter comme "voici ce dont l'écosystème a besoin", pas comme des plaintes.

**Slide 14 — The Battles (storytelling)**
3 war stories en format problème → solution (reprendre Chapters 1-4) :
1. "The Infinite Loop" (SolidJS reactivity → Event Bus → DATA_CHANGED → infinite saves) → Value comparison + source tags
2. "JSON from Hell" (ministral-3b injects markdown inside JSON → G-Eval failed 100%) → Multi-pass sanitizer + ALL control chars
3. "The Global Trace ID" (child trace overwrites parent → evaluation on wrong trace) → Closure-scoped ctx.getTraceId()
Rapide, percutant — montrer que l'observabilité Opik a aidé à débugger.

**Slide 15 — Open Source Contributions**
3 packages publiés :
- `@seed-ship/duckdb-mcp-native` (DuckDB ↔ MCP bridge)
- `@seed-ship/mcp-ui-solid` (SolidJS MCP UI components)
- `deposium_embeddings-turbov2` (embedding inference engine)

**Slide 16 — Future Vision: RAG + MotherDuck (SLIDE CLÉ pour Vercel)**
Split en 2 parties :
1. **RAG déjà live** : 3 vector indices, feedback loop (advice outcomes), BGE-M3 embeddings, graceful degradation
2. **MotherDuck Hybrid** : le diagramme privacy (local DuckDB = finances privées, MotherDuck cloud = trades/karma/community)
   Query hybride : `SELECT ... FROM local.trades JOIN md:stride_community.karma_scores`
   "Data sovereignty by design" — résout aussi le Vercel Wall (pas de filesystem persistent nécessaire côté cloud).

**Slide 17 — Community Evolution**
Les 4 phases (Campus Board → Karma Collateral → Smart Matching via RAG → Full Hybrid).
Karma scoring déjà implémenté : lend (+50), trade (+30), borrow (+20), tiers (Newcomer/Helper/Star).

**Slide 18 — By The Numbers**
Le tableau de l'Appendix A en format visuel :
17 agents, 50+ MCP tools, 30+ intents, 28 benchmark tests, 10+ feedback scores/trace, 5 screens, 3 LLM providers, 3 open source packages, 2500+ lines of Opik integration.

**Slide 19 — Live Demo Plan** (optionnel)
Si démo live prévue, indiquer le parcours :
1. Onboarding chat (profil étudiant en 5 questions)
2. Budget tab (analyse automatique)
3. Chat: "énergie 30%" → détection énergie + comeback
4. Swipe: cards de stratégies
5. Settings: switch provider Mistral → Groq en live
6. Opik dashboard: montrer les traces, scores, spans

**Slide 20 — Closing**
"We didn't build a chatbot. We built an observable, auditable financial advisor that runs on a 3B model."
Call to action : GitHub link, npm packages, demo URL.

### Contraintes de style

- **Pas de bullet-point walls** — max 4 points par slide, préférer des diagrammes et tableaux
- **Chaque slide a un seul message clé** — si tu as besoin de plus, split en 2 slides
- **Code snippets** : max 5-6 lignes, uniquement quand ça illustre un point architectural
- **Couleurs** : dark theme préféré (bleu nuit / violet / accents or/vert pour les highlights)
- **Langue** : slides en **anglais** (public international), speaker notes en **français**
- **Format de sortie** : Markdown structuré avec séparateurs `---` entre slides, incluant :
  - Titre de la slide
  - Contenu principal (bullets, tableau, diagramme en ASCII ou description)
  - Speaker notes en français (3-5 phrases, ce que le présentateur dit)
  - [Visuel suggéré] si pertinent (screenshot, diagramme, animation)

### Points à NE PAS oublier

1. **Pour Comet/Opik** : Insister sur les 2500+ lignes d'intégration, les 10+ feedback scores par trace, le REST wrapper, les recommandations constructives ("Dream APIs"), le benchmark dataset. C'est LEUR sponsor track.
2. **Pour DeepMind** : L'architecture de routage déterministe (50 tools, no tool calling), le hybrid evaluation, le RAG feedback loop — ce sont des choix d'ingénierie IA non triviaux.
3. **Pour Vercel** : Le Vercel Wall, pourquoi DuckDB local → MotherDuck hybrid résout le problème de déploiement serverless. La stack SolidStart (SSR, pas SPA).
4. **Pour Encode Club** : L'impact social (santé financière étudiante), l'open source (3 packages), la complétude du projet (5 écrans, 17 agents, fully functional).
5. **Le fil rouge** : L'observabilité n'est pas un ajout — c'est ce qui a permis de construire et débugger le projet. Sans Opik, on aurait passé 3x plus de temps sur le JSON parsing, le routage des traces, et la régression des prompts.
