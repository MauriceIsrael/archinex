# ADR-017 : Nautobot, point unique de réconciliation bidirectionnelle entre Archinex et le réel

- **Statut** : Proposé (à valider par les mainteneurs)
- **Date** : 2026-11-21
- **Contexte** : épique #372 (boucle de réconciliation), issues #375 (cet ADR), #398 (statuts et propriété des champs), #399 (write-back), #411 (relocalisation des adaptateurs)
- **Remplace / précise** : les horizons 1 à 3 de `ARCHITECTURE.md` §16 pour tout ce qui parle directement à un outil d'implémentation

---

## 1. Contexte et problématique

Un HLD, même complet et traçable, ne suffit pas : **la dérive apparaît après**, quand les équipes techniques implémentent. Archinex doit donc boucler la boucle **intention (décision) → LLD réel → écart → décision**, sans devenir une usine à gaz.

État constaté dans le dépôt :

- Archinex écrit dans Nautobot (`src/lib/server/edp/nautobotSync.ts`) et lit son état (`pullLiveInventoryFromNautobot`, webhook authentifié par HMAC, `DriftFinding` persistés par `driftService.ts`, livrés par #377).
- Archinex ouvre **directement** des PR/MR vers une forge Git (`sylvaGitopsExport.ts`, modes `github_pr` / `gitlab_mr`).
- Six adaptateurs Port/Adapter existent (`src/lib/server/edp/adapters/` : Batfish, OpenBao, Keycloak, Zot + Trivy, DNS/DDI, forge Git ; PR #363). **Aucun n'est appelé par l'application** (seuls les tests les importent) et plusieurs contiennent des **chemins d'écriture directe** vers l'outil réel (`provision`, POST/PUT).
- Les issues #351 à #358 demandaient autant de connecteurs directs. #352 à #357 sont fermées (implémentées par la PR #363) ; #351 et #358 restent ouvertes.

Chaque connecteur direct ajoute à Archinex une surface d'authentification, de maintenance et de **dérive** : une modification faite dans l'outil échappe à la réconciliation, et Archinex finit par posséder (donc par dupliquer) l'état de N outils.

## 2. Décision

1. **Nautobot est l'unique point de réconciliation bidirectionnel d'Archinex.** Archinex y **écrit** des objets au statut *Planned* et y **lit** l'état réel. Archinex n'écrit dans aucun autre système d'implémentation.
2. **Les outils d'implémentation consomment Nautobot.** GitOps Sylva, DNS/DDI, Vault/PKI, IdP, Batfish, supply chain OCI, ITSM : chacun est un **connecteur derrière Nautobot** (App, Job, webhook, Golden Config, ou dépôt consommateur). Il lit les objets Nautobot, agit (ou vérifie) dans le système réel, puis **écrit son statut et sa preuve dans Nautobot**.
3. **Cycle de vie des objets.** Archinex crée en *Planned*. Les objets évoluent ensuite (selon les statuts du modèle Nautobot concerné) **par les connecteurs et l'enforcement dans le système réel**. Archinex **ne force jamais** un statut « réalisé » ; il ne l'affiche comme tel que si la preuve du connecteur est présente (#398, #399).
4. **Tranche minimale d'abord.** Trois familles d'objets (**Tenant** ; **Device + statut** ; **Prefix / VLAN / IP**) et quatre types d'écart : `missing`, `unexpected`, `attribute_mismatch`, `status_regression`.
5. **Aucun écart sans rattachement.** Chaque écart se rattache à une décision et à une clause ; sinon il est affiché « hors décision », jamais ignoré.
6. **Distinguer « non vérifié » de « aucune dérive ».** Nautobot injoignable, connecteur muet ou donnée périmée donnent l'état **non vérifié**, jamais « conforme ».

### 2.1 Hors périmètre (liste fermée)

Tant que la tranche minimale n'est pas **en production sur un projet réel**, sont hors périmètre :

- tout nouvel appel d'écriture d'Archinex vers un outil d'implémentation ;
- tout nouveau connecteur direct ;
- l'extension de la tranche minimale (circuits, tunnels VPN, firewalls, etc. : le code existant est **conservé et gelé**, non étendu) ;
- Prometheus/Alertmanager, Batfish comme étape bloquante, Nephio (horizons 2 et 3 de `ARCHITECTURE.md` §16).

**Critère pour ajouter un élément à la liste** : la tranche minimale tourne en production sur un projet réel, avec au moins un connecteur de référence respectant le contrat de write-back (#399).

### 2.2 Sécurité

- Un **jeton Nautobot par projet** (cohérent avec le scope `projectScope` existant), au **moindre privilège**.
- Un **jeton distinct par connecteur**, limité aux champs de réalisation et au statut (#399).
- Aucun secret journalisé ni exposé au navigateur ; webhooks authentifiés par HMAC (déjà le cas depuis #377).
- Le journal de modifications de Nautobot sert de **source d'audit** de l'état réalisé.

## 3. Répartition des responsabilités

| Domaine | Archinex | Nautobot | Connecteurs |
|---|---|---|---|
| Exigences, délibération, décision | **Possède** | — | — |
| Contraintes (KB, réglementaire) | **Évalue** (Hub) | — | — |
| Intention du LLD (objets *Planned*) | **Écrit** | **Stocke** | Lisent |
| Champs d'**intention** | **Propriétaire** (empreinte `archinex_intent_hash`) | Stocke | Lisent |
| Champs **réalisés** (statut, IP allouée, version, preuve) | Lit seulement | Stocke | **Propriétaires** |
| Détection d'écart, `DriftFinding`, décision caduque | **Possède** | Source de l'état | — |
| Action dans le système réel | — | — | **Possèdent** |

La propriété fine des champs et les transitions de statut autorisées sont définies par #398 et publiées dans [`docs/edp/field-ownership.md`](../edp/field-ownership.md) (tables de statuts et de transitions par acteur) ; le marquage de traçabilité et le push idempotent (#376) dans [`docs/edp/nautobot-trace-markers.md`](../edp/nautobot-trace-markers.md) ; le contrat d'écriture des preuves par les connecteurs par #399.

## 4. Où vivent les oracles

- Les oracles de **décision** (Rego, `edp/policies/*.rego`, exécutés par `opaRunner.ts`) **restent dans Archinex**. Ils s'évaluent sur l'**intention** et sur un **instantané lu** de Nautobot. Tout verdict porte sa **provenance** (défauts, catalogue, inventaire réel : #380) ; un verdict sur des valeurs par défaut n'est jamais présenté comme opposable.
- Les contrôles d'**enforcement** (un système réel est-il conforme ?) vivent **côté connecteurs** et remontent leur verdict dans Nautobot via le write-back.

> Hypothèse à valider : cette frontière suppose que l'instantané Nautobot lu par Archinex est suffisant pour évaluer les règles de décision. Si une règle exige une donnée que Nautobot ne porte pas, elle migre côté connecteur plutôt que de rouvrir un accès direct.

## 5. Disponibilité et dégradation

Nautobot devient un **point critique de la boucle** (pas de l'application : la délibération n'en dépend pas).

- Indisponible : état **non vérifié** (règle 6), jamais « conforme ».
- Écritures vers Nautobot : **idempotentes et rejouables** (comparaison de `archinex_intent_hash`, mode `dry-run`) avec file de réessai ; aucune perte d'intention (l'intention reste dans Archinex).
- Sauvegarde et restauration de Nautobot : sous la responsabilité de son exploitant ; la reconstruction d'un Nautobot vide à partir de l'intention est un scénario de test de #376.
- Un connecteur muet depuis N jours sur des objets attendus déclenche **non vérifié** (#379).

## 6. Où vit chaque outil

| Outil | Alimenté depuis Nautobot par | Écrit dans Nautobot | Code |
|---|---|---|---|
| GitOps Sylva (`values.yaml`, PR/MR) | Job/App Nautobot ou dépôt consommateur (**connecteur de référence**, #381) | statut, lien de la PR, résultat CI | hors cœur Archinex |
| IPAM | Nautobot **lui-même** (allocation de la prochaine adresse) ; Archinex demande l'allocation (#351) | adresse allouée | Nautobot |
| DNS / DDI | connecteur | verdict de réservation / collision | `connectors/` (#411) |
| Vault / OpenBao / PKI | connecteur | verdict d'existence des chemins et profils | `connectors/` (#411) |
| IdP (Keycloak) | connecteur | verdict realms / rôles / scopes | `connectors/` (#411) |
| Registre OCI, Cosign, Trivy | connecteur | verdict signature / CVE | `connectors/` (#411) |
| Batfish / SuzieQ | connecteur (configurations générées depuis les objets) | verdict d'analyse | `connectors/` (#411) |
| ITSM / CMDB (RFC/CAB) | connecteur | numéro et état de la demande | à définir (#358, partie ITSM) |

## 7. Classement des composants existants

| Composant | Constat | Classement proposé | Suivi |
|---|---|---|---|
| `nautobotSync.ts` (écriture *Planned*, lecture live) | cœur du dispositif | **Garder** ; étendre seulement la tranche minimale ; circuits/VPN conservés et **gelés** | #376, #398 |
| `driftService.ts`, webhook Nautobot, `DriftFinding` | livrés par #377 | **Garder** | #378, #379 |
| `nautobotPlannedExtract.ts` (ex-`adapters/nautobotAdapter.ts`) | lecture de Nautobot | **Gardé** (module neutre de lecture) ; requête GraphQL paramétrée par `$site_slug` (site codé en dur supprimé) | #411 (fait) |
| `manifestSanitizer.ts` (ex-`adapters/sylvaAdapter.ts`, `sanitizeManifests`) | utilitaire utilisé par l'export | **Gardé**, déplacé dans un module neutre hors `adapters/` | #411 (fait) |
| `sylvaGitopsExport.ts` : ouverture directe de PR/MR | **écriture directe** vers une forge | **Déplacer** derrière Nautobot (connecteur de référence) ; garder `local_bundle` ; ouverture directe derrière un drapeau de dépréciation jusqu'à parité | #381 |
| 6 adaptateurs (`connectors/` : Forgejo, OCI/Trivy, Batfish, OpenBao, Keycloak, DNS/DDI) | relocalisés hors `src/lib/server/edp/adapters/` | **Relocalisés dans `connectors/`** ; aucun import depuis `src/` ; write-back #399 implémenté sur le socle GitOps Forgejo, autres documentés « à reprendre » | #411 (fait) |

### 7.1 Tableau de classement des 6 adaptateurs relocalisés (#411)

Voir le détail complet dans [`docs/edp/connectors-classification.md`](../edp/connectors-classification.md).

| Adaptateur | Emplacement | Classement | Statut write-back (#399) |
|---|---|---|---|
| Forge Git / GitOps (Forgejo) | `connectors/gitopsForgeAdapter.ts` | Connecteur derrière Nautobot *(socle référence #381)* | Implémenté (`reportRealizationToNautobot`) |
| Registre OCI + Cosign + Trivy | `connectors/ociSupplyChainAdapter.ts` | Connecteur derrière Nautobot *(contrôle lecture seule)* | À reprendre |
| Batfish (analyse réseau) | `connectors/batfishAdapter.ts` | Connecteur derrière Nautobot | À reprendre |
| OpenBao / Vault / PKI | `connectors/openbaoAdapter.ts` | Connecteur derrière Nautobot | À reprendre |
| Keycloak (IdP) | `connectors/keycloakAdapter.ts` | Connecteur derrière Nautobot | À reprendre |
| DNS / DDI (Technitium) | `connectors/ddiDnsAdapter.ts` | Connecteur derrière Nautobot | À reprendre |
| `opaRunner.ts`, oracles Rego de décision, `edp verify` | évaluation déterministe | **Garder** (voir §4) | #380 |
| Jumeau numérique Sylva (`sylvaTwin.ts`, sushy, KWOK ; #292 à #294) | vérification pré-déploiement, sans écriture | **Garder** comme analyse hors ligne lisant l'intention ; exécution en CI ; ne pas l'étendre avant clôture de la tranche minimale | à confirmer |
| Registre d'état IMP V2 (#307 : snapshots, quarantaine, CMDB) | **chevauche** Nautobot comme registre d'état | **Re-cadrer** : Nautobot est le registre d'état ; ne pas créer un second registre | à confirmer |

## 8. Sort des issues de connecteurs

- **#352 à #357** : fermées (implémentées par la PR #363) ; relocalisation suivie dans **#411**.
- **#351** (allocation IP) : reste ouverte, re-cadrée : Archinex demande l'allocation à l'IPAM de Nautobot et enregistre le résultat.
- **#358** : à scinder. Le connecteur ITSM passe derrière Nautobot ; le moteur de chiffrage FinOps relève de la délibération et reste côté Archinex.

## 9. Alternatives écartées

- **Connecteurs directs d'Archinex vers chaque outil** : N surfaces d'authentification, N états dupliqués, dérive invisible côté outil.
- **Archinex comme source de vérité du LLD** : le LLD vit et change dans le réel et dans Nautobot ; Archinex deviendrait un second CMDB.
- **Nautobot sans Archinex** (la décision n'est qu'un ticket) : on perd la traçabilité décision → clause → objet et la boucle de retour en délibération.

## 10. Conséquences

**Positives**
- Un seul point d'écart à surveiller ; la dérive de n'importe quel outil devient visible dans Nautobot.
- Archinex se concentre sur la délibération, la couverture et la justification.
- Les connecteurs sont remplaçables sans toucher au cœur.

**Négatives et mitigations**
- Dépendance de la boucle à Nautobot : états « non vérifié », écritures idempotentes (§5).
- La fiabilité de l'état « réalisé » dépend des connecteurs : contrat de write-back et kit de conformité (#399).
- Effort de relocalisation du code existant : borné et séquencé (#411, #381) ; **aucun retrait avant parité**.

## 11. Questions ouvertes (à trancher par les mainteneurs)

1. **Version minimale de Nautobot** exigée (le module VPN natif demande 2.2+) et politique de montée de version.
2. **Hébergement des connecteurs** : paquet de l'espace de travail (`connectors/`) ou dépôt séparé.
3. **Propriété du schéma** des champs `archinex_*` et `realized_*` dans Nautobot (installation par Archinex ou par l'exploitant).
4. **Seuil de sévérité** à partir duquel un écart rend une décision caduque (#378).
5. **Sort du jumeau numérique** et du registre d'état IMP V2 (§7).

## 12. Plan de réalisation

1. #398 : statuts et propriété des champs. 2. #376 : marquage de traçabilité et push idempotent. 3. #399 : contrat de write-back et kit de conformité. 4. #411 puis #381 : relocalisation, cadre et connecteur de référence. 5. #378, #379 : cycle de vie de la dérive et réconciliation périodique.

Voir l'épique #372 et `ARCHITECTURE.md` §16.
