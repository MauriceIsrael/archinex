# Audit des exigences : rfp-section4-noc.md

Modèle : `claude-sonnet-5-5` · statut : ok · généré le 2026-10-18T20:49:30.228Z

> Toutes les dispositions ci-dessous sont des **propositions du modèle**. Rien n'est décidé tant qu'un humain ne les a pas relues. Chaque clause apparaît exactement une fois, dans la section de son état.

## Lecture rapide

| État | Clauses | Que faire |
| --- | --- | --- |
| À délibérer | 77 | Ouvrir les 12 sujets dans l'espace de délibération |
| À qualifier | 0 | Trancher vous-même : promouvoir en sujet, ou évacuer avec un motif |
| À clarifier | 9 | Envoyer les questions au donneur d'ordre |
| Évacuation proposée | 6 | Relire toutes les clauses « majeur », un échantillon des « info » |
| **Total** | **92** |  |

## Plan de délibération proposé

Ordre proposé par le modèle (importance pour l'offre, puis difficulté d'architecture), à ajuster en équipe.

| Rang | Sujet | Importance | Difficulté | Nature | À trancher après | Recouvre |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SUBJ-01 · NOC dédié souverain : topologie primaire/secours (actif ou froid) et salle | H | H | architecture | — | — |
| 2 | SUBJ-02 · Haute disponibilité NOC : actif-actif ou actif-passif à bascule rapide | H | H | architecture | SUBJ-01 | — |
| 3 | SUBJ-10 · Assurance de service : sondes actives de bout en bout ou déduction par compteurs ? | H | H | architecture | SUBJ-04 | — |
| 4 | SUBJ-03 · Interface O&M : YANG natif imposé ou EMS propriétaires intégrés | M | H | architecture | — | — |
| 5 | SUBJ-04 · Médiation OSS avec NRM unifié ou adaptateurs propriétaires par fournisseur | M | H | architecture | SUBJ-03 | — |
| 6 | SUBJ-05 · Supervision de la RAN MNO partagée : adaptation aux interfaces OSS imposées du MNO | M | H | architecture | — | — |
| 7 | SUBJ-06 · Corrélation d'alarmes et RCA : règles déterministes, analytique ML ou approche hybride | M | M | architecture | SUBJ-04 | — |
| 8 | SUBJ-07 · Pipeline de collecte unique ou chaînes séparées NOC et SOC/SIEM | M | M | architecture | — | — |
| 9 | SUBJ-08 · Degré d'automatisation SMO/OSS : boucle fermée, approbation humaine ou graduée | M | M | architecture | SUBJ-06 | — |
| 10 | SUBJ-09 · Gouvernance QoS NOC : référentiel 5QI unique ou mapping par domaine | M | M | architecture | SUBJ-05 | — |
| 11 | SUBJ-11 · Détection brouillage, fausses stations et perte GNSS : RAN intégré ou sondes dédiées | M | M | architecture | — | — |
| 12 | SUBJ-12 · Source de référence inventaire/CMDB et découverte automatique encadrée par le changement | M | M | organisationnel | — | — |

## Pourquoi ces sujets (12)

### SUBJ-01 · NOC dédié souverain : topologie primaire/secours (actif ou froid) et salle

Section NOC – organisation, salle, environnement, postes · en attente de `lead_architect` · effort L · 8 clause(s)

- **Question à trancher** : Comment dimensionner un NOC LUMICC dédié 24×7, non mutualisé avec celui du MNO, sur deux sites géo-redondants : salle de secours en actif (exploitation en continu depuis les deux sites) ou en froid/tiède (activation sur sinistre) ? Quelle distance, quelle autonomie énergétique et quelle sécurité physique, compte tenu des objectifs RAMS ?
- **Tension principale** : REQ-Lot1-191 (NOC dédié, non mutualisé avec le MNO) renforce souveraineté et isolation, mais augmente coût et complexité d'exploitation d'une RAN partagée. REQ-Lot1-192 (haute disponibilité, géo-redondance, 24×7) pousse vers un secours actif, coûteux en effectifs et en infrastructure. REQ-Lot1-277 (autonomie > 72 h, sécurité physique) double les coûts de site. REQ-Lot1-282 impose un secours utilisable si le site primaire est indisponible, isolé ou inaccessible.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un NOC dédié avec deux salles géo-redondantes, la salle de secours en mode chaud réduit (postes pré-installés, connectivité et accès réseau permanents, bascule des opérateurs par procédure testée). La mutualisation partielle avec le MNO est écartée car REQ-Lot1-191 est bloquant et l'interdit explicitement. Un secours en froid complet est écarté a priori : il ne garantit pas la continuité 24×7 de REQ-Lot1-192 ni un temps de reprise compatible avec le réseau mission-critique, sauf si les objectifs RAMS (non fournis ici) le tolèrent. Un secours en actif-actif complet est le plus robuste mais le plus coûteux en effectifs et en postes. Le compromis reste à valider selon les objectifs RAMS et le budget d'exploitation.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie ; le sujet est traité comme une exigence nouvelle, avec REQ-Lot1-191 (NOC non mutualisé avec le MNO) comme contrainte bloquante.)
- **Question pour le sachant** : Quels sont les objectifs RAMS (disponibilité, RTO/RPO d'exploitation) applicables au NOC lui-même ? Un secours en froid ou en tiède les satisfait-il ?
- **Question pour le sachant** : Le donneur d'ordre fixe-t-il une distance minimale ou maximale entre salle primaire et salle de secours, ou des critères d'indépendance (réseau, énergie, zone de risque) ?
- **Question pour le sachant** : « Non mutualisé avec le NOC du MNO » interdit-il aussi les locaux, l'énergie ou les services de sécurité physique partagés avec le MNO, ou seulement l'équipe et l'outillage d'exploitation ?
- **Question pour le sachant** : L'autonomie > 72 h est-elle exigée sur chaque salle (primaire et secours) ? Est-elle une cible ou un minimum contractuel ? Quel est le volume de postes à prévoir en secours ?
- **Priorité proposée** : rang 1 (importance H, difficulté H, architecture) — Deux exigences bloquantes (NOC dédié non mutualisé, géo-redondance) engagent souveraineté et disponibilité, et le choix actif ou froid de la salle de secours arbitre coût, distance et complexité d'exploitation sur une RAN partagée.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-191` | bloquant | Un NOC dédié et non mutualisé avec celui du MNO renforce la souveraineté et l'isolation, mais augmente le coût et complique l'exploitation de la RAN partagée. |
| `REQ-Lot1-192` | bloquant | Un NOC haute disponibilité, géo-redondant et 24×7 impose un arbitrage entre coût, topologie primaire/secours et objectifs RAMS. |
| `REQ-Lot1-276` | info | L'intégration téléphonie d'escalade, Teams et interphone interne implique des choix d'interopérabilité et de dépendance à des plateformes tierces, avec un enjeu de conti… |
| `REQ-Lot1-277` | info | Une autonomie énergétique supérieure à 72 h (batteries, groupe électrogène), le HVAC et la sécurité physique relèvent de la continuité de service et impliquent un arbitr… |
| `REQ-Lot1-278` | info | Les postes de management avec agents MDM et EDR non accessibles au manager, connectés au cœur de réseau et aux serveurs INFRA, créent une tension entre sécurité, adminis… |
| `REQ-Lot1-280` | info | Le raccordement des postes et de l'hyperviseur au cœur de réseau et aux serveurs INFRA engage la segmentation réseau, la redondance du routeur (SPOF potentiel) et la séc… |
| `REQ-Lot1-281` | info | L'agencement de la salle NOC est une proposition libre du soumissionnaire qui arbitre ergonomie, sécurité, résilience et coût, avec un impact transverse sur les autres e… |
| `REQ-Lot1-282` | info | La salle NOC de secours (site primaire indisponible, isolé ou inaccessible) engage la continuité de service avec des arbitrages de distance, de mode actif ou froid, de c… |

### SUBJ-02 · Haute disponibilité NOC : actif-actif ou actif-passif à bascule rapide

Section NOC – haute disponibilité, DR, infrastructure sécurisée · en attente de `lead_architect` · effort L · 4 clause(s)

- **Question à trancher** : Quel mode de haute disponibilité (actif-actif, actif-passif à bascule rapide, ou mixte selon les couches) permet de supprimer tout point unique de défaillance sur calcul, stockage, réseau et collecte, avec des procédures de DR testées, à un coût et une complexité acceptables, sans RTO/RPO chiffrés dans les exigences ?
- **Tension principale** : REQ-Lot1-268 et REQ-Lot1-271 (bloquantes) exigent l'absence de SPOF et laissent le choix entre actif-actif et bascule rapide, alors que le coût, la complexité et le RTO/RPO, non chiffrés, sont contraires : l'actif-actif réduit l'indisponibilité mais augmente le coût, la complexité de cohérence des données et le besoin de bande passante inter-sites. S'y ajoute la diversité des liens WAN (REQ-Lot1-270), qui dépend des fournisseurs et des chemins physiques disponibles.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une architecture mixte par couche. Actif-actif pour la collecte et les services applicatifs sans état, car un nœud perdu n'interrompt pas la supervision. Actif-passif à bascule automatique pour les bases de données et le stockage, où la cohérence prime et où la réplication synchrone entre sites est coûteuse et complexe. Les deux exigences bloquantes (268 et 271) admettent explicitement « actif ou bascule rapide », donc rien n'impose l'actif-actif intégral. L'actif-actif intégral est écarté tant que les RTO/RPO ne le justifient pas. Le tout actif-passif est écarté pour la collecte, où une bascule créerait des trous de données. Cette hypothèse reste à valider dès que les RTO/RPO sont connus.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le choix du mode de haute disponibilité, avec ses cibles RTO/RPO, est une exigence nouvelle à instruire.)
- **Question pour le sachant** : Quels sont les RTO et RPO cibles du NOC, globalement et par fonction (collecte, corrélation, bases, interfaces opérateurs) ? Aucune valeur n'est donnée et elles déterminent le choix.
- **Question pour le sachant** : Les deux sites du NOC (primaire et secours) sont-ils imposés, et quelle latence et quelle bande passante sont disponibles entre eux pour une réplication synchrone ?
- **Question pour le sachant** : Une perte de données de collecte pendant une bascule est-elle tolérable, ou la continuité de la supervision doit-elle être sans interruption ?
- **Question pour le sachant** : Quelle fréquence et quelle portée de test de DR le donneur d'ordre attend-il (bascule réelle ou simulée, périodicité) ? Peut-on imposer des opérateurs de liens WAN distincts avec des chemins physiques séparés ?
- **Priorité proposée** : rang 2 (importance H, difficulté H, architecture) — Deux exigences bloquantes d'absence de SPOF et de DR testé rendent l'enjeu éliminatoire, tandis que le choix actif-actif ou bascule rapide par couche reste difficile faute de RTO/RPO chiffrés et dépend de la topologie des sites du NOC.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-268` | bloquant | Exigence bloquante de suppression des points uniques de défaillance : elle arbitre entre actif-actif et bascule rapide, avec un impact sur le coût et la continuité de se… |
| `REQ-Lot1-269` | info | Infrastructure sécurisée et redondante (RBAC, MFA, moindre privilège, journalisation) : sécurité et continuité de service, malgré une criticité informative. |
| `REQ-Lot1-270` | info | Des liens WAN redondants à basculement automatique et chemins physiques distincts relèvent de la continuité de service et arbitrent entre diversité, coût et dépendance a… |
| `REQ-Lot1-271` | bloquant | Le choix actif-actif vs actif-passif sans SPOF sur calcul, stockage et réseau, avec DR testé, arbitre coût, complexité et RTO/RPO, et la criticité est bloquante. |

### SUBJ-03 · Interface O&M : YANG natif imposé ou EMS propriétaires intégrés

Section NOC – interfaces O&M, multi-fournisseurs RAN · en attente de `lead_architect` · effort L · 8 clause(s)

- **Question à trancher** : Pour la supervision et la configuration des RAN, du cœur, de la transmission, des serveurs applicatifs et du datacentre, faut-il imposer YANG/NETCONF et RESTCONF avec NRM 3GPP natifs sur chaque équipement, ou accepter l'intégration d'EMS propriétaires comme voie de repli, et à quelles conditions de conformité ?
- **Tension principale** : REQ-240/REQ-243 (YANG/NETCONF/RESTCONF et NRM 3GPP sur tout le périmètre, notamment RAN, cœur, transmission, serveurs et datacentre) s'opposent à REQ-241/REQ-251 (intégrer un EM pour les éléments sans YANG et s'adapter à des RAN dédiés multi-fournisseurs), avec un risque d'interopérabilité (conformité NRM variable selon les fournisseurs) et de complexité d'exploitation (REQ-242).
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un modèle hybride où le support natif de YANG/NETCONF et RESTCONF avec NRM 3GPP est exigé de tous les fournisseurs (REQ-240, REQ-239), et où l'EMS propriétaire n'est admis que par dérogation, derrière une interface YANG exposée par l'EMS (REQ-241, REQ-243). Cette voie respecte la lettre des exigences, qui prévoient explicitement l'EM pour les éléments sans YANG, tout en limitant le verrouillage. Le YANG natif exclusif est écarté : il élimine des équipements existants ou des RAN dédiés (FRMCS, in-house) et fragilise le multi-fournisseur (REQ-242, REQ-251). L'EMS propriétaire généralisé est écarté : il multiplie les intégrations et crée une dépendance fournisseur. Le détail de la couche de médiation relève d'un autre sujet.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie : le sujet (YANG/NETCONF/RESTCONF, NRM 3GPP, EMS de repli) est une exigence nouvelle à instruire sans référentiel interne.)
- **Question pour le sachant** : Quels équipements ou RAN existants ou pressentis (GOV, AGA, FRMCS, in-house, relais embarqués) ne supportent pas YANG/NETCONF/RESTCONF natif, et quel est leur poids dans le périmètre ?
- **Question pour le sachant** : Le donneur d'ordre exige-t-il le YANG natif comme critère d'éligibilité des fournisseurs, ou accepte-t-il un EMS exposant une interface YANG conforme aux NRM 3GPP ?
- **Question pour le sachant** : Quels modèles YANG et profils NRM 3GPP précis (et versions) sont attendus, et la conformité doit-elle être démontrée par des tests d'interopérabilité ?
- **Question pour le sachant** : Le choix entre NETCONF/SSH et RESTCONF/HTTP/TLS est-il laissé au soumissionnaire, ou une politique de sécurité (authentification, chiffrement, gestion des clés) l'impose-t-elle ?
- **Priorité proposée** : rang 4 (importance M, difficulté H, architecture) — Aucune exigence bloquante, mais l'imposition de YANG/NETCONF et NRM 3GPP natifs sur tout le périmètre dépend des capacités des fournisseurs tiers et conditionne la médiation OSS.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-201` | majeur | La gestion de RAN multi-fournisseurs impose un arbitrage entre standards ouverts (O1, etc.), EMS propriétaires et intégration, avec risque de dépendance fournisseur. |
| `REQ-Lot1-239` | majeur | La conformité aux NRM 3GPP aux points de référence avec les RAN contraint le choix des équipements et la médiation, avec un risque d'interopérabilité selon les fournisse… |
| `REQ-Lot1-240` | majeur | Le support de YANG/NETCONF et RESTCONF sur l'interface O&M engage la compatibilité des équipements, avec le choix entre support natif et adaptation. |
| `REQ-Lot1-241` | majeur | Intégrer un EM pour les éléments sans YANG arbitre entre EM propriétaires et couche de médiation, avec un coût d'intégration et un risque de verrouillage. |
| `REQ-Lot1-242` | majeur | Le multi-fournisseur sur de nombreux RAN (macro, in-building, véhicules, FRMCS) oppose ouverture et maîtrise de la complexité d'exploitation et de maintenance. |
| `REQ-Lot1-243` | majeur | Une interface O&M YANG unifiée couvrant RAN, cœur, transmission, serveurs applicatifs et datacentre est un choix d'architecture à fort impact transverse et à risque d'in… |
| `REQ-Lot1-251` | majeur | S'adapter à des RAN dédiés multi-fournisseurs (GOV, AGA, FRMCS, in-house) engage le choix entre standardisation imposée et adaptateurs spécifiques. |
| `REQ-Lot1-254` | info | Choisir entre NETCONF/SSH et RESTCONF/HTTP/TLS pour la collecte, la configuration et l'audit des RAN arbitre sécurité, performance et compatibilité, malgré une criticité… |

### SUBJ-04 · Médiation OSS avec NRM unifié ou adaptateurs propriétaires par fournisseur

Section NOC – médiation, NRM, dashboards, hypervision, SLA · en attente de `data_architect` · effort L · 8 clause(s)

- **Question à trancher** : Comment réaliser la normalisation des compteurs, alarmes et topologie multi-fournisseurs : couche de médiation OSS vers un NRM unifié (REQ-Lot1-249), ou adaptateurs propres à chaque fournisseur alimentant dashboards, hyperviseur et SLA ? Et si médiation, avec quel niveau de conservation de la sémantique d'origine pour respecter REQ-Lot1-211 ?
- **Tension principale** : REQ-Lot1-249, REQ-Lot1-238 et REQ-Lot1-234 poussent vers une normalisation forte (NRM, taxonomie unique, sémantique commune des KPI), alors que REQ-Lot1-211 exige une interprétation des alarmes selon la spécification de chaque fournisseur. Une normalisation trop agressive perd cette fidélité et risque l'erreur d'exploitation ; une normalisation trop faible compromet SLA et topologie.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une couche de médiation OSS avec NRM unifié, conservant en parallèle l'identifiant et la sémantique d'origine du fournisseur (compteur, code d'alarme, spécification applicable). Elle découle de REQ-Lot1-249, qui la demande explicitement, et de REQ-Lot1-238 (bloquant), qui exige une topologie indépendante du fournisseur. Les adaptateurs propres à chaque fournisseur sans modèle commun sont écartés : ils ne garantiraient ni sémantique de KPI cohérente pour le SLA (REQ-Lot1-234) ni une agrégation homogène pour les dashboards (REQ-Lot1-233) et multiplieraient les intégrations. Une variante hybride (adaptateurs en entrée, modèle canonique en sortie) est retenue comme mode de mise en œuvre de la médiation, pas comme alternative. Le coût de mapping et le risque de perte de fidélité sont à maîtriser par un périmètre de normalisation progressif et un référentiel de mapping versionné.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie ; REQ-Lot1-249 impose déjà une couche de médiation vers un NRM unifié, le sujet reste donc à instruire comme exigence nouvelle.)
- **Question pour le sachant** : Quels fournisseurs, quelles familles d'équipements (RAN, cœur, transmission, MCX, infrastructure) et quelles interfaces de collecte sont dans l'inventaire des actifs LUMICC, et lesquels sont déjà connus au moment de l'offre ?
- **Question pour le sachant** : Le NRM doit-il s'appuyer sur un modèle de référence existant (standard 3GPP/TM Forum ou autre) ou le donneur d'ordre a-t-il un modèle propre à respecter pour REQ-Lot1-252 ?
- **Question pour le sachant** : Quelles règles de calcul des KPI et de pénalités de SLA sont contractuelles, et le donneur d'ordre exige-t-il d'auditer la traçabilité entre compteur brut fournisseur et KPI normalisé ?
- **Question pour le sachant** : Le donneur d'ordre exige-t-il la réversibilité ou le remplacement d'un fournisseur sans refonte des dashboards, et la propriété du référentiel de mapping lui revient-elle ?
- **Priorité proposée** : rang 5 (importance M, difficulté H, architecture) — Une exigence bloquante et huit exigences poussent vers un NRM unifié, mais la sémantique propre à chaque fournisseur rend la normalisation multi-fournisseurs complexe et dépend du niveau de standardisation des interfaces retenu.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-211` | majeur | L'interprétation correcte des alarmes de plusieurs fournisseurs exige un modèle de normalisation et de médiation, avec un risque d'erreur d'exploitation et de dépendance. |
| `REQ-Lot1-232` | majeur | Un tableau de bord centralisé temps réel et historique sur RAN, cœur, transmission, MCX et infrastructure impose un choix de plateforme d'agrégation et de rétention de d… |
| `REQ-Lot1-233` | majeur | L'agrégation d'actifs multi-fournisseurs oppose l'intégration normalisée (modèle commun) à des adaptateurs propriétaires, avec un risque de dépendance. |
| `REQ-Lot1-234` | majeur | Le calcul de KPI et le suivi de SLA multi-fournisseurs supposent une sémantique commune et ont un impact contractuel et de pénalités. |
| `REQ-Lot1-236` | majeur | Un hypervisor personnalisable pour la salle de contrôle du donneur d'ordre impose un choix entre outil sur étagère et développement spécifique, avec des enjeux de dispon… |
| `REQ-Lot1-238` | bloquant | La visualisation de la topologie complète indépendamment des fournisseurs, exigence bloquante, impose un modèle de données et une couche de médiation communs face à des … |
| `REQ-Lot1-249` | majeur | La normalisation des compteurs propriétaires vers un NRM unifié dans une couche de médiation OSS est un arbitrage structurant entre coût de mapping et fidélité des KPI. |
| `REQ-Lot1-252` | majeur | Le NRM entre INFRA et RAN dédiés détermine le modèle de données de configuration, de performance et d'alarmes, avec un impact transverse sur les fournisseurs. |

### SUBJ-05 · Supervision de la RAN MNO partagée : adaptation aux interfaces OSS imposées du MNO

Section NOC – RAN MNO partagée (MOCN) · en attente de `domain_architect` · effort L · 4 clause(s)

- **Question à trancher** : Comment l'INFRA obtient-elle, via les interfaces OSS/ENM imposées par le MNO, une visibilité suffisante pour superviser la RAN MNO partagée, distinguer ressources partagées et ressources exclusives LUMICC (NRM MOCN), et vérifier que le service reste actif tant que le service commercial du MNO l'est ?
- **Tension principale** : REQ-Lot1-250 impose de s'adapter à un OSS tiers dont on ne maîtrise ni le périmètre ni la granularité, alors que REQ-Lot1-253 exige un NRM distinguant ressources partagées et exclusives LUMICC, et REQ-Lot1-200 exige l'accès à toutes les informations nécessaires. REQ-Lot1-206 demande en outre de garantir la continuité du service partagé sans pouvoir agir sur les décisions d'exploitation du MNO.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une couche d'adaptation côté INFRA, avec un connecteur par interface MNO réellement exposée (REST/RESTCONF, NETCONF, Kafka, Syslog, SNMP, SFTP XML/CSV), alimentant un NRM MOCN unique qui sépare ressources partagées et ressources exclusives LUMICC. Le REQ-Lot1-250 impose l'adaptation à l'OSS du MNO et exclut donc un modèle où l'on imposerait notre propre interface. Le REQ-Lot1-206 est traité comme une règle de gouvernance contractuelle (engagement du MNO et notification avant tout changement), complétée d'un contrôle de cohérence côté NOC. Option écartée : la supervision uniquement indirecte par sondes de service, car elle ne donne ni statut des stations ni KPI radio (REQ-Lot1-200) ni alarmes. Option écartée aussi : s'en remettre à des rapports périodiques du MNO, trop peu réactifs pour un service critique. Cette hypothèse reste à confirmer selon le périmètre de supervision que le LUMICC Network operator indiquera.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie ne couvre la supervision d'une RAN partagée en MOCN via l'OSS d'un tiers : le sujet est nouveau.)
- **Question pour le sachant** : Le LUMICC Network operator confirme-t-il que la supervision de la RAN MNO partagée est dans le périmètre (REQ-Lot1-200) ? Si non, les REQ-Lot1-250 et -253 se réduisent-ils à un modèle de données et à un accueil d'alarmes ?
- **Question pour le sachant** : Quelles interfaces OSS/ENM le MNO s'engage-t-il à exposer, avec quelle granularité (par PLMN, par cellule, par slice) et quelle latence, et sont-elles contractualisées ou indicatives ?
- **Question pour le sachant** : Comment le MNO identifie-t-il techniquement les ressources exclusives LUMICC (PLMN-ID, cellules, tranches) dans son OSS, et accepte-t-il de les filtrer à notre intention sans exposer ses données propres ?
- **Question pour le sachant** : Que prévoit le contrat pour REQ-Lot1-206 : engagement du MNO, préavis avant désactivation, ou simple obligation de moyens, et quelles pénalités ?
- **Priorité proposée** : rang 6 (importance M, difficulté H, architecture) — La visibilité sur la RAN MNO partagée dépend d'un OSS tiers imposé dont périmètre et granularité échappent à LUMICC, ce qui rend difficile la distinction entre ressources partagées et exclusives, même avec peu d'exigences et aucune bloquante.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-200` | majeur | L'accès aux données de supervision radio (RAN Lot 2, éventuellement RAN MNO partagée) crée une tension entre visibilité opérationnelle, interopérabilité avec le MNO et s… |
| `REQ-Lot1-206` | majeur | Maintenir la RAN MNO partagée tant que le service commercial est actif concilie continuité de service critique et dépendance vis-à-vis des décisions d'exploitation du MN… |
| `REQ-Lot1-250` | majeur | En MOCN, l'INFRA doit s'adapter aux interfaces OSS de l'opérateur mobile, sans maîtrise de celles-ci, ce qui crée une tension entre interopérabilité, visibilité de servi… |
| `REQ-Lot1-253` | majeur | Le NRM MOCN doit distinguer ressources partagées et ressources exclusives LUMICC, en tension avec les limites de visibilité de l'opérateur mobile. |

### SUBJ-06 · Corrélation d'alarmes et RCA : règles déterministes, analytique ML ou approche hybride

Section NOC – gestion des alarmes, corrélation, RCA · en attente de `domain_architect` · effort L · 5 clause(s)

- **Question à trancher** : Quel moteur de corrélation et de RCA retenir pour le NOC LUMICC (règles déterministes enrichies par la topologie, analytique ML/MDA, ou combinaison des deux) afin de maîtriser les tempêtes d'alarmes, les fausses alarmes et le délai de RCA, tout en restant conforme au cadre 3GPP MDA sur le cœur et la RAN, sans risque inacceptable de faux diagnostic sur un service critique ?
- **Tension principale** : REQ-Lot1-197 (conformité 3GPP MDA cœur et RAN) et REQ-Lot1-212/215 (réduction des fausses alarmes, RCA rapide) poussent vers l'analytique avancée. Mais REQ-Lot1-214 (enrichissement par topologie, géolocalisation, services affectés) et le risque de mauvais diagnostic sur service critique plaident pour des règles déterministes explicables, dépendantes d'un inventaire fiable.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une approche hybride par couches. Un socle déterministe (déduplication, suppression, filtres, fenêtres de maintenance, corrélation topologique et services affectés) couvre REQ-214, REQ-215 et REQ-257 de façon explicable et auditable. Une couche analytique alignée 3GPP MDA est exposée en complément (REQ-197), en mode d'aide à la décision, sans action automatique sur diagnostic non validé. Le tout règles seul est écarté car il tient mal face à un parc multi-fournisseurs évolutif et à la réduction des fausses alarmes sans impact service ; le tout ML est écarté car le risque de faux diagnostic, l'explicabilité et la dépendance à la qualité des données d'inventaire sont mal maîtrisés au démarrage. Le dosage reste à valider par l'équipe.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet (corrélation, RCA, conformité 3GPP MDA) est une exigence nouvelle à instruire sans référentiel interne.)
- **Question pour le sachant** : Quel niveau de conformité 3GPP MDA est attendu (fonctions MDA et cas d'usage précis, exposition d'interfaces, ou simple alignement) et est-il vérifiable en recette ?
- **Question pour le sachant** : Quelle est la tolérance du donneur d'ordre à un diagnostic erroné sur un service critique, et la RCA automatique doit-elle rester indicative ou peut-elle déclencher des actions ?
- **Question pour le sachant** : Existe-t-il des données historiques d'alarmes et d'incidents exploitables, avec quelle qualité, pour entraîner ou calibrer des modèles ML ?
- **Question pour le sachant** : L'inventaire et la topologie multi-fournisseurs seront-ils disponibles et fiables dès la mise en service pour alimenter l'enrichissement et la corrélation ?
- **Priorité proposée** : rang 7 (importance M, difficulté M, architecture) — Enjeu d'efficacité opérationnelle sans exigence bloquante, avec un compromis classique entre règles déterministes et MDA/ML qui suppose une topologie et des données normalisées.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-197` | majeur | La conformité 3GPP MDA sur les domaines cœur et RAN contraint le choix des fournisseurs et des interfaces d'exposition de données, avec un impact transverse sur l'analyt… |
| `REQ-Lot1-212` | majeur | La maîtrise des tempêtes d'alarmes, des fausses alarmes et des délais d'analyse de cause racine repose sur des choix d'architecture de corrélation et d'automatisation. |
| `REQ-Lot1-214` | majeur | La corrélation et l'enrichissement des alarmes (topologie, géolocalisation, services affectés) dépendent d'un modèle de données d'inventaire cohérent et ont un impact tr… |
| `REQ-Lot1-215` | majeur | L'analyse automatique de cause racine pour accélérer le rétablissement arbitre entre règles déterministes et IA/ML, avec un risque de mauvais diagnostic sur un service c… |
| `REQ-Lot1-257` | majeur | Des alarmes enrichies et corrélées sur un système multi-fournisseurs reposent sur un moteur de corrélation dont les alternatives (règles ou analytique) diffèrent par coû… |

### SUBJ-07 · Pipeline de collecte unique ou chaînes séparées NOC et SOC/SIEM

Section NOC – collecte, FMS, syslog, logs · en attente de `lead_architect` · effort L · 6 clause(s)

- **Question à trancher** : La collecte temps réel (YANG, SNMPv3, syslog) et les logs doivent-ils alimenter NOC et SOC/SIEM via un pipeline unique et un agrégateur syslog en bastion, ou via deux chaînes séparées ? Comment garantir l'absence de perte d'information lors de la conversion en syslog, la séparation des domaines et la rétention ?
- **Tension principale** : REQ-213 et REQ-256 imposent un agrégateur syslog commun au NOC et au SOC/SIEM, alors que REQ-255 et REQ-264 demandent au NOC des alarmes structurées (YANG de préférence) corrélées aux KPI. Le syslog est un format appauvri : la conversion perd de l'information. Le partage avec le SOC, lui, exige une séparation des domaines et une intégrité des journaux que la mutualisation complique. La volumétrie temps réel de tous les domaines (REQ-210) pèse en outre sur l'agrégateur, qui devient un point de concentration.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un point de collecte unique côté éléments réseau, l'agrégateur syslog en bastion de l'INFRA (REQ-213), avec un double flux de sortie, l'un vers le NOC (FMS, plateforme de logs) et l'autre vers le SOC/SIEM. Les droits d'accès, la rétention et les index restent distincts par domaine. Cela respecte le texte de REQ-213 et REQ-256, évite de multiplier les flux depuis chaque équipement et rend l'intégrité des journaux plus simple à démontrer. Option écartée : deux chaînes totalement séparées, qui doublent les flux et les points d'intégration et vont à l'encontre de REQ-213. Option écartée aussi : le pipeline entièrement mutualisé jusqu'à la plateforme de données, qui ferait dépendre la sécurité de la disponibilité et des choix du NOC. Le FMS reçoit en parallèle les alarmes natives YANG ou SNMPv3 (REQ-255) afin de ne pas dépendre de la seule conversion en syslog.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet (pipeline de collecte, agrégateur syslog en bastion, partage NOC/SOC) est traité comme exigence nouvelle.)
- **Question pour le sachant** : Le SOC/SIEM est-il fourni et exploité par le donneur d'ordre (produit, formats d'ingestion attendus) ? Quelle responsabilité pour l'agrégateur et le bastion : titulaire ou INFRA ?
- **Question pour le sachant** : Quelles volumétries (événements par seconde, volume quotidien) et quelles durées de rétention sont attendues, séparément pour le NOC et pour le SOC ? Y a-t-il des exigences légales ou d'intégrité (horodatage, scellement) ?
- **Question pour le sachant** : Le SOC exige-t-il une copie brute et non modifiée des logs, ou accepte-t-il les alarmes converties en syslog (REQ-256, criticité info) ? Quel est le niveau de perte d'information acceptable ?
- **Question pour le sachant** : Le périmètre de l'inventaire d'actifs inclut-il des équipements de tiers (MNO partagé en MOCN) dont on ne contrôle pas l'émission de logs ? Quel mode de transport est attendu (TLS, relais, mise en tampon en cas de coupure) ?
- **Priorité proposée** : rang 8 (importance M, difficulté M, architecture) — Le partage de l'agrégateur syslog entre NOC et SOC est imposé, mais le risque de perte d'information lors de la conversion en alarmes structurées reste un compromis maîtrisable, sans exigence bloquante.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-210` | majeur | La collecte temps réel des alarmes, événements, compteurs et journaux de tous les domaines impose des choix de volumétrie, de pipeline de données et de sécurité des flux. |
| `REQ-Lot1-213` | majeur | Un agrégateur syslog protégé dans un bastion, alimentant à la fois le NOC et le SOC/SIEM, engage la sécurité, la séparation des domaines et l'intégrité des journaux. |
| `REQ-Lot1-244` | majeur | L'ingestion temps réel, la rétention historique et l'export standardisé transverses aux outils ITSM, dashboards et O&M engagent le dimensionnement et le choix de la plat… |
| `REQ-Lot1-255` | majeur | Un FMS collectant des alarmes temps réel en YANG, SNMPv3 ou Syslog engage le choix des protocoles et le dimensionnement, avec un impact sur la continuité de service. |
| `REQ-Lot1-256` | info | La conversion en syslog vers un agrégateur NOC et SOC/SIEM croise exploitation et sécurité, avec des enjeux de perte d'information et de séparation des domaines. |
| `REQ-Lot1-264` | majeur | La gestion de logs corrélée aux alarmes et KPI, avec compteurs de latence et de perte de paquets, engage le choix de la plateforme d'observabilité et son dimensionnement. |

### SUBJ-08 · Degré d'automatisation SMO/OSS : boucle fermée, approbation humaine ou graduée

Section NOC – OSS/SMO, automatisation, optimisation · en attente de `lead_architect` · effort L · 4 clause(s)

- **Question à trancher** : Quel niveau d'autonomie accorder au SMO, au moteur de politiques et d'intentions (avec NWDAF) et aux runbooks OSS (remédiation, optimisation QoS, économies d'énergie RAN) sur un réseau de mission critique ? Boucle fermée, approbation opérateur systématique ou autonomie graduée par classe d'action ? Et avec quel découpage OSS/SMO/EMS, intégré ou modulaire ?
- **Tension principale** : REQ-263 et REQ-247 poussent vers la réactivité (automatisation événementielle, détection automatique de non-conformité, traduction SLA→QoS). REQ-207 (économies d'énergie RAN) et le caractère mission critique poussent vers le contrôle opérateur, car une optimisation autonome peut dégrader couverture, capacité ou disponibilité. REQ-246 impose en outre un choix intégré ou modulaire qui conditionne où se situe le point de contrôle.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une autonomie graduée par classe d'action, sur une architecture modulaire OSS + SMO + EMS à responsabilités séparées. Les actions réversibles à faible impact (enrichissement, ticketing, collecte de diagnostic, runbooks de site) s'exécutent en boucle fermée. Les actions à impact sur le service (reconfiguration QoS, remédiation sur éléments critiques) passent par approbation opérateur, conformément à REQ-263 qui prévoit des « options d'approbation ». Les économies d'énergie RAN sont encadrées par des garde-fous (fenêtres, zones exclues, seuils de couverture et de capacité). Écartée : la boucle fermée généralisée, car le risque opérationnel et sécuritaire est trop élevé pour de la mission critique. Écartée aussi : l'approbation systématique, qui annule le bénéfice de l'automatisation événementielle et du moteur d'intentions (REQ-247). La plateforme intégrée mono-fournisseur est écartée à ce stade, car elle verrouille le découpage des responsabilités exigé par REQ-246, mais elle reste à confronter à l'effort d'intégration.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le niveau d'autonomie du SMO, du moteur d'intentions et des runbooks est une exigence nouvelle à instruire.)
- **Question pour le sachant** : Quelles classes d'actions le donneur d'ordre accepte-t-il de voir exécutées sans approbation humaine (remédiation, QoS, énergie), et quelles sont les zones ou services (mission critique) exclus de toute boucle fermée ?
- **Question pour le sachant** : Quelles contraintes de disponibilité, de couverture et de capacité minimales encadrent les économies d'énergie RAN, et y a-t-il une cible chiffrée d'économie ?
- **Question pour le sachant** : Quelles exigences d'auditabilité, de traçabilité, de réversibilité (rollback) et de séparation des rôles pèsent sur les actions automatiques, côté sécurité et réglementation ?
- **Question pour le sachant** : Le donneur d'ordre a-t-il une préférence ou une contrainte sur l'architecture O-RAN (SMO ouvert modulaire) face à une suite OSS intégrée d'un seul fournisseur ?
- **Priorité proposée** : rang 9 (importance M, difficulté M, architecture) — Quatre exigences non bloquantes, mais l'autonomie accordée sur un réseau de mission critique engage la sûreté, et le choix d'une automatisation graduée s'appuie sur la fiabilité de la corrélation et du RCA.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-207` | majeur | L'optimisation énergétique des RAN est en tension avec la disponibilité, la couverture et la capacité à tenir les exigences de mission critique. |
| `REQ-Lot1-246` | majeur | Associer OSS, SMO et EMS fixe l'architecture d'automatisation (type O-RAN) et le découpage des responsabilités, avec des alternatives intégrées ou modulaires. |
| `REQ-Lot1-247` | majeur | Un moteur de politiques et d'intentions avec NWDAF, qui traduit les SLA en configurations QoS, engage un choix d'automatisation à fort impact, en tension avec le contrôl… |
| `REQ-Lot1-263` | majeur | L'automatisation événementielle et la remédiation en boucle fermée avec approbation opérateur arbitrent entre réactivité, risque opérationnel et sécurité. |

### SUBJ-09 · Gouvernance QoS NOC : référentiel 5QI unique ou mapping par domaine

Section NOC – QoS, QCI/5QI, trafic · en attente de `domain_architect` · effort L · 6 clause(s)

- **Question à trancher** : Le NOC doit-il porter un référentiel QoS unique (QCI/5QI standard, opérateur 128-254, 5QI aérien) poussé vers cœur, RAN GOV et RAN MNO partagée, ou un référentiel central avec mapping négocié par domaine, et comment y adosser l'aide à la décision COW/déployable sans maîtrise de l'OSS du MNO ?
- **Tension principale** : La cohérence de priorité des flux critiques de bout en bout (REQ-193, REQ-194, REQ-195) s'oppose à la visibilité et à la maîtrise limitées sur la RAN MNO partagée, tandis que le 5QI aérien en uplink et le steering vers les déployables (REQ-195, REQ-208) consomment de la capacité radio au détriment d'autres flux.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un catalogue QoS central dans le NOC, source de vérité des QCI/5QI standard (6, 7, 8, mission critical), opérateur (128-254) et du 5QI aérien, avec des profils de mapping explicites par domaine (cœur, RAN GOV, RAN MNO partagée). Sur la RAN MNO, le mapping est contractualisé et vérifié par supervision plutôt que piloté directement. Le catalogue alimente l'analytique par 5QI (REQ-231) et un moteur de recommandation COW/déployable fondé sur règles et seuils, validé par un opérateur (REQ-209 est de niveau info). Écartées : le pilotage direct de chaque domaine par ses outils propres (dérive de cohérence, REQ-193) et une décision de renfort entièrement automatique (coûts, délais et choix MNO/GOV à arbitrer humainement).
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie ; le sujet (gouvernance des QCI/5QI, 5QI aérien, déclenchement de capacité) est une exigence nouvelle à instruire sans référentiel interne.)
- **Question pour le sachant** : Le contrat MNO donne-t-il le droit de définir ou d'imposer des 5QI opérateur (128-254), dont le 5QI aérien, sur la RAN partagée, et quelles données de charge et de QoS par 5QI le MNO expose-t-il au NOC ?
- **Question pour le sachant** : Le 5QI aérien doit-il être appliqué sur les deux RAN (GOV et MNO) ou seulement sur la RAN GOV et les déployables, et quelles valeurs cibles de priorité, PDB et PER sont attendues ?
- **Question pour le sachant** : Pour REQ-209, quel niveau d'automatisation le donneur d'ordre attend-il (suggestion simple ou déclenchement), quels critères de choix COW MNO ou déployable GOV (délai, coût, couverture) et quels événements planifiés alimentent le moteur ?
- **Question pour le sachant** : Quelles interfaces d'exposition de la QoS sont disponibles côté EUCCS et roaming pour la ventilation du trafic par 5QI (REQ-231) ?
- **Priorité proposée** : rang 10 (importance M, difficulté M, architecture) — La cohérence de priorité des flux critiques de bout en bout compte pour le service, mais la maîtrise limitée de la RAN MNO partagée contraint le choix entre référentiel 5QI unique et mapping par domaine.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-193` | majeur | Le mapping des QCI/5QI critiques doit rester cohérent entre cœur, RAN GOV et RAN MNO partagée, ce qui a un impact transverse sur la QoS et la priorité. |
| `REQ-Lot1-194` | majeur | Des QCI/5QI définis par l'opérateur (plage 128-254) doivent rester interopérables avec les équipements multi-fournisseurs et le MNO partagé, ce qui impacte la politique … |
| `REQ-Lot1-195` | majeur | Un 5QI aérien dédié (priorité, PDB, PER) pour le streaming UAV en uplink est en tension avec la capacité radio et le steering vers les solutions déployables. |
| `REQ-Lot1-208` | majeur | L'équilibrage de charge, le traffic steering et l'optimisation de la mobilité arbitrent entre performance, priorité des flux critiques et multiplicité des RAN (GOV et MN… |
| `REQ-Lot1-209` | info | L'aide à la décision automatisée pour déployer une cell-on-wheels ou un système déployable fait intervenir des alternatives (MNO ou GOV), des coûts et des délais, avec u… |
| `REQ-Lot1-231` | majeur | L'extraction de la analytique de trafic par QCI/5QI sur des interfaces hétérogènes (RAN gouvernementale, RAN partagée MNO, EUCCS, roaming) dépend de la visibilité exposé… |

### SUBJ-10 · Assurance de service : sondes actives de bout en bout ou déduction par compteurs ?

Section NOC – supervision des domaines, sondes, KPI · en attente de `lead_architect` · effort XL · 11 clause(s)

- **Question à trancher** : Les KPI contractuels MCX (KPI1 à KPI5), handover (KPI6) et FRMCS (KPI7) seront-ils mesurés par des sondes actives et une automatisation de test jusqu'aux terminaux, par déduction des compteurs et de la supervision de chaque domaine, ou par une combinaison dont il faut fixer la répartition ? Quelle source fait foi pour l'opposabilité et le ticket de non-conformité automatique ?
- **Tension principale** : REQ-217 (sondes configurables à fréquence courte, par exemple 30 s à 5 min) et REQ-219 (mesure jusqu'aux terminaux) exigent une fidélité de bout en bout, mais la charge induite sur un service critique et sur la RAN, ainsi que l'accès aux terminaux, s'y opposent. Les cibles serrées de REQ-220 (300 ms, 1000 ms, 350 ms, MOS 4.0) avec ticket automatique rendent la précision de la mesure déterminante. REQ-221 et REQ-222 (handover, 150 ms et 50 ms) sont difficilement observables par sonde applicative et supposent des compteurs RAN ou des mesures en mobilité.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : architecture hybride dans laquelle les sondes actives de bout en bout (terminaux ou émulateurs pilotés par automatisation de test) constituent la source opposable des KPI contractuels MCX. REQ-219 et REQ-220 imposent en effet une mesure « from network up to Devices » comparée à des cibles chiffrées avec ticket automatique, ce qu'aucun compteur réseau ne prouve seul (mouth-to-ear, MOS P.863). Les compteurs et la supervision par domaine (REQ-202, 203, 204, 205, 218) alimentent le PMS (REQ-260) pour la corrélation, le diagnostic et la couverture continue entre deux passes de sonde. L'option « compteurs seuls » est écartée comme source contractuelle : fidélité insuffisante pour KPI2, KPI3 et KPI5. L'option « sondes seules » est écartée : elle n'offre pas de vision des causes ni de couverture fine, et la charge sur un service critique serait maîtrisée uniquement par la fréquence de test.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie ; le sujet (sondes actives, KPI MCX opposables, PMS multi-domaines) est traité comme exigence nouvelle.)
- **Question pour le sachant** : Quelle est la source de mesure opposable convenue avec l'autorité contractante pour chaque KPI (sonde, compteur OSS, mesure terrain), et la méthode de calcul (percentiles, fenêtres, exclusions) est-elle déjà définie ?
- **Question pour le sachant** : Quelle charge de test l'autorité contractante tolère-t-elle sur le service MCX en production (fréquence, appels synthétiques, impact sur la capacité et la priorité), et les sondes peuvent-elles s'exécuter sur un environnement ou des abonnés dédiés ?
- **Question pour le sachant** : Quelles interfaces et API les fournisseurs MCX et RAN (Lot 2) exposent-ils pour la collecte d'événements et de compteurs, et quels terminaux (y compris FRMCS) sont disponibles pour l'automatisation de test ?
- **Question pour le sachant** : Les KPI6 et KPI7 doivent-ils être mesurés en mobilité réelle (campagnes de drive-test, corridor FRMCS) ou peuvent-ils être établis à partir des compteurs RAN ?
- **Priorité proposée** : rang 3 (importance H, difficulté H, architecture) — Onze exigences portent sur les KPI contractuels MCX, handover et FRMCS, probablement liés à des pénalités, et l'arbitrage entre sondes actives de bout en bout, charge sur service critique et déduction par compteurs combine de nombreuses contraintes croisées.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-202` | majeur | La supervision du cœur avec intégration ITSM pour la gestion des incidents a un impact transverse sur les outils, les processus et la continuité de service. |
| `REQ-Lot1-203` | majeur | La supervision de bout en bout du transport (backhaul, backbone, liens de gestion) dépend de réseaux potentiellement tiers et exige un choix entre outils natifs et super… |
| `REQ-Lot1-204` | majeur | La collecte temps réel des défauts et événements MCX touche un service critique et dépend des interfaces exposées par les fournisseurs MCX. |
| `REQ-Lot1-205` | majeur | La supervision des infrastructures, de l'énergie, de la climatisation et des accès sur tous les sites, y compris les éléments MNO partagés, soulève des questions d'accès… |
| `REQ-Lot1-217` | majeur | Les sondes actives MCPTT, MC-Video et MC-Data avec fréquences et protocoles configurables engagent des choix d'architecture de test de bout en bout et la charge qu'elles… |
| `REQ-Lot1-218` | majeur | La supervision de la QoS de la RAN GOV doit s'articuler avec les KPI contractuels et les sondes, sans que les indicateurs soient précisés dans cette exigence. |
| `REQ-Lot1-219` | majeur | La mesure de la couverture et des KPI MCX via sondes et automatisation de test jusqu'aux terminaux engage la méthode, l'outillage et les engagements de reporting contrac… |
| `REQ-Lot1-220` | majeur | Les cibles de latence et de qualité audio (300 ms, 1000 ms, 350 ms, MOS 4.0) sont exigeantes et contraignent le dimensionnement de bout en bout, avec ticket de non-confo… |
| `REQ-Lot1-221` | majeur | Un taux de succès de handover supérieur à 99 %, avec interruption inférieure à 150 ms, contraint fortement la conception radio et la mobilité entre RAN GOV et MNO. |
| `REQ-Lot1-222` | info | Une interruption de service inférieure à 50 ms en forte mobilité FRMCS est une valeur exigeante qui impacte la conception radio et le cœur. |
| `REQ-Lot1-260` | majeur | Un PMS couvrant RAN, cœur, transmission, MCX et IT avec analytique prédictive et supervision de SLA oppose plateforme intégrée et composants assemblés, avec un fort impa… |

### SUBJ-11 · Détection brouillage, fausses stations et perte GNSS : RAN intégré ou sondes dédiées

Section NOC – sécurité radio, brouillage, synchronisation · en attente de `security_architect` · effort L · 8 clause(s)

- **Question à trancher** : La détection, la classification et la contre-mesure du brouillage, des fausses stations/IMSI catchers et de la perte GNSS reposent-elles sur les fonctions des RAN et les mesures UE, sur des sondes et équipements spécialisés, ou sur une combinaison, compte tenu de l'hétérogénéité des RAN multi-fournisseurs, de la continuité de service exigée et de l'accueil futur de l'ISAC ?
- **Tension principale** : La couverture et la fiabilité de détection attendues (REQ-224/225/226/229) s'opposent au coût et à la dépendance aux fournisseurs RAN : les fonctions intégrées sont peu coûteuses mais inégales et peuvent dégrader le service (REQ-225), tandis que les sondes dédiées sont homogènes mais coûteuses. Le maintien du service pour tous les UE malgré le brouillage (REQ-227) s'oppose à la capacité disponible, et les provisions ISAC (REQ-230) créent un surcoût anticipé face à un risque d'obsolescence.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une approche hybride en couches. L'analytique passive des mesures UE (REQ-224) et le déclenchement des mesures RAN (REQ-225, 226) forment la détection de base, car ils sont explicitement demandés au NOC et ne demandent pas de matériel supplémentaire. Des sondes spectrales dédiées ne sont prévues que sur les sites critiques ou là où le RAN ne sait pas fournir la mesure, et pour la détection de fausses stations (REQ-229), que les seules mesures RAN couvrent mal. L'option « tout RAN/UE » est écartée en cible unique parce qu'elle dépend des capacités de chaque fournisseur, que le périmètre MOCN rend incertaines. L'option « tout sondes » est écartée parce que son coût de déploiement est élevé et qu'elle double des fonctions déjà demandées au NOC. Côté GNSS (REQ-223), il faut un holdover de plus d'un mois, donc des oscillateurs de classe adaptée ou une source de synchronisation alternative, à dimensionner avec le sachant. Pour l'ISAC (REQ-230), on se limite à des provisions passives (emplacements, alimentation, capacité de transport), sans équipement.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet est traité comme une exigence nouvelle, sans standard établi à confronter.)
- **Question pour le sachant** : Quelles fonctions de mesure UL, de scan spectral et de reporting UE chaque fournisseur RAN, y compris le MNO partagé en MOCN, expose-t-il réellement, et via quelle interface O&M ?
- **Question pour le sachant** : Quelle sensibilité opérationnelle et quels délais de détection le donneur d'ordre attend-il, et quels sites ou zones sont critiques au point de justifier des sondes dédiées ?
- **Question pour le sachant** : Quelle est la durée de holdover cible au-delà d'un mois (marge, température, vieillissement), et une source de synchronisation alternative au GNSS est-elle acceptable ou souhaitée ?
- **Question pour le sachant** : Qu'entend-on par « servir tous les UE » face au brouillage (REQ-227) : dégradation acceptable, repli de fréquence ou de bande, priorisation des usages ? Le donneur d'ordre a-t-il une échéance de décision sur l'ISAC et un périmètre de sites visés ?
- **Priorité proposée** : rang 11 (importance M, difficulté M, architecture) — Huit exigences non bloquantes de sécurité radio, avec un arbitrage coût et fiabilité entre fonctions RAN intégrées et sondes dédiées, et une dépendance modérée aux fournisseurs RAN.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-223` | majeur | Tenir plus d'un mois sans GNSS impose un choix d'oscillateurs et de sources de synchronisation de substitution, avec un impact sur le coût et la résilience. |
| `REQ-Lot1-224` | majeur | La détection de brouillage par analytique passive des mesures UE oppose fiabilité de détection, charge de reporting et interprétation des corrélations, avec un enjeu de … |
| `REQ-Lot1-225` | majeur | Le déclenchement de mesures radio sur les cellules pour inférer un brouillage dépend des capacités des RAN multi-fournisseurs et peut dégrader la performance du service. |
| `REQ-Lot1-226` | info | Le balayage spectral, la détection et la classification des brouilleurs relèvent de la sécurité et exigent un choix entre fonctions intégrées aux RAN et équipements dédi… |
| `REQ-Lot1-227` | majeur | Maintenir le service pour tous les UE LUMICC malgré le brouillage de certaines fréquences relève de la continuité de service et a un impact sur la planification radio et… |
| `REQ-Lot1-228` | majeur | Les contre-mesures anti-brouillage engagent la sécurité et la résilience, avec des alternatives techniques coûteuses et un impact transverse sur la RAN. |
| `REQ-Lot1-229` | majeur | La détection des fausses stations de base et des IMSI catchers relève de la sécurité et peut s'appuyer sur les UE, la RAN ou des sondes dédiées, avec des compromis de co… |
| `REQ-Lot1-230` | majeur | Prévoir dès maintenant l'accueil d'une fonction ISAC future dans l'infrastructure arbitre entre surcoût anticipé et risque d'obsolescence, avec un impact sur les sites e… |

### SUBJ-12 · Source de référence inventaire/CMDB et découverte automatique encadrée par le changement

Section NOC – CMS, topologie, ITSM, support terrain · en attente de `domain_architect` · effort L · 5 clause(s)

- **Question à trancher** : Quelle est la source de référence pour les éléments réseau et leurs relations entre l'inventaire OSS/CMS et la CMDB de l'ITSM, comment la découverte automatique et la réconciliation sont-elles soumises à autorisation par le processus de changement (REQ-Lot1-262), et l'ITSM (incident, problème, changement, dispatch terrain) est-il une plateforme intégrée au back-office ou un assemblage d'outils synchronisés ?
- **Tension principale** : REQ-Lot1-262 demande une découverte et une réconciliation automatiques tout en interdisant toute application de changement sans autorisation de la gestion des changements, alors que REQ-Lot1-245 exige une synchronisation CMDB/inventaire OSS cohérente. Plus la synchronisation est automatique, plus le risque d'écart ou de contournement du contrôle augmente. Plus elle est filtrée par le changement, plus l'inventaire diverge de la réalité réseau. Le choix ITSM intégré ou assemblé (REQ-Lot1-266, REQ-Lot1-267) déplace cette tension entre intégration native et interfaces à maintenir.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : inventaire/CMS du NOC maître pour les éléments techniques, topologie et configurations (découverte, réconciliation, baselines, dérive), CMDB de l'ITSM maître pour les services, les relations métier et le lien aux changements. La CMDB serait alimentée par synchronisation unidirectionnelle contrôlée depuis le CMS, avec file d'écarts traitée par le processus de changement. La découverte alimente l'inventaire en lecture, jamais la configuration des équipements sans ticket de changement approuvé. Plateforme ITSM intégrée au back-office (REQ-Lot1-266) avec module de dispatch, plutôt qu'outils assemblés : un seul modèle de données et un seul workflow de changement limitent les points de synchronisation et d'écart. Écartées : CMDB maître unique (ne porte pas la découverte multiprotocole ni les snapshots) et inventaire unique sans CMDB (contredit REQ-Lot1-245 et l'ITSM exigé).
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie : le sujet (source de référence inventaire/CMDB, ITSM intégré, découverte sous contrôle du changement) n'est couvert par aucun standard interne.)
- **Question pour le sachant** : Le back-office du donneur d'ordre fournit-il déjà une plateforme ITSM et une CMDB imposées ou à réutiliser, et quel périmètre y est attendu (incident, problème, changement, dispatch) ?
- **Question pour le sachant** : Quelle tolérance d'écart entre inventaire et CMDB est acceptable, et qui arbitre les écarts (exploitation NOC, gestion des changements, propriétaire de service) ?
- **Question pour le sachant** : Les changements standards ou d'urgence peuvent-ils être préautorisés pour la remédiation de dérive, ou tout changement passe-t-il par une approbation individuelle ?
- **Question pour le sachant** : Les données de localisation GNSS des équipes terrain ont-elles des contraintes de conservation, de souveraineté ou de protection des données personnelles qui conditionnent l'hébergement du dispatch ?
- **Priorité proposée** : rang 12 (importance M, difficulté M, organisationnel) — Une exigence bloquante impose que toute application de changement soit autorisée, mais le sujet relève surtout de la gouvernance des processus entre inventaire OSS et CMDB ITSM, avec une difficulté technique modérée.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-245` | majeur | La synchronisation CMDB/inventaire OSS impose de définir la source de référence et la gestion des écarts, avec un impact sur la cohérence des données. |
| `REQ-Lot1-261` | majeur | Sauvegarde, versionnage, détection de dérive et suivi des versions sur éléments multi-fournisseurs touchent à la sécurité de configuration et à l'intégration des équipem… |
| `REQ-Lot1-262` | bloquant | Exigence bloquante : la découverte automatique et la réconciliation de l'inventaire doivent être articulées avec le processus de gestion des changements, en tension entr… |
| `REQ-Lot1-266` | majeur | L'intégration ITIL (incident, problème, changement, SLA, MTTA/MTTR) avec le back-office impose un choix de plateforme ITSM et d'interfaces, avec un impact transverse sur… |
| `REQ-Lot1-267` | majeur | Le dispatch d'équipes selon technologie, priorité et localisation avec pointage GNSS et synchronisation ITSM engage des choix d'intégration et de données de localisation. |

## À qualifier par vous (0)

Le pipeline n'a pas pu ou pas osé trancher. C'est la liste à traiter en premier.

_Aucune._

## À clarifier avec le donneur d'ordre (9)

| Clause | Titre | Question |
| --- | --- | --- |
| `REQ-Lot1-196` | Network automation (C) 1000 | Quel objectif mesurable de réduction des effectifs d'exploitation (ou niveau d'automatisation cible) le donneur d'ordre attend-il pour valider « minimiser les besoins en personnel » ? |
| `REQ-Lot1-198` | Network functions (C) 50 | Quelle est la liste des fonctions réseau qui doivent être opérées depuis le NOC, puisque l'énoncé annonce « les fonctions suivantes » sans les fournir ? |
| `REQ-Lot1-235` | Key performance indicators on NOC own dashboard (C) 50 | Quelles sont les définitions de calcul et les sources de données de chacun des KPI « INFRA availability », « Lot 2 monthly QoE » et « Roaming-pack service availability », et qui fournit les données des Lots 2 et 3 au NOC ? |
| `REQ-Lot1-237` | Dashboard for User organisations (C/COM/EXP) 1000 | Que recouvre précisément « interface to CR to User organisation's domains (without hardware) » : quels CR, quels domaines et quel mode d'accès attendu pour les organisations utilisatrices, notamment sur les positions dispatcher autonomes ? |
| `REQ-Lot1-248` | Multi-supplier O&M and configuration of Network elements (C/COM) 250 | La configuration de tous les éléments de l'inventaire inclut-elle les éléments de la RAN partagée MNO et d'autres actifs tiers, ou se limite-t-elle aux actifs dont le NOC a la maîtrise ? |
| `REQ-Lot1-272` | General requirements on NOC premises (C) 50 | Quels niveaux précis de sécurité, de résilience (ex. niveau de redondance, classification de site) et de disponibilité 24/7 sont attendus pour les locaux du NOC, l'exigence restant qualitative ? |
| `REQ-Lot1-273` | Room layout & ergonomics (C) 50 | Quel est le nombre de postes opérateurs attendus par rôle (Tier-1, Tier-2, supervision) et quelles distances ou angles de visibilité sont requis par rapport au mur d'images ? |
| `REQ-Lot1-274` | Video wall (C) 50 | Quelles sont la taille, la résolution, la technologie et le niveau de disponibilité attendus du mur d'images, « haute résolution » n'étant pas défini ? |
| `REQ-Lot1-279` | NOC Hypervisor (C) 50 | Le « NOC Hypervisor » désigne-t-il l'écran mural d'affichage ou une plateforme logicielle d'hypervision, et quelles sources de données (cartes de couverture, synoptique, trafic, KPI) doivent l'alimenter ? |

## Évacuations proposées (6)

À relire : une évacuation à tort fait disparaître une exigence du débat. Les clauses « majeur » d'abord.

| Clause | Criticité | Titre | Motif proposé |
| --- | --- | --- | --- |
| `REQ-Lot1-199` | majeur | Monitoring and supervision (C) 1000 | La supervision temps réel avec tableaux de bord personnalisables est une fonction standard de toutes les plateformes de supervision du marché, sans arbitrage d'architect… |
| `REQ-Lot1-216` | majeur | Automated Incident creation (C) 50 | La création et la mise à jour automatiques de tickets dans l'ITSM selon des règles prédéfinies est une intégration standard NOC/ITSM disponible nativement sur les outils… |
| `REQ-Lot1-258` | majeur | Alarm console (C) 50 | Acquittement, annotation, historique et filtres d'alarmes sont des fonctions standard de toute console d'alarmes NOC du marché, sans arbitrage d'architecture. |
| `REQ-Lot1-259` | majeur | Alarm and context (C) 50 | La création d'un ticket d'incident depuis une alarme est une intégration native courante entre console d'alarmes et ITSM, sans choix d'architecture. |
| `REQ-Lot1-265` | majeur | Reporting & analytics (C) 50 | Les rapports SLA/KPI/incidents planifiés ou ad hoc, exportés en PDF, CSV, JSON ou via API, sont couverts par les outils de reporting standard. |
| `REQ-Lot1-275` | info | Operator desks (C) 50 | Bureaux réglables en hauteur avec supports d'écran, gestion des câbles et prises électriques/réseau : mobilier standard du marché, sans arbitrage d'architecture. |

## Comparaison avec l'analyse de référence

- Rappel « à délibérer » : **87 %**
- Faux négatifs dangereux (clause de référence évacuée) : **1** : `REQ-Lot1-216`
- Clauses de référence laissées « à qualifier » : 0
- Rappel « à clarifier » : 0 %
- Taux d'évacuation : 7 % · taux « à qualifier » : 0 %
- Intégrité : **ÉCHEC**

| Point dur de référence | Clauses | Meilleur sujet généré | Rappel | Précision |
| --- | --- | --- | --- | --- |
| HP-01-MEDIATION-OAM · Médiation O&M Multi-Constructeurs : NRM Unifié & YANG vs Pa… | 13 | SUBJ-03 · Interface O&M : YANG natif imposé ou EMS propriétaires inté… | 54 % | 88 % |
| HP-02-JAMMING-GNSS · Résilience Déni GNSS 30j & Détection de Brouillage RF vs Pé… | 7 | SUBJ-11 · Détection brouillage, fausses stations et perte GNSS : RAN … | 100 % | 88 % |
| HP-03-AUTOMATION-SMO · Orchestration SMO & Auto-Remédiation vs Barrière Opérateur … | 7 | SUBJ-08 · Degré d'automatisation SMO/OSS : boucle fermée, approbation… | 43 % | 75 % |
| HP-04-GEORED-BACKUP-NOC · Géo-redondance Haute Disponibilité & Basculement Salle de R… | 6 | SUBJ-01 · NOC dédié souverain : topologie primaire/secours (actif ou … | 67 % | 50 % |
| HP-05-HYPERVISOR-MULTI-TENANT · Hyperviseur & Tableaux de Bord Multi-Organisations vs Clois… | 5 | SUBJ-04 · Médiation OSS avec NRM unifié ou adaptateurs propriétaires … | 40 % | 25 % |

