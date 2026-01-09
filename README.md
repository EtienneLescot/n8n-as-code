# 🚀 n8n-as-code

![Tests](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/tests.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.0.7-blue)

**n8n-as-code** est un écosystème conçu pour gérer vos workflows n8n comme du code. Il transforme vos automations en fichiers JSON locaux synchronisés, permettant le versioning (Git), l'édition assistée par IA et une intégration fluide dans VS Code.

---

## ⚡ Quick Start

Prêt à synchroniser vos workflows en moins de 2 minutes ?

1.  **Installation** :
    ```bash
    npm install && npm run build
    npm link
    ```

    > **Note** : La commande `npm link` permet de créer un lien global vers le CLI, vous permettant d'utiliser `n8n-as-code` directement depuis n'importe quel terminal.
2.  **Configuration** :
    ```bash
    n8n-as-code init
    ```
    > **Note** : L'assistant vous guidera pour configurer votre instance n8n et stockera votre clé d'API de manière sécurisée hors de votre projet.
3.  **Sync initial** : Téléchargez vos workflows existants :
    ```bash
    n8n-as-code pull
    ```
4.  **Ouvrez VS Code** : Installez l'extension locale (`packages/vscode-extension`) et profitez de la synchronisation automatique et de l'assistance IA.

---

## 🎨 VS Code Extension : Le cockpit n8n

L'extension transforme VS Code en un véritable IDE pour n8n.

-   **Activity Bar Icon** : Un accès direct à tous vos workflows depuis le panneau latéral de gauche.
-   **Embedded Board** : Ouvrez vos workflows dans une vue web intégrée pour un retour visuel immédiat.
-   **Split View** : Éditez le JSON à gauche tout en gardant le canvas n8n à droite.
-   **Push on Save** : Toute modification locale est instantanément envoyée vers n8n.
-   **Automatic AI Context** : Dès l'ouverture, l'extension génère automatiquement l'assistance IA (`AGENTS.md`, snippets, schémas).
-   **🛡️ Gestion des Conflits** : Détecte si un workflow a été modifié simultanément sur n8n et en local, proposant un Diff View pour résoudre le conflit sans perte de données.

---

## ⚙️ Configuration

Le CLI utilise un système de configuration interactif et sécurisé via la commande `init`.

### Fichiers de configuration générés
- **`n8n-as-code.json`** : Contient les réglages du projet (Host, dossiers, etc.). Ce fichier est créé à la racine.
- **`n8n-as-code-instance.json`** : Gère l'identifiant unique de votre instance pour isoler les fichiers de différents environnements.
- **Stockage Global** : Vos clés d'API sont liées à l'hôte et stockées localement sur votre machine par le système, jamais commitées.


---

## 🛠 CLI Commands (`@n8n-as-code/cli`)

Pour ceux qui préfèrent le terminal ou l'automatisation. Les commandes sont accessibles via `n8n-as-code`.

-   **`init`** : Configure votre instance n8n et votre projet local.
-   **`pull`** : Récupère tous les workflows depuis n8n.
-   **`push`** : Envoie les nouveaux fichiers locaux vers n8n.
-   **`watch`** : Mode synchronisation bidirectionnelle en temps réel avec résolution de conflits interactive.
-   **`init-ai`** : Génère le contexte pour votre agent IA.

Exemple d'utilisation :
```bash
n8n-as-code init
n8n-as-code pull
n8n-as-code watch
```

---

## 🧪 Tests & Qualité

Le projet inclut une suite de tests unitaires et d'intégration pour garantir la fiabilité de la synchronisation.

### Lancer les tests
```bash
# Tests unitaires et d'intégration
npm test
```

*Note : Les tests d'intégration nécessitent un fichier `.env.test` à la racine avec `N8N_HOST` et `N8N_API_KEY`.*

---

## 🏗 Architecture (Monorepo)

-   **`packages/core`** : Coeur logique (API, Sync, Sanitization, State Tracking).
-   **`packages/cli`** : Interface de commande.
-   **`packages/vscode-extension`** : Plugin VS Code.

---

## 🤝 Contribution

Les contributions sont les bienvenues ! 

1.  **Fork** le projet.
2.  **Clone** votre fork localement.
3.  **Créez une branche** pour votre fonctionnalité (`git checkout -b feature/AmazingFeature`).
4.  **Assurez-vous que les tests passent** (`npm test`).
5.  **Commit** vos changements (`git commit -m 'Add some AmazingFeature'`).
6.  **Push** vers la branche (`git push origin feature/AmazingFeature`).
7.  **Ouvrez une Pull Request**.

---

## 📄 Licence
MIT
