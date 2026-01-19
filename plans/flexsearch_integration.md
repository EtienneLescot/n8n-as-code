# Analyse de l'utilisation de FlexSearch pour la Recherche n8n

## 1. Pourquoi FlexSearch ?
[FlexSearch](https://github.com/nextapps-de/flexsearch) est la bibliothèque de recherche plein texte la plus performante en JavaScript. Elle est parfaite pour notre cas d'usage car :
- **Extrêmement légère** (pas de dépendances lourdes).
- **In-memory** : Idéal pour nos fichiers JSON.
- **Supporte la recherche par fragments** et le scoring avancé (BM25).
- **Supporte le multi-index** (on peut indexer les nœuds et la doc séparément mais les interroger ensemble).

## 2. Intégration dans notre Pipeline

### Étape A : Build (Indexation)
Pendant `npm run build`, au lieu de simplement générer un `knowledge-index.json` maison, on utilise FlexSearch pour créer des **index pré-sérialisés**.
- On crée un index pour les `nodes`.
- On crée un index pour les `pages` de documentation.

### Étape B : Runtime (Recherche)
Dans `KnowledgeSearch.ts` :
1. On charge les index FlexSearch.
2. La commande `./n8n-agent search "query"` interroge FlexSearch.
3. FlexSearch gère nativement le split des termes ("generate image"), les typos, et le scoring de pertinence.

## 3. Avantages par rapport à notre solution actuelle
- **Vitesse** : FlexSearch est conçu pour être 10x à 100x plus rapide qu'un `.includes()` manuel.
- **Pertinence** : Il utilise des algorithmes de scoring professionnels.
- **Propreté** : On arrête de "réinventer la roue" de la recherche textuelle.

## 4. Plan de Migration
1. Ajouter `flexsearch` aux dépendances de `agent-cli`.
2. Modifier `build-knowledge-index.cjs` pour exporter des index FlexSearch sérialisés.
3. Refondre `KnowledgeSearch.ts` pour utiliser FlexSearch comme moteur.
4. Supprimer l'ancienne logique de recherche manuelle.

**C'est une excellente suggestion. FlexSearch apporterait la robustesse et la "tolérance" (fuzzy) qui nous manque actuellement. Voulez-vous que je valide cette approche ?**