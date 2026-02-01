# Bug Report: SolidJS SSR Hydration Error

**Erreur:** `template2 is not a function`
**Date de découverte:** 2026-02-01
**Statut:** NON RÉSOLU
**Priorité:** BLOQUANTE - L'application est inutilisable

---

## 1. Description du Problème

### Symptôme Observable
1. L'utilisateur charge la page `/` (onboarding)
2. L'onboarding semble redémarrer (affiche le greeting) même si des données existent déjà
3. L'erreur JavaScript `template2 is not a function` apparaît immédiatement
4. L'application devient complètement non-interactive

### Message d'Erreur Complet

```
template2 is not a function

Fichier: solid-js/web/dist/dev.js

Code source de l'erreur:
  let node,
    key,
    hydrating = isHydrating();
  if (!hydrating || !(node = sharedConfig.registry.get(key = getHydrationKey()))) {
    if (hydrating) {
      sharedConfig.done = true;
      throw new Error(`Hydration Mismatch. Unable to find DOM nodes for hydration key: ${key}\n${template ? template().outerHTML : ""}`);
    }
    return template();  // <-- L'ERREUR SE PRODUIT ICI
  }
```

### Contexte Technique
- **Framework:** SolidJS 1.9.11 (PAS React!)
- **Meta-framework:** SolidStart avec Vinxi 0.5.11
- **Mode:** SSR (Server-Side Rendering) activé
- **Composant principal:** `OnboardingChat.tsx` (~2800 lignes)

---

## 2. Comprendre l'Erreur dans le Contexte SolidJS

### Comment SolidJS compile le JSX

**IMPORTANT: SolidJS ≠ React**

| Aspect | React | SolidJS |
|--------|-------|---------|
| Rendu | Virtual DOM, re-render complet | Réactivité fine, pas de re-render |
| JSX | `createElement()` à chaque render | Templates compilés une seule fois |
| Hydration | Réconciliation VDOM | Attachement direct aux nœuds DOM |

En SolidJS, le JSX est compilé en **fonctions template** au build time:

```jsx
// Code source
<div class="foo"><span>Hello</span></div>

// Compilé par SolidJS
const _tmpl$ = template(`<div class="foo"><span>Hello</span></div>`);
function Component() {
  return _tmpl$();  // Clone le template DOM
}
```

### Ce que signifie "template2 is not a function"

L'erreur indique que:
1. Une variable `template2` (ou similaire) devrait contenir une fonction template
2. Mais elle contient `undefined` ou autre chose
3. Quand SolidJS essaie d'appeler `template2()`, ça échoue

### Causes possibles de ce type d'erreur

1. **Mismatch SSR/Client** - Le HTML rendu côté serveur ne correspond pas à ce que le client attend
2. **Ordre de chargement des modules** - Un template n'est pas encore défini quand il est appelé
3. **Conditional rendering différent** - Server rend A, client veut rendre B
4. **localStorage/window access** - Accès à des APIs browser pendant le SSR

---

## 3. Historique des Modifications Tentées (TOUTES ÉCHOUÉES)

### Tentative 1: Suppression des Fragments dans les boucles For

**Hypothèse:** Les `<>...</>` (Fragments) à l'intérieur de `<For>` causent un mismatch de template.

**Modification:**
```tsx
// AVANT
<For each={messages()}>
  {(msg) => (
    <>
      <ChatMessage ... />
      <Show when={msg.uiResource}>...</Show>
    </>
  )}
</For>

// APRÈS
<For each={messages()}>
  {(msg) => (
    <div class="message-wrapper">
      <ChatMessage ... />
      <Show when={msg.uiResource}>...</Show>
    </div>
  )}
</For>
```

**Fichier:** `OnboardingChat.tsx` lignes ~2686-2729
**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 2: Fragment racine remplacé par div

**Hypothèse:** Le Fragment racine `<>` avec un enfant `<style>` cause un mismatch.

**Modification:**
```tsx
// AVANT
return (
  <>
    <style>{`@keyframes orbital-pulse {...}`}</style>
    <div class="fixed ...">...</div>
  </>
);

// APRÈS
return (
  <div class="onboarding-chat-root">
    <div class="fixed ...">...</div>
  </div>
);
```

**Fichier:** `OnboardingChat.tsx` lignes ~2570-2808
**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 3: Suppression du style inline

**Hypothèse:** Le `<style>` avec template literal dans le JSX cause un problème de compilation.

**Modification:**
- Déplacé `@keyframes orbital-pulse` vers `OnboardingProgress.css`
- Supprimé le bloc `<style>` inline du composant

**Fichiers:**
- `OnboardingChat.tsx` (suppression)
- `OnboardingProgress.css` (ajout keyframes)

**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 4: Composants Portal en client-only

**Hypothèse:** `<Portal>` (utilisé par ToastContainer et DebugPanel) ne fonctionne pas avec SSR.

**Modification dans app.tsx:**
```tsx
const [mounted, setMounted] = createSignal(false);

onMount(() => {
  setMounted(true);
});

// Wrapper les composants Portal
<Show when={mounted()}>
  <ToastContainer />
  <DebugPanel ... />
</Show>
```

**Fichier:** `app.tsx`
**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 5: Suppression de ConfirmDialog

**Hypothèse:** Le composant ConfirmDialog utilise Portal et cause des problèmes.

**Modification:**
- Remplacé le ConfirmDialog personnalisé par `window.confirm()` natif
- Supprimé les imports et le state associé

**Fichier:** `OnboardingChat.tsx`
**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 6: Clean rebuild complet

**Commandes exécutées:**
```bash
rm -rf node_modules/.vite
rm -rf .vinxi
pnpm build:frontend
pnpm dev
```

**Résultat:** ❌ ÉCHEC - Même erreur

---

### Tentative 7: clientOnly wrapper (REVERTÉE)

**Hypothèse:** Désactiver complètement le SSR pour OnboardingChat.

**Modification:**
```tsx
// routes/index.tsx
import { clientOnly } from '@solidjs/start';
const OnboardingChat = clientOnly(() => import('~/components/chat/OnboardingChat'));
```

**Résultat:** ❌ ÉCHEC - A empiré la situation, revertée immédiatement

---

## 4. Analyse du Composant OnboardingChat

### Structure du fichier (~2800 lignes)

```
OnboardingChat.tsx
├── Imports (lignes 1-40)
├── Types/Interfaces (lignes 40-200)
├── Constants (GREETING_MESSAGE, etc.) (lignes 170-200)
├── export function OnboardingChat() (ligne 204)
│   ├── State signals (lignes 205-280)
│   ├── Effects (createEffect) (lignes 280-400)
│   ├── Helper functions (lignes 400-950)
│   ├── onMount() (lignes 958-1157) ⚠️ SUSPECT
│   ├── Event handlers (lignes 1160-2500)
│   └── JSX Return (lignes 2570-2800)
```

### Code Suspect #1: onMount avec localStorage

```tsx
// Ligne ~958
onMount(async () => {
  // BUG FIX: Early return if onboarding already complete
  if (onboardingIsComplete()) {  // ⚠️ Lit le signal!
    setChatMode('conversation');
    setStep('complete');
    // ... charge le profil, change les messages
    return;
  }
  // ... reste de la logique
});
```

**Problème potentiel:**
- `onboardingIsComplete()` lit `localStorage`
- `localStorage` n'existe pas côté serveur → retourne `false`
- Côté client → peut retourner `true`
- **Le serveur rend "greeting", le client attend "complete"** → MISMATCH!

### ⚠️ DÉCOUVERTE CRITIQUE: entry-client.tsx

**Fichier:** `entry-client.tsx`
```tsx
import { initOnboardingState } from '~/lib/onboardingStateStore';

// Initialize onboarding state from localStorage (must run before app hydrates)
initOnboardingState();  // ⚠️ CHANGE LE SIGNAL AVANT L'HYDRATION!

mount(() => <StartClient />, document.getElementById('app')!);
```

**Fichier:** `onboardingStateStore.ts`
```tsx
const [isComplete, setIsComplete] = createSignal(false);  // Défaut: false

export const initOnboardingState = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('onboardingComplete');
    if (stored === 'true') {
      setIsComplete(true);  // ⚠️ Passe à true AVANT mount()!
    }
  }
};
```

### Séquence d'événements problématique

```
1. SERVEUR: Render avec isComplete = false (défaut du signal)
   → HTML généré avec structure "greeting"

2. CLIENT: Le module onboardingStateStore.ts est chargé
   → isComplete initialisé à false

3. CLIENT: initOnboardingState() est appelé (AVANT mount!)
   → localStorage lu, isComplete passe à TRUE

4. CLIENT: mount() commence l'hydration
   → SolidJS essaie d'hydrater avec isComplete = true
   → Mais le DOM a été rendu avec isComplete = false
   → MISMATCH! → "template2 is not a function"
```

**C'EST LA CAUSE RACINE!** Le signal est modifié AVANT que l'hydration commence, mais APRÈS que le HTML serveur ait été généré.

### Code Suspect #2: Initialisation des signaux

```tsx
// Ligne ~221
const [step, setStep] = createSignal<OnboardingStep>('greeting');
```

Le step est toujours initialisé à `'greeting'` même si l'utilisateur a déjà complété l'onboarding.

### Code Suspect #3: Rendu conditionnel basé sur step

```tsx
// Ligne ~2658
<Show when={!['greeting', 'currency_confirm'].includes(step())}>
  <OnboardingProgress currentStepId={step()} />
</Show>
```

Si `step()` est différent entre SSR et client, le Show rend des enfants différents.

---

## 5. Fichiers Impliqués

| Fichier | Rôle | Modifié? |
|---------|------|----------|
| `routes/index.tsx` | Monte OnboardingChat | Non (revert) |
| `components/chat/OnboardingChat.tsx` | Composant principal | Oui (plusieurs) |
| `lib/onboardingStateStore.ts` | Gère `onboardingComplete` localStorage | Non |
| `app.tsx` | Layout racine, Portals | Oui |
| `components/chat/OnboardingProgress.tsx` | Barre de progression | Oui (mapping) |
| `components/chat/OnboardingProgress.css` | Styles + keyframes | Oui |
| `components/chat/GridMultiSelect.tsx` | Sélection skills | Oui (réactivité) |
| `components/chat/OnboardingFormStep.tsx` | Formulaires step | Oui |
| `routes/api/profiles.ts` | API profils | Oui (auto-activate) |
| `components/ProfileSelector.tsx` | Sélecteur profil | Oui |
| `types/chat.ts` | Types messages | Oui (isCompletionCta) |

---

## 6. Pistes de Solutions Non Testées

### Piste A: NE PAS initialiser le signal avant mount (RECOMMANDÉE)

**Cause racine identifiée:** `initOnboardingState()` est appelé AVANT `mount()` dans entry-client.tsx.

**Solution:** Déplacer l'initialisation APRÈS l'hydration.

```tsx
// entry-client.tsx - AVANT (BUGUÉ)
initOnboardingState();  // Change le signal AVANT hydration!
mount(() => <StartClient />, document.getElementById('app')!);

// entry-client.tsx - APRÈS (CORRIGÉ)
mount(() => <StartClient />, document.getElementById('app')!);
// NE PAS appeler initOnboardingState() ici!
```

Puis dans chaque composant qui a besoin de l'état:
```tsx
// OnboardingChat.tsx
onMount(() => {
  // Initialiser ici, APRÈS l'hydration
  initOnboardingState();

  if (onboardingIsComplete()) {
    // Maintenant c'est safe de changer l'état
  }
});
```

**Avantage:** L'hydration se fait avec le même état que le serveur (isComplete = false)
**Inconvénient:** Flash de contenu possible (greeting visible brièvement)

---

### Piste A-bis: Supprimer complètement initOnboardingState de entry-client

**Idée:** Laisser chaque composant gérer son propre état post-hydration.

```tsx
// entry-client.tsx - Supprimer la ligne:
// initOnboardingState();  // SUPPRIMER CETTE LIGNE
```

Le signal reste à `false` pendant l'hydration, puis les composants le mettent à jour dans leur `onMount()`.

---

### Piste B: Synchroniser l'état initial SSR/Client (alternative)

**Idée:** S'assurer que le rendu initial est IDENTIQUE entre serveur et client.

```tsx
// Au lieu de lire localStorage dans onMount qui change le rendu
// Toujours commencer par 'greeting' et faire la transition APRÈS l'hydration

export function OnboardingChat() {
  const [step, setStep] = createSignal<OnboardingStep>('greeting');
  const [hydrated, setHydrated] = createSignal(false);

  onMount(() => {
    // Marquer comme hydraté AVANT de changer l'état
    setHydrated(true);

    // Maintenant on peut changer l'état en toute sécurité
    if (onboardingIsComplete()) {
      setStep('complete');
      // ...
    }
  });

  // Le rendu initial sera toujours 'greeting' (SSR et client)
  // Puis après hydration, ça changera si nécessaire
}
```

**Risque:** Flash de contenu (greeting visible brièvement avant complete)

---

### Piste B: Désactiver SSR au niveau route

**Idée:** Utiliser la configuration SolidStart pour désactiver SSR sur cette route.

```tsx
// routes/index.tsx
export const route = {
  preload: () => {}, // Pas de preload SSR
};

// Ou dans app.config.ts
export default defineConfig({
  server: {
    prerender: {
      routes: ['/plan', '/suivi'], // Exclure '/'
    }
  }
});
```

**À investiguer:** Documentation SolidStart sur le contrôle SSR par route.

---

### Piste C: Créer un wrapper Hydration-Safe

**Idée:** Composant utilitaire qui attend l'hydration avant de rendre.

```tsx
// lib/HydrationBoundary.tsx
import { createSignal, onMount, ParentComponent, Show } from 'solid-js';

export const HydrationBoundary: ParentComponent<{
  fallback?: JSX.Element;
}> = (props) => {
  const [ready, setReady] = createSignal(false);

  onMount(() => setReady(true));

  return (
    <Show when={ready()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
};

// Usage dans index.tsx
<HydrationBoundary fallback={<LoadingSpinner />}>
  <OnboardingChat />
</HydrationBoundary>
```

---

### Piste D: Investiguer les imports circulaires

**Idée:** Les imports circulaires peuvent causer des templates undefined.

**Commande pour détecter:**
```bash
npx madge --circular packages/frontend/src/components/chat/OnboardingChat.tsx
```

---

### Piste E: Investiguer le build Vinxi

**Idée:** Regarder les fichiers compilés pour comprendre pourquoi template2 est undefined.

```bash
# Voir les chunks générés
ls -la .vinxi/build/
# Chercher template2 dans le code compilé
grep -r "template2" .vinxi/
```

---

### Piste F: Vérifier la version de SolidJS

**Idée:** Bug connu dans certaines versions?

```bash
pnpm why solid-js
# Vérifier s'il y a des versions multiples
```

Issues GitHub à consulter:
- https://github.com/solidjs/solid/issues/1614
- https://github.com/solidjs/solid/issues/1891
- https://github.com/solidjs/solid-start/issues/682

---

## 7. État Actuel du Code

### Modifications conservées (non revertées)

1. **app.tsx** - Portal components wrappés en client-only
2. **OnboardingProgress.css** - Keyframes orbital-pulse ajoutés
3. **GridMultiSelect.tsx** - Options acceptent getter function
4. **OnboardingFormStep.tsx** - Passe getter au lieu de valeur
5. **profiles.ts** - Auto-activation du profil
6. **ProfileSelector.tsx** - Clear onboardingComplete
7. **chat.ts** - Type isCompletionCta ajouté

### Modifications revertées

1. **index.tsx** - Revenu à l'import simple (pas clientOnly)
2. **OnboardingChat.tsx** - Revenu à l'état précédent (avec les fixes de bug initiaux)

---

## 8. Environnement

```
Node.js: 22.x
pnpm: 10.x
OS: WSL2 Linux 6.6.87

Dépendances clés:
- solid-js: 1.9.11
- @solidjs/start: 1.1.2 (vérifier)
- vinxi: 0.5.11
- vite: 6.x
```

---

## 9. Reproduction

1. Avoir un profil existant dans DuckDB avec `onboardingComplete = true` en localStorage
2. Naviguer vers une autre page (/plan, /suivi)
3. Revenir sur `/`
4. Observer: l'onboarding semble redémarrer, puis crash

Ou simplement:
1. Rafraîchir la page `/` avec des données existantes
2. L'erreur apparaît immédiatement

---

## 10. Prochaines Étapes Recommandées

### CAUSE RACINE IDENTIFIÉE ✓

Le problème vient de `entry-client.tsx` ligne 18:
```tsx
initOnboardingState();  // Change isComplete de false à true AVANT mount()
```

Cela crée un mismatch:
- Serveur a rendu avec `isComplete = false`
- Client essaie d'hydrater avec `isComplete = true`

### Action Recommandée

**Option 1 (Quick fix):** Commenter/supprimer `initOnboardingState()` dans entry-client.tsx

**Option 2 (Proper fix):** Déplacer l'initialisation dans les `onMount()` des composants concernés

### Étapes

1. Supprimer `initOnboardingState()` de `entry-client.tsx`
2. S'assurer que les composants qui lisent `onboardingIsComplete()` appellent `initOnboardingState()` dans leur `onMount()`
3. Tester que l'hydration fonctionne
4. Gérer le flash de contenu éventuel (loading state ou transition)

---

## 11. Questions Ouvertes

1. Ce bug existait-il avant les modifications du sprint "Final Onboarding Bugs"?
2. Quel était le dernier commit où l'app fonctionnait?
3. Y a-t-il d'autres composants dans l'app qui utilisent un pattern similaire (localStorage + conditional rendering)?
4. Le bug se produit-il en mode production build aussi?

---

## 12. État Git Actuel

### Dernier commit stable
```
5810ced chore: complete v2.1 milestone
```

### Fichiers actuellement modifiés (non commités)
```
packages/frontend/src/app.tsx
packages/frontend/src/components/ProfileSelector.tsx
packages/frontend/src/components/chat/GridMultiSelect.tsx
packages/frontend/src/components/chat/OnboardingFormStep.tsx
packages/frontend/src/components/chat/OnboardingProgress.css
packages/frontend/src/components/chat/OnboardingProgress.tsx
packages/frontend/src/routes/api/profiles.ts
packages/frontend/src/types/chat.ts
```

### Fichiers revertés
```
packages/frontend/src/routes/index.tsx (revert clientOnly)
packages/frontend/src/components/chat/OnboardingChat.tsx (revert à l'état initial)
```

### Test à faire: Vérifier si le bug existe au commit 5810ced

```bash
# Stash les modifications actuelles
git stash

# Tester l'app au dernier commit stable
pnpm dev

# Si ça marche, le bug a été introduit par nos modifications
# Si ça ne marche pas, le bug existait déjà

# Restaurer les modifications
git stash pop
```

---

---

## 13. FIX APPLIQUÉ

**Date:** 2026-02-01

### Modifications

**1. entry-client.tsx** — Supprimé l'appel à `initOnboardingState()` avant `mount()`

```tsx
// AVANT (BUGUÉ)
initOnboardingState();  // Change le signal AVANT hydration!
mount(() => <StartClient />, ...);

// APRÈS (CORRIGÉ)
// NOTE: Do NOT call initOnboardingState() here!
mount(() => <StartClient />, ...);
```

**2. app.tsx** — Ajouté l'appel dans `onMount()` (APRÈS hydration)

```tsx
import { initOnboardingState } from '~/lib/onboardingStateStore';

onMount(() => {
  setMounted(true);

  // Initialize onboarding state from localStorage AFTER hydration
  initOnboardingState();

  // ...
});
```

### Séquence corrigée

```
1. SERVEUR: Render avec isComplete = false (défaut)
   → HTML généré avec structure "greeting" + nav limitée

2. CLIENT: mount() démarre l'hydration
   → isComplete = false (même que serveur)
   → Hydration réussie! ✓

3. CLIENT: onMount() s'exécute (APRÈS hydration)
   → initOnboardingState() lit localStorage
   → isComplete passe à true (si applicable)
   → SolidJS met à jour le DOM réactivement
   → Navigation complète apparaît
```

### Comportement attendu

- **Flash potentiel:** La navigation peut brièvement montrer seulement "Onboarding" avant de révéler tous les liens (si l'utilisateur a déjà complété l'onboarding)
- **Pas d'erreur:** Plus de "template2 is not a function"

---

*Rapport rédigé le 2026-02-01*
*Fix appliqué: 2026-02-01*
