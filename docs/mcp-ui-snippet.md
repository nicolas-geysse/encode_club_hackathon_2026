# MCP-UI Snippets Documentation

Guide pour tester et utiliser les composants MCP-UI dans le chat de Stride.

## Slash Commands Disponibles

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/budget` | Affiche une grille de métriques budget | `/budget` |
| `/goal` | Formulaire pour définir un objectif | `/goal` |
| `/skills` | Tableau des compétences avec potentiel marché | `/skills` |
| `/swipe` | Navigue vers les scénarios swipe | `/swipe` |
| `/summary` | Vue d'ensemble complète du profil | `/summary` |
| `/help` | Liste toutes les commandes | `/help` |

---

## Types de Composants UI

### 1. `metric` - Métrique Simple

Affiche une valeur avec label et tendance optionnelle.

```json
{
  "type": "metric",
  "label": "Revenu mensuel",
  "value": "1200€",
  "trend": "+5%",
  "trendDirection": "up"
}
```

**Props:**
- `label`: string - Titre de la métrique
- `value`: string | number - Valeur affichée
- `trend?`: string - Variation (ex: "+5%")
- `trendDirection?`: "up" | "down" | "neutral"

---

### 2. `grid` - Grille de Métriques

Affiche plusieurs métriques en grille responsive.

```json
{
  "type": "grid",
  "columns": 3,
  "items": [
    { "type": "metric", "label": "Revenus", "value": "1200€" },
    { "type": "metric", "label": "Dépenses", "value": "800€" },
    { "type": "metric", "label": "Marge", "value": "400€", "trend": "+10%", "trendDirection": "up" }
  ]
}
```

**Props:**
- `columns`: number - Nombre de colonnes (2, 3, 4)
- `items`: UIResource[] - Composants enfants

---

### 3. `table` - Tableau de Données

Affiche des données tabulaires avec headers.

```json
{
  "type": "table",
  "headers": ["Compétence", "Niveau", "Demande"],
  "rows": [
    ["JavaScript", "Intermédiaire", "Haute"],
    ["Python", "Débutant", "Très haute"],
    ["Design", "Avancé", "Moyenne"]
  ]
}
```

**Props:**
- `headers`: string[] - En-têtes de colonnes
- `rows`: (string | number)[][] - Lignes de données

---

### 4. `form` - Formulaire Interactif

Permet la saisie de données structurées.

```json
{
  "type": "form",
  "title": "Définir un objectif",
  "fields": [
    { "name": "goalName", "label": "Nom de l'objectif", "type": "text", "required": true },
    { "name": "amount", "label": "Montant cible (€)", "type": "number", "required": true },
    { "name": "deadline", "label": "Date limite", "type": "date" }
  ],
  "submitLabel": "Créer l'objectif"
}
```

**Types de champs:**
- `text` - Champ texte
- `number` - Champ numérique
- `date` - Sélecteur de date
- `select` - Liste déroulante (avec `options`)
- `textarea` - Zone de texte multiligne

---

### 5. `text` - Texte Formaté

Affiche du texte avec formatage optionnel.

```json
{
  "type": "text",
  "content": "Voici votre résumé financier",
  "variant": "heading"
}
```

**Variants:**
- `heading` - Titre (h3)
- `subheading` - Sous-titre
- `body` - Texte normal (défaut)
- `muted` - Texte grisé
- `success` - Texte vert
- `warning` - Texte orange
- `error` - Texte rouge

---

### 6. `chart` - Graphique

Affiche des données sous forme de graphique.

```json
{
  "type": "chart",
  "chartType": "bar",
  "title": "Revenus par source",
  "data": [
    { "label": "Freelance", "value": 500 },
    { "label": "Tutorat", "value": 300 },
    { "label": "Ventes", "value": 200 }
  ]
}
```

**Types de graphiques:**
- `bar` - Barres horizontales
- `progress` - Barre de progression
- `pie` - Camembert (non implémenté)

---

### 7. `link` - Lien/Navigation

Bouton de navigation vers une autre page.

```json
{
  "type": "link",
  "label": "Voir les scénarios",
  "href": "/plan?tab=swipe",
  "variant": "primary"
}
```

**Variants:**
- `primary` - Bouton principal
- `secondary` - Bouton secondaire
- `ghost` - Lien discret

---

### 8. `action` - Bouton d'Action

Déclenche une action côté client.

```json
{
  "type": "action",
  "label": "Actualiser",
  "action": "refresh",
  "variant": "outline"
}
```

**Actions disponibles:**
- `refresh` - Recharge les données
- `navigate` - Navigation (avec `href`)
- `submit` - Soumettre un formulaire
- Custom actions via `onAction` callback

---

### 9. `composite` - Composition

Combine plusieurs composants dans un conteneur.

```json
{
  "type": "composite",
  "layout": "vertical",
  "children": [
    { "type": "text", "content": "Résumé Budget", "variant": "heading" },
    { "type": "grid", "columns": 2, "items": [...] },
    { "type": "link", "label": "Voir détails", "href": "/plan" }
  ]
}
```

**Layouts:**
- `vertical` - Empilé verticalement
- `horizontal` - En ligne

---

## Exemples de Réponses Chat

### Commande `/budget`

```json
{
  "response": "Voici votre situation budgétaire:",
  "uiResource": {
    "type": "composite",
    "layout": "vertical",
    "children": [
      {
        "type": "grid",
        "columns": 3,
        "items": [
          { "type": "metric", "label": "Revenus", "value": "1200€/mois" },
          { "type": "metric", "label": "Dépenses", "value": "800€/mois" },
          { "type": "metric", "label": "Marge", "value": "400€/mois", "trend": "+12%", "trendDirection": "up" }
        ]
      },
      {
        "type": "text",
        "content": "Vous êtes sur la bonne voie pour atteindre votre objectif!",
        "variant": "success"
      }
    ]
  }
}
```

### Commande `/skills`

```json
{
  "response": "Vos compétences et leur potentiel:",
  "uiResource": {
    "type": "table",
    "headers": ["Compétence", "Niveau", "Demande marché", "Taux horaire"],
    "rows": [
      ["JavaScript", "Intermédiaire", "🟢 Haute", "25-35€/h"],
      ["Python", "Débutant", "🟢 Très haute", "20-30€/h"],
      ["Tutorat Maths", "Avancé", "🟡 Moyenne", "20-25€/h"]
    ]
  }
}
```

### Commande `/goal`

```json
{
  "response": "Définissez votre objectif d'épargne:",
  "uiResource": {
    "type": "form",
    "title": "Nouvel objectif",
    "fields": [
      { "name": "goalName", "label": "Nom", "type": "text", "placeholder": "Ex: Voyage été", "required": true },
      { "name": "amount", "label": "Montant (€)", "type": "number", "required": true },
      { "name": "deadline", "label": "Date cible", "type": "date", "required": true }
    ],
    "submitLabel": "Créer"
  }
}
```

---

## Intégration dans le Code

### Côté Serveur (routes/api/chat.ts)

```typescript
import type { UIResource } from '~/lib/chat/types';

// Dans la réponse du chat:
return {
  response: "Message texte",
  uiResource: {
    type: "metric",
    label: "Budget",
    value: profile.income - profile.expenses
  } as UIResource
};
```

### Côté Client (MCPUIRenderer.tsx)

```tsx
import { MCPUIRenderer } from '~/components/chat/MCPUIRenderer';

// Dans le composant chat:
<Show when={message.uiResource}>
  <MCPUIRenderer
    resource={message.uiResource!}
    onAction={handleAction}
    onFormSubmit={handleFormSubmit}
  />
</Show>
```

---

## Test des Commandes

1. Aller sur la page d'accueil (/)
2. Dans le chat, taper une commande (ex: `/budget`)
3. Observer le rendu du composant UI

### Commandes de test rapide:

```
/help          → Liste des commandes
/budget        → Grille métriques budget
/skills        → Tableau compétences
/goal          → Formulaire objectif
/summary       → Vue complète profil
```

---

## Notes de Développement

- Les composants UI sont rendus par `MCPUIRenderer.tsx`
- Les commandes sont définies dans `lib/chat/commands/definitions.ts`
- L'exécution se fait dans `lib/chat/commands/executor.ts`
- Le type `UIResource` est défini dans `lib/chat/types.ts`
