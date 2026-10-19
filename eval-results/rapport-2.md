# Audit des exigences : rfp-section4-noc.md

Modèle : `claude-sonnet-5-5` · statut : ok · généré le 2026-10-18T20:53:34.234Z

> Toutes les dispositions ci-dessous sont des **propositions du modèle**. Rien n'est décidé tant qu'un humain ne les a pas relues. Chaque clause apparaît exactement une fois, dans la section de son état.

## Lecture rapide

| État | Clauses | Que faire |
| --- | --- | --- |
| À délibérer | 75 | Ouvrir les 12 sujets dans l'espace de délibération |
| À qualifier | 0 | Trancher vous-même : promouvoir en sujet, ou évacuer avec un motif |
| À clarifier | 11 | Envoyer les questions au donneur d'ordre |
| Évacuation proposée | 6 | Relire toutes les clauses « majeur », un échantillon des « info » |
| **Total** | **92** |  |

## Plan de délibération proposé

Ordre proposé par le modèle (importance pour l'offre, puis difficulté d'architecture), à ajuster en équipe.

| Rang | Sujet | Importance | Difficulté | Nature | À trancher après | Recouvre |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SUBJ-02 · Haute disponibilité du NOC sans SPOF : actif-actif ou actif-veille, holdover GNSS | H | H | architecture | SUBJ-01 | — |
| 2 | SUBJ-03 · Gestion multi-fournisseurs : YANG/NRM natif imposé ou EMS propriétaires médiés | H | H | architecture | — | — |
| 3 | SUBJ-01 · NOC LUMICC dédié : site primaire, salle de secours et moyens d'exploitation | H | M | organisationnel | — | — |
| 4 | SUBJ-10 · Source de vérité inventaire/CMDB et autorisation des changements découverts | H | M | architecture | SUBJ-03 | — |
| 5 | SUBJ-04 · RAN partagée MOCN : consommer les interfaces OSS du MNO ou imposer une exposition normali… | M | H | architecture | SUBJ-03 | — |
| 6 | SUBJ-09 · Architecture OSS/SMO : boucle fermée graduée ou validation opérateur systématique | M | H | architecture | SUBJ-03, SUBJ-10 | — |
| 7 | SUBJ-12 · Détection des menaces radio : mesures natives, scanners dédiés et contre-mesures | M | H | architecture | SUBJ-03 | — |
| 8 | SUBJ-05 · QoS mission-critique : priorité garantie ou optimisation globale RAN GOV et MNO partagée | M | M | architecture | SUBJ-09 | — |
| 9 | SUBJ-06 · Chaîne de collecte unifiée ou collecteurs par domaine, avec agrégateur syslog partagé NOC… | M | M | architecture | SUBJ-03 | — |
| 10 | SUBJ-07 · Corrélation et RCA du NOC : règles déterministes, analytique avancée ou hybride | M | M | architecture | SUBJ-06, SUBJ-10 | — |
| 11 | SUBJ-08 · Plateforme de données unique ou vues spécialisées par audience (NOC, autorité, utilisateu… | M | M | architecture | SUBJ-06 | — |
| 12 | SUBJ-11 · Preuve des KPI MCX : sondes actives jusqu'au terminal ou compteurs réseau | M | M | architecture | SUBJ-03 | — |

## Pourquoi ces sujets (12)

### SUBJ-01 · NOC LUMICC dédié : site primaire, salle de secours et moyens d'exploitation

Section Lot 1 – NOC : organisation, facilités, salle de secours · en attente de `lead_architect` · effort L · 6 clause(s)

- **Question à trancher** : Comment dimensionner le NOC LUMICC pour qu'il soit dédié (non partagé avec le NOC du MNO), 24×7 et géo-redondant, avec une salle de secours distincte, en précisant ce qui peut être mutualisé (bâtiment, énergie, outils de communication, postes) sans violer REQ-Lot1-191 ?
- **Tension principale** : REQ-Lot1-191 (NOC strictement dédié, non partagé avec le MNO) et REQ-Lot1-192 (haute disponibilité, géo-redondance, 24×7) poussent vers un doublement complet des sites, de l'énergie (autonomie >72 h, REQ-Lot1-277) et des moyens d'exploitation. Cela s'oppose à la maîtrise du coût et de la complexité. La redondance des moyens de communication (REQ-Lot1-276, avec Teams, plateforme tierce) peut en outre réintroduire une dépendance à des services mutualisés.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un NOC primaire et une salle de secours dédiés LUMICC, sur deux sites géographiquement distincts, avec énergie et réseau indépendants. La mutualisation éventuelle est limitée à des services d'infrastructure non opérationnels (génie civil, services généraux du bâtiment), sous réserve de validation du donneur d'ordre. Cette hypothèse est retenue parce que REQ-Lot1-191 et REQ-Lot1-192 sont bloquantes et que REQ-Lot1-282 exige une salle de secours utilisable si la salle primaire est indisponible, isolée ou inaccessible. Sont écartés : un NOC mutualisé avec celui du MNO (interdit par REQ-Lot1-191) et une salle de secours dans le même bâtiment que la salle primaire (ne couvre pas l'inaccessibilité du site). Un mode de secours en télétravail ou à distance reste à qualifier, car il suppose des postes et des accès sécurisés conformes à REQ-Lot1-278.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie pour ce sujet ; l'exigence de NOC dédié non mutualisé avec celui du MNO et la salle de secours relèvent d'un besoin nouveau à instruire.)
- **Question pour le sachant** : Que recouvre exactement « non partagé avec le NOC du MNO » : séparation de site, de personnel, d'outils, de réseau d'exploitation ? Une colocalisation de bâtiment avec cloisonnement est-elle acceptable ?
- **Question pour le sachant** : Quelle disponibilité cible et quels RTO/RPO le chapitre RAMS impose-t-il au NOC (primaire + secours), et la bascule vers la salle de secours doit-elle être instantanée ou peut-elle être manuelle ?
- **Question pour le sachant** : Les sites du NOC primaire et de secours sont-ils imposés ou à proposer par le soumissionnaire, avec quelles contraintes de localisation, de distance et de souveraineté ?
- **Question pour le sachant** : Teams est-il imposé comme plateforme de collaboration ? Dans ce cas, est-il acceptable en tant que service tiers mutualisé, et quel canal de repli indépendant faut-il prévoir pour l'escalade ?
- **Priorité proposée** : rang 3 (importance H, difficulté M, organisationnel) — Deux exigences bloquantes (NOC dédié, 24×7 géo-redondant) rendent le risque éliminatoire, mais le dimensionnement de sites, d'énergie et de moyens d'exploitation est connu et la difficulté porte surtout sur le périmètre de mutualisation admissible.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-191` | bloquant | Un NOC dédié à LUMICC, non mutualisé avec celui de l'opérateur mobile, renchérit le coût et la complexité mais garantit l'isolation et la souveraineté opérationnelle. |
| `REQ-Lot1-192` | bloquant | Un NOC 24×7 géo-redondant à haute disponibilité arbitre entre coût, RTO/RPO et dépendance aux exigences RAMS. |
| `REQ-Lot1-276` | info | L'intégration téléphonie d'escalade, Teams et interphonie interne engage des choix d'interopérabilité (SIP/PBX, plateforme collaborative tierce) avec enjeux de continuit… |
| `REQ-Lot1-277` | info | Autonomie énergétique cible >72 h, CVC et sécurité physique engagent un arbitrage coût/résilience (dimensionnement carburant, batteries) et des exigences de sécurité et … |
| `REQ-Lot1-278` | info | Postes d'encadrement avec agents MDM/EDR inaccessibles au manager et connexion au cœur de réseau et aux serveurs INFRA : tension entre sécurité, séparation des privilège… |
| `REQ-Lot1-282` | info | Salle NOC de secours pour la continuité d'activité en cas d'indisponibilité, d'isolement ou d'inaccessibilité : arbitrage coût vs risque sur localisation, indépendance (… |

### SUBJ-02 · Haute disponibilité du NOC sans SPOF : actif-actif ou actif-veille, holdover GNSS

Section Lot 1 – NOC : HA/DR, infrastructure sécurisée, connectivité, synchronisation · en attente de `lead_architect` · effort L · 5 clause(s)

- **Question à trancher** : Quel modèle de haute disponibilité (actif-actif ou actif-veille à bascule rapide, éventuellement différencié par couche : applications, bases, collecte, WAN) permet de supprimer tout SPOF de calcul, stockage et réseau, avec des procédures de PRA testées, tout en tenant le fonctionnement nominal plus d'un mois sans GNSS ?
- **Tension principale** : REQ-Lot1-268 et REQ-Lot1-271 (bloquantes, sans SPOF) poussent vers la redondance maximale, alors que le coût et la complexité d'un actif-actif sur les couches à état s'opposent à une bascule rapide plus simple. Le holdover de plus d'un mois (REQ-Lot1-223) ajoute un coût matériel de synchronisation et une dépendance de souveraineté du timing. REQ-Lot1-270 (WAN à chemins physiques diversifiés) engage des coûts d'opérateurs et de tracés indépendants du choix applicatif.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une architecture hybride différenciée par couche. Actif-actif pour la collecte et les applications sans état, où la perte de données est la moins tolérable, et actif-veille à bascule automatique pour les bases et composants à état, afin de limiter la complexité de cohérence. Les deux exigences bloquantes (REQ-Lot1-268 et REQ-Lot1-271) autorisent explicitement l'un ou l'autre modèle, ce qui justifie de ne pas imposer un actif-actif intégral coûteux. Un actif-actif généralisé est écarté faute de besoin explicite et à cause du coût et du risque de split-brain. Un actif-veille généralisé est écarté pour la collecte, où une bascule à froid ferait perdre des alarmes. Le holdover GNSS de plus d'un mois est traité comme un sous-système de synchronisation distinct (oscillateurs de haute stabilité), dimensionné séparément du modèle de HA.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet (HA/DR du NOC et holdover GNSS) est traité comme une exigence nouvelle.)
- **Question pour le sachant** : Quels RTO et RPO cibles le donneur d'ordre attend-il par couche (collecte, applications, bases, WAN), ou accepte-t-il que le candidat les propose ?
- **Question pour le sachant** : Que signifie « bascule rapide » : quel délai maximal accepté, et la perte temporaire d'alarmes ou de données de collecte est-elle tolérable pendant la bascule ?
- **Question pour le sachant** : Le holdover de plus d'un mois concerne-t-il uniquement le cœur et l'infrastructure de management du NOC, ou aussi la RAN ? Quelle dérive de phase est tolérée, et quelle source alternative (autre que GNSS) est acceptable au regard de la souveraineté ?
- **Question pour le sachant** : Les deux sites (primaire et salle de secours) sont-ils fournis dans le périmètre, avec quelle distance, et le candidat maîtrise-t-il la diversité des tracés WAN ou dépend-il des opérateurs ?
- **Priorité proposée** : rang 1 (importance H, difficulté H, architecture) — Deux exigences bloquantes sans SPOF engagent la disponibilité du NOC, et le choix actif-actif ou actif-veille par couche à état, avec PRA testés et holdover GNSS, cumule compromis coût/complexité et contraintes croisées.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-223` | majeur | Tenir plus d'un mois sans GNSS exige un holdover de synchronisation de haute stabilité, avec un compromis coût et résilience, et touche à la souveraineté du timing. |
| `REQ-Lot1-268` | bloquant | Exigence bloquante : l'élimination des SPOF sur applications, bases de données et collecte arbitre entre actif/actif et bascule rapide, au prix d'un coût et d'une comple… |
| `REQ-Lot1-269` | info | Une infrastructure NOC sécurisée et sans SPOF, avec RBAC, MFA, moindre privilège, audit et sauvegardes automatisées, relève de la sécurité et de la continuité de service. |
| `REQ-Lot1-270` | info | Des liens WAN redondants à bascule automatique et chemins physiques diversifiés relèvent de la continuité de service et engagent des choix de coût, d'opérateurs et de di… |
| `REQ-Lot1-271` | bloquant | Exigence bloquante de haute disponibilité sans point de défaillance unique : arbitrage actif-actif vs actif-veille entre coût, complexité et risque, avec impact transver… |

### SUBJ-03 · Gestion multi-fournisseurs : YANG/NRM natif imposé ou EMS propriétaires médiés

Section Lot 1 – O&M multi-fournisseurs, interfaces INFRA–RAN, modèle de ressources réseau · en attente de `lead_architect` · effort L · 14 clause(s)

- **Question à trancher** : Pour obtenir une topologie, des alarmes et des KPI/SLA indépendants des fournisseurs sur RAN, Core, transport, IWF, serveurs applicatifs et datacentres, faut-il imposer YANG/NETCONF/RESTCONF et les NRM 3GPP natifs à tous les équipements, ou accepter des EMS propriétaires (REQ-Lot1-241) derrière une couche de médiation OSS qui traduit vers un NRM unifié (REQ-Lot1-249) ?
- **Tension principale** : REQ-Lot1-240/243/254 (YANG et protocoles ouverts exigés à l'interface O&M) s'opposent à REQ-Lot1-241 (EM propriétaires tolérés pour les éléments non YANG). REQ-Lot1-211 (alarmes interprétées selon la spécification de chaque fournisseur) s'oppose à REQ-Lot1-249 (taxonomie normalisée unique), car la normalisation peut perdre la sémantique fournisseur. REQ-Lot1-239 (NRM 3GPP) peut enfin entrer en conflit avec les interfaces propriétaires ou celles du MNO.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une approche hybride. YANG/NETCONF/RESTCONF et NRM 3GPP sont exigés comme cible contractuelle côté fournisseurs. Les équipements non conformes sont rattachés par un EM intégré au NMS, comme le prévoit REQ-Lot1-241. Une couche de médiation OSS unique porte le modèle NRM, la taxonomie d'alarmes et la sémantique KPI, ce qui rend REQ-Lot1-249 et REQ-Lot1-238 (bloquante) indépendantes de l'origine. Le « tout natif imposé » est écarté : il est irréaliste sur l'ensemble du parc et contredit l'existence même de REQ-Lot1-241. Le « tout propriétaire médié » est écarté : il ignore REQ-Lot1-240 et REQ-Lot1-243 et multiplie les adaptateurs à maintenir, donc le verrouillage et le coût d'intégration.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet est traité comme exigence nouvelle, sans standard établi ni conflit à confronter.)
- **Question pour le sachant** : Quel est le parc existant par fournisseur et par domaine (RAN, Core, transport, IWF, serveurs applicatifs, datacentres), et quelle part ne supporte pas YANG/NETCONF/RESTCONF nativement (inventaire LUMICC) ?
- **Question pour le sachant** : Le donneur d'ordre exige-t-il YANG et NRM 3GPP comme condition d'éligibilité des fournisseurs RAN (notamment Lot 2, GOV/AGA, FRMCS, in-house), ou acceptera-t-il des EM propriétaires dérogatoires, et sous quelles conditions ?
- **Question pour le sachant** : Quels modèles YANG (standards 3GPP/IETF ou modèles fournisseur) et quelle version de NRM 3GPP sont attendus aux points de référence RAN ? Le MNO en MOCN impose-t-il ses propres interfaces ?
- **Question pour le sachant** : Les KPI/SLA contractuels sont-ils définis sur des compteurs 3GPP normalisés ou sur des compteurs fournisseur à convertir, et qui valide la formule de normalisation en cas de litige SLA ?
- **Priorité proposée** : rang 2 (importance H, difficulté H, architecture) — 14 exigences dont une bloquante fondent l'indépendance vis-à-vis des fournisseurs, et la tension entre YANG/NRM natif et EMS propriétaires dépend de la capacité des équipementiers tiers, avec un fort impact sur les autres sujets de gestion.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-201` | majeur | Superviser une RAN multi-fournisseurs oppose les EMS propriétaires aux interfaces ouvertes et à un orchestrateur unifié, avec un risque d'interopérabilité et de dépendan… |
| `REQ-Lot1-211` | majeur | Interpréter correctement les alarmes selon chaque fournisseur impose un choix entre modèle de données normalisé et adaptateurs propriétaires, avec un risque d'interopéra… |
| `REQ-Lot1-233` | majeur | L'agrégation d'actifs multi-fournisseurs oppose l'intégration native à une couche de médiation, avec un impact sur l'interopérabilité et le verrouillage fournisseur. |
| `REQ-Lot1-234` | majeur | Le calcul de KPI et le suivi SLA sur des mesures multi-fournisseurs nécessitent une normalisation des compteurs, avec un enjeu contractuel direct. |
| `REQ-Lot1-238` | bloquant | Exigence bloquante : la visualisation de la topologie complète doit rester indépendante de la diversité fournisseurs, ce qui impose un modèle de données et une médiation… |
| `REQ-Lot1-239` | majeur | La conformité aux NRM 3GPP aux points de référence RAN contraint les fournisseurs et peut entrer en conflit avec les interfaces propriétaires ou celles du MNO. |
| `REQ-Lot1-240` | majeur | Le support obligatoire de YANG/NETCONF et RESTCONF à l'interface O&M conditionne le choix des équipements et de la couche d'intégration multi-fournisseurs. |
| `REQ-Lot1-241` | majeur | L'intégration d'EM pour les éléments non YANG arbitre entre exiger YANG natif et accepter des EM propriétaires, avec un coût et une complexité d'exploitation accrus. |
| `REQ-Lot1-242` | majeur | Le support multi-fournisseurs sur de nombreux RAN (macro, indoor, véhiculaires, FRMCS) arbitre entre standardisation ouverte et dépendance à un fournisseur, avec impact … |
| `REQ-Lot1-243` | majeur | Une interface O&M YANG unique couvrant RAN, Core, transport, IWF, serveurs applicatifs et datacentres a une portée transverse et impose des choix d'intégration structura… |
| `REQ-Lot1-249` | majeur | Une couche de médiation OSS avec sémantique KPI unifiée et taxonomie d'alarmes traduisant les compteurs propriétaires est un choix structurant de modèle de données. |
| `REQ-Lot1-251` | majeur | L'adaptation à des RAN dédiés (GOV, AGA, FRMCS, in-house) de fournisseurs multiples engage la stratégie d'intégration et de normalisation de l'INFRA. |
| `REQ-Lot1-252` | majeur | Le modèle de ressources réseau entre INFRA et RAN GOV/AGA détermine inventaire, configuration cellule, supervision et alarmes, avec un impact fort sur l'interopérabilité. |
| `REQ-Lot1-254` | info | Le choix entre NETCONF/SSH et RESTCONF/HTTP/TLS pour la collecte, la configuration et l'audit entre INFRA et RAN touche la sécurité des flux et l'interopérabilité. |

### SUBJ-04 · RAN partagée MOCN : consommer les interfaces OSS du MNO ou imposer une exposition normalisée

Section Lot 1 – O&M vis-à-vis de la RAN partagée MNO (Lot 2) · en attente de `domain_architect` · effort L · 4 clause(s)

- **Question à trancher** : Pour l'O&M de la RAN partagée MOCN (Lot 2), l'INFRA doit-elle se limiter à adapter ses collecteurs aux interfaces OSS/ENM hétérogènes du MNO (REQ-Lot1-250), ou faut-il aussi négocier une exposition normalisée portant un NRM qui distingue ressources partagées et ressources LUMICC exclusives (REQ-Lot1-253), pour alimenter les rapports de trafic par QCI/5QI (REQ-Lot1-231) et piloter la disponibilité du service partagé (REQ-Lot1-206) ?
- **Tension principale** : REQ-Lot1-250 impose d'adapter l'INFRA aux interfaces hétérogènes du MNO, alors que REQ-Lot1-253 exige un NRM séparant ressources partagées et exclusives LUMICC et que REQ-Lot1-231 exige des rapports par QCI/5QI : ces deux dernières exigences dépendent de ce que le MNO accepte d'exposer. En parallèle, REQ-Lot1-206 impose de maintenir la RAN partagée tant que le commercial est actif, sans levier de gouvernance sur l'opérateur.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une couche de médiation côté LUMICC, avec adaptateurs par protocole (REST/RESTCONF, NETCONF, Kafka, Syslog, SNMP, fichiers SFTP) qui alimentent un NRM canonique propre à LUMICC, et une demande contractuelle d'exposition normalisée comme cible, sans en faire un préalable. Cela respecte REQ-Lot1-250, qui impose l'adaptation à l'interface du MNO, tout en répondant à REQ-Lot1-253 par un modèle interne dont la fidélité dépend de ce que le MNO expose. L'option « imposer nos interfaces » est écartée comme socle : l'exigence dit que l'INFRA s'adapte, et le MNO n'est pas maître d'œuvre de ce lot. L'option « consommer tel quel sans modèle canonique » est écartée car elle ne distingue pas ressources partagées et exclusives et fait dépendre les rapports 5QI de chaque format du MNO. Les sondes propres sont à étudier en complément seulement pour les interfaces que LUMICC maîtrise.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie ; le sujet (intégration O&M avec la RAN MOCN d'un MNO tiers) est traité comme exigence nouvelle.)
- **Question pour le sachant** : Le MNO du Lot 2 a-t-il déjà documenté ses interfaces OSS/ENM, et existe-t-il un engagement contractuel sur leur stabilité et leur périmètre d'exposition (KPI, alarmes, performance, config) ?
- **Question pour le sachant** : Le MNO peut-il filtrer ou taguer les données par PLMN/slice ou par ressources LUMICC afin d'isoler les ressources exclusives des ressources partagées dans les compteurs, et à quelle granularité QCI/5QI ?
- **Question pour le sachant** : Qui décide de désactiver le service RAN partagé dans une zone, et quel mécanisme de notification ou de veto le MNO accepte-t-il pour garantir REQ-Lot1-206 ?
- **Question pour le sachant** : Le donneur d'ordre attend-il que le NRM soit un livrable normatif opposable au MNO ou un modèle interne de LUMICC alimenté au mieux des données exposées ?
- **Priorité proposée** : rang 5 (importance M, difficulté H, architecture) — Aucune exigence bloquante, mais la dépendance aux interfaces OSS du MNO, hors de notre maîtrise, et la nécessité d'un NRM distinguant ressources partagées et exclusives rendent le sujet incertain.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-206` | majeur | Maintenir la RAN partagée tant que le service commercial est actif oppose la continuité des communications critiques à la gouvernance et aux contraintes de l'opérateur m… |
| `REQ-Lot1-231` | majeur | La production de rapports de trafic par QCI/5QI sur le RAN mutualisé MNO, l'EUCCS et le roaming dépend de données exposées par des tiers, ce qui arbitre entre sondes pro… |
| `REQ-Lot1-250` | majeur | L'INFRA doit s'adapter à des interfaces OSS du MNO hétérogènes et non maîtrisées en MOCN, ce qui crée une dépendance externe et un risque d'interopérabilité. |
| `REQ-Lot1-253` | majeur | Le modèle MOCN doit distinguer ressources partagées et ressources LUMICC exclusives, ce qui dépend de ce que le MNO expose et met en tension isolation et mutualisation. |

### SUBJ-05 · QoS mission-critique : priorité garantie ou optimisation globale RAN GOV et MNO partagée

Section Lot 1 – NOC : QoS, optimisation trafic/énergie, aide à la décision · en attente de `domain_architect` · effort L · 6 clause(s)

- **Question à trancher** : Le NOC doit-il piloter les QCI/5QI (standard, propriétaires 128-254, 5QI aérien) comme un plan de priorité intangible, que l'optimisation de charge, de mobilité et d'énergie doit respecter par construction, ou comme un paramètre parmi d'autres d'une optimisation globale RAN ? Comment l'appliquer sur la RAN GOV et sur la RAN MNO partagée, où le NOC n'a pas la même maîtrise ?
- **Tension principale** : REQ-Lot1-207 (économies d'énergie) et REQ-Lot1-208 (load balancing, steering, mobilité) cherchent l'efficacité globale. REQ-Lot1-193 (QCI/5QI 6, 7, 8 et mission critical) et REQ-Lot1-195 (5QI aérien) exigent des garanties de priorité. S'y ajoute la limite de maîtrise sur la RAN MNO partagée, où REQ-Lot1-194 impose des QCI/5QI propriétaires de bout en bout, alors que le NOC dépend des interfaces et politiques du MNO.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : un plan de QoS prioritaire et gouverné (catalogue unique de QCI/5QI avec mapping par RAN), qui sert de garde-fou à des optimisations (charge, steering, mobilité, énergie) bornées par des contraintes de service critique. Elle est préférée à l'optimisation globale pure, car la performance moyenne peut dégrader les utilisateurs critiques, et à la priorité statique sans optimisation, qui ignore REQ-Lot1-207 et REQ-Lot1-208. Le 5QI aérien (REQ-Lot1-195) est défini comme profil dédié, avec priorité, PDB et PER à valider par simulation ou essai avant généralisation. L'aide à la décision pour cellules mobiles (REQ-Lot1-209) reste une recommandation avec validation humaine : l'exigence est de criticité « info » et ses choix d'analytique sont ouverts.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie : le sujet relie QoS mission-critique, optimisation RAN et déploiement de cellules mobiles, sans standard interne établi.)
- **Question pour le sachant** : Sur la RAN MNO partagée, le NOC peut-il configurer ou seulement demander au MNO le mapping QCI/5QI, les 5QI propriétaires 128-254 et le 5QI aérien ? Quels engagements contractuels de support existent ?
- **Question pour le sachant** : Quels niveaux minimaux de couverture, capacité et disponibilité doivent rester garantis aux utilisateurs critiques lorsque l'optimisation d'énergie ou de charge s'applique, et avec quelle fenêtre de tolérance ?
- **Question pour le sachant** : Quelles valeurs cibles de priorité, PDB et PER sont attendues pour le 5QI aérien, et pour quels volumes de flux UAV en uplink ?
- **Question pour le sachant** : L'aide à la décision pour cellules mobiles ou déployables doit-elle rester une suggestion à validation humaine, ou peut-elle déclencher automatiquement une action ? Sur quels déclencheurs (événement d'urgence, événement planifié) ?
- **Priorité proposée** : rang 8 (importance M, difficulté M, architecture) — La priorité mission-critique est sensible pour le donneur d'ordre mais sans exigence bloquante, et l'arbitrage entre plan de priorité intangible et optimisation globale reste un compromis de conception borné.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-193` | majeur | Le mapping QCI/5QI prioritaires pilote la QoS mission-critique et doit rester cohérent avec la RAN partagée du MNO. |
| `REQ-Lot1-194` | majeur | Les QCI/5QI propriétaires (128-254) doivent être supportés de bout en bout, RAN multi-fournisseurs et RAN partagée MNO comprises, ce qui pose un enjeu d'interopérabilité. |
| `REQ-Lot1-195` | majeur | Un 5QI aérien dédié (priorité, PDB, PER) est un choix de QoS spécifique qui arbitre entre le streaming UAV en uplink et la capacité des autres services. |
| `REQ-Lot1-207` | majeur | Les économies d'énergie sur la RAN sont en tension avec la couverture, la capacité et la disponibilité du service critique. |
| `REQ-Lot1-208` | majeur | L'équilibrage de charge, le traffic steering et l'optimisation de la mobilité arbitrent entre performance globale et priorité des utilisateurs critiques, sur une RAN mul… |
| `REQ-Lot1-209` | info | L'aide à la décision pour déployer une cellule mobile ou un système déployable engage des choix d'analytique et d'orchestration entre RAN MNO partagée et RAN GOV. |

### SUBJ-06 · Chaîne de collecte unifiée ou collecteurs par domaine, avec agrégateur syslog partagé NOC/SOC

Section Lot 1 – NOC : collecte, FMS, syslog, supervision par domaine · en attente de `lead_architect` · effort L · 9 clause(s)

- **Question à trancher** : La collecte temps réel des alarmes, événements, compteurs et logs de RAN, cœur, transport, MCX et infrastructures doit-elle passer par une chaîne unique (FMS YANG/SNMPv3/Syslog + agrégateur syslog en bastion partagé NOC/SOC), par des collecteurs spécialisés par domaine fédérés vers un FMS central, ou par une combinaison (collecte par domaine, normalisation commune et un seul point d'agrégation des logs) ?
- **Tension principale** : Uniformité et corrélation transverse (REQ-Lot1-210, 255, 264 : un format préféré, une chaîne, des logs indexés et corrélés) contre cloisonnement et couverture hétérogène (REQ-Lot1-213 : agrégateur en bastion partagé NOC/SOC ; REQ-Lot1-205 et 203 : éléments MNO et liens tiers non maîtrisés). La volumétrie et la latence temps réel s'opposent aussi à la conversion systématique en syslog (REQ-Lot1-256), qui peut appauvrir les alarmes structurées YANG/SNMP.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une architecture hybride à normalisation commune. Chaque domaine dispose d'un collecteur de proximité (adaptateurs YANG, SNMPv3, Syslog selon l'équipement), qui alimente un FMS central unique et un agrégateur syslog en bastion, source commune pour NOC et SOC/SIEM. Elle respecte REQ-Lot1-255 (YANG préféré, repli SNMPv3/Syslog) et REQ-Lot1-213/256 (agrégateur unique) tout en absorbant l'hétérogénéité des équipements hérités et MNO. Option écartée : la chaîne strictement unique, car elle crée un point de défaillance et de saturation unique pour 5 domaines, sans garantie de couverture des équipements non YANG. Option écartée : les outils par domaine sans agrégation commune, car elle contredit l'exigence d'un agrégateur recevant les logs de tous les éléments de l'inventaire et complique la corrélation logs/alarmes/KPI (REQ-Lot1-264).
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie pour la collecte et la supervision multi-domaines ; le sujet est traité comme exigence nouvelle.)
- **Question pour le sachant** : Quelles volumétries (événements/s, logs/s, compteurs) et quelles latences maximales de bout en bout alarme-affichage le donneur d'ordre attend-il, par domaine ?
- **Question pour le sachant** : Quelle part des équipements (RAN, cœur, transport, MCX, MNO partagés) expose du YANG/NRM natif, et quelle part est limitée à SNMP ou Syslog ?
- **Question pour le sachant** : Le SOC/SIEM est-il fourni par le donneur d'ordre ou par nous, et quelles règles de séparation et de propriété des données NOC/SOC s'appliquent à l'agrégateur partagé ?
- **Question pour le sachant** : Quels accès le MNO et les tiers autorisent-ils pour les éléments partagés et liens tiers (collecte directe, passerelle, export), et avec quelles garanties de continuité ?
- **Priorité proposée** : rang 9 (importance M, difficulté M, architecture) — 9 exigences non bloquantes structurent la collecte et la corrélation transverse, avec un compromis uniformité/cloisonnement du bastion NOC/SOC, mais des patterns de collecte éprouvés.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-202` | majeur | La supervision défauts et performances du cœur mission-critique avec intégration ITSM touche la continuité de service et les interfaces avec les outils de gestion des in… |
| `REQ-Lot1-203` | majeur | La supervision de bout en bout du transport, y compris les liens de gestion et les systèmes adjacents, a un impact transverse et dépend de l'accès aux liens tiers. |
| `REQ-Lot1-204` | majeur | La collecte temps réel d'événements MCX engage l'intégration avec les plateformes de services critiques de plusieurs fournisseurs. |
| `REQ-Lot1-205` | majeur | La supervision des infrastructures, de l'énergie, du HVAC et des accès sur tous les sites, y compris les éléments MNO partagés, dépend de l'accès aux équipements du MNO … |
| `REQ-Lot1-210` | majeur | La collecte temps réel d'alarmes, événements, compteurs et journaux sur tous les domaines pose des enjeux de volumétrie, de latence et d'intégration multi-fournisseurs. |
| `REQ-Lot1-213` | majeur | Un agrégateur syslog protégé en bastion et alimenté par tous les éléments réseau pour le NOC et le SOC/SIEM est une exigence de sécurité qui lie supervision et cloisonne… |
| `REQ-Lot1-255` | majeur | Le FMS temps réel avec YANG préféré et repli SNMPv3/Syslog arbitre entre uniformité des formats et couverture des équipements hérités, avec une exigence de continuité de… |
| `REQ-Lot1-256` | info | La conversion des alarmes en syslog vers le NOC et le SOC/SIEM touche la sécurité et le partage de données entre deux domaines opérationnels. |
| `REQ-Lot1-264` | majeur | L'indexation de logs corrélés aux alarmes et KPI, avec compteurs de QoS, de latence et de perte de paquets, engage les choix de stockage, de volumétrie et de points de m… |

### SUBJ-07 · Corrélation et RCA du NOC : règles déterministes, analytique avancée ou hybride

Section Lot 1 – NOC : gestion des alarmes, corrélation, RCA · en attente de `domain_architect` · effort L · 4 clause(s)

- **Question à trancher** : Le moteur de corrélation et de RCA préliminaire du NOC LUMICC doit-il reposer sur des règles déterministes et la topologie, sur de l'analytique/IA, ou sur une combinaison, de façon à réduire la saturation et les fausses alarmes sans masquer de défaut critique ni retarder la restauration ?
- **Tension principale** : REQ-Lot1-212 demande de réduire le bruit et les fausses alarmes sans service impact, alors que REQ-Lot1-214 et REQ-Lot1-215 imposent suppression et RCA automatique : plus la suppression est agressive, plus le risque de masquer un défaut critique et de retarder la restauration augmente. En outre, la corrélation et l'enrichissement dépendent d'un inventaire et d'une topologie fiables (sujet inventaire/ITSM).
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une approche hybride à socle déterministe. La corrélation s'appuie sur des règles et sur la topologie enrichie (déduplication, suppression, fenêtres de maintenance, dépendances de service), avec des règles explicables et auditables, et l'analytique avancée n'intervient qu'en suggestion, non bloquante, pour prioriser et proposer des causes candidates. Cette base répond aux exigences explicites (déduplication, suppression, filtres personnalisables, enrichissement, suppression en maintenance) et garantit qu'aucune alarme critique n'est masquée par un modèle opaque. Option écartée : l'analytique seule, car elle exige un historique et un inventaire fiables non garantis et son explicabilité est faible face au risque de masquage. Option écartée : les règles seules, car elles passent mal à l'échelle sur la corrélation inter-domaines et demandent beaucoup de maintenance.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie ne couvre la corrélation d'alarmes ni la RCA ; le sujet est nouveau et doit être instruit sans référentiel interne.)
- **Question pour le sachant** : Quels volumes d'alarmes et quels niveaux de saturation constate-t-on aujourd'hui, et existe-t-il un historique d'incidents étiqueté exploitable pour entraîner ou valider un modèle analytique ?
- **Question pour le sachant** : Le donneur d'ordre impose-t-il un niveau d'explicabilité ou d'auditabilité de la suppression et de la RCA (traçabilité de chaque alarme supprimée) ?
- **Question pour le sachant** : L'inventaire et le modèle de topologie seront-ils fiables, à jour et disponibles dès la mise en service, notamment pour les domaines gérés par des tiers ?
- **Question pour le sachant** : Quels indicateurs de succès sont attendus (taux de réduction du bruit, délai de RCA, taux de faux négatifs toléré) et la RCA doit-elle rester préliminaire avec validation par l'opérateur ?
- **Priorité proposée** : rang 10 (importance M, difficulté M, architecture) — Quatre exigences non bloquantes, avec un risque de masquer un défaut critique en cas de suppression trop agressive, et un choix règles/analytique qui dépend de la qualité des données de collecte et de topologie.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-212` | majeur | Éviter la saturation d'alarmes, les fausses alarmes et les retards d'analyse de cause racine oppose réduction du bruit et risque de masquer des défauts critiques. |
| `REQ-Lot1-214` | majeur | La corrélation inter-domaines avec enrichissement topologique et géographique dépend du modèle de données et d'un inventaire fiable, avec un impact transverse. |
| `REQ-Lot1-215` | majeur | L'analyse automatique de cause racine pour accélérer la restauration arbitre entre règles déterministes et analytique avancée, avec un impact sur la continuité de servic… |
| `REQ-Lot1-257` | majeur | Des alarmes enrichies et corrélées multi-domaines imposent un choix de moteur de corrélation et de modèle de topologie, au-delà d'une simple console. |

### SUBJ-08 · Plateforme de données unique ou vues spécialisées par audience (NOC, autorité, utilisateurs)

Section Lot 1 – NOC : PMS, dashboards, hyperviseur, intégration d'outils · en attente de `data_architect` · effort L · 5 clause(s)

- **Question à trancher** : Les besoins d'ingestion temps réel, de rétention historique, d'analytique PMS et de visualisation pour le NOC, l'autorité contractante et les organisations utilisatrices reposent-ils sur une plateforme de données unique avec vues par audience, ou sur des outils spécialisés fédérés, compte tenu de l'exposition web sans matériel dédié et des exports standardisés ?
- **Tension principale** : REQ-Lot1-232, 236 et 260 poussent vers une base de données consolidée et transverse, tandis que REQ-Lot1-237 impose l'exposition web aux organisations utilisatrices sans matériel dédié, depuis plusieurs points d'accès, ce qui exige un cloisonnement fort et une disponibilité propre. REQ-Lot1-244 demande une rétention historique et des exports standardisés sans en fixer la durée ni les formats, ce qui laisse le dimensionnement du stockage ouvert.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une plateforme de données commune (ingestion, stockage temps réel et historique, moteur d'analytique PMS, API d'export standard) alimentant des vues distinctes par audience (NOC, hyperviseur autorité, portail utilisateurs web). Elle évite de dupliquer la collecte multi-domaines (RAN, Core, transmission, MCX, infrastructure), garantit une seule version des KPI et des seuils SLA, et répond à REQ-244 par construction. Écartée : la fédération d'outils par audience, qui multiplie les pipelines, les écarts de chiffres entre vues et les interfaces à maintenir. Écartée aussi : la version tout-en-un sans séparation de l'exposition, incompatible avec le cloisonnement exigé pour les organisations utilisatrices. Cette hypothèse reste à valider sur la rétention et sur l'isolation de l'exposition externe.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie : le sujet (plateforme de données, PMS et dashboards multi-audiences) est traité comme exigence nouvelle.)
- **Question pour le sachant** : Quelle durée de rétention historique (par type de donnée : KPI, logs, événements) et quelle granularité temporelle le donneur d'ordre attend-il, pour dimensionner le stockage et le rejeu ?
- **Question pour le sachant** : Quels formats et protocoles d'export standardisés sont attendus (fichiers, API, flux) et vers quels systèmes tiers de l'autorité ?
- **Question pour le sachant** : Les organisations utilisatrices doivent-elles voir uniquement leur périmètre (multi-tenant strict) et quel niveau de disponibilité est exigé pour leur portail par rapport au NOC ?
- **Question pour le sachant** : Les positions dispatcher autonomes sont-elles connectées au réseau LUMICC ou depuis des réseaux externes, et quelles contraintes de sécurité s'appliquent à l'exposition web ?
- **Priorité proposée** : rang 11 (importance M, difficulté M, architecture) — Cinq exigences non bloquantes, avec un arbitrage plateforme unique ou vues par audience concernant l'exposition web multi-organisations et la sécurité des accès, solution techniquement maîtrisée.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-232` | majeur | Un tableau de bord unique temps réel et historique sur RAN, Core, transmission, MCX et infrastructure impose un choix de plateforme de collecte et d'agrégation transvers… |
| `REQ-Lot1-236` | majeur | Un dashboard hyperviseur personnalisable de l'état global réseau et services impose de consolider des sources hétérogènes, avec arbitrage entre outil unifié et fédératio… |
| `REQ-Lot1-237` | majeur | L'exposition d'un tableau de bord web aux organisations utilisatrices, sans matériel dédié et depuis plusieurs points d'accès, met en tension disponibilité de l'informat… |
| `REQ-Lot1-244` | majeur | L'ingestion temps réel, la rétention historique et l'export standardisé entre outils ITSM, dashboards et O&M engagent le choix des formats et du stockage, sans durée de … |
| `REQ-Lot1-260` | majeur | Un PMS multi-domaines avec analyse prédictive, rejeu et seuils SLA engage le choix de plateforme de données et d'analytique, avec un impact transverse. |

### SUBJ-09 · Architecture OSS/SMO : boucle fermée graduée ou validation opérateur systématique

Section Lot 1 – OSS, SMO, automatisation, analytique 3GPP · en attente de `lead_architect` · effort L · 4 clause(s)

- **Question à trancher** : Quelle architecture OSS + SMO + EMS, avec intent engine, NWDAF et analytique conforme 3GPP MDA, retenir, et quel niveau d'automatisation (approbation opérateur, boucle fermée, ou graduation par classe d'action) autoriser pour la remédiation événementielle et la configuration QoS sur le cœur et la RAN ?
- **Tension principale** : REQ-Lot1-247 et REQ-Lot1-263 demandent d'automatiser configuration QoS, détection de non-conformité et remédiation événementielle pour réagir vite. Ils s'opposent à la maîtrise du risque sur la continuité de service, qui impose l'option d'approbation opérateur prévue par REQ-263. REQ-Lot1-197 (conformité MDA cœur et RAN) et REQ-Lot1-246 (OSS/SMO/EMS ouvert aux fournisseurs RAN et Core) contraignent en plus les interfaces, donc la capacité réelle à automatiser de façon homogène.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une architecture OSS/SMO/EMS en couches, avec fonctions MDA et NWDAF alimentant un moteur d'intentions et de politiques, et une automatisation graduée par classe d'action. Les actions réversibles à faible impact (runbooks répétables) passent en boucle fermée. Les actions à fort impact (configuration QoS, changements touchant le service mission-critique) exigent l'approbation de l'opérateur. Cette graduation est la seule qui satisfait à la fois REQ-263 (« operator approval options ») et REQ-247 (automatisation de la configuration QoS), en maîtrisant le risque sur la continuité de service. Écartées : l'approbation humaine systématique, qui annule le bénéfice d'automatisation attendu ; et la boucle fermée généralisée, qui expose la continuité de service à une erreur propagée sur plusieurs domaines et fournisseurs. La graduation doit être validée avec le donneur d'ordre.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'a été fournie : le sujet est traité comme exigence nouvelle, sans standard établi ni conflit détectable.)
- **Question pour le sachant** : Quelles classes d'actions le donneur d'ordre accepte-t-il en boucle fermée sans approbation (par exemple redémarrage, bascule, ajustement QoS), et lesquelles exigent une validation humaine ?
- **Question pour le sachant** : Quelles sont les exigences de traçabilité, d'audit et de retour arrière (rollback) sur les changements automatisés, et sont-elles alignées avec le processus de gestion des changements ITSM ?
- **Question pour le sachant** : Le périmètre MDA attendu consiste-t-il à implémenter les fonctions MDA (producteur d'analytique, MDAS) ou à démontrer la conformité des interfaces fournies par les fournisseurs RAN et Core ?
- **Question pour le sachant** : Quels engagements de délai de réaction (SLA) le donneur d'ordre attend-il sur la remédiation, qui justifieraient la boucle fermée par rapport à l'approbation humaine ?
- **Priorité proposée** : rang 6 (importance M, difficulté H, architecture) — Quatre exigences non bloquantes, mais l'automatisation en boucle fermée sur un réseau mission-critique combine risque de continuité, conformité 3GPP MDA/SMO et dépendance aux interfaces fournisseurs, d'où une forte incertitude.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-197` | majeur | La conformité au cadre 3GPP MDA sur les domaines cœur et RAN engage l'architecture d'analytique et d'interfaces, avec un impact transverse sur les fournisseurs. |
| `REQ-Lot1-246` | majeur | L'association OSS, SMO et EMS structure l'architecture de gestion et l'ouverture vers les fournisseurs RAN et Core. |
| `REQ-Lot1-247` | majeur | Un moteur de politiques et d'intentions sur SMO et NWDAF automatise la configuration QoS et la détection de non-conformité, ce qui met en tension automatisation et maîtr… |
| `REQ-Lot1-263` | majeur | L'automatisation événementielle et la remédiation en boucle fermée mettent en tension rapidité de réaction et validation par l'opérateur, avec un risque sur la continuit… |

### SUBJ-10 · Source de vérité inventaire/CMDB et autorisation des changements découverts

Section Lot 1 – NOC : topologie, CMS, CMDB, ITSM, support terrain · en attente de `lead_architect` · effort L · 6 clause(s)

- **Question à trancher** : Quel système fait foi pour l'inventaire et la configuration des éléments réseau (inventaire OSS/CMS ou CMDB ITSM), comment réconcilier auto-découverte et dérive avec l'autorisation par la gestion des changements, et l'ITSM et le dispatch terrain reposent-ils sur un outil unifié ou sur des outils séparés synchronisés ?
- **Tension principale** : REQ-Lot1-262 impose l'auto-découverte et la réconciliation continues mais interdit toute application automatique de configuration sans autorisation Change. REQ-Lot1-248 demande de configurer tous les éléments depuis l'inventaire, ce qui exige un accès centralisé en écriture, tandis que REQ-Lot1-261 et REQ-Lot1-245 exigent la cohérence avec la CMDB sans désigner de maître. Les interfaces des équipements multi-fournisseurs bornent en outre ce qui est réellement configurable et vérifiable.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : l'inventaire OSS/CMS est la source de vérité technique (topologie, configuration, versions) et alimente la CMDB ITSM par synchronisation unidirectionnelle des éléments et des relations. Toute modification découverte ou dérive détectée est qualifiée en écart et génère une demande de changement ; seul le workflow Change du back-office ITIL autorise l'application. Cette séparation des rôles répond à REQ-Lot1-262 (bloquante) et à REQ-Lot1-245. Le dispatch terrain serait un module du back-office ITSM, ce qui évite une synchronisation supplémentaire pour REQ-Lot1-267. Options écartées : la CMDB maître (elle ne sait pas consommer l'auto-découverte multiprotocole ni porter les snapshots et la détection de dérive) et le référentiel unique tout-en-un (couplage fort, risque d'enfermement, périmètre fonctionnel trop large).
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie : le sujet (source de vérité, CMDB, ITSM, contrôle des changements) est traité comme exigence nouvelle.)
- **Question pour le sachant** : LUMICC dispose-t-il déjà d'une plateforme ITSM ou d'une CMDB à réutiliser, ou le back-office ITIL est-il à fournir ? Cela peut imposer le choix entre outil unifié et outils fédérés.
- **Question pour le sachant** : Le périmètre « tous les éléments réseau » de REQ-Lot1-248 inclut-il les équipements de tiers (MNO, autres fournisseurs) en écriture, et quelles responsabilités et interfaces de gestion sont contractuellement ouvertes ?
- **Question pour le sachant** : Quel niveau de granularité de changement exige-t-on (standard préapprouvé, normal, urgent) et la remédiation d'une dérive vers la baseline doit-elle toujours passer par un changement formel ?
- **Question pour le sachant** : Quelles contraintes s'appliquent aux données de localisation GNSS du personnel (durée de conservation, hébergement, consentement) et le dispatch doit-il fonctionner hors ligne ou en mode dégradé ?
- **Priorité proposée** : rang 4 (importance H, difficulté M, architecture) — Une exigence bloquante et six au total portent sur la source de vérité et le lien avec la gestion des changements, essentiels à la conformité, avec une difficulté surtout d'intégration ITSM/OSS et de gouvernance.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-245` | majeur | La synchronisation CMDB/inventaire OSS impose de désigner la source de vérité et un mécanisme de réconciliation, avec impact transverse sur ITSM et OSS. |
| `REQ-Lot1-248` | majeur | La configuration de tous les éléments de l'inventaire, y compris ceux de tiers, met en tension capacité d'action centralisée, sécurité des accès et périmètre de responsa… |
| `REQ-Lot1-261` | majeur | Sauvegarde, versionnement et détection de dérive sur des équipements multi-fournisseurs dépendent des interfaces disponibles et touchent la sécurité des configurations. |
| `REQ-Lot1-262` | bloquant | Exigence bloquante : l'auto-découverte et la réconciliation par collecteurs multiprotocoles doivent être conciliées avec le contrôle des changements. |
| `REQ-Lot1-266` | majeur | S'appuyer sur un back-office ITIL avec timers SLA, MTTA/MTTR et intégration ITSM crée une dépendance inter-systèmes et un arbitrage entre outil unifié et outils fédérés. |
| `REQ-Lot1-267` | majeur | Le dispatch d'équipes avec check-in GNSS et synchronisation ITSM implique des données de localisation du personnel et une intégration avec le back-office. |

### SUBJ-11 · Preuve des KPI MCX : sondes actives jusqu'au terminal ou compteurs réseau

Section Lot 1 – Assurance de service, sondes, KPI MCX/PPDR/FRMCS · en attente de `domain_architect` · effort L · 5 clause(s)

- **Question à trancher** : Quelle architecture de mesure retenir pour prouver les KPI1 à KPI7 et ticketer les non-conformités : sondes actives et automatisation de test jusqu'au terminal, compteurs de performance des fournisseurs RAN/cœur, ou combinaison où chacun couvre un sous-ensemble de KPI ? Où placer les sondes, avec quelle fréquence et quelle charge, et quelle source fait foi en cas de litige ?
- **Tension principale** : REQ-Lot1-217 (sondes configurables de 30 s à 5 min) et REQ-Lot1-219 (automatisation jusqu'aux terminaux) poussent vers une forte densité de mesure, au risque de charger le réseau mission-critique. REQ-Lot1-220, REQ-Lot1-221 et REQ-Lot1-222 imposent des seuils stricts (300/1000/350 ms, MOS 4,0, handover >99 %, interruption <150 ms puis <50 ms) qui déclenchent des non-conformités contractuelles. Or la précision d'une mesure, notamment sub-50 ms en mobilité ferroviaire, dépend du placement des sondes et de l'hétérogénéité des compteurs multi-fournisseurs.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une approche hybride à source de vérité différenciée. Les sondes actives, avec terminaux ou émulateurs pilotés par automatisation, portent les KPI vus de l'utilisateur (KPI1 à KPI5), parce que seule une mesure de bout en bout peut établir l'accès MCPTT, le mouth-to-ear et le MOS P.863 (REQ-Lot1-217, 219, 220). Les compteurs réseau portent KPI6 et KPI7 (handover, interruption), qui exigent un volume statistique sur toutes les tentatives réelles, qu'un échantillon de sondes ne donnerait pas. Écartés : le tout-sondes, qui ne couvre ni le volume du handover ni le corridor ferroviaire en mobilité, et le tout-compteurs, qui ne mesure ni le ressenti terminal ni la qualité vocale et dépend de définitions propres à chaque fournisseur. À confirmer avec le donneur d'ordre sur la valeur probante de chaque source.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine fournie ne couvre la mesure de QoS MCX ni la preuve des KPI contractuels ; le sujet est donc nouveau.)
- **Question pour le sachant** : Le contrat définit-il la source de mesure opposable (sondes, compteurs fournisseurs, ou les deux), et la méthode de calcul de chaque KPI est-elle fixée, notamment pour KPI6 et KPI7 ?
- **Question pour le sachant** : Une interruption sous 50 ms (KPI7) et sous 150 ms (KPI6) est-elle mesurable avec les compteurs standards des fournisseurs RAN, ou faut-il des sondes dédiées côté terminal ou voie ferrée ?
- **Question pour le sachant** : Quels terminaux, émulateurs ou robots de test le donneur d'ordre met-il à disposition, et la mesure est-elle acceptée en conditions réelles de mobilité (véhicules, corridor ferroviaire) ?
- **Question pour le sachant** : Y a-t-il un plafond de charge ou de consommation de ressources toléré pour les sondes actives sur les cellules et le cœur MCX, notamment sur les cellules de PPDR en situation de crise ?
- **Priorité proposée** : rang 12 (importance M, difficulté M, architecture) — Les KPI MCX conditionnent la preuve de service et les pénalités éventuelles, sans exigence bloquante, et le compromis densité de mesure et charge réseau reste borné par la combinaison sondes/compteurs.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-217` | majeur | Les sondes actives de validation de bout en bout MCPTT/MC-Video/MC-Data engagent le placement des sondes, la charge générée et la fiabilité des KPI de service. |
| `REQ-Lot1-219` | majeur | La mesure de couverture et des KPI MCX de l'accès radio jusqu'au terminal impose des choix de sondes et d'automatisation de test qui conditionnent les rapports contractu… |
| `REQ-Lot1-220` | majeur | Les seuils chiffrés exigeants (300 ms, 1000 ms, 350 ms, MOS 4,0) contraignent l'architecture de bout en bout et déclenchent des non-conformités contractuelles. |
| `REQ-Lot1-221` | majeur | Un taux de succès de handover supérieur à 99 % avec interruption sous 150 ms est une cible chiffrée exigeante, en tension avec la mobilité et la RAN multi-fournisseurs. |
| `REQ-Lot1-222` | info | Une interruption de handover inférieure à 50 ms en mobilité élevée pour FRMCS est très exigeante et engage la conception du RAN ferroviaire. |

### SUBJ-12 · Détection des menaces radio : mesures natives, scanners dédiés et contre-mesures

Section Lot 1 – NOC : sécurité radio, anti-brouillage, ISAC · en attente de `security_architect` · effort L · 7 clause(s)

- **Question à trancher** : Quelle architecture de détection retenir pour le brouillage, les fausses stations de base et les IMSI catchers (analytique des mesures UE, mesures RAN déclenchées par le NOC, balayage spectral dédié), et quelles contre-mesures prévoir pour que le service continue pour tous les terminaux LUMICC ?
- **Tension principale** : REQ-Lot1-225 et REQ-Lot1-226 (mesures et balayage déclenchés dans les cellules) dépendent des capacités des équipementiers RAN et peuvent dégrader le service. L'alternative des scanners dédiés répond à REQ-Lot1-226 et REQ-Lot1-229 mais coûte plus cher. Parallèlement, REQ-Lot1-227 (continuité pour tous les terminaux) oppose agilité spectrale et capacité résiduelle, et REQ-Lot1-230 (provision ISAC) oppose surdimensionnement anticipé et évolutivité.
- **Hypothèse de départ** (proposée, non retenue) : Hypothèse de départ : une architecture hybride. Les mesures UE (REQ-Lot1-224) et les mesures RAN déclenchées par le NOC (REQ-Lot1-225) sont exploitées partout, car elles ne demandent pas de matériel supplémentaire. Des scanners spectraux dédiés complètent le dispositif sur un nombre limité de sites ou de zones sensibles, pour le balayage et la classification (REQ-Lot1-226) et pour les fausses stations et IMSI catchers (REQ-Lot1-229). Les sites GOV/AGA reçoivent des réservations d'accueil (emplacement, alimentation, transmission) pour l'ISAC (REQ-Lot1-230), sans le déployer. L'option native seule est écartée comme socle unique : elle dépend des capacités des équipementiers RAN, non connues à ce stade, et détecte mal les stations pirates. Le déploiement dédié généralisé est écarté car son coût est élevé alors que REQ-Lot1-226 n'est que de criticité info. La mitigation (REQ-Lot1-227) repose sur la reconfiguration de fréquences ou de porteuses pilotée par le NOC, à valider avec les contraintes de spectre et de capacité résiduelle.
- **Doctrine** : aucune règle de doctrine rapprochée (Aucune règle de doctrine n'est fournie pour la sécurité radio (brouillage, fausses stations, IMSI catchers, ISAC), donc le sujet est une exigence nouvelle.)
- **Question pour le sachant** : Quelles fonctions de mesure UL (puissance large bande, par PRB, BLER) et de balayage spectral les équipementiers RAN des réseaux concernés exposent-ils nativement vers le NOC, et avec quel impact sur la capacité en cellule ?
- **Question pour le sachant** : Le donneur d'ordre attend-il pour REQ-Lot1-226 et REQ-Lot1-229 un déploiement de capteurs dédiés, ou une détection reposant sur les capacités du RAN et des terminaux ?
- **Question pour le sachant** : Quelle marge de fréquences ou de bande est disponible pour la mitigation de REQ-Lot1-227, et que signifie servir tous les terminaux en cas de perte partielle de capacité (priorités, dégradation admise) ?
- **Question pour le sachant** : Quel niveau de provision attend-on sur les sites GOV/AGA pour l'ISAC (REQ-Lot1-230) : gaines et emplacements, alimentation, transmission, ou plus ?
- **Priorité proposée** : rang 7 (importance M, difficulté H, architecture) — Sept exigences non bloquantes de sécurité radio, avec des capacités équipementiers incertaines, un risque de dégradation du service et une alternative de scanners dédiés à arbitrer, donc forte incertitude technique.

| Clause | Criticité | Pourquoi elle est ici |
| --- | --- | --- |
| `REQ-Lot1-224` | majeur | Détecter le brouillage à partir des mesures passives des terminaux arbitre entre exploitation des données UE et fiabilité de détection, avec un enjeu de sécurité. |
| `REQ-Lot1-225` | majeur | Déclencher des mesures radio dans les cellules pour détecter le brouillage dépend des capacités des équipementiers RAN et arbitre entre détection et impact sur le servic… |
| `REQ-Lot1-226` | info | Le balayage spectral et la classification des brouilleurs relèvent de la sécurité radio et supposent des capacités spécifiques du RAN ou des équipements dédiés. |
| `REQ-Lot1-227` | majeur | Maintenir le service pour tous les terminaux LUMICC malgré un brouillage de fréquences relève de la continuité de service et oppose agilité spectrale et capacité résidue… |
| `REQ-Lot1-228` | majeur | Les contre-mesures anti-brouillage relèvent de la sécurité et de la résilience et engagent des choix techniques coûteux (antennes, spectre, algorithmes) avec un impact t… |
| `REQ-Lot1-229` | majeur | La détection de fausses stations de base et d'IMSI catchers relève de la sécurité et de la protection des abonnés, avec des choix de détection côté RAN, terminal et cœur. |
| `REQ-Lot1-230` | majeur | Prévoir dès maintenant l'accueil d'une fonction ISAC future arbitre entre surdimensionnement anticipé et évolutivité, avec un impact sur les sites et les RAN GOV/AGA. |

## À qualifier par vous (0)

Le pipeline n'a pas pu ou pas osé trancher. C'est la liste à traiter en premier.

_Aucune._

## À clarifier avec le donneur d'ordre (11)

| Clause | Titre | Question |
| --- | --- | --- |
| `REQ-Lot1-196` | Network automation (C) 1000 | Quel niveau d'effectif d'exploitation cible ou quel indicateur mesurable (ETP, taux d'automatisation, périmètre automatisé) définit « minimiser les besoins en personnel » ? |
| `REQ-Lot1-198` | Network functions (C) 50 | Quelle est la liste des fonctions réseau qui doivent être opérées depuis le NOC, puisque l'exigence annonce « les fonctions suivantes » sans les énumérer ? |
| `REQ-Lot1-200` | RANs monitoring (C/COM) 50 | La supervision de la RAN partagée du MNO est-elle dans le périmètre, et si oui le MNO fournira-t-il l'accès aux données de gestion et KPI radio de cette RAN ? |
| `REQ-Lot1-218` | GOV RAN QoS monitoring (C) 50 | Quels indicateurs, seuils et fréquences de mesure définissent la QoS à superviser sur la RAN GOV, en complément des KPI cités dans les autres exigences ? |
| `REQ-Lot1-235` | Key performance indicators on NOC own dashboard (C) 50 | Où sont définies les formules de calcul, les sources de mesure et les périmètres des KPI « INFRA availability », « Lot 2 monthly QoE » et « Roaming-pack service availability », et ces définitions sont-elles contractuelles ? |
| `REQ-Lot1-272` | General requirements on NOC premises (C) 50 | Quels niveaux mesurables de sécurité, d'ergonomie et de résilience (disponibilité cible, normes ou certifications de référence) sont attendus pour les locaux NOC 24/7 ? |
| `REQ-Lot1-273` | Room layout & ergonomics (C) 50 | Quels sont le nombre de postes Tier-1, Tier-2 et supervision à accueillir, et la distance ou les contraintes de visibilité attendues vers le mur d'images ? |
| `REQ-Lot1-274` | Video wall (C) 50 | Quelles sont les caractéristiques attendues du mur d'images (dimensions, résolution, nombre de sources, redondance d'affichage) ? |
| `REQ-Lot1-279` | NOC Hypervisor (C) 50 | Le terme « NOC Hypervisor » désigne-t-il l'hyperviseur de supervision (plateforme logicielle) ou un écran mural d'affichage, et quelle est la distinction avec le mur d'images de REQ-Lot1-274 ? |
| `REQ-Lot1-280` | Network router and ancillary equipment (C) 50 | Quels sont les exigences de débit, de redondance et de segmentation du routeur et du câblage reliant postes de gestion et hyperviseur au cœur de réseau et aux serveurs INFRA ? |
| `REQ-Lot1-281` | Lay-out of the NOC room (C/COM/EXP) 50 | Quels critères et contraintes (surface disponible, nombre de postes, normes applicables) cadrent la proposition d'agencement de la salle NOC, et selon quelle grille sera-t-elle évaluée ? |

## Évacuations proposées (6)

À relire : une évacuation à tort fait disparaître une exigence du débat. Les clauses « majeur » d'abord.

| Clause | Criticité | Titre | Motif proposé |
| --- | --- | --- | --- |
| `REQ-Lot1-199` | majeur | Monitoring and supervision (C) 1000 | Les tableaux de bord temps réel personnalisables sont une fonction standard de toute plateforme de supervision OSS/NOC du marché, sans arbitrage d'architecture. |
| `REQ-Lot1-216` | majeur | Automated Incident creation (C) 50 | La création et la mise à jour automatiques de tickets ITSM à partir de règles d'alarme sont une intégration standard (connecteurs/API) des solutions NOC et ITSM du march… |
| `REQ-Lot1-258` | majeur | Alarm console (C) 50 | Acquittement, annotation, consultation d'historique et filtrage sont des fonctions de base de toute console d'alarmes NOC du marché, sans arbitrage d'architecture. |
| `REQ-Lot1-259` | majeur | Alarm and context (C) 50 | La création de ticket d'incident depuis une alarme sélectionnée est une action contextuelle native des consoles d'alarmes et plateformes ITSM courantes. |
| `REQ-Lot1-265` | majeur | Reporting & analytics (C) 50 | Les rapports SLA/KPI/incident planifiés ou ad hoc avec export PDF, CSV, JSON et API sont couverts par les outils de reporting standard, sans arbitrage d'architecture. |
| `REQ-Lot1-275` | info | Operator desks (C) 50 | Mobilier de poste opérateur standard (hauteur réglable, supports écrans, gestion des câbles, prises) couvert par des produits courants du marché, sans arbitrage d'archit… |

## Comparaison avec l'analyse de référence

- Rappel « à délibérer » : **89 %**
- Faux négatifs dangereux (clause de référence évacuée) : **1** : `REQ-Lot1-216`
- Clauses de référence laissées « à qualifier » : 0
- Rappel « à clarifier » : 0 %
- Taux d'évacuation : 7 % · taux « à qualifier » : 0 %
- Intégrité : **ÉCHEC**

| Point dur de référence | Clauses | Meilleur sujet généré | Rappel | Précision |
| --- | --- | --- | --- | --- |
| HP-01-MEDIATION-OAM · Médiation O&M Multi-Constructeurs : NRM Unifié & YANG vs Pa… | 13 | SUBJ-03 · Gestion multi-fournisseurs : YANG/NRM natif imposé ou EMS p… | 77 % | 71 % |
| HP-02-JAMMING-GNSS · Résilience Déni GNSS 30j & Détection de Brouillage RF vs Pé… | 7 | SUBJ-12 · Détection des menaces radio : mesures natives, scanners déd… | 86 % | 86 % |
| HP-03-AUTOMATION-SMO · Orchestration SMO & Auto-Remédiation vs Barrière Opérateur … | 7 | SUBJ-09 · Architecture OSS/SMO : boucle fermée graduée ou validation … | 57 % | 100 % |
| HP-04-GEORED-BACKUP-NOC · Géo-redondance Haute Disponibilité & Basculement Salle de R… | 6 | SUBJ-01 · NOC LUMICC dédié : site primaire, salle de secours et moyen… | 50 % | 50 % |
| HP-05-HYPERVISOR-MULTI-TENANT · Hyperviseur & Tableaux de Bord Multi-Organisations vs Clois… | 5 | SUBJ-08 · Plateforme de données unique ou vues spécialisées par audie… | 40 % | 40 % |

