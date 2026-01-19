# Stratégie de Sérialisation FlexSearch pour n8n-as-code

## 1. La Contrainte de FlexSearch
FlexSearch ne permet pas de sauvegarder un index complet d'un seul bloc via un simple `JSON.stringify`. Il utilise une architecture asynchrone où l'index est découpé en plusieurs clés (segments).

## 2. Le Processus de Sérialisation (Build Time)
Dans `build-knowledge-index.cjs`, nous allons implémenter un exportateur personnalisé :
1. **Initialisation** : Créer un index FlexSearch avec les options optimisées (tokenizer: "forward", context: true pour la recherche de phrases).
2. **Indexation** : Ajouter tous les nœuds et toutes les pages de documentation.
3. **Export par Segments** :
   - FlexSearch fournit une fonction `export(key, value)`.
   - Nous allons capturer chaque segment généré et les stocker dans un objet JSON structuré :
     ```json
     {
       "reg": "{...}", // Registre de l'index
       "cfg": "{...}", // Configuration
       "map": "{...}", // Mapping ID -> Document
       "ctx": { "0": "...", "1": "..." } // Segments contextuels (le cœur de l'index)
     }
     ```
4. **Fichier de Sortie** : Enregistrer cet objet dans `n8n-knowledge-index.json`.

## 3. Le Processus de Désérialisation (Runtime)
Dans `KnowledgeSearch.ts` :
1. **Chargement** : Lire le fichier JSON.
2. **Réhydratation** :
   - Créer une nouvelle instance FlexSearch vide.
   - Utiliser `index.import(key, data)` pour réinjecter chaque segment du JSON dans l'instance.
3. **Recherche** : L'index est prêt à l'emploi en mémoire, avec toute la puissance du moteur FlexSearch.

## 4. Avantages de cette approche
- **Transportable** : Un seul fichier JSON standard compatible avec NPM et VS Code.
- **Rapide** : La réhydratation est beaucoup plus rapide que de ré-indexer 1200 pages à chaque démarrage.
- **Efficace** : FlexSearch ne charge que les segments nécessaires pour la recherche.

## 5. Alternative "Zero-Réhydratation"
Si le fichier JSON devient trop gros (> 20MB), nous pouvons aussi stocker les segments dans des fichiers séparés (`index.cfg.json`, `index.ctx.1.json`, etc.) et ne charger que ceux demandés, mais pour 1200 pages, un fichier unique de ~10-15MB restera très performant.

**Est-ce que cette gestion par segmentation vous semble claire et robuste ?**