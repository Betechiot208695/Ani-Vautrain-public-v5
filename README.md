# 🤖 Ani Local

Compagne virtuelle Ani construite avec React, TypeScript et Vite,
avec prise en charge de Gemini et Mistral.

## ✨ Fonctionnalités

- Chat multi-modèles : Google Gemini et Mistral AI
- Persona d'exemple Nyx éducative (Base / Créative / Analytique)
- Édition d'images via Gemini
- Historique local et recherche
- Synthèse vocale française
- Paramètres et quotas
- Architecture d'outils extensible

## 🧱 Stack

- React 19
- TypeScript
- Vite
- `@google/genai`
- Tailwind CSS via CDN

## 🚀 Installation

Prérequis : Node.js 18+

```bash
npm install
```

Copier `.env.example` vers `.env`, puis renseigner ses propres clés API :

```env
GEMINI_API_KEY=
MISTRAL_API_KEY=
MISTRAL_API_URL=https://api.mistral.ai/v1/chat/completions
```

Lancer le serveur de développement :

```bash
npm run dev
```

Puis ouvrir l'adresse affichée par Vite.

## 🛠️ Outils

Les outils externes présents dans cette version publique peuvent être
des mocks/simulations. Ils servent de base pour développer et tester
l'architecture sans exposer de comptes, tokens ou services privés.

## 🔐 Sécurité

- Ne jamais publier `.env`.
- Ne jamais publier de clé API, token ou secret.
- Ne pas ajouter de conversations, mémoires ou fichiers personnels.
- Pour une application publique, les secrets doivent rester côté serveur
  et ne doivent pas être exposés dans le code client.

## 🗺️ Roadmap

- Mémoire persistante
- Tool Manager
- Serveur local
- Voix bidirectionnelle
- Vision caméra
- Bluetooth
- Accès distant sécurisé
- Gestionnaire de périphériques

## 📄 Licence

Ajoutez ici la licence de votre choix avant publication.


## 👤 Persona publique

Cette version publique utilise **Nyx**, une persona éducative d'exemple.
Les données personnelles et le lore privé ne sont pas inclus.

## 🔐 Architecture des clés API

Cette version publique ne transmet pas les clés API au bundle frontend.
Les clés doivent rester côté serveur dans une future architecture backend.
Ne placez pas de secret dans une variable `VITE_*`.

Pour un prototype local, configurez les secrets dans `.env` uniquement
si le code d'exécution prévu les consomme côté serveur. Avant une
publication ou un déploiement public, utilisez un backend/proxy sécurisé.
