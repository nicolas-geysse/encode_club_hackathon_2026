# Rapport d'Analyse : Duplication d'Instances et Erreurs de Déploiement Railway

**Date** : 23 Janvier 2026
**Sujet** : Analyse des doublons "encode_club_hackathon_2026" vs "frontend" et crash au démarrage.

---

## 1. Diagnostic de la Duplication

Vous avez observé deux instances déployées :
1.  **`encode_club_hackathon_2026`** (Nom par défaut du repo/root)
2.  **`frontend`** (Nom du package `@stride/frontend`)

### Cause Racine : Ambiguïté Monorepo sur Railway
Railway tente d'être intelligent ("Magic Deployment").
*   Il voit un fichier `railway.json` et un `Dockerfile` à la racine → Il crée un service pour la racine (**Instance 1**).
*   Il détecte une structure monorepo (via `pnpm-workspace.yaml`) et identifie `packages/frontend` comme une application web autonome → Il crée un service pour ce package (**Instance 2**).

Comme les deux pointent potentiellement vers le même code ou la même commande de start (via le `railway.json` qui lance le build frontend), vous obtenez deux fois l'application, ou deux tentatives de build concurrentes.

**Impact** :
*   Conflits de build (si cache partagé).
*   Double facturation (ressources CPU/RAM).
*   Confusion sur quelle URL utiliser.

---

## 2. Analyse du Crash (Logs)

L'instance qui tente de démarrer échoue avec cette erreur critique :

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@ai-sdk/provider-v5' imported from ...node_modules/@mastra/core/dist/chunk-FKO2M32N.js
```

### Mécanisme de l'Erreur
*   Le package **`@mastra/core` (v1.0.4)** utilisé dans votre code contient un import hardcodé vers **`@ai-sdk/provider-v5`**.
*   Dans votre `package.json` et `pnpm-lock.yaml`, vous avez installé **`@ai-sdk/provider` (v3.0.5)**.
*   **Résultat** : Node.js ne trouve pas le package avec le suffixe `-v5` requis par cette version spécifique de Mastra.

Il semble que `@mastra/core` v1.0.4 dépende d'une version spécifique ou expérimentale du SDK AI (aliasée en v5 pour la migration) qui n'est pas installée dans votre projet.

---

## 3. Recommandations Structurelles & Correctives

Pour assainir l'architecture et corriger le déploiement, voici le plan d'action recommandé (ne pas implémenter tout de suite, validation requise) :

### A. Supprimer le Doublon (Architecture)
Il faut expliciter à Railway ce qui doit être déployé.
*   **Décision** : Garder uniquement le déploiement basé sur le **Root** (qui utilise le `Dockerfile` et orchestre tout), OU configurer le monorepo Railway pour ignorer la racine et ne déployer que les services des packages.
*   **Solution recommandée** : Utiliser le `railway.json` à la racine comme source de vérité unique et désactiver la détection automatique des sous-packages si elle est redondante.

### B. Corriger la Dépendance Mastra (Code)
L'erreur de module manquant est bloquante.
1.  **Vérifier Mastra** : Est-ce que `@mastra/core` v1.0.4 est la bonne version compatible avec `@ai-sdk/provider` v3 ?
    *   *Hypothèse* : Mastra a peut-être release une version cassée ou nécessitant une "peer dependency" spécifique non documentée.
2.  **Action** :
    *   Soit downgrader `@mastra/core` vers une version stable précédente.
    *   Soit installer explicitement le package manquant (si disponible) : `pnpm add @ai-sdk/provider-v5`.
    *   Soit mettre à jour `@ai-sdk/provider` vers la version attendue (v4/v5 si dispo).

---

## 4. Conclusion

L'infrastructure actuelle est "schizophrène" (Root vs Package) et le code est cassé par une dépendance Mastra instable.
L'ajout du volume n'est pas la cause, mais a peut-être déclenché un redéploiement qui a révélé ces soucis.

**Prochaine étape suggérée** :
Voulez-vous que je tente de corriger la dépendance manquante en ajustant le `package.json`, ou que je nettoie d'abord la configuration Railway pour éviter le doublon ?
