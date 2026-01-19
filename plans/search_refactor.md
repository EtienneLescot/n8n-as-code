# Plan de Refonte de la Recherche et Analyse de l'Architecture de Données

## 1. Analyse des Fichiers Générés (La "Pipeline" de Données)

Voici le rôle exact de chaque fichier dans l'architecture actuelle :

| Fichier | Rôle | Pourquoi ce n'est pas "propre" ? |
| :--- | :--- | :--- |
| `n8n-docs-cache/pages/` | Dossier contenant les 1200+ fichiers `.md` téléchargés de n8n. | **Stockage brut**. Inutile en runtime, ne devrait servir qu'au build. |
| `n8n-docs-cache/llms.txt` | Copie locale du `llms.txt` de n8n. | **Index de téléchargement**. Doublon avec les métadonnées. |
| `n8n-docs-cache/metadata.json` | Métadonnées de téléchargement (URL -> Fichier local, Catégories). | **Pivot de build**. |
| `n8n-nodes-index.json` | Liste brute des nœuds extraite de la source n8n. | **Fallback obsolète**. Devrait être supprimé au profit de `technical.json`. |
| `n8n-nodes-technical.json` | La structure technique (paramètres) des nœuds. | **Source de vérité technique**. Indispensable pour `schema` et `validate`. |
| `n8n-docs-complete.json` | Un gros JSON contenant TOUT le contenu markdown des 1200 pages. | **Base de connaissance**. Utilisé par `docs` et `get`. Trop gros pour la recherche. |
| `n8n-knowledge-index.json` | Version "light" optimisée pour la recherche (Keywords, Titres, Slugs). | **Index de recherche**. C'est ici que se joue la performance de `search`. |

---

## 2. Analyse de la Recherche : `search` vs `docs --search`

### Ce que faisait `docs --search` (DocsProvider)
- Parcourt les 1200 pages de `n8n-docs-complete.json`.
- Fait un `.includes(query)` sur le titre (score 10), les mots-clés (score 3/match), et le contenu (score 2).
- **Limites** : Très lent sur un gros fichier, recherche exacte uniquement, ne cherche que dans la doc (pas les nœuds).

### Ce que fait `search` (KnowledgeSearch)
- Utilise l'index pré-calculé `n8n-knowledge-index.json`.
- Cherche dans les nœuds ET la doc.
- **Limites actuelles** : Trop strict. Si vous tapez "generate image", il cherche la chaîne exacte "generate image". Comme les mots-clés sont souvent "generate" et "image" séparément, il ne trouve rien.

---

## 3. Recommandations Architecturales

### Faut-il une base de données ?
- **Base Vectorielle (RAG)** : Pour un package NPM, c'est trop lourd (nécessite des embeddings, souvent un service externe ou une lib WASM lourde). Par contre, on peut simuler une recherche "pseudo-vectorielle" avec un index de mots-clés pondérés (BM25 simplifié).
- **SQLite / DB locale** : Trop lourd à distribuer via NPM (problèmes de compilation native).
- **Ma recommandation** : Garder le JSON mais **unifier l'index**. Supprimer les fichiers de cache inutiles (`n8n-docs-cache/`) du package final pour ne garder que les 3 JSON de production.

---

## 4. Plan d'Action : La Recherche Unifiée "Du plus large au plus précis"

### Étape 1 : Unification Totale
Supprimer `docs --search` et faire de `search` l'unique point d'entrée. 
- Si l'IA veut apprendre : `search` -> `docs`
- Si l'IA veut coder : `search` -> `get` / `schema`

### Étape 2 : Algorithme "Smart Search"
Modifier `KnowledgeSearch` pour :
1. **Tokenisation** : Splitter la requête ("generate image" -> `["generate", "image"]`).
2. **Intersection** : Un résultat qui contient tous les mots (même séparés) score beaucoup plus haut.
3. **Fuzzy Basic** : Utiliser une distance de Levenshtein très légère pour les typos (ex: "OpenA" -> "OpenAI").
4. **Pondération sémantique** :
   - Titre contient le mot exact : +++
   - Mots-clés contiennent les termes : ++
   - Description contient les termes : +

### Étape 3 : Nettoyage de la Pipeline
Modifier les scripts de build pour que `agent-cli/dist/assets` ne contienne que :
- `n8n-nodes-technical.json` (Le "Comment")
- `n8n-docs-complete.json` (Le "Pourquoi" - détaillé)
- `n8n-knowledge-index.json` (Le "Où" - l'index de recherche)

---

## 5. Exemple de Résolution "NanoBanana"
Si l'IA cherche "NanoBanana" :
1. `search "NanoBanana"` -> Ne trouve rien (0 score).
2. `search "Image generation"` (termes splités) -> Trouve le nœud `openAi` (car il a les mots-clés `image` et `generate`) et la page de doc `Image operations`.
3. L'IA voit les résultats et comprend qu'elle doit utiliser OpenAI pour générer des images.

**Voulez-vous que je procède à la modification de `KnowledgeSearch.ts` et du `cli.ts` pour implémenter cette stratégie ?**