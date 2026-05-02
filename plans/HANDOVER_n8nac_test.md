# Handover — `n8nac test` (français)

## Objectif

- Ajouter la commande `n8nac test <workflowId>` pour tester des workflows n8n déclenchés par HTTP (webhook / chat / form).
- Classer les échecs en :
  - **Class A — config-gap** : manque de credentials / modèle LLM / variables d'environnement → informer, ne pas bloquer.
  - **Class B — wiring-error** : erreurs structurelles, expressions cassées, mauvais champs → corriger et retester.

## Principe technique (résumé)

- Récupère le workflow via l'API publique (`GET /api/v1/workflows/{id}`).
- Détecte le noeud trigger (webhook / form / chat). Extrait le `path` (params.path > webhookId > node.id).
- Construit l'URL de test :
  - Webhook : `/webhook-test/{path}`
  - Form : `/form-test/{path}`
  - Chat : `/webhook-test/{path}/chat`
- Appelle directement l'URL HTTP (sans header API key) et retourne un `ITestResult`.
- n8n n'expose pas d'API pour lancer une exécution (`POST /executions` absent) — c'est la seule façon fiable.

## Comportement CLI

- Commande : `n8nac test <workflowId>`
- Options : `--data '<json>'`, `--prod` (utiliser production au lieu de test)
- Codes de sortie :
  - `0` : succès 2xx, ou Class A (config-gap), ou workflow non-testable (schedule/unknown)
  - `1` : Class B (wiring-error) ou erreur fatale (workflow introuvable)

## Fichiers modifiés

- [packages/cli/src/core/types.ts](packages/cli/src/core/types.ts) — ajoute `ITriggerInfo`, `ITestResult`, `TestErrorClass`.
- [packages/cli/src/core/services/n8n-api-client.ts](packages/cli/src/core/services/n8n-api-client.ts) — `detectTrigger()`, `buildTestUrl()`, `testWorkflow()`, heuristiques de classification.
- [packages/cli/src/core/services/cli-api.ts](packages/cli/src/core/services/cli-api.ts) — façade `testWorkflow()`.
- [packages/cli/src/core/services/sync-manager.ts](packages/cli/src/core/services/sync-manager.ts) — exposé `getApiClient()`.
- [packages/cli/src/commands/test.ts](packages/cli/src/commands/test.ts) — nouvelle commande CLI et sortie formatée.
- [packages/cli/src/index.ts](packages/cli/src/index.ts) — enregistrement de la commande `test`.
- [packages/skills/src/services/ai-context-generator.ts](packages/skills/src/services/ai-context-generator.ts) — mise à jour de la documentation AI (procédure et classification A/B).

## Exemples d'utilisation

```bash
npx n8nac test <workflowId>
npx n8nac test <workflowId> --data '{"foo":"bar"}'
npx n8nac test <workflowId> --prod
```

## Classification rapide et action attendue

- Class A (config-gap) — sortie 0 :
  - Manifestations : 401/403, messages contenant `credential`, `model not set`, `environment variable`, etc.
  - Action : informer l'utilisateur des éléments à configurer dans l'UI n8n. Ne pas modifier le code pour résoudre.

- Class B (wiring-error) — sortie 1 :
  - Manifestations : erreurs d'expression, propriété introuvable, HTTP 4xx/5xx liées à la logique du workflow.
  - Action : corriger le `.workflow.ts` (expressions, noms de champs, types de node), push, re-run `n8nac test`.

## Points d'attention

- Ne pas envoyer la `N8N_API_KEY` dans les requêtes vers `/webhook-test/*`.
- Les triggers `schedule` ou poll ne sont pas testables via HTTP — signaler et expliquer.
- `validate` statique ≠ `test` runtime. Toujours exécuter `test` pour webhook/chat/form après `push`.

## Tests recommandés

1. Compiler le CLI :

```bash
cd /home/etienne/repos/n8n-as-code
npm run build --workspace=packages/cli
```

2. Tester contre une instance n8n de dev :

```bash
npx n8nac test <workflowId> --data '{}'
```

## Prochaines améliorations (optionnel)

- Ajouter tests unitaires pour `detectTrigger()` et `testWorkflow()`.
- Ajouter e2e CI qui exécute `n8nac test` contre une instance n8n de test.
- Améliorer la détection des messages de Class A par pattern matching plus riche.

---

Si tu veux, je peux aussi créer directement une MR avec ces fichiers modifiés et un petit `README` d'utilisation pour l'agent qui reprendra ce handover.