# Architecture Technique — CineStudio AI

## 1. Vue d'ensemble

- **Frontend** : React 19 + TypeScript + Tailwind CSS v4 (portée bureau 1440px, thème sombre studio cinéma).
- **Backend** : Node.js + Express (`server.ts`, `server/routes/api.ts`), servant à la fois l'API REST `/api/*` et l'application frontend.
- **Base de données locale** : SQLite (`better-sqlite3`, mode WAL + clés étrangères actives) dans `cinestudio.sqlite`.
- **Stockage fichiers local** : arborescence structurée sous `CineStudioProjects/<project_slug>/` avec synchronisation atomique (`project.json` et `history/snapshot_latest.json`) après chaque mutation majeure.
- **Intégration IA** : `@google/genai` exclusivement côté serveur (`server/providers/geminiProvider.ts`), zéro appel navigateur.

---

## 2. Architecture multi-fournisseurs (ImageProvider)

Tous les modules métier (Personnages, Tenues, Décors, Storyboards, Bibliothèque) passent par l'interface commune définie dans `server/providers/types.ts` :

- `checkAvailability()` : vérifie la connectivité réelle et les modèles disponibles.
- `listModels(settings)` : retourne le registre centralisé (`server/config/models.ts`) et les tarifs modifiables.
- `estimateCost(params)` : calcule l'estimation avant confirmation utilisateur.
- `generateImages(req, settings)` : génération multi-variantes (1–8) avec injection de références visuelles `inlineData`.
- `editImage(req, settings)` : retouche conversationnelle et régionale non destructive.

### Modèles Google centralisés (`server/config/models.ts`)
1. `gemini-nano-banana-2.1` — Modèle principal (1K / 2K / 4K, multi-références).
2. `gemini-3-pro-image` — Modèle premium (1K / 2K / 4K).
3. `gemini-3.1-flash-lite-image` — Modèle économique (1K).
4. `gemini-4-hydrogen` — Modèle texte structuré (analyse de scénario, fiches personnages, découpage storyboard, assistant central).

### Limites techniques documentées honnêtement
- **Ratio `4:5`** : les modèles Gemini Image acceptent nativement `1:1`, `3:4`, `4:3`, `9:16`, `16:9`. Lorsque l'utilisateur choisit `4:5`, CineStudio AI transmet `3:4` (ratio vertical le plus proche) avec une directive de cadrage 4:5 sans déformation, et l'indique explicitement dans l'estimation.
- **Retouche localisée** : Gemini effectue une retouche guidée image-vers-image à partir de l'image source et des coordonnées en pourcentage de la zone dessinée, plutôt qu'un inpainting par masque binaire pixel-strict. La version originale est toujours conservée intacte.
- **Coût facturé réel** : l'API Gemini retourne `usageMetadata` (compteurs de tokens), mais ne retourne pas de montant monétaire exact en devise. CineStudio AI enregistre les tokens réels rapportés + le coût estimé calculé d'après la grille modifiable datée dans Paramètres, sans jamais inventer de montant facturé réel.

---

## 3. Sécurité & Confidentialité

- **Clé API** : résolue exclusivement côté serveur (`server/services/secretStore.ts`) dans l'ordre `process.env.GEMINI_API_KEY` → Trousseau macOS (`execFileSync('security', ...)` sans shell) → `~/.cinestudio-ai/credentials.json` (`chmod 0600`). Jamais exposée au frontend, jamais dans `localStorage`, jamais dans les exports ZIP, et masquée dans les logs (`logs/cinestudio.log`).
- **Confinement des chemins** : toute opération fichier (médias, snapshots, import/export ZIP) passe par `resolveConfinedPath(baseDir, ...)` empêchant toute traversée de répertoire (`../`).
- **Requêtes SQL paramétrées** : 100 % des requêtes SQLite utilisent des instructions préparées `better-sqlite3`.
- **Confirmation obligatoire** : `POST /api/images/generate` et `POST /api/images/:id/edit` rejettent toute requête sans `confirmed: true`.

---

## 4. Tests automatisés

Exécuter la suite de tests smoke (SQLite, persistance, confinement des chemins, export ZIP sans secrets, estimateur de coûts) :

```bash
npm run test:smoke
```
