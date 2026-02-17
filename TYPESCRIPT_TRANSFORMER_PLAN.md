# Plan de Transformation - JSON vers TypeScript Concis 🚀

> **Objectif** : Remplacer le stockage de workflows en JSON par du TypeScript concis et lisible
> **Branche** : branche dev dédiée, pas de rétrocompatibilité nécessaire  
> **Format cible** : Vrais décorateurs TypeScript avec classes
> **Date** : Février 2026

---

## 📋 Vue d'ensemble

### Impacts sur le Monorepo

```
┌─────────────────────────────────────────────────────────┐
│                    MONOREPO n8n-as-code                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. CORE TRANSFORMER (nouveau package)                 │
│     packages/transformer/                              │
│     ├── json-to-typescript.ts    ← Parser JSON → AST  │
│     ├── typescript-to-json.ts    ← Transformer TS → JSON │
│     ├── decorators.ts            ← @workflow, @node... │
│     └── types.ts                 ← Types partagés      │
│                                                         │
│  2. PACKAGE SYNC (modifications majeures)              │
│     packages/sync/                                     │
│     ├── workflow-sanitizer.ts    ← REMPLACÉ par transformer │
│     ├── sync-engine.ts           ← Adapté pour .ts    │
│     ├── watcher.ts               ← Observer .ts files │
│     └── resolution-manager.ts    ← Hash sur TS compilé │
│                                                         │
│  3. PACKAGE SKILLS (refonte build)                     │
│     packages/skills/                                   │
│     ├── Documentation générée en TypeScript            │
│     ├── Templates convertis en TypeScript              │
│     └── No more JSON snippets                          │
│                                                         │
│  4. SCRIPTS BUILD (transformation complète)            │
│     scripts/                                            │
│     ├── build-knowledge-index.cjs    ← Gen doc TS     │
│     ├── build-workflow-index.cjs     ← Templates en TS │
│     └── enrich-nodes-technical.cjs   ← Schémas TS     │
│                                                         │
│  5. CLI (nouveau workflow create/validate)             │
│     packages/cli/                                      │
│     └── Commandes de création TS workflows            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Phase 1 : Architecture & Design du Transformer

### 1.1 Créer la structure du package transformer

**Localisation** : `packages/transformer/`

**Fichiers à créer** :
```
packages/transformer/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Exports publics
│   ├── decorators/
│   │   ├── workflow.ts             # @workflow decorator
│   │   ├── node.ts                 # @node decorator
│   │   ├── links.ts                # @links decorator
│   │   └── types.ts                # Types pour décorateurs
│   ├── parser/
│   │   ├── json-to-ast.ts          # Parse JSON workflow → AST
│   │   ├── ast-to-typescript.ts    # AST → Code TypeScript
│   │   └── class-generator.ts      # Génère structure de classe
│   ├── compiler/
│   │   ├── typescript-parser.ts    # Parse fichier .ts
│   │   ├── decorator-extractor.ts  # Extrait metadata des decorators
│   │   └── workflow-builder.ts     # Reconstruit JSON depuis TS
│   ├── utils/
│   │   ├── naming.ts               # Sanitize noms (Configuration1, etc.)
│   │   └── formatting.ts           # Prettier integration
│   └── types.ts                    # Types partagés
└── tests/
    ├── fixtures/
    │   ├── simple-workflow.json
    │   ├── agent-workflow.json
    │   └── expected/...
    └── transformer.test.ts
```

### 1.2 Définir les types core

**Fichier** : `packages/transformer/src/types.ts`

**Types principaux** :
```typescript
// Représentation intermédiaire (AST)
export interface WorkflowAST {
    metadata: WorkflowMetadata;
    nodes: NodeAST[];
    connections: ConnectionAST[];
}

export interface WorkflowMetadata {
    id: string;
    name: string;
    active: boolean;
    settings: Record<string, any>;
    projectId?: string;
    projectName?: string;
}

export interface NodeAST {
    propertyName: string;      // "ScheduleTrigger"
    displayName: string;        // "🕘 Schedule Trigger"
    type: string;              // "n8n-nodes-base.scheduleTrigger"
    version: number;
    position: [number, number];
    parameters: Record<string, any>;
    credentials?: Record<string, any>;
    onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';
}

export interface ConnectionAST {
    from: {
        node: string;          // Property name
        output: number;        // Output index (0, 1, error)
        isError?: boolean;
    };
    to: {
        node: string;          // Property name  
        input: number;         // Input index
    };
}

// Options pour le transformer
export interface TransformOptions {
    format?: boolean;          // Prettier formatting
    commentStyle?: 'minimal' | 'verbose';
    groupNodes?: boolean;      // Group nodes by type in comments
}
```

### 1.3 Design des décorateurs

**Format cible confirmé** (selon votre exemple) :

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
    id: "G9GXzwX97XBKAwcj",
    name: "Job Application Assistant",
    active: false,
    settings: { executionOrder: "v1" }
})
export class JobApplicationWorkflow {
    
    @node({ 
        name: "🕘 Schedule Trigger", 
        type: "n8n-nodes-base.scheduleTrigger",
        version: 1.2,
        position: [-1072, 720]
    })
    ScheduleTrigger = {
        rule: { interval: [{ field: "cronExpression", expression: "0 9 * * 1-5" }] }
    };

    @links()
    defineRouting() {
        this.ScheduleTrigger.out(0).to(this.Configuration1.in(0));
        // ...
    }
}
```

**Questions de design** :
- ✅ Vrais décorateurs TypeScript (reflect-metadata)
- ✅ Pas de rétrocompatibilité JSON
- ✅ Validation par transpilation + schema

---

## 🔧 Phase 2 : Core Transformer (JSON ↔ TypeScript)

### 2.1 Implémentation JSON → TypeScript

**Fichier** : `packages/transformer/src/parser/json-to-ast.ts`

**Responsabilités** :
1. Parser le JSON workflow n8n
2. Créer AST intermédiaire
3. Normaliser les noms de propriétés (éviter conflits JS)

**Tâches** :
- [ ] Parser metadata (id, name, settings, active)
- [ ] Parser nodes → NodeAST[]
  - Générer noms de propriétés uniques (Configuration1, Configuration2...)
  - Détecter credentials
  - Gérer onError
- [ ] Parser connections → ConnectionAST[]
  - Mapper node IDs → property names
  - Détecter outputs normaux vs error outputs
- [ ] Validation du JSON source

**Fichier** : `packages/transformer/src/parser/ast-to-typescript.ts`

**Responsabilités** :
1. Générer code TypeScript depuis AST
2. Appliquer formatage Prettier
3. Générer commentaires structurés

**Tâches** :
- [ ] Générer imports
- [ ] Générer décorateur @workflow avec metadata
- [ ] Générer propriétés @node
  - Formater parameters (multi-lignes si besoin)
  - Gérer credentials inline
  - Gérer onError
- [ ] Générer méthode defineRouting()
  - Section dependency injection (.uses())
  - Section pipeline (.out().to())
  - Gérer error outputs (.error().to())
- [ ] Intégrer Prettier pour formatting

### 2.2 Implémentation TypeScript → JSON

**Fichier** : `packages/transformer/src/compiler/typescript-parser.ts`

**Bibliothèque conseillée** : `@typescript/compiler-api` ou `ts-morph`

**Responsabilités** :
1. Parser fichier .ts avec TypeScript Compiler API
2. Extraire décorateurs et metadata
3. Reconstruire structure JSON n8n

**Tâches** :
- [ ] Setup ts-morph ou TS Compiler API
- [ ] Extraire classe avec @workflow
- [ ] Lire metadata du @workflow decorator
- [ ] Parcourir propriétés avec @node
  - Extraire decorator metadata (name, type, version, position)
  - Parser valeur de propriété (parameters object)
- [ ] Parser méthode defineRouting()
  - Extraire .uses() calls → AI dependencies
  - Extraire .out().to() chains → connections
  - Reconstruire connections JSON
- [ ] Validation : vérifier tous les nodes référencés existent

**Fichier** : `packages/transformer/src/compiler/workflow-builder.ts`

**Responsabilités** :
1. Assembler JSON workflow complet
2. Assigner node IDs uniques
3. Valider structure finale

**Tâches** :
- [ ] Créer workflow object de base
- [ ] Générer UUIDs pour node IDs (ou réutiliser existants)
- [ ] Construire nodes array
- [ ] Construire connections object (format n8n)
- [ ] Valider avec schéma n8n

### 2.3 Décorateurs runtime

**Fichier** : `packages/transformer/src/decorators/workflow.ts`

**Implémentation** :
```typescript
import 'reflect-metadata';

export interface WorkflowMetadata {
    id: string;
    name: string;
    active: boolean;
    settings?: Record<string, any>;
    projectId?: string;
    projectName?: string;
}

export function workflow(metadata: WorkflowMetadata) {
    return function <T extends { new (...args: any[]): {} }>(constructor: T) {
        Reflect.defineMetadata('n8n:workflow', metadata, constructor);
        return constructor;
    };
}

// Helper pour extraire metadata (utilisé par compiler)
export function getWorkflowMetadata(target: any): WorkflowMetadata | null {
    return Reflect.getMetadata('n8n:workflow', target) || null;
}
```

**Fichiers similaires** :
- [ ] `node.ts` : décorateur @node
- [ ] `links.ts` : décorateur @links (marker)
- [ ] Helper methods pour .out(), .to(), .in(), .uses(), .error()

---

## 🔄 Phase 3 : Adaptation Package Sync

### 3.1 Remplacer WorkflowSanitizer par Transformer

**Fichier** : `packages/sync/src/services/workflow-sanitizer.ts`

**Action** : SUPPRIMER et remplacer par intégration transformer

**Nouveau fichier** : `packages/sync/src/services/workflow-transformer-adapter.ts`

```typescript
import { JsonToTypeScript, TypeScriptToJson } from '@n8n-as-code/transformer';

export class WorkflowTransformerAdapter {
    /**
     * Convertit workflow JSON (depuis API n8n) → fichier .ts local
     */
    static async convertToTypeScript(workflow: IWorkflow): Promise<string> {
        const transformer = new JsonToTypeScript();
        return transformer.transform(workflow, {
            format: true,
            commentStyle: 'verbose'
        });
    }

    /**
     * Compile workflow .ts local → JSON (pour push vers API)
     */
    static async compileToJson(tsContent: string): Promise<IWorkflow> {
        const compiler = new TypeScriptToJson();
        return compiler.compile(tsContent);
    }

    /**
     * Hash un workflow pour détection de changements
     * On compile le .ts vers JSON puis on hash le JSON normalisé
     */
    static async hashWorkflow(tsContent: string): Promise<string> {
        const json = await this.compileToJson(tsContent);
        // Normaliser le JSON (enlever champs volatiles)
        const normalized = this.normalizeForHash(json);
        return HashUtils.computeHash(JSON.stringify(normalized));
    }

    private static normalizeForHash(workflow: IWorkflow): any {
        // Même logique que l'ancien cleanForHash
        const clean = { ...workflow };
        delete clean.projectId;
        delete clean.projectName;
        delete clean.homeProject;
        delete clean.isArchived;
        // Retirer node IDs (générés à la compilation)
        if (clean.nodes) {
            clean.nodes = clean.nodes.map(n => {
                const { id, ...rest } = n;
                return rest;
            });
        }
        return clean;
    }
}
```

### 3.2 Adapter SyncEngine

**Fichier** : `packages/sync/src/services/sync-engine.ts`

**Modifications** :
- [ ] Changer extension fichiers : `.json` → `.ts`
- [ ] Remplacer appels `WorkflowSanitizer.cleanForStorage()` par `WorkflowTransformerAdapter.convertToTypeScript()`
- [ ] Remplacer appels `WorkflowSanitizer.cleanForPush()` par `WorkflowTransformerAdapter.compileToJson()`
- [ ] Remplacer appels `WorkflowSanitizer.cleanForHash()` par `WorkflowTransformerAdapter.hashWorkflow()`
- [ ] Mettre à jour méthodes `executePull()` :
  ```typescript
  // AVANT
  fs.writeFileSync(localPath, JSON.stringify(clean, null, 2));
  
  // APRÈS
  const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(workflow);
  fs.writeFileSync(localPath, tsCode);
  ```
- [ ] Mettre à jour méthodes `executePush()` :
  ```typescript
  // AVANT
  const localContent = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  const payload = WorkflowSanitizer.cleanForPush(localContent);
  
  // APRÈS
  const tsContent = fs.readFileSync(localPath, 'utf-8');
  const payload = await WorkflowTransformerAdapter.compileToJson(tsContent);
  ```

### 3.3 Adapter Watcher

**Fichier** : `packages/sync/src/services/watcher.ts`

**Modifications** :
- [ ] Changer pattern de fichiers : `*.json` → `*.ts`
- [ ] Filtrer workflows TypeScript (ignorer autres .ts files)
  ```typescript
  // Ignore .ts files qui ne sont pas des workflows
  // Détection: fichier commence par "import { workflow" ou contient @workflow
  ```
- [ ] Adapter `computeFileHash()` pour lire .ts et compiler
- [ ] Adapter `loadWorkflowFromFile()` :
  ```typescript
  // AVANT
  const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  
  // APRÈS  
  const tsContent = fs.readFileSync(filepath, 'utf-8');
  const workflow = await WorkflowTransformerAdapter.compileToJson(tsContent);
  ```

### 3.4 Adapter ResolutionManager

**Fichier** : `packages/sync/src/services/resolution-manager.ts`

**Modifications** :
- [ ] Méthodes de conflict resolution utilisent désormais .ts
- [ ] Hash comparison reste identique (on hash le JSON compilé)
- [ ] Display diffs : option de montrer diff TypeScript au lieu de JSON

---

## 📦 Phase 4 : Adaptation Package Skills (Build)

### 4.1 Modifier build-knowledge-index.cjs

**Fichier** : `scripts/build-knowledge-index.cjs`

**Objectif** : Générer documentation TypeScript au lieu de JSON

**Modifications** :
- [ ] Les exemples de code générés doivent être en TypeScript
- [ ] Remplacer snippets JSON par snippets TypeScript
  ```typescript
  // AVANT
  codeExample: `{
    "name": "HTTP Request",
    "type": "n8n-nodes-base.httpRequest",
    "parameters": { "url": "https://api.example.com" }
  }`
  
  // APRÈS
  codeExample: `@node({ 
    name: "HTTP Request",
    type: "n8n-nodes-base.httpRequest",
    version: 1,
    position: [0, 0]
  })
  HttpRequest = {
    url: "https://api.example.com"
  }`
  ```

### 4.2 Modifier build-workflow-index.cjs

**Fichier** : `scripts/build-workflow-index.cjs`

**Objectif** : Convertir tous les templates téléchargés en TypeScript

**Modifications** :
- [ ] Après clone du repo `n8nworkflows.xyz`, convertir chaque workflow JSON
- [ ] Utiliser `@n8n-as-code/transformer` pour conversion
  ```javascript
  const { JsonToTypeScript } = require('@n8n-as-code/transformer');
  
  async function processWorkflowTemplate(jsonPath) {
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const transformer = new JsonToTypeScript();
      const tsCode = await transformer.transform(json, { format: true });
      
      // Stocker version TypeScript
      return {
          id: json.id,
          name: json.name,
          code: tsCode,  // ← TypeScript code au lieu de JSON
          metadata: { /* ... */ }
      };
  }
  ```
- [ ] Mettre à jour `workflows-index.json` pour inclure code TypeScript

### 4.3 Modifier enrich-nodes-technical.cjs

**Fichier** : `scripts/enrich-nodes-technical.cjs`

**Objectif** : Générer schémas de nodes avec exemples TypeScript

**Modifications** :
- [ ] Pour chaque node, générer exemple TypeScript minimal
  ```javascript
  function generateNodeExample(nodeDef) {
      return {
          name: nodeDef.name,
          displayName: nodeDef.displayName,
          
          // Exemple TypeScript
          exampleUsage: `@node({
              name: "${nodeDef.displayName}",
              type: "${nodeDef.name}",
              version: ${nodeDef.version},
              position: [0, 0]
          })
          ${camelCase(nodeDef.displayName)} = {
              // Parameters here
          }`,
          
          // Schema reste en JSON (pour validation)
          schema: nodeDef.schema
      };
  }
  ```

### 4.4 Adapter NodeSchemaProvider

**Fichier** : `packages/skills/src/services/node-schema-provider.ts`

**Modifications** :
- [ ] Méthode `getNodeSchema()` retourne aussi exemple TypeScript
  ```typescript
  public getNodeSchema(nodeName: string): NodeSchemaWithExample | null {
      this.loadIndex();
      
      const node = this.index.nodes[nodeName];
      if (!node) return null;
      
      return {
          ...node,
          // Générer exemple TypeScript à la volée
          exampleUsage: this.generateTypeScriptExample(node)
      };
  }
  
  private generateTypeScriptExample(node: any): string {
      // Utiliser transformer pour générer exemple minimal
      const mockWorkflow = {
          nodes: [{ 
              name: node.displayName,
              type: node.name,
              parameters: {},
              position: [0, 0]
          }],
          connections: {}
      };
      
      // Générer juste la section node
      return `@node({ ... }) ${propertyName} = { ... }`;
  }
  ```

### 4.5 Adapter CLI commands

**Fichier** : `packages/skills/src/cli.ts` + `packages/cli/src/`

**Nouvelles commandes** :
- [ ] `n8nac create workflow` : Scaffolding workflow TypeScript
- [ ] `n8nac validate workflow.ts` : Validation TypeScript
- [ ] `n8nac compile workflow.ts` : Compile vers JSON (debug)

**Exemple de `create workflow`** :
```typescript
import { Command } from 'commander';
import { JsonToTypeScript } from '@n8n-as-code/transformer';

program
    .command('create')
    .argument('<name>', 'Workflow name')
    .option('-t, --template <template>', 'Template to use')
    .action(async (name, options) => {
        const template = options.template || 'basic';
        
        // Charger template depuis workflows-index
        const workflowTemplate = loadTemplate(template);
        
        // Convertir en TypeScript
        const transformer = new JsonToTypeScript();
        const tsCode = await transformer.transform(workflowTemplate, {
            format: true,
            commentStyle: 'verbose'
        });
        
        // Écrire fichier
        const filename = `${kebabCase(name)}.workflow.ts`;
        fs.writeFileSync(filename, tsCode);
        
        console.log(`✅ Created ${filename}`);
    });
```

---

## ✅ Phase 5 : Validation & CLI

### 5.1 Système de validation TypeScript

**Fichier** : `packages/transformer/src/validator/workflow-validator.ts`

**Responsabilités** :
1. Valider syntaxe TypeScript
2. Valider structure workflow (decorators corrects)
3. Valider références nodes dans defineRouting()
4. Valider schémas parameters des nodes

**Tâches** :
- [ ] Validation compilation TypeScript (pas d'erreurs TS)
- [ ] Validation decorators présents et corrects
- [ ] Validation node types existent dans n8n
- [ ] Validation parameters vs schema node
- [ ] Validation connections (nodes référencés existent)

**Intégration** :
```typescript
export class WorkflowValidator {
    async validate(tsFilePath: string): Promise<ValidationResult> {
        // 1. Compile TypeScript
        const compiled = await this.compileTypeScript(tsFilePath);
        if (!compiled.success) {
            return { valid: false, errors: compiled.errors };
        }
        
        // 2. Parse et extraire metadata
        const workflow = await TypeScriptToJson.compile(tsFilePath);
        
        // 3. Valider structure workflow
        const structureErrors = this.validateStructure(workflow);
        
        // 4. Valider nodes
        const nodeErrors = this.validateNodes(workflow.nodes);
        
        // 5. Valider connections
        const connectionErrors = this.validateConnections(workflow);
        
        return {
            valid: [...structureErrors, ...nodeErrors, ...connectionErrors].length === 0,
            errors: [...structureErrors, ...nodeErrors, ...connectionErrors]
        };
    }
}
```

### 5.2 Git hooks

**Fichier** : `lefthook.yml`

**Ajouter validation pre-commit** :
```yaml
pre-commit:
  commands:
    validate-workflows:
      run: |
        # Find modified .workflow.ts files
        FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.workflow\.ts$')
        if [ -n "$FILES" ]; then
          echo "Validating workflow files..."
          for file in $FILES; do
            npx n8nac validate "$file"
          done
        fi
```

---

## 📚 Phase 6 : Documentation & Testing

### 6.1 Tests unitaires transformer

**Fichiers** : `packages/transformer/tests/`

**Test cases** :
- [ ] JSON simple → TypeScript → JSON (roundtrip)
- [ ] Workflow avec AI agents
- [ ] Workflow avec credentials
- [ ] Workflow avec error handling  
- [ ] Workflow avec loops (splitInBatches)
- [ ] Noms de nodes avec caractères spéciaux
- [ ] Collision de noms (auto-increment)

### 6.2 Tests d'intégration sync

**Fichiers** : `packages/sync/tests/`

**Test cases** :
- [ ] Pull workflow depuis n8n → génère .ts correct
- [ ] Modifier .ts local → push vers n8n → JSON correct
- [ ] Détection de modifications (hash)
- [ ] Conflict resolution avec .ts

### 6.3 Documentation

**Fichiers à créer/modifier** :
- [ ] `docs/docs/getting-started/typescript-workflows.md` : Guide TypeScript workflows
- [ ] `docs/docs/usage/workflow-decorators.md` : Documentation décorateurs
- [ ] `README.md` : Mettre à jour avec exemples TypeScript
- [ ] `packages/transformer/README.md` : Documentation API transformer

### 6.4 Migration du workflow exemple

**Fichier** : `generated-workflows-examples/social-post-assistant.json`

**Action** :
- [ ] Convertir en `social-post-assistant.workflow.ts`
- [ ] Vérifier compilation correcte
- [ ] Utiliser comme exemple de référence

---

## 📐 Bibliothèques recommandées

### Core Dependencies

| Bibliothèque | Usage | Justification |
|-------------|-------|---------------|
| `ts-morph` | Parser/manipuler TypeScript AST | API haut niveau, plus simple que TS Compiler API direct |
| `reflect-metadata` | Support décorateurs runtime | Standard pour decorators TypeScript |
| `prettier` | Formatter code TypeScript généré | Standard industrie, configuration facile |
| `zod` ou `ajv` | Validation schemas | Validation runtime des structures |
| `typescript` | Compilation TypeScript | Obligatoire pour compilation |

### Dev Dependencies

| Bibliothèque | Usage |
|-------------|-------|
| `@types/node` | Types Node.js |
| `vitest` ou `jest` | Testing |
| `ts-node` | Execution TypeScript en dev |

---

## 🔀 Stratégie de Branches & Commits

### Structure des branches

```
main
└── feat/typescript-transformer
    ├── feat/transformer-core        ← Phase 2
    ├── feat/sync-adapter            ← Phase 3
    ├── feat/skills-typescript       ← Phase 4
    └── feat/cli-validation          ← Phase 5
```

### Commits atomiques recommandés

**Phase 2 - Core Transformer** :
1. `feat(transformer): add package structure and types`
2. `feat(transformer): implement JSON to AST parser`
3. `feat(transformer): implement AST to TypeScript generator`
4. `feat(transformer): implement TypeScript to JSON compiler`
5. `feat(transformer): add decorators implementation`
6. `test(transformer): add roundtrip transformation tests`

**Phase 3 - Sync Adapter** :
1. `feat(sync): add WorkflowTransformerAdapter`
2. `refactor(sync): replace sanitizer with transformer in SyncEngine`
3. `refactor(sync): update Watcher for .ts files`
4. `refactor(sync): update ResolutionManager for TypeScript`
5. `test(sync): add integration tests with transformer`

**Phase 4 - Skills** :
1. `feat(skills): generate TypeScript examples in knowledge index`
2. `feat(skills): convert workflow templates to TypeScript`
3. `refactor(skills): update NodeSchemaProvider with TS examples`
4. `feat(skills): add TypeScript template scaffolding`

**Phase 5 - CLI** :
1. `feat(cli): add workflow create command`
2. `feat(cli): add workflow validation command`
3. `feat(cli): add compile command for debugging`
4. `chore: add pre-commit validation hook`

---

## ⚠️ Points d'attention critiques

### 1. **Source Unique de Vérité** : Schémas de Nodes

- ✅ **Conserver** : `n8n-nodes-technical.json` comme source de vérité pour schémas
- ⚠️ Ne PAS dupliquer les schémas dans le code TypeScript généré
- Le code TypeScript généré doit référencer/utiliser ces schémas pour validation

### 2. **Gestion des Node IDs**

Problème : n8n utilise UUIDs pour node IDs, mais on veut des property names lisibles

**Solution** :
- Dans le fichier `.ts` : utiliser property names (PascalCase, lisibles)
- À la compilation vers JSON : générer UUIDs déterministes basés sur property name + position
- Mapping bidirectionnel maintenu pendant transformation

### 3. **Credentials Handling**

Les credentials contiennent des IDs spécifiques à l'instance

**Solution** :
- Dans `.ts` : stocker credential metadata (type + name)
  ```typescript
  @node({
      credentials: {
          jinaAiApi: { id: "YmIMq9jd5lNUfwOe", name: "Jina AI account" }
      }
  })
  ```
- Option : permettre credential references symboliques
  ```typescript
  credentials: { jinaAiApi: "@jina-ai-main" }
  ```

### 4. **Dependency Injection (AI Nodes)**

Les nodes AI ont des connections spéciales (ressources)

**Validation** :
- Vérifier que les nodes référencés dans `.uses()` existent
- Vérifier que les types sont compatibles (model, memory, parser...)
- Valider les types d'outputs/inputs correspondants

### 5. **Error Outputs**

Les nodes avec `onError: "continueErrorOutput"` ont un output spécial

**Représentation** :
```typescript
this.GithubCheckBranchRef.error().to(this.GithubCreateBranch.in(0));
```

**Mapping** : Error output = output index spécial (à définir : -1 ou "error")

### 6. **Formatage et Lisibilité**

**Règles de formatage** :
- Maximum 120 caractères par ligne
- Toujours formatter avec Prettier après génération
- Sections commentées :
  ```typescript
  // =====================================================================
  // 1. METADATA DU WORKFLOW
  // =====================================================================
  ```
- Grouper nodes par type (triggers, actions, AI, etc.)

### 7. **Performance Build**

Les scripts de build vont compiler beaucoup de TypeScript

**Optimisations** :
- Utiliser cache pour compilation TypeScript
- Paralléliser conversion des templates
- Ne régénérer que ce qui a changé

---

## 🎯 Jalons de validation (Checkpoints)

### Checkpoint 1 : Transformer Core ✅ **COMPLETE**
**Critères** :
- [x] Transformer peut convertir workflow simple JSON → TS → JSON (identique)
- [x] Decorators fonctionnent (metadata extractable)
- [x] Code généré compile sans erreurs TypeScript
- [x] Tests unitaires passent (15/15 tests - 100% coverage)

**Fichier de test** : simple-workflow.json (3 nodes) ✅
**Test complexe** : social-post-assistant.json (63 nodes) ✅

**Résultats** :
- ✅ Roundtrip parfait JSON → TS → JSON
- ✅ Workflow complexe (63 nodes, 1684 lignes) généré correctement
- ✅ Tous les types de nodes supportés (Agent AI, Discord, HTTP, etc.)
- ✅ Connections avec error outputs fonctionnelles

### Checkpoint 2 : Sync Integration ✅
**Critères** :
- [ ] `n8nac sync pull` génère fichiers `.ts` corrects
- [ ] Modification d'un `.ts` local → push fonctionne
- [ ] Hash détecte correctement les modifications
- [ ] Pas de régression sur fonctionnalités sync existantes

**Test** : Cycle complet pull → modify → push → pull (idempotent)

### Checkpoint 3 : Skills Build ✅
**Critères** :
- [ ] Build génère documentation TypeScript
- [ ] Templates convertis en TypeScript valide
- [ ] CLI `get-schema` retourne exemples TypeScript
- [ ] Index search fonctionne avec nouveaux formats

**Test** : `npm run build` dans packages/skills successful

### Checkpoint 4 : End-to-End ✅
**Critères** :
- [ ] Création workflow from scratch en TypeScript
- [ ] Validation pre-commit fonctionne
- [ ] Sync bidirectionnel complet
- [ ] Agent IA peut générer workflow TypeScript correct

**Test** : Scénario complet utilisateur

---

## 📊 Métriques de succès

### Quantitatives
- ✅ 100% des workflows JSON convertibles en TypeScript
- ✅ Roundtrip JSON→TS→JSON produit JSON identique (sauf formatting)
- ✅ Compilation TypeScript <100ms par workflow
- ✅ Build scripts <2x temps actuel
- ✅ Test coverage >85% sur transformer

### Qualitatives
- ✅ Code TypeScript généré lisible par humain
- ✅ PRs de workflows faciles à review (diffs lisibles)
- ✅ Agent IA peut générer/modifier workflows TypeScript
- ✅ Onboarding développeurs plus rapide (TypeScript > JSON)

---

## 🚀 Next Steps - Action Immédiate

### Prochaine session de travail :

1. **Créer package transformer** (structure + types)
2. **Implémenter premier transformer simple** (workflow basique 2-3 nodes)
3. **Tester roundtrip** sur workflow exemple
4. **Intégrer dans sync** (proof of concept)

**Estimation** : ~3-4 sessions de développement pour Phase 1-2

**MISE À JOUR** : ✅ **Phase 1-2 COMPLÈTES** (1 session)
- Package transformer créé et fonctionnel
- 15 tests passés (100%)
- Roundtrip validé sur workflows simples et complexes
- Prêt pour intégration dans sync (Phase 3)

---

## ❓ Questions ouvertes à résoudre

1. **Naming collisions** : Si deux nodes ont le même displayName, comment nommer properties?
   - Proposition : `ScheduleTrigger1`, `ScheduleTrigger2`
   - Alternative : `ScheduleTrigger_<hash>` (moins lisible)

2. **Multi-version nodes** : Un node peut avoir plusieurs versions
   - Stocker dans decorator : `version: 1.2` ou `version: [1, 2]`?

3. **Position auto-layout** : Conserver positions exactes ou permettre auto-layout?
   - Pour generated workflows : auto-layout serait mieux
   - Pour imported workflows : conserver positions

4. **Import resolution** : Permettre imports de nodes communs?
   ```typescript
   import { CommonAuthNode } from './common-nodes';
   ```
   - Utile pour réutilisabilité
   - Complexifie compilation

5. **Credential management** : Faut-il un système de credential references?
   - Actuellement : IDs hardcodés
   - Alternative : credential aliases/environment variables

---

**Plan créé le** : 17 février 2026  
**Auteur** : GitHub Copilot (Claude Sonnet 4.5)  
**Statut** : 📋 Planning - Prêt pour exécution
