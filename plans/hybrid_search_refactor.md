# Plan de Recherche Hybride : Deep & Wide

## 1. La Problématique
- **`search` (via `KnowledgeSearch`)** : Rapide, mais superficiel. Si le terme n'est pas dans le titre ou les mots-clés, il échoue.
- **`docs --search` (via `DocsProvider`)** : Cherche dans le contenu complet, mais uniquement pour la documentation, et est trop lent car il relit tout le JSON de 40MB à chaque fois.

## 2. La Solution : Recherche Multi-Niveaux Unifiée
Nous allons modifier `KnowledgeSearch` pour qu'il devienne l'unique chef d'orchestre, capable de fouiller dans les deux sources avec une stratégie de "failover" et de "complétion" :

### Stratégie de Recherche Unifiée
1. **Niveau 1 : Recherche "Wide" (Index Rapide)**
   - Recherche sur les titres, noms de nœuds et mots-clés (via `n8n-knowledge-index.json`).
   - Recherche par termes fragmentés ("generate image" -> `generate` AND `image`).
   - C'est ce qui donne les résultats instantanés.

2. **Niveau 2 : Recherche "Deep" (Full-Text)**
   - Si les résultats du Niveau 1 sont insuffisants ou pour enrichir le score, `KnowledgeSearch` interroge `DocsProvider` pour fouiller dans le markdown complet (`n8n-docs-complete.json`).
   - Cela garantit qu'on ne rate rien (ex: "NanoBanana" cité dans un tutoriel au milieu d'un paragraphe).

### Unification des Commandes
- **`search <query>`** : Devient la commande ultime. Elle renvoie un mix pondéré de nœuds et de pages de doc.
- **`docs --search`** : Devient obsolète ou un alias vers `search --type documentation`.

## 3. Optimisation Mémoire & Performance
Charger un JSON de 40MB (`n8n-docs-complete.json`) à chaque recherche peut être lourd.
- **Lazy Loading** : On ne charge le gros fichier de connaissance complète que si la recherche "Wide" ne donne pas assez de résultats de haute qualité.
- **Scoring Pondéré** : 
   - Match Titre : 100 pts
   - Match Mots-clés : 50 pts
   - Match Contenu (Full-text) : 10 pts (mais permet de trouver des pépites cachées).

## 4. Ce qui va changer pour l'IA (Cursor/Cline)
L'IA n'aura plus besoin de se poser la question "Dois-je utiliser `search` ou `docs --search`?".
Elle fera systématiquement :
`./n8n-agent search "mon besoin complexe"`
Et le système lui répondra : "J'ai trouvé ce nœud qui semble correspondre (90%) et ce tutoriel qui en parle en détail (70%)".

**Est-ce que cette approche hybride (Index pour la vitesse + Full-text pour l'exhaustivité) répond mieux à votre attente ?**