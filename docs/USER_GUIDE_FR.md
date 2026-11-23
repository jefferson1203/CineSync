# Guide Utilisateur — CineStudio AI

**CineStudio AI** est un studio local de préproduction cinématographique assisté par intelligence artificielle (Google Gemini). Il permet de transformer un scénario écrit en personnages photoréalistes verrouillés, tenues, décors, scènes et storyboards exportables en PDF et ZIP — tout en conservant vos projets localement sur votre Mac.

---

## 1. Installation sur macOS

Prérequis : **Node.js 20+** et une connexion Internet (requise uniquement pour les appels vers l’API Google Gemini).

```bash
cd cinestudio-ai
chmod +x scripts/install-macos.sh
./scripts/install-macos.sh
```

### Créer un raccourci natif `CineStudio AI.app`
```bash
./scripts/create-macos-app.sh
```
Un raccourci **CineStudio AI.app** apparaît sur votre Bureau. En double-cliquant dessus :
1. Le script vérifie si CineStudio AI tourne déjà sur `127.0.0.1:3000`.
2. Si besoin, il démarre le serveur Node.js localement (écoute uniquement sur `127.0.0.1`).
3. Votre navigateur s’ouvre automatiquement sur CineStudio AI.

---

## 2. Configuration sécurisée de la clé API Google

CineStudio AI **ne stocke jamais** votre clé API dans le navigateur (`localStorage`), ni dans vos dossiers de projet, ni dans les exports ZIP.

Sur macOS, exécutez dans Terminal :
```bash
./scripts/setup-keychain-macos.sh
```
La clé est enregistrée dans le **Trousseau d’accès macOS** (`CineStudioAI / gemini_api_key`). Si le trousseau n’est pas disponible, un fichier de secours `~/.cinestudio-ai/credentials.json` est créé avec des permissions strictes (`chmod 0600`).

Dans l’application, ouvrez **Paramètres > Connexion Google** et cliquez sur **Tester la connexion Google** pour vérifier la disponibilité du modèle en direct.

---

## 3. Flux de travail recommandé

1. **Projets** : Créez un projet. CineStudio AI génère automatiquement l’arborescence locale dans `CineStudioProjects/<projet>/` et synchronise `project.json` après chaque modification importante.
2. **Scenario Studio** : Importez un fichier `.PDF`, `.DOCX`, `.TXT` ou collez votre texte. Le document original reste en lecture seule ; lancez l’analyse Gemini puis validez les personnages, lieux et scènes à importer.
3. **Character Studio & Verrouillage d’identité** :
   - Créez la fiche par formulaire guidé ou description libre complétée par IA.
   - Générez les références sur fond neutre (Portrait visage, Corps complet, Planche Face/Profil/Dos, Expressions, Poses).
   - Sélectionnez les **références officielles** puis activez **Verrouiller l’identité**.
   - Note transparente : les images de référence guident fortement Gemini pour préserver l’identité physique, sans qu’un modèle génératif ne puisse garantir une identité mathématiquement identique à 100 % sous tous les angles.
4. **Tenues & Décors** : Créez la garde-robe (séparée de l’identité physique) et les lieux réutilisables avec plusieurs angles de vue.
5. **Scene Studio & Storyboard Studio** : Associez lieux, personnages et tenues aux scènes, demandez un découpage automatique en plans, puis générez chaque plan (les références officielles sont injectées automatiquement).
6. **Contrôle des coûts** : Avant chaque génération ou retouche payante, une fenêtre de confirmation affiche le modèle, la résolution, le nombre d’images et le coût estimé. Rien n’est facturé sans votre clic de confirmation.
7. **Historique non destructif & Retouche** : Cliquez sur n’importe quelle image pour comparer des versions côte à côte, tracer une zone à retoucher, restaurer une ancienne version ou exporter en PNG / JPG. Aucune ancienne version n’est supprimée automatiquement.
8. **Exports** :
   - **PDF Storyboard** depuis Storyboard Studio.
   - **Archive ZIP complète** (sans clé API) depuis le module Projets.
