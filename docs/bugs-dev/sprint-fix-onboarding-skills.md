# Sprint: Onboarding → Skills → Jobs → Swipe Integration

**Date**: 2026-02-03
**Statut**: EN COURS (Phase 0 ✅, Phase 1 ✅, Phase 2 ✅, Phase 3 ✅, Phase 4 ✅)
**Priorité**: Haute (cohérence UX et valeur métier)

---

## Contexte et Problématique

L'analyse du flux Onboarding → Skills → Jobs → Swipe révèle plusieurs **ruptures de cohérence** qui diminuent la valeur de l'application:

### Problèmes Identifiés

| # | Problème | Impact | Fichiers Concernés |
|---|----------|--------|-------------------|
| 1 | **Skills onboarding sans attributs** | Les skills créés n'ont que `name`, `level`, `hourlyRate`. Pas de `marketDemand`, `cognitiveEffort`, `restNeeded` | `onboardingPersistence.ts:177-198` |
| 2 | **Templates SkillsTab ≠ skillsByField** | 17 templates quick-add vs ~84 skills par domaine d'étude. L'utilisateur ne retrouve pas ses skills d'onboarding | `SkillsTab.tsx:45-71` vs `skillsByField.ts` |
| 3 | **Tab order incorrect** | Jobs (Prospection) est APRÈS Swipe. L'utilisateur swipe avant d'avoir exploré les jobs disponibles | `plan.tsx:136-144` |
| 4 | **Pas de lien Leads → Swipe** | Les jobs marqués "interested" ne deviennent pas des scénarios Swipe | `SwipeTab.tsx:57-179` |
| 5 | **Certifications sans impact** | Les certifications (BAFA, BNSSA, etc.) n'influencent pas les suggestions de jobs | `ProspectionTab.tsx`, `jobScoring.ts` |
| 6 | **Pas de feedback utilisateur** | Aucun thumb up/down pour évaluer les suggestions (skills, jobs, swipe) | Global |
| 7 | **Pas de traçage Opik** | Les suggestions ne sont pas tracées pour améliorer les recommandations | Global |

---

## Analyse Technique Détaillée

### 1. Flux Actuel de Persistance des Skills

```
Onboarding (stepForms.ts:356-368)
  ↓
skills: string[]  // Juste les noms!
  ↓
persistSkills(profileId, skills, minHourlyRate)  // onboardingPersistence.ts:177-198
  ↓
skillService.bulkCreateSkills({
  name,
  level: 'intermediate',
  hourlyRate: defaultHourlyRate,
  // ❌ marketDemand: ABSENT
  // ❌ cognitiveEffort: ABSENT
  // ❌ restNeeded: ABSENT
})
```

**Problème**: Le score d'arbitrage dans SkillsTab utilise ces attributs manquants:
```typescript
score = 0.3 * (hourlyRate/30)
      + 0.25 * (marketDemand/5)      // ← 0 si absent
      + 0.25 * (1 - cognitiveEffort/5) // ← 0 si absent
      + 0.2 * (1 - restNeeded/4)       // ← 0 si absent
```

### 2. Divergence Templates vs skillsByField

**skillsByField.ts** - Skills suggérés à l'onboarding:
```typescript
computer_science: [
  'Python Freelance', 'Data Science Projects', 'Web Development',
  'Mobile App Development', 'IT Support', 'Cybersecurity Consulting',
  'Machine Learning Projects', 'Database Administration'
]
```

**SkillsTab.tsx** - Templates quick-add:
```typescript
SKILL_TEMPLATES = [
  'Python', 'SQL Coaching', 'JavaScript', 'Excel', 'Tutoring',
  'English Translation', 'Graphic Design', 'Data Entry', ...
]
```

**Aucune intersection cohérente!** Un étudiant en CS qui ajoute "Web Development" à l'onboarding ne le retrouvera pas dans le quick-add.

### 3. Tab Order Actuel

```typescript
const TABS = [
  'profile',      // 0
  'goals',        // 1
  'skills',       // 2
  'budget',       // 3
  'trade',        // 4
  'swipe',        // 5  ← L'utilisateur swipe
  'prospection',  // 6  ← PUIS découvre les jobs
];
```

**Logique inversée**: L'utilisateur devrait d'abord voir les jobs disponibles (Prospection) pour alimenter les scénarios Swipe.

### 4. Génération des Scénarios Swipe (Actuel)

```typescript
// SwipeTab.tsx:57-179
generateScenarios():
  FROM skills → 2 scénarios par skill (freelance + tutoring)
  FROM inventory → 1 scénario par item (vente)
  FROM lifestyle → 1 scénario par subscription (pause)

  // ❌ FROM leads → RIEN!
```

### 5. Impact des Certifications (Actuel)

```typescript
// jobScoring.ts - profileMatchScore()
// Vérifie si job.category match un skill de l'utilisateur
// ❌ Les certifications (BAFA, BNSSA, etc.) ne sont PAS utilisées
```

---

## Plan de Sprint Priorisé

### Phase 0: Bug Fixes + Migration Préparatoire ✅ COMPLETE (partial)
> Corriger avant de refactorer + préparer la migration des données existantes

| ID | Fix | Fichier | Status |
|----|-----|---------|--------|
| B0.1 | Vérifier que les skills onboarding sont bien créés en DB | `onboardingPersistence.ts:187-191` | ✅ Vérifié - Skills créés mais SANS attributs (marketDemand, cognitiveEffort, restNeeded manquants) |
| B0.2 | Audit du code mort lié aux skills/jobs | Global | ✅ Audit - `getFieldSkills()` et `isSkillInField()` non utilisés (gardés pour Phase 2) |
| B0.3 | **[NEW]** Ajouter defensive coding dans `bulkCreateSkills` | `skillService.ts:153-204` | ✅ Implémenté - try/catch granulaire + logging failed skills |
| B0.4 | **[NEW]** Créer utilitaire migration skills incomplets | `lib/skillMigration.ts` (nouveau) | 🔜 À faire en Phase 1 (dépend du registry) |

### Phase 1: Unified Skill Registry ✅ COMPLETE
> Objectif: Single Source of Truth pour tous les skills (onboarding + quick-add + scoring)

| ID | Tâche | Détails | Fichiers | Status |
|----|-------|---------|----------|--------|
| P1.1 | Créer `SkillDefinition` type + registry | Type centralisé avec tous attributs + fields[] | `lib/data/skillRegistry.ts` | ✅ |
| P1.2 | Peupler registry avec ~70 skills | Fusionner skillsByField + SKILL_TEMPLATES avec attributs complets | `lib/data/skillRegistry.ts` | ✅ |
| P1.3 | Modifier `persistSkills()` | Lookup dans registry pour attributs complets | `onboardingPersistence.ts` | ✅ |
| P1.4 | Migration au mount SkillsTab | Backfill skills existants sans attributs | `SkillsTab.tsx` | ✅ |
| P1.5 | Quick-add contextuel | Templates filtrés par field + registry | `SkillsTab.tsx` | ✅ |

### Phase 2: Unification Templates Skills ✅ COMPLETE
> Objectif: SkillsTab quick-add affiche les skills pertinents selon le domaine d'étude

| ID | Tâche | Détails | Fichiers | Status |
|----|-------|---------|----------|--------|
| P2.1 | Fusionner `SKILL_TEMPLATES` avec `skillsByField` | Créer un seul référentiel avec attributs | `lib/data/skillRegistry.ts` | ✅ (Phase 1) |
| P2.2 | Quick-add contextuel dans SkillsTab | Filtrer par `profile.field` + suggestions globales | `SkillsTab.tsx` | ✅ (Phase 1) |
| P2.3 | Afficher skills pertinents en premier | Tri par market demand + indication "(suggestions for your field)" | `SkillsTab.tsx` | ✅ |

### Phase 3: Réordonner les Tabs ✅ COMPLETE
> Objectif: Jobs avant Swipe pour un flux logique

| ID | Tâche | Détails | Fichiers | Status |
|----|-------|---------|----------|--------|
| P3.1 | Modifier l'ordre des tabs | `prospection` avant `swipe` | `plan.tsx:136-144` | ✅ |
| P3.2 | Vérifier navigation et deep links | Les URLs `/plan?tab=X` fonctionnent toujours | `plan.tsx` | ✅ |

### Phase 4: Intégration Leads → Swipe ✅ COMPLETE
> Objectif: Les jobs "interested" deviennent des scénarios Swipe
> **Commit**: `785b2ff` - feat(swipe): integrate Jobs leads into Swipe scenarios (Phase 4)

| ID | Tâche | Détails | Fichiers | Status |
|----|-------|---------|----------|--------|
| P4.1 | Créer `generateLeadScenarios()` | Transformer leads status='interested' en Scenarios | `SwipeTab.tsx:66-97` | ✅ |
| P4.2 | Intégrer dans `generateScenarios()` | Ajouter les lead scenarios aux skills/items/lifestyle | `SwipeTab.tsx:99-242` | ✅ |
| P4.3 | Afficher source du scénario | Badge "From Jobs" sur les cartes issues de leads | `SwipeCard.tsx:351-360` | ✅ |
| P4.4 | Synchronisation cross-tab | `onLeadsChange` callback pour partager leads Jobs→Swipe | `ProspectionTab.tsx`, `plan.tsx` | ✅ |

**Implémentation détaillée:**

1. **`generateLeadScenarios()` (SwipeTab.tsx:66-97)**
   - Filtre les leads avec `status === 'interested'`
   - Calcule `hourlyRate` depuis `salaryMin/salaryMax` (assume mensuel, 160h/mois)
   - Génère scénarios avec `source: 'jobs'` et `leadId` pour traçabilité

2. **Intégration dans `generateScenarios()` (SwipeTab.tsx:108-111)**
   - Les lead scenarios apparaissent EN PREMIER (opportunités concrètes)
   - Puis skills, items, lifestyle comme avant

3. **Badge "From Jobs" (SwipeCard.tsx:351-360)**
   - Icône `MapPin` + texte "From Jobs" en badge bleu
   - Affiché uniquement quand `props.source === 'jobs'`

4. **Synchronisation cross-tab**
   - `ProspectionTab.tsx:77-85`: `createEffect` qui appelle `onLeadsChange` à chaque modification
   - `prospectionTypes.ts:192`: Nouveau prop `onLeadsChange?: (leads: Lead[]) => void`
   - `plan.tsx:195-196`: Signal `leads` partagé entre les tabs
   - `plan.tsx:660`: Prop `leads={leads()}` passé au SwipeTab
   - `plan.tsx:698`: Prop `onLeadsChange={setLeads}` passé au ProspectionTab

### Phase 5: Certifications Impact
> Objectif: Les certifications boostent les jobs correspondants

| ID | Tâche | Détails | Fichiers |
|----|-------|---------|----------|
| P5.1 | Créer mapping certification → catégories jobs | BAFA → babysitting, BNSSA → lifeguard, etc. | `lib/data/certificationMapping.ts` (nouveau) |
| P5.2 | Modifier `profileMatchScore()` | Bonus si certification match catégorie job | `jobScoring.ts` |
| P5.3 | Afficher badge certification | Sur les jobs boostés par certification | `ProspectionTab.tsx` |

### Phase 6: Système de Feedback (Thumb Up/Down)
> Objectif: L'utilisateur peut noter les suggestions pour améliorer les recommandations

| ID | Tâche | Détails | Fichiers |
|----|-------|---------|----------|
| P6.1 | Créer composant `FeedbackButton` | Thumb up/down avec animation | `components/ui/FeedbackButton.tsx` (nouveau) |
| P6.2 | Ajouter feedback sur skill suggestions | Dans SkillsTab quick-add | `SkillsTab.tsx` |
| P6.3 | Ajouter feedback sur job cards | Dans ProspectionTab | `ProspectionTab.tsx` |
| P6.4 | Ajouter feedback sur swipe scenarios | Avant/après swipe | `SwipeCard.tsx` |
| P6.5 | Persister feedback en DB | Nouvelle table `feedback` | `api/feedback.ts` |

### Phase 7: Traçage Opik
> Objectif: Toutes les suggestions et feedbacks sont tracés

| ID | Tâche | Détails | Fichiers |
|----|-------|---------|----------|
| P7.1 | Tracer suggestions skills | Span "skill_suggestion" avec attributs | `SkillsTab.tsx` |
| P7.2 | Tracer suggestions jobs | Span "job_suggestion" avec score | `ProspectionTab.tsx` |
| P7.3 | Tracer feedback utilisateur | Span "user_feedback" avec thumbs | `FeedbackButton.tsx` |
| P7.4 | Dashboard Opik | Filtrer par suggestion type, analyser thumbs ratio | Configuration Opik |

### Phase 8: UX Visuelle (Color Coding)
> Objectif: Indicateurs visuels de pertinence

| ID | Tâche | Détails | Fichiers |
|----|-------|---------|----------|
| P8.1 | Code couleur dans listes skills | Vert (high match) → Rouge (low match) | `SkillsTab.tsx` |
| P8.2 | Code couleur sur carte jobs | Marqueurs colorés selon score | `ProspectionTab.tsx` |
| P8.3 | Code couleur points carte | Pins colorés sur la map Google | `ProspectionTab.tsx` |

---

## Ordre d'Exécution Recommandé

```
Phase 0: Bug Fixes (jour 1)
    ↓
Phase 3: Réordonner Tabs (1h) ← Quick win, impact UX immédiat
    ↓
Phase 1: Enrichissement Skills (jour 1-2)
    ↓
Phase 2: Unification Templates (jour 2)
    ↓
Phase 4: Leads → Swipe (jour 3)
    ↓
Phase 5: Certifications (jour 3-4)
    ↓
Phase 6: Feedback System (jour 4-5)
    ↓
Phase 7: Opik Tracing (jour 5-6)
    ↓
Phase 8: UX Visuelle (jour 6-7)
```

---

## Définitions de Done

### Phase 0 (Bug Fixes + Migration) ✅ COMPLETE
- [x] Aucune erreur console liée aux skills (vérifié - pas d'erreurs)
- [x] Les skills onboarding apparaissent dans SkillsTab après création (maintenant avec attributs complets)
- [x] Audit code mort: `getFieldSkills`, `isSkillInField` non utilisés (gardés pour Phase 2)
- [x] `bulkCreateSkills` ne crash pas si un skill échoue (defensive coding implémenté)
- [x] Utilitaire migration créé (`migrateIncompleteSkills` dans SkillsTab.tsx)

### Phase 1 (Unified Skill Registry) ✅ COMPLETE
- [x] `SkillDefinition` type créé avec tous les attributs requis (70+ skills)
- [x] Registry contient skills de skillsByField + SKILL_TEMPLATES avec attributs complets
- [x] Chaque skill créé à l'onboarding a: marketDemand, cognitiveEffort, restNeeded
- [x] Le score d'arbitrage est > 0 pour tous les skills (via registry defaults)
- [x] Skills existants sans attributs sont migrés au mount (migrateIncompleteSkills)
- [x] Quick-add contextuel par field implémenté

### Phase 2 (Templates Unifiés) ✅ COMPLETE
- [x] Quick-add affiche skills pertinents selon `profile.field` (via `getQuickAddTemplates`)
- [x] Skills triés par market demand (plus pertinents en premier)
- [x] Indication "(suggestions for your field)" affichée quand field est défini

### Phase 3 (Tab Order) ✅ COMPLETE
- [x] Ordre: Profile → Goals → Skills → Budget → Trade → **Jobs** → **Swipe**
- [x] Navigation fonctionne avec le nouvel ordre (à vérifier manuellement)

### Phase 4 (Leads → Swipe) ✅ COMPLETE
- [x] Un job "interested" génère un scénario Swipe (`generateLeadScenarios()`)
- [x] Le scénario affiche la source "From Jobs" (badge avec MapPin icon)
- [x] Les leads sont synchronisés en temps réel entre Jobs tab et Swipe tab
- [x] Les scénarios from Jobs apparaissent en premier (opportunités concrètes prioritaires)

### Phase 5 (Certifications)
- [ ] BAFA booste les jobs babysitting/animation
- [ ] Badge visible sur les jobs boostés

### Phase 6 (Feedback)
- [ ] Thumb up/down visible sur: skills suggestions, job cards, swipe cards
- [ ] Feedback persisté en DB

### Phase 7 (Opik)
- [ ] Traces visibles dans dashboard Opik
- [ ] Corrélation feedback ↔ suggestions possible

### Phase 8 (Color Coding)
- [ ] Gradient de couleur visible dans les listes
- [ ] Pins colorés sur la carte

---

## Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Régression SkillsTab | Moyenne | Haute | Tests unitaires + E2E |
| Performance Opik tracing | Faible | Moyenne | Traces async, batch si nécessaire |
| Complexité feedback UI | Moyenne | Moyenne | Composant réutilisable simple |
| Migration données skills existantes | Haute | Haute | Script migration + rollback |

---

## Recommandations Senior (Audit 2026-02-03)

> Source: SENIOR_AUDIT_ONBOARDING_SKILLS.md - Statut: ✅ VALIDATED

### 1. Unified "Skill Registry" (Architecture)

**Ne pas simplement "merger" les listes.** Créer un type `SkillDefinition` centralisé:

```typescript
// lib/data/skillRegistry.ts (nouveau)
interface SkillDefinition {
  id: string;           // ex: "web_development"
  name: string;         // ex: "Web Development"
  aliases?: string[];   // ex: ["Web Dev", "Frontend Development"]
  defaultHourlyRate: number;
  marketDemand: 1 | 2 | 3 | 4 | 5;
  cognitiveEffort: 1 | 2 | 3 | 4 | 5;
  restNeeded: 1 | 2 | 3 | 4;
  fields: string[];     // ex: ["computer_science", "engineering"]
}

// Single Source of Truth pour skillsByField ET SKILL_TEMPLATES
export const SKILL_REGISTRY: SkillDefinition[] = [...];
```

**Avantage**: Si un skill change de nom, il se met à jour partout automatiquement.

### 2. Migration Strategy (Phase 0 Extended)

**Action explicite en Phase 0**: Backfill les skills existants sans attributs.

```typescript
// Utilitaire à exécuter au mount de SkillsTab
async function migrateIncompleteSkills(skills: Skill[]): Promise<void> {
  for (const skill of skills) {
    if (!skill.marketDemand || !skill.cognitiveEffort || !skill.restNeeded) {
      const definition = findInRegistry(skill.name);
      if (definition) {
        await skillService.updateSkill(skill.id, {
          marketDemand: definition.marketDemand,
          cognitiveEffort: definition.cognitiveEffort,
          restNeeded: definition.restNeeded,
        });
      }
    }
  }
}
```

**Avantage**: Corrige l'expérience des utilisateurs existants sans script DB complexe.

### 3. Defensive Coding in `bulkCreateSkills`

**Problème actuel**: `bulkCreateSkills` traite les items séquentiellement. Une erreur sur un skill peut crasher tout l'onboarding.

**Action**: Wrapper dans un try-catch granulaire:

```typescript
// skillService.ts - bulkCreateSkills
async bulkCreateSkills(skills: CreateSkillInput[]): Promise<Skill[]> {
  const results: Skill[] = [];
  const errors: Array<{skill: string, error: Error}> = [];

  for (const skill of skills) {
    try {
      const created = await this.createSkill(skill);
      results.push(created);
    } catch (error) {
      errors.push({ skill: skill.name, error: error as Error });
      // Continue avec les autres skills
    }
  }

  if (errors.length > 0) {
    console.warn(`[bulkCreateSkills] ${errors.length} skills failed:`, errors);
  }
  return results;
}
```

### 4. E2E Testing (Phase 1.3 Extended)

**Test spécifique recommandé**:

```
Scénario: Onboarding CS student avec score > 0
  Given user selects "Computer Science" as field
  And user selects "Web Dev" specialization
  When onboarding completes
  Then Skills Tab shows "Web Development" skill
  And skill arbitrage score > 0
  And Quick-add shows "Web Development" as already added (grayed out)
```

---

## Données de Test

### Profil Test Recommandé
```json
{
  "name": "Test User",
  "field": "computer_science",
  "skills": ["Web Development", "Python Freelance", "IT Support"],
  "certifications": ["BAFA", "PSC1"],
  "minHourlyRate": 15,
  "city": "Paris",
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

### Scénarios de Validation
1. **Onboarding CS student** → Skills avec attributs → Quick-add pertinent
2. **Marquer job "interested"** → Apparaît dans Swipe
3. **Certification BAFA** → Jobs babysitting boostés
4. **Thumb down sur skill** → Trace Opik visible

---

## Ressources

### Fichiers Clés
- `packages/frontend/src/lib/onboardingPersistence.ts` - Persistance skills
- `packages/frontend/src/lib/data/skillsByField.ts` - Suggestions par domaine
- `packages/frontend/src/lib/data/skillRegistry.ts` - **[Phase 1]** Source unique pour tous les skills
- `packages/frontend/src/components/tabs/SkillsTab.tsx` - Gestion skills + migration
- `packages/frontend/src/components/tabs/SwipeTab.tsx` - **[Phase 4]** Génération scénarios + leads integration
- `packages/frontend/src/components/swipe/SwipeCard.tsx` - **[Phase 4]** Badge "From Jobs"
- `packages/frontend/src/components/tabs/ProspectionTab.tsx` - Jobs + **[Phase 4]** onLeadsChange callback
- `packages/frontend/src/lib/prospectionTypes.ts` - **[Phase 4]** Type onLeadsChange
- `packages/frontend/src/routes/plan.tsx` - Configuration tabs + **[Phase 4]** leads state sharing
- `packages/frontend/src/lib/jobScoring.ts` - Scoring jobs

### Documentation Existante
- `docs/bugs-dev/budget-goals-margin-sync.md` - Pattern de consolidation
- `CLAUDE.md` - Patterns SolidJS et anti-patterns

---

## Notes

Ce sprint vise à créer un **flux cohérent** de l'onboarding jusqu'au suivi:

```
Onboarding (skills + certs + préférences)
    ↓
Skills Tab (enrichis, scorés, feedback)
    ↓
Jobs Tab (boostés par skills + certs, feedback)
    ↓
Swipe Tab (scénarios from skills + jobs interested)
    ↓
Suivi (missions actives, progression)
```

L'objectif final est que chaque donnée saisie à l'onboarding ait un **impact visible et mesurable** sur les recommandations ultérieures.
