# Plan d'Action : Find Jobs & Prospection (MCP + Mastra)

> **Objectif** : Créer un système de prospection proactive d'emplois étudiants qui allie la **rapidité** (catégories statiques) et l'**intelligence** (enrichissement Mastra), avec une UX de swipe "Tinder-like" pour la découverte.

## Stack Technique

| Composant | Technologie | Usage |
|-----------|-------------|-------|
| **Orchestration** | Mastra Workflows | Pipeline Search → Parse → Enrich → Format |
| **Tools** | MCP Tools (Zod schemas) | `google_maps_places`, `google_maps_distance`, `groq_web_search` |
| **LLM** | Groq (llama-3.1-70b) | Parsing résultats web, génération cards |
| **Database** | DuckDB | Table `leads` pour pistes sauvegardées |
| **Tracing** | Opik | Feedback loop sur préférences utilisateur |
| **Maps Display** | Leaflet + OSM | Affichage carte (existant) |
| **Maps Data** | Google Maps API | Places + Distance Matrix (enrichissement) |

## 1. Vision Globale (Architecture)

Nous combinons deux approches : un "Fast Path" pour l'UI instantanée et un "Smart Path" pour l'intelligence.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROSPECTION ARCHITECTURE                      │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Profile  │───▶│ Job Finder   │───▶│ Geo Enricher        │   │
│  │ + Context│    │ Workflow     │    │ (Google Maps Tool)  │   │
│  │          │    │ (Groq Tool)  │    │ - Places API        │   │
│  └──────────┘    └──────────────┘    │ - Distance Matrix   │   │
│                          │            └──────────────────────┘   │
│                          ▼                      │                │
│                  ┌──────────────────────────────────────┐       │
│                  │        PROSPECTION TAB (Frontend)    │       │
│                  │  ┌────────────────────────────────┐  │       │
│                  │  │ Swipe Cards (Découverte)       │  │       │
│                  │  │ - "Tinder" des jobs            │  │       │
│                  │  │ - Feedback Loop (J'aime/Pas)   │  │       │
│                  │  └────────────────────────────────┘  │       │
│                  │                                      │       │
│                  │  ┌────────────────────────────────┐  │       │
│                  │  │ Map avec POI (Visualisation)   │  │       │
│                  │  │ - Leads sauvegardés            │  │       │
│                  │  │ - Lieux de révision / Events   │  │       │
│                  │  └────────────────────────────────┘  │       │
│                  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. User Journey & Hybrid Data Flow

Ce diagramme détaille comment les données circulent de la sélection d'une catégorie jusqu'à la carte.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. DÉCOUVERTE
   User ouvre Prospection Tab
         │
         ▼
   ┌─────────────────┐
   │ Affiche les     │
   │ catégories      │◄──── PROSPECTION_CATEGORIES (Frontend Config / Fast)
   │ (accordion)     │
   └────────┬────────┘
            │ Click sur "Service"
            ▼
2. EXPLORATION (Mastra Workflow Backend)
   ┌─────────────────────────────────────────┐
   │         Job Prospector Workflow         │
   │                                         │
   │  searchJobsOnline() ──► Groq Web Search │
   │         │                               │
   │         ▼                               │
   │  enrichWithLocation() ──► Google Maps   │
   │         │                     │         │
   │         │                     ▼         │
   │         │              Places API       │
   │         │              Distance Matrix  │
   │         ▼                               │
   │  generateProspectionCards()             │
   └────────────────┬────────────────────────┘
                    │
                    ▼
3. SWIPE (Prospection Frontend)
   ┌─────────────────────────────────────────┐
   │      ProspectionSwipeDeck               │
   │                                         │
   │  Card: "Serveur au Café de Flore"       │
   │  📍 800m (10 min à pied)                │
   │  💰 11€/h + pourboires                  │
   │  ⏰ Soirs et weekends                   │
   │                                         │
   │  ◄── NOPE    YES! ──►                   │
   │      ▲ APPLY NOW ▲                      │
   │      ▼ SAVE LATER ▼                     │
   └────────────────┬────────────────────────┘
                    │ Swipe Right (interested)
                    ▼
4. SAUVEGARDE & FEEDBACK (DuckDB + Opik)
   ┌─────────────────────────────────────────┐
   │  leads table (DuckDB)                   │
   │  - id, job_title, company               │
   │  - salary_structure, commute_time       │
   │  - status: 'interested'                 │
   └────────────────┬────────────────────────┘
                    │+ Opik Trace: "User likes Restaurant jobs"
                    ▼
5. VISUALISATION
   ┌─────────────────────────────────────────┐
   │       ProspectionMap                    │
   │   🏠 User location                      │
   │   🍽️ ──── 800m ──── Café de Flore      │
   └─────────────────────────────────────────┘
```

---

## 3. Configuration & Intégration

### 3.1 Frontend : Configuration Statique des Catégories

Fichier : `frontend/src/config/prospectionCategories.ts`

```typescript
export interface ProspectionCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  examples: string[];
  queryTemplate: string;
  googlePlaceTypes?: string[];  // Pour Google Places API
  platforms?: string[];         // Plateformes spécialisées
  questions: string[];          // Questions pour qualifier l'intérêt
  avgHourlyRate: { min: number; max: number };
  effortLevel: 1 | 2 | 3 | 4 | 5;
}

export const PROSPECTION_CATEGORIES: Record<string, ProspectionCategory> = {
  service: {
    id: 'service',
    label: 'Service & Restauration',
    icon: '🍽️',
    description: 'Travail en salle, bar, livraison',
    examples: ['Serveur', 'Barman', 'Équipier fast-food', 'Livreur Uber Eats'],
    queryTemplate: 'offre emploi étudiant serveur barman ${city} 2026',
    googlePlaceTypes: ['restaurant', 'cafe', 'bar', 'meal_takeaway'],
    platforms: ['Indeed', 'StudentJob', 'JobEtudiant'],
    questions: ['Tu aimes le contact client ?', 'OK pour horaires décalés (soirs/weekends) ?'],
    avgHourlyRate: { min: 11, max: 14 },
    effortLevel: 3,
  },

  retail: {
    id: 'retail',
    label: 'Commerce & Vente',
    icon: '🛍️',
    description: 'Vente, caisse, inventaire',
    examples: ['Vendeur', 'Caissier', 'Inventoriste', 'Hôte d\'accueil'],
    queryTemplate: 'offre emploi étudiant vendeur caissier ${city} 2026',
    googlePlaceTypes: ['store', 'shopping_mall', 'supermarket', 'clothing_store'],
    platforms: ['Indeed', 'Retail Jobs', 'StudentPop'],
    questions: ['Tu es à l\'aise pour conseiller ?', 'Debout longtemps OK ?'],
    avgHourlyRate: { min: 11, max: 13 },
    effortLevel: 2,
  },

  cleaning: {
    id: 'cleaning',
    label: 'Ménage & Entretien',
    icon: '🧹',
    description: 'Nettoyage, aide ménagère',
    examples: ['Agent d\'entretien', 'Aide ménagère', 'Nettoyage Airbnb'],
    queryTemplate: 'offre emploi ménage entretien étudiant ${city} 2026',
    googlePlaceTypes: ['lodging', 'gym', 'school'],
    platforms: ['Wecasa', 'Yoopies', 'O2'],
    questions: ['Tu préfères travailler seul ?', 'Horaires tôt le matin OK ?'],
    avgHourlyRate: { min: 12, max: 15 },
    effortLevel: 3,
  },

  handyman: {
    id: 'handyman',
    label: 'Bricolage & Petits travaux',
    icon: '🔧',
    description: 'Montage, déménagement, jardinage',
    examples: ['Montage meubles IKEA', 'Aide déménagement', 'Jardinage', 'Peinture'],
    queryTemplate: 'bricoleur petits travaux particuliers ${city}',
    platforms: ['TaskRabbit', 'Yoojo', 'AlloVoisins', 'Leboncoin Services'],
    questions: ['Tu es bricoleur ?', 'Tu as une voiture/permis ?', 'Tu as des outils ?'],
    avgHourlyRate: { min: 15, max: 25 },
    effortLevel: 4,
  },

  childcare: {
    id: 'childcare',
    label: 'Garde d\'enfants',
    icon: '👶',
    description: 'Baby-sitting, sortie d\'école',
    examples: ['Baby-sitting soir', 'Sortie d\'école', 'Garde mercredi', 'Aide aux devoirs'],
    queryTemplate: 'baby sitting garde enfants étudiant ${city} 2026',
    platforms: ['Yoopies', 'Babysits', 'Nounou-top', 'Kinougarde'],
    questions: ['Tu aimes les enfants ?', 'Tu as des références ?', 'BAFA ?'],
    avgHourlyRate: { min: 10, max: 15 },
    effortLevel: 2,
  },

  tutoring: {
    id: 'tutoring',
    label: 'Cours particuliers',
    icon: '📚',
    description: 'Soutien scolaire, langues, musique',
    examples: ['Maths/Physique', 'Langues', 'Musique', 'Code/Programmation'],
    queryTemplate: 'cours particuliers professeur étudiant ${city} 2026',
    platforms: ['Superprof', 'Kelprof', 'Acadomia', 'Complétude'],
    questions: ['Quelle matière maîtrises-tu ?', 'Tu es pédagogue et patient ?'],
    avgHourlyRate: { min: 15, max: 30 },
    effortLevel: 3,
  },

  events: {
    id: 'events',
    label: 'Événementiel',
    icon: '🎉',
    description: 'Hôtesse, animation, montage',
    examples: ['Hôte/Hôtesse', 'Distribution flyers', 'Animation', 'Montage/démontage'],
    queryTemplate: 'job étudiant événementiel hôtesse animation ${city} 2026',
    platforms: ['StudentPop', 'StaffMe', 'Side', 'Etudiemploi'],
    questions: ['Disponible weekends/soirées ?', 'Bonne présentation ?', 'Souriant ?'],
    avgHourlyRate: { min: 11, max: 18 },
    effortLevel: 2,
  },

  interim: {
    id: 'interim',
    label: 'Intérim & Agences',
    icon: '🏭',
    description: 'Missions courtes, logistique',
    examples: ['Manutention', 'Préparation commandes', 'Usine', 'Tri postal'],
    queryTemplate: 'agence interim étudiant missions ${city}',
    platforms: ['Manpower', 'Adecco', 'Randstad', 'Synergie', 'CRIT'],
    questions: ['OK pour missions courtes (1-5 jours) ?', 'Flexibilité horaires ?', 'Physique OK ?'],
    avgHourlyRate: { min: 11, max: 14 },
    effortLevel: 4,
  },

  digital: {
    id: 'digital',
    label: 'Freelance Digital',
    icon: '💻',
    description: 'Rédaction, design, dev, CM',
    examples: ['Rédaction web', 'Design graphique', 'Dev web', 'Community Management'],
    queryTemplate: 'freelance étudiant rédaction design développeur ${city}',
    platforms: ['Malt', 'Fiverr', 'Upwork', 'ComeUp', '5euros'],
    questions: ['Tu as un portfolio ?', 'Tu peux travailler à distance ?', 'Quel outil maîtrises-tu ?'],
    avgHourlyRate: { min: 15, max: 40 },
    effortLevel: 3,
  },

  campus: {
    id: 'campus',
    label: 'Jobs sur Campus',
    icon: '🎓',
    description: 'BU, tutorat, accueil',
    examples: ['Moniteur BU', 'Tuteur universitaire', 'Accueil étudiants', 'Événements BDE'],
    queryTemplate: 'job étudiant campus université CROUS ${city}',
    platforms: ['CROUS', 'Service emploi université', 'BDE', 'Jobaviz'],
    questions: ['Tu connais les services de ton campus ?', 'Tu veux rester sur place ?'],
    avgHourlyRate: { min: 10, max: 12 },
    effortLevel: 1,
  },
};
```

### 3.2 Backend : MCP Tools (Zod Schemas)

Fichier : `mcp-server/src/tools/google-maps.ts`

```typescript
import { z } from 'zod';
import { createTool } from '@mastra/core';

// Schema pour les coordonnées
const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Tool: Recherche de lieux à proximité
export const findNearbyPlaces = createTool({
  id: 'google_maps_places',
  description: 'Find places near a location using Google Places API',
  inputSchema: z.object({
    location: CoordinatesSchema.describe('User location'),
    type: z.enum([
      'restaurant', 'cafe', 'bar', 'store', 'supermarket',
      'library', 'university', 'gym', 'lodging'
    ]).describe('Google Place type'),
    radius: z.number().min(100).max(50000).default(5000).describe('Search radius in meters'),
    keyword: z.string().optional().describe('Additional keyword filter'),
  }),
  outputSchema: z.object({
    places: z.array(z.object({
      placeId: z.string(),
      name: z.string(),
      address: z.string(),
      location: CoordinatesSchema,
      rating: z.number().optional(),
      priceLevel: z.number().optional(),
      openNow: z.boolean().optional(),
      types: z.array(z.string()),
    })),
  }),
  execute: async ({ context }) => {
    const { location, type, radius, keyword } = context;
    const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${location.lat},${location.lng}`);
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('type', type);
    url.searchParams.set('key', API_KEY!);
    if (keyword) url.searchParams.set('keyword', keyword);

    const res = await fetch(url.toString());
    const data = await res.json();

    return {
      places: data.results.map((p: any) => ({
        placeId: p.place_id,
        name: p.name,
        address: p.vicinity,
        location: { lat: p.geometry.location.lat, lng: p.geometry.location.lng },
        rating: p.rating,
        priceLevel: p.price_level,
        openNow: p.opening_hours?.open_now,
        types: p.types,
      })),
    };
  },
});

// Tool: Calcul distance et temps de trajet
export const getDistanceMatrix = createTool({
  id: 'google_maps_distance',
  description: 'Calculate travel time and distance between locations',
  inputSchema: z.object({
    origin: CoordinatesSchema.describe('Starting point'),
    destinations: z.array(CoordinatesSchema).max(25).describe('Destination points (max 25)'),
    mode: z.enum(['walking', 'bicycling', 'transit', 'driving']).default('transit'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      destination: CoordinatesSchema,
      distanceMeters: z.number(),
      distanceText: z.string(),
      durationSeconds: z.number(),
      durationText: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { origin, destinations, mode } = context;
    const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

    const destString = destinations.map(d => `${d.lat},${d.lng}`).join('|');
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', destString);
    url.searchParams.set('mode', mode);
    url.searchParams.set('key', API_KEY!);

    const res = await fetch(url.toString());
    const data = await res.json();

    return {
      results: data.rows[0].elements.map((el: any, i: number) => ({
        destination: destinations[i],
        distanceMeters: el.distance?.value || 0,
        distanceText: el.distance?.text || 'N/A',
        durationSeconds: el.duration?.value || 0,
        durationText: el.duration?.text || 'N/A',
      })),
    };
  },
});
```

Fichier : `mcp-server/src/tools/groq-search.ts`

```typescript
import { z } from 'zod';
import { createTool } from '@mastra/core';
import Groq from 'groq-sdk';

// Tool: Recherche web via Groq
export const groqWebSearch = createTool({
  id: 'groq_web_search',
  description: 'Search the web for job offers using Groq LLM with web search capability',
  inputSchema: z.object({
    query: z.string().describe('Search query for job offers'),
    city: z.string().describe('City for location-based search'),
    maxResults: z.number().min(1).max(10).default(5),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      company: z.string().optional(),
      location: z.string().optional(),
      salary: z.string().optional(),
      url: z.string().optional(),
      snippet: z.string(),
      source: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { query, city, maxResults } = context;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant de recherche d'emploi. Recherche des offres d'emploi et retourne les résultats en JSON.
Format: { "results": [{ "title", "company", "location", "salary", "url", "snippet", "source" }] }`,
        },
        {
          role: 'user',
          content: `Recherche: "${query}" à ${city}. Trouve ${maxResults} offres récentes.`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the web for information',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        },
      ],
      tool_choice: 'auto',
    });

    // Parse LLM response to extract structured job data
    const content = completion.choices[0]?.message?.content || '{"results":[]}';
    return JSON.parse(content);
  },
});
```

### 3.3 Backend : Mastra Workflow

Fichier : `mcp-server/src/workflows/job-prospection.ts`

```typescript
import { Workflow, Step } from '@mastra/core';
import { findNearbyPlaces, getDistanceMatrix } from '../tools/google-maps';
import { groqWebSearch } from '../tools/groq-search';
import { PROSPECTION_CATEGORIES } from '../config/categories';

interface ProspectionInput {
  profileId: string;
  categoryId: string;
  userLocation: { lat: number; lng: number };
  city: string;
}

export const jobProspectionWorkflow = new Workflow({
  name: 'job-prospection',
  triggerSchema: z.object({
    profileId: z.string(),
    categoryId: z.string(),
    userLocation: z.object({ lat: z.number(), lng: z.number() }),
    city: z.string(),
  }),
})
  // Step 1: Search - Requête web avec template
  .step(new Step({
    id: 'search-jobs',
    execute: async ({ context }) => {
      const category = PROSPECTION_CATEGORIES[context.categoryId];
      const query = category.queryTemplate.replace('${city}', context.city);

      const searchResults = await groqWebSearch.execute({
        context: { query, city: context.city, maxResults: 8 },
      });

      return { jobs: searchResults.results, category };
    },
  }))

  // Step 2: Enrich with Places - Trouver les entreprises à proximité
  .step(new Step({
    id: 'find-nearby-businesses',
    execute: async ({ context }) => {
      const { category, userLocation } = context;

      if (!category.googlePlaceTypes?.length) {
        return { nearbyPlaces: [] };
      }

      // Recherche pour chaque type de lieu
      const allPlaces = await Promise.all(
        category.googlePlaceTypes.map(type =>
          findNearbyPlaces.execute({
            context: { location: userLocation, type, radius: 5000 },
          })
        )
      );

      return { nearbyPlaces: allPlaces.flatMap(r => r.places) };
    },
  }))

  // Step 3: Enrich with Distance - Calculer temps de trajet
  .step(new Step({
    id: 'calculate-commute',
    execute: async ({ context }) => {
      const { nearbyPlaces, userLocation } = context;

      if (!nearbyPlaces.length) return { enrichedPlaces: [] };

      const distances = await getDistanceMatrix.execute({
        context: {
          origin: userLocation,
          destinations: nearbyPlaces.slice(0, 25).map(p => p.location),
          mode: 'transit',
        },
      });

      return {
        enrichedPlaces: nearbyPlaces.slice(0, 25).map((place, i) => ({
          ...place,
          commuteTime: distances.results[i].durationText,
          commuteMinutes: Math.round(distances.results[i].durationSeconds / 60),
          distance: distances.results[i].distanceText,
        })),
      };
    },
  }))

  // Step 4: Format - Générer les ProspectionCards
  .step(new Step({
    id: 'format-cards',
    execute: async ({ context }) => {
      const { jobs, enrichedPlaces, category } = context;

      // Combiner jobs web + places locaux en cards
      const cards: ProspectionCard[] = [
        // Cards from web search
        ...jobs.map((job, i) => ({
          id: `web-${i}`,
          type: 'job-offer' as const,
          title: job.title,
          company: job.company,
          location: job.location || context.city,
          salaryText: job.salary,
          avgHourlyRate: category.avgHourlyRate,
          effortLevel: category.effortLevel,
          source: job.source,
          url: job.url,
          snippet: job.snippet,
          categoryId: category.id,
        })),
        // Cards from nearby places
        ...enrichedPlaces.map((place, i) => ({
          id: `place-${place.placeId}`,
          type: 'nearby-business' as const,
          title: `${category.examples[0]} @ ${place.name}`,
          company: place.name,
          location: place.address,
          lat: place.location.lat,
          lng: place.location.lng,
          commuteTime: place.commuteTime,
          commuteMinutes: place.commuteMinutes,
          distance: place.distance,
          avgHourlyRate: category.avgHourlyRate,
          effortLevel: category.effortLevel,
          source: 'Google Maps',
          categoryId: category.id,
          rating: place.rating,
        })),
      ];

      return { cards };
    },
  }));
```

### 3.4 Interface ProspectionCard

```typescript
// frontend/src/lib/prospectionTypes.ts
export interface ProspectionCard {
  id: string;
  type: 'job-offer' | 'nearby-business';
  title: string;
  company?: string;
  location: string;
  lat?: number;
  lng?: number;
  commuteTime?: string;
  commuteMinutes?: number;
  distance?: string;
  salaryText?: string;
  avgHourlyRate: { min: number; max: number };
  effortLevel: 1 | 2 | 3 | 4 | 5;
  source: string;
  url?: string;
  snippet?: string;
  categoryId: string;
  rating?: number;
}

export interface Lead extends ProspectionCard {
  profileId: string;
  status: 'interested' | 'applied' | 'rejected' | 'archived';
  notes?: string;
  createdAt: string;
}
```

### 3.5 API Endpoints (Server Functions)

Fichier : `frontend/src/routes/api/prospection.ts`

```typescript
import { APIEvent, json } from '@solidjs/start/server';
import { getDb } from './_db';

export async function POST(event: APIEvent) {
  const body = await event.request.json();
  const { action, ...params } = body;

  switch (action) {
    case 'search': {
      // Déclenche le workflow Mastra
      const { categoryId, profileId, userLocation, city } = params;
      const result = await jobProspectionWorkflow.execute({
        profileId,
        categoryId,
        userLocation,
        city,
      });
      return json({ cards: result.cards });
    }

    case 'save_lead': {
      const { lead } = params;
      const db = getDb();
      await db.run(`
        INSERT INTO leads (id, profile_id, category, title, company, location_raw, lat, lng,
                          commute_time_mins, salary_structure, url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'interested')
      `, [
        lead.id, lead.profileId, lead.categoryId, lead.title, lead.company,
        lead.location, lead.lat, lead.lng, lead.commuteMinutes,
        JSON.stringify({ min: lead.avgHourlyRate.min, max: lead.avgHourlyRate.max }),
        lead.url
      ]);
      return json({ success: true });
    }

    case 'get_leads': {
      const { profileId } = params;
      const db = getDb();
      const leads = await db.all('SELECT * FROM leads WHERE profile_id = ?', [profileId]);
      return json({ leads });
    }

    case 'update_lead_status': {
      const { leadId, status } = params;
      const db = getDb();
      await db.run('UPDATE leads SET status = ? WHERE id = ?', [status, leadId]);
      return json({ success: true });
    }
  }
}
```

### 3.6 Intégration avec Agents Existants

Le workflow s'intègre avec les agents Mastra existants :

```typescript
// Dans mcp-server/src/agents/job-matcher.ts
// Le job-matcher existant peut utiliser les leads sauvegardés

import { jobProspectionWorkflow } from '../workflows/job-prospection';

// Enrichir le scoring skill-arbitrage avec les données de prospection
export async function getEnrichedJobSuggestions(profile: Profile) {
  // 1. Skill-based suggestions (existant)
  const skillBasedJobs = await skillArbitrageCalculation(profile);

  // 2. Si l'utilisateur a des leads sauvegardés, les prioriser
  const savedLeads = await getLeadsByProfile(profile.id);
  const interestedLeads = savedLeads.filter(l => l.status === 'interested');

  // 3. Merger et scorer
  return mergeAndScoreJobs(skillBasedJobs, interestedLeads, profile);
}
```

### 3.7 Base de Données (DuckDB)

Schema de la table `leads` :
```sql
CREATE TABLE leads (
    id VARCHAR PRIMARY KEY,
    profile_id VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    company VARCHAR,
    location_raw VARCHAR,
    lat DOUBLE, lng DOUBLE,
    commute_time_mins INTEGER,
    salary_structure JSON,
    url VARCHAR,
    status VARCHAR DEFAULT 'interested',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Cas d'Usage "Facilitateurs" (Extensions)

### 4.1 "Study Spots" (Où réviser ?)
*   **Trigger** : Bouton dans la Map.
*   **Logic** : Appel direct `find_nearby_places(type='library')`.
*   **Affichage** : Pins immédiats sur la carte.

### 4.2 "Event Scout" (Networking)
*   **Trigger** : Bouton dans Skills.
*   **Logic** : Workflow Mastra "Events" (Search "hackathon" + Enrich Date/Lieu).

---

## 5. Plan d'Implémentation Détaillé

### Phase 1 : Fondations Backend (P1)
**Fichiers** : `mcp-server/src/tools/*`, `.env`
1.  Activer Google Maps API (Places, Distance) et récupérer la clé.
2.  Créer `tools/google-maps.ts` : Implémenter `find_nearby_places` et `get_distance_matrix`.
3.  Créer `tools/search.ts` : Implémenter le wrapper Groq Web Search.

### Phase 2 : Workflow Intelligence (P1)
**Fichiers** : `mcp-server/src/workflows/*`, `mcp-server/src/services/duckdb.ts`
1.  Créer la table `leads` dans DuckDB.
2.  Implémenter le workflow `job-prospection.ts` :
    - Step 1: Search (via Query Template).
    - Step 2: Parse (LLM).
    - Step 3: Enrich (Maps).
3.  Exposer ce workflow comme outil `find_prospection_jobs`.

### Phase 3 : Interface Utilisateur (P2)
**Fichiers** : `frontend/src/components/tabs/ProspectionTab.tsx`
1.  Créer `ProspectionTab` avec la liste des catégories (`PROSPECTION_CATEGORIES`).
2.  Intégrer le composant `SwipeSession` existant.
3.  Connecter le backend :
    - Sélection Catégorie -> Appel `find_prospection_jobs`.
    - Swipe Right -> Appel `save_lead`.

### Phase 4 : Carte & Visualisation (P2)
**Fichiers** : `frontend/src/components/tabs/ProspectionMap.tsx`
1.  Créer une vue Map qui affiche les `leads` de la base DuckDB.
2.  Ajouter le mode "Facilitateur" : toggle pour afficher les "Study Spots" (appel direct Google tools).

### Phase 5 : Feedback Loop & Opik Tracing (P3)

**Fichiers** : `mcp-server/src/services/opik.ts`, `frontend/src/lib/swipePreferences.ts`

1.  **Tracer chaque interaction de prospection** :

```typescript
// Dans le workflow job-prospection.ts
import { trace } from '../services/opik';

// Wrap le workflow avec tracing
export const tracedJobProspection = trace(
  'prospection_session',
  jobProspectionWorkflow,
  {
    attributes: (input) => ({
      category_id: input.categoryId,
      user_city: input.city,
      profile_id: input.profileId,
    }),
  }
);

// Tracer les swipes individuels
export async function trackProspectionSwipe(
  profileId: string,
  card: ProspectionCard,
  direction: 'left' | 'right' | 'up' | 'down'
) {
  await trace('prospection_swipe', async () => {
    return {
      profile_id: profileId,
      card_id: card.id,
      card_type: card.type,
      category: card.categoryId,
      company: card.company,
      commute_minutes: card.commuteMinutes,
      direction,
      outcome: direction === 'right' ? 'interested' : direction === 'up' ? 'apply' : 'rejected',
    };
  })();
}
```

2.  **Connecter au système de préférences swipe existant** :

```typescript
// frontend/src/lib/swipePreferences.ts
// Réutiliser le système de preference learning du SwipeTab

export function updateProspectionPreferences(
  currentPrefs: SwipePreferences,
  card: ProspectionCard,
  direction: 'left' | 'right' | 'up' | 'down'
): SwipePreferences {
  const liked = direction === 'right' || direction === 'up';

  // Ajuster les poids basés sur les caractéristiques de la carte
  return {
    ...currentPrefs,
    // Augmenter/diminuer la sensibilité effort si l'utilisateur swipe en fonction
    effort_sensitivity: adjustWeight(
      currentPrefs.effort_sensitivity,
      card.effortLevel,
      liked
    ),
    // Ajuster la priorité au taux horaire
    hourly_rate_priority: adjustWeight(
      currentPrefs.hourly_rate_priority,
      normalizeRate(card.avgHourlyRate),
      liked
    ),
    // Nouveau: Sensibilité au temps de trajet
    commute_sensitivity: adjustWeight(
      currentPrefs.commute_sensitivity || 0.5,
      normalizeCommute(card.commuteMinutes),
      liked
    ),
  };
}
```

3.  **Exploiter les données Opik pour personnaliser les recherches** :

```typescript
// mcp-server/src/services/prospection-insights.ts
export async function getProspectionInsights(profileId: string) {
  // Analyser les traces Opik pour extraire les patterns
  const traces = await opikClient.getTraces({
    filter: {
      'attributes.profile_id': profileId,
      name: 'prospection_swipe',
    },
    limit: 100,
  });

  // Calculer les préférences implicites
  const likedCategories = traces
    .filter(t => t.attributes.outcome === 'interested')
    .reduce((acc, t) => {
      acc[t.attributes.category] = (acc[t.attributes.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const rejectedCompanies = traces
    .filter(t => t.attributes.outcome === 'rejected')
    .map(t => t.attributes.company)
    .filter(Boolean);

  const avgPreferredCommute = calculateAvgCommute(
    traces.filter(t => t.attributes.outcome === 'interested')
  );

  return {
    preferredCategories: Object.keys(likedCategories).sort(
      (a, b) => likedCategories[b] - likedCategories[a]
    ),
    rejectedCompanies: [...new Set(rejectedCompanies)],
    maxAcceptableCommute: avgPreferredCommute * 1.5,
  };
}
```

---

## 6. Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Quota Google Maps** | Coûts imprévus | Tier gratuit (200$/mois), cache Redis, limiter radius |
| **Groq rate limits** | Recherches lentes | Queue avec retry, fallback vers cache |
| **Données obsolètes** | UX frustrante | TTL cache 24h, marqueur "dernière màj" |
| **RGPD leads** | Compliance | Anonymisation, consentement explicite, purge 30j |
| **Résultats vides** | UX cassée | Fallback vers catégories similaires + message explicatif |

---

## 7. Métriques de Succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| **Taux de swipe right** | > 30% | Opik traces |
| **Leads → Applied** | > 10% | Status progression |
| **Temps moyen exploration** | > 3 min/session | Session duration |
| **Retour utilisateur** | > 2 sessions/semaine | User engagement |

---

## 8. Prochaines Étapes

1. **P1 (Semaine 1)** : Activer Google Maps API, créer les MCP tools
2. **P1 (Semaine 2)** : Implémenter workflow Mastra, créer table DuckDB
3. **P2 (Semaine 3)** : Créer ProspectionTab avec SwipeDeck réutilisé
4. **P2 (Semaine 4)** : Carte avec POI, intégration SavedLeads
5. **P3 (Semaine 5)** : Feedback loop Opik, personnalisation recherches
