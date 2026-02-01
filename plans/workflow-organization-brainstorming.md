# Brainstorming: Organisation des Workflows par Projets, Dossiers et Archivage

## 🎯 Objectif

Améliorer le package `sync` pour refléter l'organisation des workflows sur l'instance n8n au niveau local, incluant:
- **Projets**: Organisation de haut niveau (disponible selon la licence)
- **Dossiers**: Organisation intermédiaire (disponible pour toutes les licences)
- **Statut archivé**: Workflows archivés vs actifs

## 📊 État Actuel

### Ce qui existe
- ✅ Synchronisation bidirectionnelle des workflows par ID
- ✅ Gestion des tags
- ✅ Système de state tracking (lastSyncedHash)
- ✅ Détection de conflits
- ✅ Dossier `.archive` pour les workflows supprimés localement

### Limitations
- ❌ Pas de support pour les projets
- ❌ Pas de support pour les dossiers (folders)
- ❌ Pas de gestion du statut archivé
- ❌ Tous les workflows sont stockés dans un dossier plat au niveau local

### Structure de données actuelle

```typescript
interface IWorkflow {
    id: string;
    name: string;
    active: boolean;
    nodes: any[];
    connections: any;
    settings?: any;
    tags?: ITag[];
    updatedAt?: string;
    createdAt?: string;
}
```

## 🔍 Analyse de l'API n8n

### Endpoints disponibles
D'après la documentation API, nous avons accès à:
- ✅ `/api/v1/workflows` - GET/POST workflows
- ✅ `/api/v1/workflows/{id}` - GET/PUT/DELETE workflow
- ✅ `/api/v1/projects` - Gestion des projets
- ✅ `/api/v1/workflows/{id}/transfer` - Transfert de workflow entre projets

### Propriétés supplémentaires des workflows
À vérifier dans les réponses API réelles:
- `projectId` ou `homeProject`: ID du projet parent
- `folderId` ou similaire: ID du dossier
- `archived`: Boolean pour le statut archivé
- `scopes` / `ownedBy`: Informations de propriété

## 🤔 Défis et Contraintes

### 1. Limitations de Licence
- **Problème**: Certaines instances n'ont pas accès aux projets
- **Impact**: Impossible de créer/modifier des projets via l'API
- **Conséquence**: Tous les workflows restent dans "Personal"
- **Risque**: Si on organise localement en dossiers de projets, la sync push échouera

### 2. Bidirectionnalité
- **Pull (Remote → Local)**: Relativement simple
  - Lire les métadonnées (projet, dossier, archivé)
  - Créer l'arborescence locale correspondante
  - Écrire les JSONs dans les bons dossiers

- **Push (Local → Remote)**: Complexe
  - Détecter les déplacements de fichiers entre dossiers
  - Traduire le déplacement en appel API approprié
  - Gérer les erreurs si l'instance ne supporte pas les projets
  - Créer automatiquement les projets/dossiers manquants

### 3. Détection des Changements
- Comment savoir qu'un fichier a été **déplacé** vs supprimé puis recréé?
- Le système actuel ne track que le contenu via hash
- Besoin de tracker également l'emplacement (chemin de fichier)

### 4. Gestion des Conflits
- Que faire si quelqu'un déplace un workflow localement ET à distance?
- Conflit de localisation en plus du conflit de contenu

## 💡 Approches Possibles

### Option A: Métadonnées dans le JSON (Simple)

**Principe**: Ajouter les métadonnées directement dans le JSON du workflow

```json
{
  "id": "abc123",
  "name": "My Workflow",
  "nodes": [...],
  "connections": {...},
  "_n8nac": {
    "projectId": "proj-xyz",
    "projectName": "Marketing",
    "folderId": "folder-123",
    "folderPath": "Campaigns/Email",
    "archived": false
  }
}
```

**Avantages**:
- ✅ Simplicité: pas de gestion de dossiers
- ✅ Toutes les infos dans un seul fichier
- ✅ Fonctionne avec n'importe quel workflow
- ✅ Facile à synchroniser

**Inconvénients**:
- ❌ Pas d'organisation visuelle locale
- ❌ Liste plate difficile à naviguer avec beaucoup de workflows
- ❌ Pas de bénéfice de l'explorateur de fichiers
- ❌ Push complexe: comment détecter un changement de projet/dossier?

### Option B: Arborescence Locale Stricte (Mirror)

**Principe**: Répliquer exactement la structure distante localement

```
workflows/
├── Personal/
│   ├── Utilities/
│   │   ├── workflow-1.json
│   │   └── workflow-2.json
│   └── workflow-3.json
├── Marketing/
│   ├── Campaigns/
│   │   └── workflow-4.json
│   └── workflow-5.json
├── _Archived/
│   └── workflow-6.json
└── .n8nac-structure.json  # Métadonnées de structure
```

**Avantages**:
- ✅ Organisation visuelle claire
- ✅ Navigation facile dans l'explorateur
- ✅ Intuitif pour les utilisateurs
- ✅ Groupement naturel des workflows liés

**Inconvénients**:
- ❌ Push très complexe: détecter les déplacements
- ❌ Conflits possibles si l'instance ne supporte pas les projets
- ❌ Risque de désynchronisation structure vs contenu
- ❌ Nécessite un système de tracking des emplacements

**Besoin supplémentaire**: Fichier de métadonnées
```json
{
  "version": "1.0",
  "structure": {
    "projects": [
      {"id": "proj-1", "name": "Marketing", "type": "team"},
      {"id": null, "name": "Personal", "type": "personal"}
    ],
    "folders": [
      {"id": "f-1", "name": "Campaigns", "projectId": "proj-1", "path": "Campaigns"},
      {"id": "f-2", "name": "Utilities", "projectId": null, "path": "Utilities"}
    ],
    "capabilities": {
      "supportsProjects": true,
      "supportsFolders": true,
      "supportsArchive": true
    }
  }
}
```

### Option C: Arborescence Locale Optionnelle (Hybride)

**Principe**: Utiliser les métadonnées + option d'organiser localement

```
workflows/
├── workflow-1.json          # Métadonnées dans le JSON
├── workflow-2.json
└── Marketing/               # Organisation optionnelle (ignorée en push)
    └── workflow-3.json      # Lien symbolique ou copie?
```

**Avantages**:
- ✅ Flexibilité maximale
- ✅ Compatible avec les instances limitées
- ✅ Métadonnées toujours présentes
- ✅ Organisation visuelle optionnelle

**Inconvénients**:
- ❌ Complexité conceptuelle
- ❌ Risque de confusion
- ❌ Difficile à maintenir cohérent

### Option D: Mode Configuration (Adaptative)

**Principe**: Comportement différent selon les capacités de l'instance

```typescript
interface SyncConfig {
  organizationMode: 'flat' | 'folders' | 'projects';
  // 'flat': Tout dans un dossier avec métadonnées
  // 'folders': Organisation par dossiers seulement
  // 'projects': Organisation complète projets + dossiers
}
```

**Mode Auto-détection**:
```typescript
async function detectInstanceCapabilities(): Promise<Capabilities> {
  try {
    await client.get('/api/v1/projects');
    return { projects: true, folders: true };
  } catch {
    return { projects: false, folders: true };
  }
}
```

**Avantages**:
- ✅ S'adapte automatiquement aux capacités
- ✅ Pas de frustration avec les instances limitées
- ✅ Peut évoluer si la licence change
- ✅ Configuration explicite disponible

**Inconvénients**:
- ❌ Plusieurs chemins de code à maintenir
- ❌ Tests plus complexes
- ❌ Migration si l'instance change de capacités

## 🎬 Scénarios d'Usage

### Scénario 1: Pull Initial
**Contexte**: Première synchronisation d'une instance avec 50 workflows

**Option A (Métadonnées)**:
1. GET /api/v1/workflows (tous)
2. Pour chaque workflow, enrichir avec métadonnées
3. Écrire 50 fichiers dans workflows/

**Option B (Arborescence)**:
1. GET /api/v1/projects
2. GET /api/v1/workflows (tous)
3. Créer structure de dossiers
4. Écrire workflows dans bons dossiers
5. Sauver .n8nac-structure.json

### Scénario 2: Déplacement Local d'un Workflow
**Contexte**: Utilisateur déplace `workflow-1.json` de `Personal/` vers `Marketing/`

**Option A (Métadonnées)**:
- Impossible de déplacer, structure plate

**Option B (Arborescence)**:
1. Watcher détecte changement de path
2. Lire projectId du nouveau dossier parent
3. Appeler PUT /api/v1/workflows/{id}/transfer
4. Mettre à jour state avec nouveau path

### Scénario 3: Instance sans Support Projets
**Contexte**: Instance locale sans licence, tous workflows dans Personal

**Option A (Métadonnées)**:
- Fonctionne normalement
- Métadonnées indiquent `projectId: null`

**Option B (Arborescence)**:
- Tout dans `Personal/` uniquement
- Tentative de créer d'autres dossiers = erreur

**Option D (Configuration)**:
- Auto-détection: `mode='folders'`
- Organisation par dossiers uniquement, pas de projets

### Scénario 4: Archivage d'un Workflow
**Contexte**: Utilisateur archive un workflow à distance

**Option A (Métadonnées)**:
1. Pull détecte `archived: true`
2. Met à jour métadonnées dans JSON
3. Fichier reste dans workflows/

**Option B (Arborescence)**:
1. Pull détecte `archived: true`
2. Déplace fichier vers `_Archived/`
3. Met à jour state avec nouveau path

## ⚖️ Comparaison et Recommandation

| Critère | Option A | Option B | Option C | Option D |
|---------|----------|----------|----------|----------|
| Simplicité technique | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Expérience utilisateur | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Compatibilité licences | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Risque de bugs | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Facilité de debug | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Évolutivité | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 🏆 Recommandation: Option D (Mode Adaptatif) avec Phase Progressive

#### Phase 1: Métadonnées (Court Terme)
1. Enrichir `IWorkflow` avec métadonnées:
   ```typescript
   interface IWorkflow {
     // ... existant
     projectId?: string;
     projectName?: string;
     folderId?: string;
     folderPath?: string;
     archived?: boolean;
   }
   ```

2. Modifier WorkflowSanitizer:
   ```typescript
   // cleanForStorage: garder les métadonnées
   // cleanForPush: retirer les métadonnées read-only
   ```

3. Afficher les métadonnées dans CLI/Extension:
   ```
   📁 Marketing/Campaigns > Email Campaign Workflow
   🏷️  Tags: automation, email
   📦 Project: Marketing
   📂 Folder: Campaigns
   ⏸️  Archived: No
   ```

#### Phase 2: Auto-détection des Capacités
1. Ajouter méthode dans N8nApiClient:
   ```typescript
   async getInstanceCapabilities(): Promise<{
     supportsProjects: boolean;
     supportsFolders: boolean;
     supportsArchive: boolean;
   }>
   ```

2. Stocker dans ISyncConfig ou instance metadata

#### Phase 3: Organisation Locale Optionnelle (Moyen Terme)
1. Ajouter configuration:
   ```typescript
   interface ISyncConfig {
     // ... existant
     organizationMode?: 'flat' | 'structured';
     // 'flat': workflows/ (par défaut)
     // 'structured': workflows/Project/Folder/
   }
   ```

2. Si `structured` ET instance supporte projets:
   - Créer arborescence lors du pull
   - Détecter déplacements lors du push
   - Gérer création auto de projets/dossiers

3. Système de migration:
   - Commande pour passer de flat à structured
   - Commande pour passer de structured à flat
   - Validation avant migration

## 🚀 Plan d'Implémentation

### Étape 1: Enrichissement des Métadonnées (Priorité: HAUTE)
**Objectif**: Capturer toutes les infos d'organisation

**Tâches**:
- [ ] Étendre `IWorkflow` avec propriétés organisation
- [ ] Mettre à jour N8nApiClient.getAllWorkflows()
- [ ] Mettre à jour WorkflowSanitizer pour préserver métadonnées
- [ ] Tests: vérifier que les métadonnées sont bien extraites

**Impact**:
- ✅ Aucun changement d'arborescence locale
- ✅ Pas de régression
- ✅ Fondation pour futures évolutions

### Étape 2: Affichage des Métadonnées (Priorité: HAUTE)
**Objectif**: Permettre aux utilisateurs de voir l'organisation

**Tâches**:
- [ ] CLI: Afficher projet/dossier dans commande `list`
- [ ] CLI: Ajouter filtres `--project`, `--folder`, `--archived`
- [ ] Extension VSCode: Afficher dans arbre de fichiers
- [ ] Extension VSCode: Filtrer par projet/dossier

**Impact**:
- ✅ Amélioration immédiate UX
- ✅ Pas de complexité supplémentaire

### Étape 3: Auto-détection (Priorité: MOYENNE)
**Objectif**: Identifier les capacités de l'instance

**Tâches**:
- [ ] Ajouter méthode detectCapabilities()
- [ ] Stocker dans instance metadata
- [ ] Afficher dans CLI info
- [ ] Logger warnings si features pas disponibles

### Étape 4: Organisation Structurée Optionnelle (Priorité: BASSE)
**Objectif**: Arborescence locale pour grandes instances

**Tâches**:
- [ ] Design système de tracking des paths
- [ ] Implémentation mode structured
- [ ] Commandes de migration
- [ ] Documentation exhaustive

**Note**: Cette étape peut être reportée ou même abandonnée si les phases 1-3 suffisent.

## ⚠️ Points d'Attention

### 1. Workflow ID Loop
- Le système actuel est basé sur l'ID du workflow
- Les métadonnées ne changent pas l'ID
- ⚠️ Attention à ne pas créer de boucles infinies si on détecte un "changement"

### 2. Backward Compatibility
- Les workflows existants n'ont pas de métadonnées
- Besoin de migrer progressivement
- Gérer le cas où métadonnées = undefined

### 3. Performance
- GET /api/v1/workflows peut être lent avec beaucoup de workflows
- Considérer pagination
- Cache des métadonnées?

### 4. Tests
- Tester avec instance avec projets
- Tester avec instance SANS projets
- Tester archivage
- Tester déplacements (phase 4)

## 🎯 Décision à Prendre

**Question clé**: Veut-on vraiment l'arborescence locale (Option B/D Phase 4)?

**Facteurs à considérer**:
1. Nombre de workflows typique de nos utilisateurs
   - < 20 workflows: métadonnées suffisent
   - \> 100 workflows: arborescence utile

2. Complexité vs Valeur
   - Phase 1-3: Haute valeur, complexité moyenne
   - Phase 4: Valeur incertaine, haute complexité

3. Alternatives
   - Extension VSCode peut créer une "vue virtuelle" organisée
   - Sans modifier l'arborescence physique des fichiers
   - Meilleur des deux mondes?

**Recommandation immédiate**: 
- ✅ Implémenter Phase 1-2 (Métadonnées + Affichage)
- 🤔 Recueillir feedback utilisateurs
- 📊 Mesurer besoin réel pour Phase 4
- 🚀 Décider ensuite si arborescence physique vaut le coût

## 📝 Questions Ouvertes

1. L'API n8n retourne-t-elle `projectId` et `folderId` dans GET /workflows?
   - À tester avec une instance réelle

2. Comment créer un dossier via l'API?
   - Documentation à rechercher
   - Possiblement auto-créé lors du PUT workflow?

3. Quel endpoint pour archiver un workflow?
   - PUT /workflows/{id} avec `archived: true`?
   - Endpoint dédié?

4. Migration de workflows entre projets nécessite permissions?
   - Tester les erreurs possibles
   - Gérer les cas d'échec

5. Les dossiers sont-ils hiérarchiques (sous-dossiers possibles)?
   - Impact sur la complexité de l'arborescence

## 📚 Ressources

- [n8n API Documentation](https://docs.n8n.io/api/api-reference/)
- [n8n Projects Documentation](https://docs.n8n.io/user-management/rbac/projects/)
- Code existant: `packages/sync/src/services/n8n-api-client.ts`
- Code existant: `packages/sync/src/services/workflow-sanitizer.ts`
