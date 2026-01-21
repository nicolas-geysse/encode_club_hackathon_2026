# Onboarding Flow Optimization

## Contexte

L'onboarding actuel collecte les informations dans cet ordre :
1. Région (US/UK/Europe) → Currency
2. Nom
3. Études (niveau, domaine)
4. Skills
5. Certifications
6. Ville
7. Budget (revenus/dépenses)
8. Préférences travail (heures max, taux horaire min)
9. Objectif (quoi, montant, deadline)
10. Événements académiques (exams, vacances)
11. Inventaire (items à vendre)
12. Trade opportunities (emprunts, échanges)
13. Subscriptions (abonnements)

## Problème

**On ne maximise pas le temps disponible pour aller chercher des données contextuelles.**

Actuellement :
- La ville arrive en position 6
- La région (currency) arrive en position 1 mais sans précision géographique
- Aucune géolocalisation proposée
- Pas de scraping/fetch en background pendant que l'utilisateur répond

## Objectif

Réorganiser les questions pour :
1. **Obtenir la localisation précise le plus tôt possible**
2. **Lancer des fetches en background** pendant que l'user continue de répondre
3. **Personnaliser les questions suivantes** avec les données récupérées

---

## Proposition : Nouvel Ordre des Questions

### Phase 1 : Localisation (Questions 1-2)

| # | Question | Données à fetcher en background |
|---|----------|--------------------------------|
| 1 | **Géolocalisation** (optionnelle) | Si acceptée → ville, quartier, pays, currency |
| 2 | **Confirmation ville** ou saisie manuelle | Jobs locaux, coût de la vie, loyers moyens, transports |

**Pourquoi en premier ?**
- La géolocalisation est instantanée si acceptée
- On gagne ~60 secondes de fetch pendant les questions suivantes
- La currency est déduite automatiquement
- On peut personnaliser les exemples ("à Brooklyn, un tuteur gagne $30/h")

### Phase 2 : Identité & Études (Questions 3-5)

| # | Question | Données à fetcher en background |
|---|----------|--------------------------------|
| 3 | **Nom** | - |
| 4 | **Études** (niveau, domaine) | Jobs étudiants pour ce domaine, stages, alternances |
| 5 | **Skills** | Taux horaires locaux pour ces skills, demande locale |

**Pourquoi ici ?**
- Le nom est rapide à répondre, laisse du temps aux fetches précédents
- Les études + skills permettent de cibler les jobs pertinents

### Phase 3 : Certifications & Budget (Questions 6-8)

| # | Question | Données à fetcher en background |
|---|----------|--------------------------------|
| 6 | **Certifications** | Jobs spécifiques (BAFA → animation, PADI → club de plongée) |
| 7 | **Budget** (revenus/dépenses) | Comparaison avec moyenne locale |
| 8 | **Préférences travail** | Matching avec jobs fetché |

### Phase 4 : Objectif & Planning (Questions 9-11)

| # | Question | Données à fetcher en background |
|---|----------|--------------------------------|
| 9 | **Objectif** (quoi, montant, deadline) | Prix moyens (si voyage : vols, hébergement) |
| 10 | **Événements académiques** | Calendrier universitaire local |
| 11 | **Inventaire** (items à vendre) | Prix de revente locaux (eBay, LeBonCoin, Craigslist) |

### Phase 5 : Optimisations (Questions 12-13)

| # | Question | Données à fetcher en background |
|---|----------|--------------------------------|
| 12 | **Trade opportunities** | - |
| 13 | **Subscriptions** | Alternatives moins chères locales |

---

## Géolocalisation : UX Proposé

```
┌─────────────────────────────────────────────────────────┐
│  📍 Can I use your location to personalize suggestions? │
│                                                         │
│  This helps me find:                                    │
│  • Local job opportunities & rates                      │
│  • Cost of living in your area                          │
│  • Relevant services near you                           │
│                                                         │
│  [Allow Location]  [Enter Manually]                     │
└─────────────────────────────────────────────────────────┘
```

**Si accepté :**
1. Obtenir coordonnées GPS
2. Reverse geocoding → ville, quartier, pays
3. Afficher : "📍 I see you're in **Brooklyn, NY**. Is that right?"
4. User confirme ou corrige
5. Lancer les fetches locaux

**Si refusé :**
1. Demander la ville directement
2. Optionnel : demander le quartier ("Which neighborhood? This helps find local gigs")

---

## Données à Fetcher (Future Scraping)

### Par Localisation
| Source | Données | Utilité |
|--------|---------|---------|
| Numbeo / Cost of Living API | Loyer moyen, transport, nourriture | Validation budget |
| Indeed / LinkedIn | Jobs étudiants locaux | Skill Arbitrage |
| Glassdoor / Payscale | Taux horaires par skill | Scoring jobs |
| Google Maps | Services à proximité | Recommendations |

### Par Études/Skills
| Source | Données | Utilité |
|--------|---------|---------|
| Upwork / Fiverr | Taux freelance | Benchmark taux horaire |
| University calendar | Dates exams/vacances | Planning automatique |
| Coursera / LinkedIn Learning | Certifications recommandées | Upselling skills |

### Par Objectif
| Source | Données | Utilité |
|--------|---------|---------|
| Skyscanner / Kayak | Prix vols | Si objectif = voyage |
| Amazon / eBay | Prix revente items | Estimation inventaire |
| Subscription alternatives | Forfaits moins chers | Économies lifestyle |

---

## Architecture Technique

### Frontend : Parallel Fetching

```typescript
// Dès que la ville est confirmée
const locationConfirmed = async (city: string, neighborhood?: string) => {
  // Lancer tous les fetches en parallèle
  const [
    costOfLiving,
    localJobs,
    hourlyRates,
  ] = await Promise.all([
    fetchCostOfLiving(city),
    fetchLocalJobs(city, neighborhood),
    fetchHourlyRates(city),
  ]);

  // Stocker pour personnaliser les questions suivantes
  setBackgroundData({ costOfLiving, localJobs, hourlyRates });
};
```

### Backend : Queue de Scraping

```typescript
// MCP Tool : scrape-local-data
const scrapeLocalData = async (location: Location, skills?: string[]) => {
  const queue = new ScrapingQueue();

  // Priority 1 : Données essentielles
  queue.add('cost-of-living', fetchCostOfLiving(location));
  queue.add('local-jobs', fetchLocalJobs(location));

  // Priority 2 : Personnalisation (si skills connus)
  if (skills) {
    queue.add('skill-rates', fetchSkillRates(location, skills));
  }

  return queue.processAll();
};
```

---

## Métriques de Succès

| Métrique | Actuel | Cible |
|----------|--------|-------|
| Temps onboarding | ~3 min | ~3 min (inchangé) |
| Données contextuelles | 0 | 5+ sources |
| Personnalisation questions | 0% | 50%+ |
| Précision recommendations | Générique | Locale |

---

## Risques & Mitigations

| Risque | Mitigation |
|--------|------------|
| User refuse géolocalisation | Fallback sur saisie manuelle |
| API scraping down | Cache + fallback générique |
| RGPD / Privacy | Données traitées localement, pas stockées côté serveur |
| Latence scraping | Questions "buffer" pendant le fetch |

---

## Prochaines Étapes

1. [ ] Implémenter géolocalisation (browser API)
2. [ ] Réorganiser l'ordre des questions dans `OnboardingChat.tsx`
3. [ ] Créer service de background fetching
4. [ ] Intégrer première API (Numbeo ou équivalent)
5. [ ] Tracer les fetches dans Opik
