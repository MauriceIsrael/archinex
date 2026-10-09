# Intégration LLMOps MCP Server ↔ Archinex

> Document de référence — connexion entre le serveur LLMOps déployé sur GCP et le projet Archinex.
> Dernière mise à jour : 2026-09-27 — données vérifiées empiriquement par les tests d'intégration.

---

## 1. Topologie des Serveurs LLMOps (Dual-Mode Souverain)

Archinex prend en charge l'intégration avec LLMOps selon deux modes d'exécution (avec repli automatique hors-ligne conforme au CONTRAT-KH-API-V1) :

### 1.1 Instance Locale Souveraine (Mode Actif Prioritaire)
Pour garantir l'étanchéité stricte des données et la confidentialité absolue des RFP :

| Propriété | Valeur |
|---|---|
| Service | `llmops-mcp-server` (Local FastAPI / MCP) |
| URL de base (`LLMOPS_BASE_URL`) | `http://127.0.0.1:8000` |
| Backend Base de Gouvernance | `sqlite:///<chemin-local>/LLMOps/data/governance.db` |
| Authentification (`LLMOPS_AUTH_TOKEN`) | Jeton de service Archinex (`Bearer <token>`) |
| Schéma & Version | `schema_version: 1.24` · Engine `0.1.0` |
| Health check | `GET /health` → `200 OK` (`status: ok`) |
| API Gouvernance | `GET /api/knowledge/health` → `200 OK` |

### 1.2 Instance Cloud Distante (GCP Cloud Run)

| Propriété | Valeur |
|---|---|
| Service | `llmops-mcp-server` |
| Cloud / Région | GCP Cloud Run · `europe-west1` |
| URL de base | `https://llmops-mcp-server-344571265365.europe-west1.run.app` |
| Health check | `GET /health` → `200 OK` |
| Protocole MCP | FastMCP **full async** via SSE (voir §2) |
| Authentification | `Authorization: Bearer <token>` |
| Version moteur | `0.1.0` |

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
- L'implémentation de référence est la classe `McpSession` dans [`tests/integration/llmops-mcp.test.ts`](../tests/integration/llmops-mcp.test.ts).

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

Le fichier [`.mcp.json`](../.mcp.json) à la racine d'Archinex est lu automatiquement par **Antigravity**, Claude Desktop et Cursor.

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

Fichier : [`tests/integration/llmops-mcp.test.ts`](../tests/integration/llmops-mcp.test.ts)

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
| `EMBEDDING_MODEL` | `toy-bow` | Modèle d'embeddings (calculé par Archinex, jamais par LLMOps) ; `toy-bow` est un encodeur de test sans valeur sémantique |
| `EMBEDDING_OLLAMA_URL` | non défini | Serveur Ollama qui calcule les vecteurs pour tout modèle autre que `toy-bow` (ex. `http://raptor-nino:11434`) |
| `ALLOW_TOY_EMBEDDINGS` | `0` | `1` pour autoriser `toy-bow` en production (démonstration uniquement) |

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

## 7 bis. Embeddings sémantiques (Ollama) — A12

Archinex calcule les vecteurs ; LLMOps les stocke et mesure le cosinus (décision D6, contrat 1.9). Règles :

- **Un modèle = un espace de vecteurs.** Le nom envoyé à LLMOps est celui de l'encodeur qui a réellement calculé le vecteur ; un modèle inconnu ou non configuré est **refusé** (503 « unavailable »), jamais remplacé en silence (`src/lib/server/similarity/encoder.ts`). La version déposée est l'**empreinte des poids** (`digest`) avec l'API native Ollama ; avec l'API compatible OpenAI le serveur n'expose que l'identifiant et la date de création, donc un changement de poids sous le même nom n'est pas détectable. Dans tous les cas, changer de modèle ou de version impose de tout recalculer.
- `toy-bow` (sac de mots déterministe) sert aux tests ; en production il est refusé sauf `ALLOW_TOY_EMBEDDINGS=1`.
- Aucun texte d'engagement non anonymisé n'est encodé pour la recherche (`anonymizeSubjectText`).

### Choisir le modèle installé sur le serveur Ollama

```bash
OLLAMA_URL=http://raptor-nino:11434 node scripts/ollama-models.mjs
```

Le script accepte l'API native Ollama (`/api/tags`) **ou** l'API compatible OpenAI (`/v1/models`, `/v1/embeddings`), avec ou sans `/v1` dans l'URL. Il liste les modèles (nom, taille, empreinte), indique ceux qui produisent des embeddings et fait un test de bon sens FR/EN (une traduction doit être plus proche qu'un sujet voisin). Candidats multilingues : `bge-m3`, `multilingual-e5-large` ; `nomic-embed-text` est surtout anglophone. Le choix définitif se fait sur **mesure** avec le jeu annoté (`/kb/evals`, A14), jamais d'après ce seul test. Puis :

```bash
EMBEDDING_OLLAMA_URL=http://raptor-nino:11434 EMBEDDING_MODEL=bge-m3
```

## 7 ter. Tests de tolérance zéro (réutilisation, D8)

| Niveau | Fichier | Ce qui est prouvé |
|---|---|---|
| Navigateur, serveur LLMOps **réel** | `tests/e2e/browser/second-rfp-zero-tolerance.spec.ts` | rien de présélectionné ; issues de réutilisation indisponibles tant que chaque hypothèse n'est pas jugée ; hypothèse fausse = question réouverte (jamais affichée comme validée) ; inconnue = exception motivée seulement ; actif sans hypothèses ou remplacé non réutilisable ; rejet mémorisé avec sa raison ; contournement par l'API refusé sans rien enregistrer ; 401 sans session |
| Contrat, serveur LLMOps **réel** | `tests/contract/llmops-live-reuse-negative.test.ts` | refus du serveur (hypothèse fausse/inconnue/incomplète/différente, actif sans hypothèses, commentaire manquant, acteur absent) et journal inchangé |
| Contrat | `tests/contract/embedding-encoder.test.ts`, `actor-from-session.test.ts` | un modèle ne usurpe pas un autre ; l'acteur vient de la session |

Les cas « actif sans hypothèses » et « actif remplacé » façonnent la réponse de `/api/knowledge/similar` dans le navigateur (aucun actif de la KB de contrat ne se trouve dans ces situations) ; le refus correspondant du serveur est, lui, vérifié sur le vrai LLMOps.

**Limite connue** : l'acte 6 de l'E2E (boucle fermée) montre que le motif capitalisé entre dans le jugement avec le verdict `unassessed`, car il ne porte pas d'assertion formelle ; prouver qu'il *change* un verdict exige une règle avec assertion (atelier A8).

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

---

## 10. Dossiers d'Engagement Scellés et Alignement Suite (Lots A16 à A21)

Archinex produit le **Dossier d'Engagement Scellé** (`EngagementBundle`), consommé par les moteurs de rendu (Document Engine, Document Studio) sans réinterprétation du statut épistémique des affirmations.

### Principes et Dérivations Déterministes (A16)
- **Profil canonical-json v1** : Le sceau cryptographique SHA-256 (`checksum`) est calculé sur le payload `data` au profil canonique partagé avec la suite.
- **Dérivation des niveaux d'affirmation (`assertion_level`)** :
  - `validated` / `reused_confirmed` $\rightarrow$ `asserted` (exige une personne humaine identifiée par son handle et une base humaine).
  - `ai_proposed` $\rightarrow$ `proposed` (ne devient jamais `asserted` sans validation humaine).
  - `assumption` $\rightarrow$ `assumption` (hypothèses non prouvées).
  - `contested` $\rightarrow$ `open`.
- **Réutilisation prouvée** : Toute décision issue de la base renvoie obligatoirement à une confirmation du journal de réutilisation (`reuse_log`) dont chaque hypothèse est jugée.
- **Deux étages épistémiques** : Le dossier entier porte `is_provisional: true` tant qu'un sujet est sous `L3_decided` ou qu'un conflit est ouvert.
- **Vie privée** : Strictement aucune adresse e-mail dans les exports ; seuls des handles (`@lead-architect`).

### Publication & Interface Utilisateur (A17)
- Dialogue d'homologation unifié (`FreezeSectionDialog.svelte`) intégrant l'onglet **Dossier d'Engagement (Bundle)**.
- Affichage obligatoire du **Bandeau Dossier Provisoire** avec justification (`unripe_subjects`, `open_conflicts`).
- Affichage des **écarts bloquants** et stylage différencié des éléments proposés (non affirmés).
- Sélecteur obligatoire du niveau de confidentialité (`public`, `internal`, `confidential`, `secret`).
- Téléchargement du fichier `engagement-bundle-<snapshotId>.json` et copie de la référence `SnapshotRef` `{ sourceSystem, snapshotId, checksum, producedAt }`.
- Route API `/api/projects/[id]/bundle-export` protégée par session (401 si non authentifié, en-têtes d'e-mail clients ignorés).

### E2E Acte 7 (A18)
- Vérification du cycle complet jusqu'à la publication du dossier scellé.
- Épinglage des référentiels et versions d'instantanés (`pins.kb`, `kb_references`).
- Validation par le vérificateur TypeScript strict (`verifyEngagementBundle`).

### Export OSCAL, Différentiel & Capitalisation (A19)
- **Export OSCAL NIST SSP** : La matrice `compliance` est projetée au format standard NIST OSCAL SSP v1.0.0. **Règle absolue** : Seul ce qui est `asserted` est qualifié de `implemented` (`state: satisfied`) ; toute proposition IA ou hypothèse reste en `planned` / `under-review`.
- **Différentiel déterministe (`diffEngagementBundles`)** : Compare deux dossiers pour identifier ajouts, suppressions, modifications et alerte spécifiquement sur les régressions épistémiques (`asserted` $\rightarrow$ `proposed`).
- **Retour vers la capitalisation (`extractBundleKbCandidates`)** : Les décisions affirmées natives d'un dossier sont transformées en candidats de capitalisation arrivant obligatoirement dans la boîte de revue avec le statut `in_review` (jamais promues automatiquement).

### Alignement sur l'Enveloppe de la Suite (A21)
- L'export figé par section (`SealedSnapshot`) s'encapsule dans `SuiteSnapshotEnvelope` avec `SnapshotRef` associé.
- Projection de la maturité : Le niveau `L5_archived` est projeté vers `L4_specified` pour conformité avec le vocabulaire reconnu de la suite.
