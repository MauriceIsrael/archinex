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

| Variable | Défaut | Usage |
|---|---|---|
| `LLMOPS_BASE_URL` | URL Cloud Run prod | Rediriger vers staging/local |
| `LLMOPS_TOKEN` | `demo-public-2026-08` | Surcharger le jeton |
| `LLMOPS_ENGAGEMENT` | `nordwave-mcx-2027` | Tester un autre engagement |

