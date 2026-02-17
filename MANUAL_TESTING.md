# Manuel de Tests - TypeScript Workflows (Phase 5-6)

## 🎯 Objectif
Vérifier que toutes les fonctionnalités TypeScript workflows fonctionnent correctement après l'implémentation des phases 5 et 6.

---

## ✅ Checklist Globale

- [x] 1. Base de connaissances Skills - Index & Recherche
- [x] 2. Conversion à la volée (Workflows JSON → TS)
- [x] 2.5. Documentation TypeScript pour l'IA (Skills)
- [ ] 3. CLI convert - Reverse (TS → JSON)
- [ ] 4. CLI convert - Batch
- [ ] 5. Skills validate - TypeScript workflow
- [ ] 6. Sync package - .workflow.ts files
- [ ] 7. Documentation - Docusaurus build
- [ ] 8. End-to-end workflow

---

## 📚 Test 1: Base de Connaissances Skills (Index & Recherche)

**Objectif:** Vérifier que la base de connaissances (index) est accessible et que la CLI peut trouver des workflows.

### Étapes

1. **Vérifier l'existence et la taille de l'index:**
   ```bash
   cd /home/etienne/repos/n8n-as-code
   ls -lh packages/skills/src/assets/workflows-index.json
   ```
   ✅ Attendu: Fichier existe (> 5MB).
   *Note: L'index contient les métadonnées JSON brut (source n8n.io). La conversion TypeScript se fait à la volée lors de l'installation/utilisation.*

2. **Inspecter le contenu (Métadonnées):**
   ```bash
   cd packages/skills
   node -p "require('./src/assets/workflows-index.json').totalWorkflows"
   ```
   ✅ Attendu: > 7000 workflows.

3. **Tester la recherche via CLI (n8n-as-code/skills):**
   ```bash
   # Utiliser le shim ou le build direct
   cd packages/skills
   npm run build
   node dist/cli.js search "google sheets"
   ```
   ✅ Attendu: Liste de workflows avec IDs et noms.

### Critères de Succès
- [x] ✅ L'index est généré et contient > 7000 entrées.
- [x] ✅ La CLI peut lire l'index et effectuer une recherche.

---

## 🔄 Test 2: Conversion à la volée (CLI)

**Objectif:** Vérifier que la conversion JSON → TypeScript fonctionne "à la volée" (On-Demand).

### Étapes

1. **Convertir un fichier local (JSON → TS):**
   ```bash
   cd packages/cli
   npm run build
   # Convertir l'exemple social-post-assistant
   node dist/index.js convert ../../generated-workflows-examples/social-post-assistant.json --output ./social-post.ts
   ```
   ✅ Attendu:
   - Message de succès.
   - Fichier `./social-post.ts` créé.

2. **Vérifier le fichier converti:**
   ```bash
   head -n 20 ./social-post.ts
   grep "import { workflow" ./social-post.ts
   ```
   ✅ Attendu:
   - Contenu TypeScript valide.
   - Imports corrects.

3. **(Optionnel) Convertir un workflow distant (via ID) - Testé avec ID 5424:**
   ```bash
   cd packages/skills
   node dist/cli.js workflows install 5424 --typescript --output /tmp/workflow-remote.ts
   ```
   ✅ Attendu: Téléchargement et conversion réussie.

### Critères de Succès
- [x] ✅ Conversion locale fonctionnelle (JSON -> TS).
- [x] ✅ Conversion distante fonctionnelle (ID -> TS).


---

## � Test 2.5: Documentation TypeScript pour l'IA (Skills)

**Objectif:** Vérifier que toutes les commandes de documentation retournent du TypeScript pour l'agent IA.

### Étapes

1. **Tester la commande `schema` (Snippet rapide):**
   ```bash
   cd packages/skills
   node dist/cli.js schema googleSheets
   ```
   ✅ Attendu:
   - Code TypeScript avec décorateur `@node()`
   - Paramètres avec valeurs par défaut et types
   - Import de `@n8n-as-code/transformer`

2. **Tester la commande `get` (Documentation complète):**
   ```bash
   node dist/cli.js get googleSheets
   ```
   ✅ Attendu:
   - Interface TypeScript des paramètres
   - Exemple de code complet avec décorateur
   - Commentaires JSDoc avec mots-clés et opérations

3. **Tester la commande `search` (Résultats formatés):**
   ```bash
   node dist/cli.js search "http request"
   ```
   ✅ Attendu:
   - Snippets TypeScript pour les nœuds trouvés
   - Section séparée pour la documentation
   - Format prêt à copier-coller

4. **Vérifier le format JSON (fallback):**
   ```bash
   node dist/cli.js schema googleSheets --json
   node dist/cli.js get googleSheets --json
   node dist/cli.js search "http request" --json
   ```
   ✅ Attendu: Sortie JSON (pour compatibilité legacy ou parsing)

### Critères de Succès
- [x] ✅ Commande `schema` retourne du TypeScript par défaut
- [x] ✅ Commande `get` génère interface + exemple de code
- [x] ✅ Commande `search` formate les résultats en TypeScript
- [x] ✅ Option `--json` disponible pour compatibilité legacy

---

## �🔄 Test 3: CLI Convert - Reverse (TypeScript → JSON)

**Objectif:** Convertir un workflow TypeScript → JSON

### Étapes

1. **Convertir TypeScript → JSON:**
   ```bash
   cd packages/cli
   node dist/index.js convert /tmp/test-workflow.ts -o /tmp/test-workflow-back.json
   ```
   ✅ Attendu: Message de succès

2. **Vérifier le contenu JSON:**
   ```bash
   head -30 /tmp/test-workflow-back.json
   jq '.id, .name, .nodes | length' /tmp/test-workflow-back.json
   ```
   ✅ Attendu:
   - JSON valide
   - ID et name présents
   - Nombre de nodes correct

3. **Comparer avec l'original (structure):**
   ```bash
   jq 'keys | sort' generated-workflows-examples/social-post-assistant.json > /tmp/original-keys.txt
   jq 'keys | sort' /tmp/test-workflow-back.json > /tmp/converted-keys.txt
   diff /tmp/original-keys.txt /tmp/converted-keys.txt
   ```
   ✅ Attendu: Mêmes clés principales (nodes, connections, settings, etc.)

### Critères de Succès
- ✅ JSON valide généré
- ✅ Structure préservée
- ✅ Données cohérentes

---

## 📦 Test 4: CLI Convert - Batch

**Objectif:** Convertir un répertoire entier

### Étapes

1. **Préparer un répertoire de test:**
   ```bash
   mkdir -p /tmp/batch-test
   cp generated-workflows-examples/social-post-assistant.json /tmp/batch-test/
   ls /tmp/batch-test/
   ```

2. **Conversion batch JSON → TypeScript:**
   ```bash
   cd packages/cli
   node dist/index.js convert-batch /tmp/batch-test --format typescript
   ```
   ✅ Attendu:
   - Message "Found X file(s) to convert"
   - Message de succès pour chaque fichier
   - Summary: "Converted: X"

3. **Vérifier les fichiers générés:**
   ```bash
   ls -lh /tmp/batch-test/
   ```
   ✅ Attendu:
   - Fichier `.workflow.ts` créé
   - Fichier `.json` toujours présent

4. **Conversion batch TypeScript → JSON:**
   ```bash
   rm /tmp/batch-test/*.json
   node dist/index.js convert-batch /tmp/batch-test --format json
   ls -lh /tmp/batch-test/
   ```
   ✅ Attendu: Fichiers JSON recréés

### Critères de Succès
- ✅ Batch conversion fonctionne
- ✅ Plusieurs fichiers traités correctement
- ✅ Bidirectionnel (TS→JSON et JSON→TS)

---

## ✅ Test 5: Skills Validate - TypeScript Workflow

**Objectif:** Valider un workflow TypeScript avec n8nac-skills

### Étapes

1. **Valider le workflow TypeScript généré:**
   ```bash
   cd packages/skills
   npm run build
   node dist/cli.js validate /tmp/test-workflow.ts
   ```
   ✅ Attendu:
   - Message de succès ou liste des erreurs
   - Pas d'erreur de parsing TypeScript

2. **Valider un workflow JSON (pour comparaison):**
   ```bash
   node dist/cli.js validate ../../generated-workflows-examples/social-post-assistant.json
   ```
   ✅ Attendu: Même type de validation

### Critères de Succès
- ✅ Validation TypeScript fonctionne
- ✅ Détecte les erreurs correctement

---

## 📥 Test 6: Skills Workflows Install --typescript

**Objectif:** Télécharger un workflow au format TypeScript

### Étapes

1. **Chercher un workflow intéressant:**
   ```bash
   cd packages/skills
   node dist/cli.js workflows search "chatbot" --limit 3
   ```

2. **Installer en TypeScript:**
   ```bash
   node dist/cli.js workflows install <ID> --typescript -o /tmp/downloaded-workflow.ts
   ```
   ✅ Attendu:
   - Workflow téléchargé
   - Format TypeScript
   - Fichier `.workflow.ts` créé

3. **Vérifier le contenu:**
   ```bash
   head -50 /tmp/downloaded-workflow.ts
   ```
   ✅ Attendu: Code TypeScript valide avec décorateurs

### Critères de Succès
- ✅ Download + conversion automatique fonctionne
- ✅ Flag --typescript respecté

---

## 🔄 Test 7: Sync Package - Fichiers .workflow.ts

**Objectif:** Vérifier que le sync fonctionne avec les fichiers TypeScript

### Étapes

1. **Vérifier les tests unitaires passent:**
   ```bash
   cd packages/sync
   npm run test:unit
   ```
   ✅ Attendu: 28/28 tests passing

2. **Créer un workflow TypeScript dans un dossier de test:**
   ```bash
   mkdir -p /tmp/sync-test
   cp /tmp/test-workflow.ts /tmp/sync-test/my-workflow.workflow.ts
   ```

3. **Tester la lecture du workflow:**
   ```bash
   cd packages/sync
   node -e "
   const { WorkflowTransformerAdapter } = require('./dist/services/workflow-transformer-adapter.js');
   const fs = require('fs');
   const tsCode = fs.readFileSync('/tmp/sync-test/my-workflow.workflow.ts', 'utf8');
   WorkflowTransformerAdapter.compileToJson(tsCode).then(json => {
     console.log('ID:', json.id);
     console.log('Name:', json.name);
     console.log('Nodes:', json.nodes.length);
   });
   "
   ```
   ✅ Attendu: Affichage des métadonnées du workflow

### Critères de Succès
- ✅ Tests unitaires passent
- ✅ Lecture TypeScript fonctionne
- ✅ Hash computation fonctionne

---

## 📖 Test 8: Documentation Docusaurus

**Objectif:** Vérifier que la documentation se construit et affiche correctement

### Étapes

1. **Build de la documentation:**
   ```bash
   cd docs
   npm run build
   ```
   ✅ Attendu: Build réussit sans erreurs

2. **Vérifier que la page TypeScript est générée:**
   ```bash
   ls -lh build/docs/usage/typescript-workflows/index.html
   ```
   ✅ Attendu: Fichier HTML existe

3. **Vérifier le sidebar:**
   ```bash
   grep -A5 "TypeScript" build/docs/usage/index.html
   ```
   ✅ Attendu: Lien vers la page TypeScript workflows

4. **Servir localement (optionnel):**
   ```bash
   npm run serve
   # Ouvrir http://localhost:3000/n8n-as-code/docs/usage/typescript-workflows
   ```
   ✅ Attendu: Page accessible et bien formatée

### Critères de Succès
- ✅ Documentation build sans erreur
- ✅ Page TypeScript accessible
- ✅ Navigation sidebar correcte

---

## 🎬 Test 9: End-to-End Workflow

**Objectif:** Test complet du cycle de vie d'un workflow

### Scénario Complet

```bash
# 1. Partir d'un workflow JSON
cd /home/etienne/repos/n8n-as-code
cp generated-workflows-examples/social-post-assistant.json /tmp/e2e-test.json

# 2. Convertir en TypeScript
cd packages/cli
node dist/index.js convert /tmp/e2e-test.json -o /tmp/e2e-test.ts

# 3. Valider le TypeScript
cd ../skills
node dist/cli.js validate /tmp/e2e-test.ts

# 4. Modifier le workflow TypeScript (changement manuel)
# Éditer /tmp/e2e-test.ts et changer le nom du workflow

# 5. Re-convertir en JSON
cd ../cli
node dist/index.js convert /tmp/e2e-test.ts -o /tmp/e2e-test-modified.json

# 6. Vérifier que la modification est présente
jq '.name' /tmp/e2e-test-modified.json

# 7. Calculer le hash (pour sync)
cd ../sync
node -e "
const { WorkflowTransformerAdapter } = require('./dist/services/workflow-transformer-adapter.js');
const fs = require('fs');
const tsCode = fs.readFileSync('/tmp/e2e-test.ts', 'utf8');
WorkflowTransformerAdapter.hashWorkflow(tsCode).then(hash => {
  console.log('Hash:', hash);
});
"
```

### Critères de Succès
- ✅ Cycle complet JSON→TS→modification→JSON fonctionne
- ✅ Modifications préservées
- ✅ Hash calculable

---

## 📊 Résumé des Tests

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 1 | Base connaissances Skills | ⏳ | À tester |
| 2 | CLI convert single | ⏳ | À tester |
| 3 | CLI convert reverse | ⏳ | À tester |
| 4 | CLI convert batch | ⏳ | À tester |
| 5 | Skills validate TS | ⏳ | À tester |
| 6 | Skills install --typescript | ⏳ | À tester |
| 7 | Sync .workflow.ts | ⏳ | À tester |
| 8 | Docs Docusaurus | ⏳ | À tester |
| 9 | End-to-end workflow | ⏳ | À tester |

---

## 🐛 Bugs Trouvés

_(Section à remplir pendant les tests)_

### Bug #1
- **Description:** 
- **Reproduction:** 
- **Fix:** 

---

## ✅ Validation Finale

Une fois tous les tests passés, vérifier:
- [ ] Tous les tests automatiques passent (79/79)
- [ ] Tous les tests manuels passés
- [ ] Documentation à jour
- [ ] README mis à jour
- [ ] Pas de régression sur fonctionnalités existantes
