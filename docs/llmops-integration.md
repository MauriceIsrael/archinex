# Intégration LLMOps MCP Server ↔ Archinex

> Document de référence — connexion entre le serveur LLMOps déployé sur GCP et le projet Archinex.
> Dernière mise à jour : 2026-09-27 — données vérifiées empiriquement par les tests d'intégration.

---

## 1. Serveur distant

| Propriété | Valeur |
|---|---|
| Service | `llmops-mcp-server` |
| Cloud / Région | GCP Cloud Run · `europe-west1` |
| URL de base | `https://llmops-mcp-server-344571265365.europe-west1.run.app` |
| Health check | `GET /health` → `200 OK` |
| Protocole MCP | FastMCP **full async** via SSE (voir §2) |
| Authentification | `Authorization: Bearer <token>` — requête sans token → `401 Unauthorized` |
| Jeton public de démo | `demo-public-2026-08` |
| Snapshot KB actif | `snapshot-2026-09-13-06f3455` |
| Version moteur | `0.1.0` (commit `d7d3291`) |

---

## 2. Protocole FastMCP — mode full async (vérifié empiriquement)

> [!IMPORTANT]
> Le serveur n'expose **pas** d'endpoint `/mcp` one-shot. Tout appel d'outil passe obligatoirement par le cycle SSE décrit ci-dessous.

### Routes actives (confirmées par les tests)

| Route | Méthode | Comportement |
|---|---|---|
| `/health` | `GET` | `200 OK` + body JSON |
| `/sse` | `GET` | `200 OK` · `Content-Type: text/event-stream` · flux permanent |
| `/messages/?session_id=<uuid>` | `POST` | `202 Accepted` (texte brut, **pas JSON**) |
| `/mcp`, `/docs`, `/tools`, etc. | toute | `404 Not Found` |

### Cycle complet d'un appel MCP

```
Client                              Serveur
  │                                    │
  │── GET /sse ────────────────────────▶│  (connexion SSE permanente)
  │◀── event: endpoint ─────────────────│
  │    data: /messages/?session_id=<id>
  │                                    │
  │── POST /messages/?session_id=<id> ──▶│  (body: JSON-RPC 2.0)
  │◀── HTTP 202 "Accepted" ─────────────│  (texte brut — pas de résultat ici)
  │                                    │
  │◀── event: message ──────────────────│  (réponse JSON-RPC corrélée par id)
  │    data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

### Points critiques d'implémentation

- Le `session_id` **doit** être obtenu depuis l'event `endpoint` avant tout POST.
- La corrélation requête/réponse se fait via le champ `id` JSON-RPC.
- Le flux SSE doit rester **ouvert en parallèle** pendant toute la durée des appels.
- L'implémentation de référence est la classe `McpSession` dans [`tests/integration/llmops-mcp.test.ts`](file:///c:/Users/Momo/Documents/Dev/archinex/tests/integration/llmops-mcp.test.ts).

---

## 3. Données de l'instance de démo

### Plan Knowledge (Architecture KB)
- **60 Assets** d'architecture indexés
- **17 GlossaryTerms**

### Plan Engagement — `nordwave-mcx-2027`
Banc d'essai 3GPP MCPTT :

| Artefact | Compte |
|---|---|
| Topics (Sujets) | 8 (dont `floor-control`) |
| Statements (Déclarations) | 9 |
| Conflicts | 2 |

---

## 4. Configuration MCP (`.mcp.json`)

Le fichier [`.mcp.json`](file:///c:/Users/Momo/Documents/Dev/archinex/.mcp.json) à la racine d'Archinex est lu automatiquement par **Antigravity**, Claude Desktop et Cursor.

```json
{
  "mcpServers": {
    "llmops-remote": {
      "url": "https://llmops-mcp-server-344571265365.europe-west1.run.app/sse",
      "headers": {
        "Authorization": "Bearer demo-public-2026-08"
      }
    }
  }
}
```

> [!CAUTION]
> Le jeton `demo-public-2026-08` est public et de démo. Le serveur renvoie `401 Unauthorized` pour tout token invalide. En production, injecter via une variable d'environnement et ne jamais commiter le jeton réel.

Pour surcharger le jeton sans modifier le fichier :

```bash
LLMOPS_TOKEN=mon-vrai-jeton npx vitest run tests/integration/llmops-mcp.test.ts
```

---

## 5. Tests d'intégration

Fichier : [`tests/integration/llmops-mcp.test.ts`](file:///c:/Users/Momo/Documents/Dev/archinex/tests/integration/llmops-mcp.test.ts)

**Résultat : 13/13 tests verts** (vérifié le 2026-09-27)

### Suites couvertes

| # | Suite | Ce qui est vérifié |
|---|---|---|
| 1 | **Health Check** | `GET /health` → 200, schéma JSON, `plane="all"` |
| 2 | **Session SSE** | Ouverture flux SSE, réception de l'event `endpoint`, extraction du `session_id` |
| 3 | **tools/list** | Liste les outils via SSE async — `get_graph_summary` et `get_board` présents |
| 4 | **get_graph_summary** | ≥ 60 assets Knowledge, `nordwave-mcx-2027` référencé |
| 5 | **get_board** | Board non vide, présence de Statements/Topics, mots-clés MCPTT/floor-control |
| 6 | **Mapping Archinex** | Conflits LLMOps détectables → mappables au `deliberationStore` |

### Exécution

```bash
# Lancement ciblé (réseau requis)
npx vitest run tests/integration/llmops-mcp.test.ts

# Avec variables d'environnement personnalisées
LLMOPS_BASE_URL=https://... LLMOPS_TOKEN=xxx npx vitest run tests/integration/llmops-mcp.test.ts
```

> [!NOTE]
> Ces tests sont des tests réseau réels. Les inclure dans la CI nécessite :
> - Un accès réseau sortant vers `europe-west1.run.app`
> - Le jeton injecté via secret CI/CD (ex. `LLMOPS_TOKEN`)
> - Un timeout suffisant (~20 s) car le protocole SSE async implique deux allers-retours réseau

---

## 6. Mapping domaine LLMOps ↔ Archinex

| Concept LLMOps | Équivalent Archinex |
|---|---|
| `Asset` (Knowledge Plan) | `CorpusDocument` |
| `GlossaryTerm` | Terme du glossaire métier |
| `Topic` (Engagement) | `Subject` du `deliberationStore` |
| `Statement` | Déclaration épistémique (`EpistemicStatement`) |
| `Conflict` | Conflit du `deliberationStore` |
| `Engagement` | Projet / instance de délibération |

Ce mapping permettra à terme d'alimenter Archinex depuis le graphe LLMOps (import, sync, ou déclencheur de workflow).

---

## 7. Variables d'environnement supportées

| `LLMOPS_BASE_URL` | URL Cloud Run prod | Rediriger vers staging/local |
| `LLMOPS_TOKEN` | `demo-public-2026-08` | Surcharger le jeton (tests réseau historiques) |
| `LLMOPS_AUTH_TOKEN` | — | Jeton de service du client applicatif : doit porter `kb:review,kb:delegate` (+ l'engagement) pour la gouvernance |
| `LLMOPS_ALLOWED_HOSTS` | vide | Hôtes LLMOps hors réseau local autorisés nommément (ex. l'hôte Cloud Run) ; sans elle, `*.run.app` est bloqué (règle air-gap) |
| `LLMOPS_TIMEOUT_MS` | non défini | Délai uniforme (ms) qui prime sur les délais par opération (voir `GCP_CLOUD_RUN_DEPLOYMENT.md`) |
| `LLMOPS_ENGAGEMENT` | `nordwave-mcx-2027` | Tester un autre engagement |
| `LLMOPS_LIVE_URL` | Non défini (optionnel) | URL du serveur de contrat local LLMOps pour tests de contrat vivants |
| `LLMOPS_LIVE_TOKEN` | `contract-service-token` | Jeton de service portant les scopes `kb:review,kb:delegate` |
| `USE_FAKE_LLMOPS` | `0` | Définir à `1` pour forcer l'utilisation du serveur mock en mémoire `fakeLlmops` lors des tests E2E Playwright |
| `ALLOW_OFFLINE_MOCK` | `0` | Définir à `1` pour autoriser le mode démo hors-ligne simulé localement en cas d'absence de serveur |

---

### Modes d'exécution des tests E2E Navigateur (Playwright)

Les tests de parcours navigateur (`tests/e2e/browser/`) supportent 3 modes d'exécution stricts (sans repli silencieux) :

1. **Mode Conteneur Docker (Défaut)** :
   - Démarré automatiquement via `testcontainers` avec l'image `llmops-contract:latest`.
   - Nécessite Docker actif. En cas d'indisponibilité de Docker, le setup échoue immédiatement avec un message clair et les instructions de démarrage.

2. **Mode Serveur Live Externe (`LLMOPS_LIVE_URL`)** :
   - Cible une instance Python déjà en cours d'exécution (ex: `python scripts/contract_server.py --port 8099` dans le dépôt LLMOps).
   - Configuration : `$env:LLMOPS_LIVE_URL="http://127.0.0.1:8099"`.
   - Les embeddings vectoriels sont pré-synchronisés automatiquement au démarrage du test.

3. **Mode Mock en Mémoire Déclaré (`USE_FAKE_LLMOPS=1`)** :
   - Utilise le mock local in-memory `fakeLlmops` sans dépendance Docker ni Python.
   - Doit être **explicitement consenti** : `$env:USE_FAKE_LLMOPS="1"`.
   - Affiche une bannière d'avertissement très visible dans la console pour signaler que le vrai serveur LLMOps n'est pas sollicité.


---

## 8. Gouvernance de la Base de Connaissances (API v1)

Les lots de gouvernance étendent l'intégration au-delà du protocole MCP en appelant directement l'API REST de gouvernance avec propagation d'identité souveraine (`X-Actor-Email`) :

| Lot | Objet | Portes & Validation | Issue associée |
|---|---|---|---|
| **A6** | Comptes experts, rôles KB (`kb:review`, `kb:evaluate`, `kb:maintain`, `kb:admin`) et en-tête `X-Actor-Email` | Validé (Porte G5 prérequis) | Closes #1 |
| **A7** | Boîte de revue d'experts, actions (`accept`, `amend`, `reject`), réassignation et notifications | Validé (Porte G5) | Closes #2 |
| **A8** | Atelier de doctrine : templates d'actifs, assertions formelles et simulateur d'impact | Validé | Closes #3 |
| **A10** | Ingestion multi-format (.pdf, .md, .txt), revue ligne par ligne et déclaration de couverture | Validé | Closes #5 |

### Identité de l'acteur : la session, rien d'autre

Le jeton de service d'Archinex porte `kb:delegate` : LLMOps accepte alors `X-Actor-Email` et agit **au nom de cette personne**. Cette identité doit donc venir exclusivement de la **session authentifiée** du navigateur (`locals.session.user.email`, posée par `src/hooks.server.ts`).

- Les routes `/api/knowledge/*` et `/api/frameworks/*` répondent **401** sans session (garde dans `hooks.server.ts`).
- Aucune route ne lit l'en-tête `X-Actor-Email` envoyé par le navigateur et aucune n'a d'identité de repli (`architect@…`, `eva@…`) : un test statique (`tests/contract/actor-from-session.test.ts`) l'impose.
- Les appels « système » (synchronisation d'embeddings, polling) n'envoient pas d'acteur ; ils sont déclenchés par un utilisateur connecté ou une tâche serveur, jamais par un appelant anonyme.
- Les rôles et domaines restent vérifiés par LLMOps (`403` si l'e-mail est inconnu ou sans droit).

---

## 9. Test E2E API — Réglementation → RFP → Délibération → Décision → Capitalisation (Issue #12)

Le test d'intégration bout-en-bout en boucle fermée vérifie l'ensemble des 6 actes contre une instance réelle de LLMOps isolée et conteneurisée :

```bash
# Avec conteneur éphémère (testcontainers Docker) :
TEST_CONTAINERS=1 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts

# Ou contre un serveur de contrat existant :
LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run tests/e2e/regulatory-to-capitalization.test.ts
```

### Déroulement des 6 actes validés :
1. **Acte 0 — Base vierge** : vérification de l'état initial normal et de la non-couverture de NIS2.
2. **Acte 1 — RFP Référence** : découpage du RFP avant ingestion, extraction des contrôles baseline et verdict initial d'option.
3. **Acte 2 — Ingestion réglementaire** : ingestion multipart de l'extrait NIS2 (19 exigences), revue collégiale d'experts, application et publication doctrinale (`status: covered`).
4. **Acte 3 — Preuve de causalité RFP** : re-découpage du RFP prouvant formellement avant ≠ après (apparition des contrôles `NIS2-ART20`, `NIS2-ART21-3`, `NIS2-ART23-4`).
5. **Acte 4 — Délibération & Porte G3** : débat contradictoire, traitement des objections et arbitrage humain opposable L3_decided.
6. **Acte 5 — Capitalisation** : préparation de candidats anonymisés, revue par pairs (double revue sur principes), promotion, scellement de snapshot et distribution des notifications de gouvernance.
7. **Acte 6 — Boucle fermée** : réévaluation par le juge d'options prouvant la prise en compte immédiate de la règle capitalisée (`PAT-099`).



