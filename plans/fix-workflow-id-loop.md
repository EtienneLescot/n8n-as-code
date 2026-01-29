# Plan de Correction - Bug ID Workflow en Boucle

## Problème
L'identifiant d'un workflow change constamment à chaque cycle de polling quand:
1. Des modifications sont faites sur l'instance distante pendant que le sync est hors ligne
2. Le workflow distant est recréé avec un nouvel ID (comportement n8n)
3. Le fichier local contient encore l'ancien ID

## Architecture de la Solution

### 1. Détection du Conflit (watcher.ts)

Dans `refreshLocalState()`, ajouter une vérification avant de mettre à jour les mappings:

```typescript
// AVANT (lignes 300-303):
if (content.id) {
    this.fileToIdMap.set(filename, content.id);
    this.idToFileMap.set(content.id, filename);
}

// APRÈS:
if (content.id) {
    const existingMappedId = this.fileToIdMap.get(filename);
    
    if (existingMappedId && existingMappedId !== content.id) {
        // Conflit: migrer l'état
        await this.migrateWorkflowId(existingMappedId, content.id);
    }
    
    this.fileToIdMap.set(filename, content.id);
    this.idToFileMap.set(content.id, filename);
}
```

### 2. Méthode de Migration

Utiliser la méthode existante `updateWorkflowId()` dans `watcher.ts` (lignes 709-739):
- Migre l'état depuis `.n8n-state.json`
- Met à jour tous les mappings internes
- Préserve l'historique de synchronisation

### 3. Gestion du Cas Inverse

Dans `refreshRemoteState()`, si `findFilenameByWorkflowId()` échoue mais qu'un fichier avec le même nom existe:
- Vérifier si le fichier contient un ID différent
- Si oui, traiter comme un conflit potentiel

## Tests à Créer

1. **Test unitaire**: Simuler le scénario de conflit d'ID
2. **Test d'intégration**: Modification sur remote pendant sync offline
3. **Test de robustesse**: Vérifier qu'il n'y a pas de boucle après correction

## Fichiers à Modifier

1. `packages/sync/src/services/watcher.ts`
   - Modifier `refreshLocalState()` (ligne ~293-305)
   - Vérifier `refreshRemoteState()` (ligne ~314-408)

2. `packages/sync/tests/unit/workflow-identification.test.ts`
   - Ajouter un test pour le scénario de conflit d'ID

## Critères d'Acceptation

- [ ] Le test unitaire reproduit le bug (échec avant correction)
- [ ] Après correction, le test passe
- [ ] Les mappings sont correctement mis à jour lors d'un changement d'ID
- [ ] L'état de synchronisation est préservé (pas de perte de lastSyncedHash)
- [ ] Aucune boucle de polling ne se produit
