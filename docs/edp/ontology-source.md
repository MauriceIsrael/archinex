# Source de l'ontologie : le Knowledge Hub, et rien d'autre

L'ontologie commune (concepts, axes, feuilles, triplets, règles d'oracle et leurs paramètres) est **écrite et versionnée dans le Knowledge Hub (LLMOps)**. Archinex la consomme ; il n'en tient pas une seconde copie à jour à la main (LLMOps#192, Archinex#417).

## D'où vient le catalogue

| Contexte | Source |
|---|---|
| Production (`NODE_ENV=production`) | `GET /api/knowledge/ontology/export` du Hub ; aucun repli |
| Développement avec Hub | idem ; repli sur la fixture si le Hub est injoignable |
| Tests hors-ligne | `tests/fixtures/edp/ontology_export.json` : **copie générée** de l'export du Hub |

## La fixture est générée, pas écrite

```bash
# depuis un clone de LLMOps (fichier servi par l'export)
node scripts/sync-ontology-fixture.mjs --from-file ../llmops/data/snapshots/ontology_export.json --ref <sha-LLMOps>
# ou depuis un Hub qui tourne
node scripts/sync-ontology-fixture.mjs --from-hub http://127.0.0.1:8099 --token <jeton>
# vérifier sans écrire
node scripts/sync-ontology-fixture.mjs --from-file ... --check
```

Le script écrit aussi `ontology_export.provenance.json` (origine, version du catalogue, empreinte SHA-256). `tests/contract/ontology-fixture-provenance.test.ts` :

- hors-ligne : échoue si la fixture est retouchée à la main (empreinte différente de la provenance) ;
- en ligne (`tests/contract/hub-ontology-fixture-live.test.ts`, lancé par `hub-live` sur les PR et chaque nuit) : échoue si la fixture n’est plus identique à ce que sert le Hub, c'est-à-dire dès que l'ontologie du Hub a changé. Il faut alors **resynchroniser puis relire les tests** qui en dépendent.

Les révisions des entités viennent du catalogue : ni les tests ni la démo ne figent de numéro de révision.

## Ce qui n'appartient pas à l'ontologie commune : les extensions de projet

Identifiants d'exigences (`REQ-…`), mots-clés d'un scénario, instances d'un graphe de réconciliation : de la donnée de **projet**. Elle se déclare dans un fichier d'extension appliqué **par-dessus** le catalogue du Hub (`OntologyProjectOverlay`, `src/lib/server/edp/ontologyClient.ts`), désigné par `ARCHINEX_ONTOLOGY_PROJECT_OVERLAY` (liste de fichiers séparés par des virgules).

- `entityPatches` : par URN d'une entité **existante** du Hub ; objets fusionnés, tableaux réunis, scalaires remplacés ; `{ "$replace": … }` remplace explicitement la valeur du Hub. Une URN absente du Hub est une **erreur** (le Hub a retiré ou renommé l'entité : mettre l'extension à jour) ;
- `addedTriplets` : relations propres au projet, avec des identifiants propres (`tr-prj-…`) pour ne pas entrer en collision avec ceux du Hub.

Sans variable, aucune extension n'est appliquée : la production ne voit que le Hub.

| Fichier | Contenu | Utilisé par |
|---|---|---|
| `tests/fixtures/edp/ontology_project_overlay.lulu.json` | donnée du scénario « Lulu » (exigences, graphe de réconciliation) | tests, démo (`scripts/seed-demo.ts`) |

Il n'existe plus d'extension pour des « écarts de doctrine » : les paramètres et règles des feuilles `oob` et `oam` sont ceux du Hub (LLMOps#201), et Archinex implémente en Rego les règles que le Hub nomme.

## Échelles ordonnées du Hub

Le catalogue du Hub porte des **énumérations ordonnées** (`enumerations`), aujourd'hui `isolation_level` : `shared` < `segmented` < `strict` < `air-gap-logical` < `air-gap-physical`. Archinex :

- les passe à OPA (`data.enumerations`) et compare **par rang** : une zone plus isolée que l'exigence est conforme (`deny_weak_oam_isolation`, `deny_user_plane_management_leak`) ;
- refuse à l'ingestion une exigence hors échelle (`compileOntologyProjections`) ; une valeur observée hors échelle a le rang -1 et est donc signalée ;
- inclut l'échelle dans l'empreinte de l'ontologie compilée, puisqu'elle change le verdict.

## Isolement du plan OOB

`deny_shared_oob_network` (fiche dans `rule_cards` du Hub) vérifie, à la planification, que les interfaces de type `management` sont dans la VRF OOB dédiée déclarée par le gabarit `network_segment` de la feuille, que cette VRF ne porte aucune interface de données, et qu'une VRF OOB est déclarée. L'inventaire hydraté porte pour cela `oob_segments` et `interfaces[*].vrf`. La règle est inerte si `requires_dedicated_vrf` est faux ou si la feuille OOB n'est pas liée.

**Pas encore fait** : la preuve en **dérive** (lecture réelle de la VRF des interfaces dans Nautobot) et la création de la VRF OOB en statut planifié par `nautobotSync` ; comment Nautobot porte ce rattachement (adresse IP, préfixe ou interface) reste à confirmer.

## Surcharges d'exécution

`.archinex-ontology-overlay.json` (triplets ajoutés par l'utilisateur via l'interface) est un autre mécanisme, local à l'instance ; il s'applique après les extensions de projet.
