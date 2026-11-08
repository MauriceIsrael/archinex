# Archinex Â· Guide Utilisateur

Bienvenue dans le guide d'utilisation de la plateforme **Archinex** â€” Moteur de co-conception architecturale et d'arbitrage opposable.

---

## 1. Authentification & Profils

Le systÃ¨me utilise une gestion de session sÃ©curisÃ©e avec hachage **bcrypt**.

- **Mode Visiteur (Anonyme)** :
  - Lorsqu'aucun utilisateur n'est authentifiÃ©, l'application est restreinte au **Dashboard Global** (Â« Executive Cockpit Â»).
  - Le menu latÃ©ral et le tiroir mobile n'exposent que le tableau de bord et un lien direct vers la mire de connexion.
  - Les espaces de travail (`/workspaces`), l'atelier de dÃ©libÃ©ration (`/deliberation`), et le graphe de connaissances (`/knowledge`) sont protÃ©gÃ©s par un garde serveur (`requireAuth`) qui redirige automatiquement vers `/login?redirectTo=...`.
  - AprÃ¨s authentification, l'utilisateur est automatiquement redirigÃ© vers sa destination initiale.
- **Connexion** : Rendez-vous sur `/login` avec votre adresse e-mail et mot de passe.
- **RÃ´les supportÃ©s** :
  - `lead_architect` : Responsable d'architecture, habilitÃ© Ã  arbitrer tous les domaines et Ã  homologuer les spÃ©cifications L4 et sceller les livrables L5.
  - `domain_expert` / `domain_architect` : Expert technique spÃ©cialisÃ© (infrastructure, sÃ©curitÃ©, rÃ©seau, cloud, data). HabilitÃ© Ã  arbitrer les sujets relevant de ses domaines attribuÃ©s.
  - `contributor` : Participe aux dÃ©bats, Ã©value les options et propose des alternatives.
  - `viewer` : Consultation seule du tableau de maturitÃ© et des dossiers.

### 1.1 ContrÃ´les de Navigation & Indicateurs Globaux
L'en-tÃªte supÃ©rieur de l'application est accessible en permanence depuis n'importe quelle page :
- **Pastille de connectivitÃ© LLMOps** : Affiche l'Ã©tat de synchronisation avec le Knowledge Hub (`ConnectÃ©`, `Local` ou `En synchronisation...`). Cliquez dessus Ã  tout moment pour forcer une resynchronisation ou tester la liaison distante.
- **Menu d'aide mÃ©thodologique** : L'icÃ´ne `?` ouvre l'accÃ¨s direct au guide interactif *Â« Comment dÃ©cider ? Â»*, explicitant les 4 leviers de dÃ©cision formelle (L2â†’L3, Diff, Porte G4, Scellement L5).
- **PrÃ©fÃ©rences** : SÃ©lecteur de langue (FranÃ§ais / Anglais / Espagnol) et sÃ©lecteur de thÃ¨me (Clair / Sombre / SystÃ¨me).

---

## 2. DÃ©roulÃ© d'un Projet de Co-Conception

Chaque sujet d'architecture traverse une chaÃ®ne rigoureuse de maturation en 6 Ã©tapes :

### 2.0 Ergonomie de l'Espace Sujet UnifiÃ© (Workbench de DÃ©libÃ©ration)
Lorsqu'un sujet est sÃ©lectionnÃ© dans l'arbre de gauche, tout l'Ã©cran de droite forme un **Espace Sujet UnifiÃ©** sans redondance :
- **PossibilitÃ© de replier la liste des sujets (`â‡¥ Replier` / `ðŸ“‚ Sujets`)** : un bouton dans l'en-tÃªte de la liste permet de masquer la colonne latÃ©rale pour allouer 100% de la largeur de l'Ã©cran (12 colonnes) Ã  la dÃ©libÃ©ration. Le bouton `ðŸ“‚ Sujets` dans l'en-tÃªte supÃ©rieur permet de la redÃ©plier instantanÃ©ment.
- **En haut : Timeline horizontale de maturation (`L0 NommÃ©` â†’ `L5 ArchivÃ©`)** : ouverte par dÃ©faut sur le prochain jalon Ã  franchir (et inspectable au clic sur n'importe quel jalon `L0..L5`), elle prÃ©sente en grille horizontale les critÃ¨res de passage ainsi que les **actions humaines et agents IA contextualisÃ©es au jalon** (`Reformuler`, `@proposer`, `@verifier`, `@challenger`, `@synthesizer`, `Trancher dans la Matrice`, `ðŸ“¦ PrÃ©parer les candidats KB (G4)`).
- **4 Volets UnifiÃ©s (Vue Split Fil + Matrice activÃ©e par dÃ©faut sur grand Ã©cran, dÃ©sactivable via Â« Pleine largeur Â»)** :
  1. **DÃ©libÃ©ration & Cadrage** : bandeau de cadrage compact sur 2 lignes (Question centrale + pastilles HypothÃ¨se, Dilemme, RFP, Questions mÃ©tier, dÃ©pliable Ã  la demande), objections ouvertes Ã©pinglÃ©es, fil contradictoire et composeur structurÃ©. Lorsqu'une dÃ©cision est actÃ©e (`L3+`), un raccourci direct Â« Candidats KB (G4) Â» permet de basculer et dÃ©filer vers la section de capitalisation.
  2. **Options, Matrice, Arbitrage & Capitalisation Porte G4** :
     - *Contextualisation par niveau* : en phase de cadrage (`L0/L1`), un bandeau pÃ©dagogique guide la recherche d'alternatives sans encombrer l'Ã©cran de formulaires d'arbitrage inaccessibles.
     - *Arbitrage & Affirmation (`L3+`)* : matrice multicritÃ¨res, arbitrage formel, affirmation collÃ©giale `K16` et extraction des faits `K18`.
     - *Capitalisation doctrinale (`Porte G4`)* : panneau `CapitalizationPanel` intÃ©grÃ© avec appel Ã  l'action proÃ©minent Â« âœ¨ PrÃ©parer les Candidats KB maintenant Â» pour extraire et transmettre patterns, amendements et REX anonymisÃ©s Ã  LLMOps.
  3. **Doctrines, RFP & Brouillon** : doctrines LLMOps applicables, rÃ¨gles citÃ©es dans le dÃ©bat et spÃ©cification tÃ©lÃ©graphique (5 colonnes, Ã©purÃ©e de tout onglet redondant en lecture seule).
  4. **Cascade & RÃ¨gles** : questions en cascade post-dÃ©cision, arbre gÃ©nÃ©alogique de dÃ©couverte et rÃ¨gles du projet.

### Ã‰tape 1 : Cadrage du Sujet
1. Ouvrez le sujet depuis la **Matrice d'Allocation d'Effort** ou la liste des sujets.
2. DÃ©finissez le **ProblÃ¨me / Dilemme d'Architecture** (ex: *SÃ©lection de la solution de stockage persistant pour les clusters bare-metal*).
3. Le sujet passe du niveau `L0_named` au niveau `L1_framed`.

### Ã‰tape 2 : CritÃ¨res & Alternatives ContrastÃ©es (Onglet 1)
1. **CritÃ¨res** : Ajoutez au moins deux critÃ¨res pondÃ©rÃ©s (technique, rÃ©glementaire/sÃ©curitÃ©, coÃ»t, rÃ©silience).
2. **Options** : Formulez au moins deux options d'architecture viables. Vous pouvez saisir une alternative manuellement ou solliciter l'agent *Proposer* pour complÃ©ter la matrice.
3. **Matrice d'Ã‰valuation** : Notez chaque option sur l'Ã©chelle [-2; +2] avec une justification textuelle concise. DÃ¨s que toutes les options sont Ã©valuÃ©es, le sujet atteint le niveau `L2_decomposed`. Chaque colonne d'option prÃ©sente un badge distinctif (`Option A`, `Option B`), un titre complet enveloppÃ© sur plusieurs lignes (sans tronquage) et un bouton d'information Â« DÃ©tails Â» dÃ©pliant son rÃ©sumÃ© technique.

### Ã‰tape 3 : DÃ©bat Multi-Agents Contradictoire (Onglet 2)
1. Cliquez sur **Lancer le dÃ©bat multi-agents**.
2. Quatre agents interviennent en boucle bornÃ©e (3 tours maximum) :
   - **Proposer** valorise les options et apporte des fondements concrets ;
   - **Challenger** soulÃ¨ve les objections et les risques critiques ;
   - **Verifier** confronte les choix aux rÃ¨gles de doctrine KB d'entreprise ;
   - **Synthesizer** rÃ©sume le compromis clÃ© Ã  trancher.
3. **Action humaine obligatoire** : Vous pouvez rÃ©pondre aux arguments et clore les objections ouvertes (*rÃ©pondre* ou *accepter le risque avec justification*).

### Ã‰tape 4 : Suivi de la MaturitÃ© CalculÃ©e
Le niveau de maturitÃ© est calculÃ© en temps rÃ©el. Si le sujet n'est pas prÃªt, la banniÃ¨re d'alerte liste les blocages actifs :
- Objections ouvertes non rÃ©solues ;
- Violations de rÃ¨gles doctrinales sans dÃ©rogation ;
- RÃ©fÃ©rentiels rÃ©glementaires projet (ex: NIS2, SecNumCloud) incomplets.

### Ã‰tape 5 : Arbitrage Opposable (Porte G3 - Onglet 4)
DÃ¨s que tous les blocages sont levÃ©s :
1. SÃ©lectionnez l'option retenue.
2. Renseignez le motif d'Ã©cartement pour chaque alternative rejetÃ©e.
3. Exposez la motivation d'arbitrage et qualifiez sa rÃ©versibilitÃ© (*rÃ©versible*, *coÃ»teuse*, *structurante/irrÃ©versible*).
4. Cliquez sur **Prononcer l'arbitrage opposable**. Le sujet passe au niveau scellÃ© `L3_decided`.

### Ã‰tape 6 : Capitalisation vers le Knowledge Hub LLMOps (Porte G4)
Une fois le sujet arbitrÃ©, la section de capitalisation s'active :
1. Cliquez sur **PrÃ©parer les Candidats KB**.
2. Archinex analyse la dÃ©cision et gÃ©nÃ¨re automatiquement :
   - Un candidat `new_asset` (nouveau pattern architectural) si l'option retenue n'a pas de rÃ¨gle prÃ©alable ;
   - Un candidat `amendment` pour chaque violation acceptÃ©e avec dispense motivÃ©e ;
   - Un candidat `rex` rÃ©sumant le compromis.
3. **Revue humaine prÃ©alable (Invariant III)** : Modifiez le titre, le rÃ©sumÃ©, la clause ou les motifs avant tout envoi. Vos modifications sont prises en compte en toute sÃ©curitÃ© (adresses IP, disques chiffrÃ©s et noms propres sont anonymisÃ©s automatiquement).
4. Cliquez sur **Transmettre Ã  LLMOps (Porte G4)** pour enrichir la doctrine d'entreprise.
5. Suivez le statut d'examen (*En cours d'examen*, *AcceptÃ© & IntÃ©grÃ©*, *RejetÃ©*) directement depuis la fiche.

---

## 3. Administration & Gestion Centralisée des Comptes

Archinex constitue la **Source Unique de Vérité (SSoT - Single Source of Truth)** pour l'ensemble des identités, habilitations applicatives, rôles par espace et droits doctrinaux. La gestion des comptes est unifiée pour Archinex et LLMOps : aucune double administration ni synchronisation manuelle n'est requise.

La vue **Administration** (`/admin`) permet aux administrateurs de piloter l'ensemble des identités, rôles et compétences :
- **Création et gestion unifiée des comptes** : création en un clic sans saisie superflue.
- **Deux dimensions orthogonales claires** :
  1. **Domaines de responsabilité (compétences techniques/métier)** : sélection assistée par le composant `DomainsPicker` (filtres thématiques, packs rapides `+ Pack 3GPP` et `+ Pack Sécurité`, ajout dynamique de domaines personnalisés).
  2. **Rôles applicatifs & d'arbitrage** : rôle système (`admin`/`user`), rôles par espace de travail (`lead_architect`, `architect`, `auditor`, `observer`) et rôles sur la doctrine LLMOps (`kb:review`, `kb:maintain`, `kb:evaluate`, `kb:admin`).
- **Dérivation automatique de handle & synchronisation transparente** : Archinex dérive automatiquement le handle canonique (ex: `@prenom-nom`) à partir de l'adresse e-mail et synchronise le profil avec le registre LLMOps (`data/kb/owners.yaml`).
- **Enrôlement automatique à la volée (Zero-Touch JIT Provisioning)** : Lorsqu'un utilisateur Archinex accède aux fonctionnalités de doctrine ou de revue (`/kb/me`, `/kb/reviews`), il est automatiquement inscrit et aligné dans le registre LLMOps sans aucune intervention manuelle.
- **Ajustement des politiques Casbin & audit** : supervision en temps réel des règles RBAC/ABAC et des journaux d'audit.

---

## 4. Gouvernance Knowledge Hub & Comptes Experts

Archinex permet de gérer la communauté des experts doctrinaux intervenant sur la base de connaissances (KB) :

### Créer ou Inviter un Expert KB (Administrateurs)
1. Rendez-vous dans **Administration** (`/admin`), bouton **Nouveau compte** (ou fiche de modification).
2. Renseignez le nom complet et l'adresse e-mail professionnelle. Le handle LLMOps est auto-dérivé immédiatement.
3. Sélectionnez ses **domaines de responsabilité** dans le sélecteur visuel (ex: activez le `Pack 3GPP` pour cocher d'un coup `conformance`, `telecom-core`, `5g-security`, `sba`, etc.).
4. Cochez les **rôles sur la Doctrine LLMOps** selon les prérogatives accordées :
   - `kb:review` : Voter et statuer sur les candidats de règles ;
   - `kb:evaluate` : Piloter et annoter les bancs de tests et évaluations ;
   - `kb:maintain` : Éditer et adapter les clauses de doctrine ;
   - `kb:admin` : Gouvernance et publication des versions KB.
5. Définissez soit un **mot de passe initial** pour une mise à disposition immédiate, soit générez un **lien d'activation sécurisé** valable 7 jours à usage unique (`/invite?token=...`).

### Matrice de Couverture des Domaines & Détection des Déficits
L'onglet **Couverture par domaine & Registre LLMOps** (`/admin`) et le bandeau d'alerte supérieur permettent de piloter l'exhaustivité de la couverture technique :
- **Synchronisation automatique** : Dès qu'un domaine de responsabilité est associé à un compte utilisateur (lors de sa création ou depuis sa fiche personne), la synchronisation vers LLMOps (`PUT /api/knowledge/owners`) est effectuée en direct sans manipulation supplémentaire.
- **Mise à jour en temps réel de la matrice** : Le tableau des domaines affiche instantanément le compte Archinex associé, le handle LLMOps et l'adresse e-mail vérifiée.
- **Résorption dynamique des alertes** : Les groupes de travail ou responsables collectifs génériques sans adresse e-mail (ex: `@3gpp-conformance-wg`) voient leur liste de domaines orphelins se réduire au fur et à mesure des affectations, et disparaissent automatiquement du bandeau d'alerte dès lors que l'ensemble de leurs domaines techniques sont couverts par des experts nominatifs.

### Activer son Compte Expert
1. L'expert accÃ¨de au lien reÃ§u (`/invite?token=...`).
2. Il dÃ©finit son mot de passe sÃ©curisÃ©.
3. DÃ¨s validation, le jeton est scellÃ© et l'expert est immÃ©diatement activÃ© et synchronisÃ© avec LLMOps (`delegated: true`).

### Consulter son Profil Expert (`/kb/me`)
- Depuis le menu latÃ©ral gauche **Knowledge Hub > 1. Visualisation & Exploration > Profil Expert KB**, accÃ©dez Ã  votre fiche expert.
- Visualisez votre handle canonique, votre statut de dÃ©lÃ©gation auprÃ¨s de LLMOps, vos rÃ´les KB actifs et le nombre de revues doctrinales en attente.
- L'ensemble des mini-applications de la base de connaissance est désormais unifié dans le menu latéral **Knowledge Hub** selon une progressivité ergonomique en 3 paliers séparés visuellement :
  1. **Visualisation & Exploration** : *Base de Connaissance* (`/knowledge`), *Profil Expert KB* (`/kb/me`), *Référentiels & Couverture* (`/kb/frameworks`).
  2. **Doctrine & Rédaction** : *Atelier de Doctrine* (`/kb/workshop`), *Clauses vérifiables* (`/kb/clauses`).
  3. **Validation & Évaluation** : *Boîte de Revue KB* (`/kb/reviews` — Porte G5), *Banc d'Évaluation KB* (`/kb/evals` — Porte G6), *Tableau de Bord & Publication* (`/kb/dashboard` — Porte G7).

---

## 5. BoÃ®te de RÃ©ception et Examen Expert des Candidats KB (`/kb/reviews`) â€” Porte G5

Les experts disposant du rÃ´le `kb:review` participent Ã  la collÃ©gialitÃ© doctrinale du Knowledge Hub.

### 5.1 BoÃ®te de RÃ©ception (`/kb/reviews`)
- **AccÃ¨s direct** : Via le menu latéral gauche **Knowledge Hub > 3. Validation & Évaluation > Boîte de Revue KB**.
- **SÃ©paration des tÃ¢ches & PrÃ©vention de l'auto-Ã©valuation** : ConformÃ©ment Ã  la rÃ¨gle constitutionnelle des 4 yeux (Hub contrat 1.37), un expert ne peut ni examiner ni s'auto-Ã©valuer sur une clause dont il est l'auteur. Par dÃ©faut, la boÃ®te de rÃ©ception active le filtre *Â« Ã€ examiner uniquement (exclure mes clauses) Â»* afin de ne prÃ©senter pour examen que les clauses rÃ©digÃ©es par des tiers.
- **Consultation de ses propres clauses** : Si le filtre est dÃ©cochÃ©, les clauses rÃ©digÃ©es par l'expert connectÃ© apparaissent avec le badge explicite *Â« Votre clause (Auteur) Â»* et le bouton d'action bascule de **Examiner** Ã  **Consulter (Auteur)** (l'auto-Ã©valuation Ã©tant rigoureusement impossible).
- **Alertes de Retard (&ge; 5 jours ouvrÃ©s)** : Les candidats dont l'Ã©chÃ©ance `due_at` est dÃ©passÃ©e sont mis en Ã©vidence par un bandeau d'alerte et un badge rouge animÃ© (le dÃ©compte exclut les clauses propres de l'expert lorsqu'elles sont masquÃ©es).
- **Filtres** : Filtrez par domaine de compÃ©tence (`security`, `cloud`, etc.), par nature d'actif (`principle`, `new_asset`, `amendment`, `rex`), ou isolez uniquement les retards critiques.
- **Centre de Notifications** : La cloche en haut Ã  droite affiche les alertes instantanÃ©es de gouvernance (assignations, demandes d'avis, rappels) avec acquittement de lecture.

### 5.2 Espace d'Examen (`/kb/reviews/[id]`)
En cliquant sur **Examiner** sur un candidat, l'expert accÃ¨de Ã  son espace de dÃ©cision :
1. **Les 7 ContrÃ´les Automatiques LLMOps (Gate G5)** :
   - `schema_validity` : ValiditÃ© structurelle de la clause.
   - `clarity_score` : Indice de clartÃ© sÃ©mantique et assertivitÃ© (score / 100).
   - `testability` : TestabilitÃ© des prÃ©dicats sous forme d'assertions formelles.
   - `non_duplication` : DÃ©tection de chevauchement ou doublon avec le rÃ©fÃ©rentiel existant.
   - `sovereign_compliance` : ContrÃ´le de conformitÃ© souveraine et air-gap (interdiction d'exfiltration).
   - `domain_alignment` : Alignement avec le pÃ©rimÃ¨tre de gouvernance.
   - `architectural_impact` : Analyse d'impact et de cascade de rÃ©visabilitÃ©.
2. **DÃ©cision d'Examen Opposable** :
   - **Accepter** : Valide le candidat. *RÃ¨gle constitutionnelle* : si le candidat est de type `principle`, un 2nd avis collÃ©gial est automatiquement dÃ©clenchÃ© et notifiÃ© Ã  un pair avant validation finale.
   - **Amender** : Permet de reformuler directement le texte de la clause avec consignation du motif.
   - **Rejeter** : Exige impÃ©rativement un motif explicite circonstanciÃ© (le rejet sans motif est bloquÃ©).
   - **ContrÃ´le d'habilitation domaine** : Si vous ne possÃ©dez pas le domaine du candidat, toute action terminale renvoie un refus d'autorisation (403 Forbidden).
3. **CollÃ©gialitÃ© & DÃ©lÃ©gation** :
   - **Assigner Ã  un pair** : TransfÃ©rer l'examen Ã  un autre expert identifiÃ© par son handle (ex: `@cloud-architect`).
   - **Solliciter un 2nd avis ou un conseil** : Ouvrir une demande de revue complÃ©mentaire datÃ©e.
   - **Fil de discussion** : Ã‰changer des remarques et clarifications en direct sur la clause.

---

### 5.3 RÃ©utiliser une dÃ©cision dÃ©jÃ  validÃ©e (Â« deuxiÃ¨me RFP Â»)

Quand un sujet du RFP ressemble Ã  une dÃ©cision dÃ©jÃ  validÃ©e, Archinex la **propose** ; il ne la rÃ©utilise jamais de lui-mÃªme, quel que soit le score (tolÃ©rance zÃ©ro).

1. Cliquez sur **Examiner les hypothÃ¨ses**. La fenÃªtre liste les hypothÃ¨ses de la dÃ©cision (volumes, contraintes, Ã©tat de l'existant) : **aucune n'est prÃ©sumÃ©e valide**.
2. Jugez **chacune** : *Valide*, *Invalide* ou *Inconnue* (note facultative). Tant que ce n'est pas fait, les issues de rÃ©utilisation restent grisÃ©es.
3. Choisissez l'issue : *RÃ©utiliser tel quel* (toutes valides), *RÃ©utiliser avec exception* (commentaire obligatoire), *Rejeter, hypothÃ¨se rompue* (la question est **rÃ©ouverte**), *Rejeter, pas le mÃªme sujet* (raison obligatoire, **rÃ©affichÃ©e** la fois suivante) ou *Reporter*.
4. Une dÃ©cision **sans hypothÃ¨ses documentÃ©es**, ou **remplacÃ©e**, ne peut pas Ãªtre rÃ©utilisÃ©e : documentez d'abord ses hypothÃ¨ses par un amendement dans la boÃ®te de revue.

Seules les issues de rÃ©utilisation marquent la clause Â« Conforme (RÃ©utilisÃ©) Â», avec qui l'a validÃ©e et sur quelles hypothÃ¨ses. Un rejet ou un report laisse la question ouverte et le dit.

### 5.4 VÃ©rification du dÃ©coupage PDF sur Ã©chantillon & Rapport d'extraction (Issue #50)

Avant d'exÃ©cuter l'audit ou la factorisation sÃ©mantique d'un document, Archinex affiche un rapport d'extraction synthÃ©tique avec contrÃ´le de cohÃ©rence :
1. **Rapport d'extraction & Taux de couverture** :
   - Indication du nombre de pages et du nombre d'exigences dÃ©coupÃ©es.
   - Calcul de la couverture textuelle (`coverageRate`) avec seuil d'avertissement si elle est infÃ©rieure Ã  60 %.
   - SynthÃ¨se des motifs dÃ©tectÃ©s (`REQ-Lot1-*`, `Art. *`, `Clause *`, `Â§*`) et mise en Ã©vidence du motif dominant.
2. **DÃ©tection explicite des anomalies** :
   - Trous dans la numÃ©rotation sÃ©quentielle avec affichage des plages manquantes (ex: `REQ-Lot1-13 .. REQ-Lot1-14`).
   - Doublons disambiguÃ¯sÃ©s avec suffixe `#2` (renvois ou tableaux de synthÃ¨se).
   - RÃ©fÃ©rences sans numÃ©ro explicite (`REQ-Lot1-?`) ou atypiques.
   - Clauses anormalement courtes (< 25 caractÃ¨res) ou volumineuses (> 2 500 caractÃ¨res).
   - Pages sans exigence identifiÃ©e (pages de garde, tables des matiÃ¨res, etc.).
3. **Ã‰chantillon de vÃ©rification humaine cÃ´te Ã  cÃ´te** :
   - PrÃ©sentation de toutes les anomalies prioritaires complÃ©tÃ©es de clauses de contrÃ´le.
   - Vue cÃ´te Ã  cÃ´te : clause extraite Ã  gauche, extrait de la page source correspondante du PDF (avec numÃ©ro de page) Ã  droite.
   - PossibilitÃ© d'accepter l'Ã©chantillon ou de signaler une clause problÃ©matique.
4. **TraÃ§abilitÃ© & Persistance** :
   - La validation humaine est persistÃ©e avec l'exÃ©cution (`FactorizationRun`) et rappelÃ©e dans la synthÃ¨se des rÃ©sultats.
   - Une exÃ©cution lancÃ©e sans validation humaine prÃ©alable est marquÃ©e comme telle avec avertissement explicite.

## 6. Atelier de Doctrine & Simulation de Clauses (`/kb/workshop`) â€” Lot A8

L'Atelier de Doctrine permet aux experts (`kb:maintain`, `kb:review`, `kb:admin`) de formuler de nouvelles clauses de doctrine, de dÃ©finir des prÃ©dicats formels vÃ©rifiables par machine, de simuler l'impact sur un banc de test et de dÃ©tecter d'Ã©ventuelles rÃ©gressions de rappel avant soumission.

### 6.1 ModÃ¨les d'Actifs & Gabarits Officiels
En haut de l'atelier, sÃ©lectionnez le gabarit adaptÃ© :
- **Principe Fondamental (`principle`)** : Orientation stratÃ©gique pÃ©renne (soumis Ã  double-revue collÃ©giale).
- **Patron dâ€™Architecture (`pattern`)** : Solution Ã©prouvÃ©e Ã  un problÃ¨me rÃ©current dans un contexte donnÃ©.
- **DÃ©cision Architecturale (`decision`)** : ADR formel motivÃ© avec alternatives Ã©cartÃ©es.
- **RÃ¨gle de ContrÃ´le (`control`)** : Assertion de conformitÃ© automatique (sÃ©curitÃ©, rÃ©seau, rÃ©silience).
- **Terme du Glossaire (`glossary`)** : DÃ©finition canonique sans ambiguÃ¯tÃ© sÃ©mantique.
- **RÃ¨gle Standard (`rule`)** : Exigence normative gÃ©nÃ©rale.
- **Amendement (`amendment`)** : Ã‰volution ciblÃ©e d'une rÃ¨gle existante.

### 6.2 PrÃ©dicats Testables (Machine-Readable)
Au-delÃ  du texte libre en Markdown, chaque clause structure ses contraintes formelles :
- **`WHEN` (Contexte d'activation)** : Condition dÃ©clenchant la rÃ¨gle (ex: *Dans tout composant manipulant des clÃ©s cryptographiques*).
- **`EXPECT` (Assertion vÃ©rifiÃ©e)** : RÃ©sultat attendu non nÃ©gociable (ex: *L'utilisation d'un HSM souverain certifiÃ© est requise*).
- **`REQUIRES` (PrÃ©requis obligatoires)** : DÃ©pendances prÃ©alables (ex: *PKI interne, audit log signÃ©e*).
- **`FORBIDS` (Anti-patrons proscrits)** : Pratiques strictement interdites (ex: *ClÃ© en clair, export non chiffrÃ©*).

### 6.3 Validation Ã  Blanc & Simulateur d'Impact en Direct
1. **Validation Ã  blanc** : VÃ©rifie en temps rÃ©el la complÃ©tude des champs et calcule l'estimation des 7 contrÃ´les automatiques LLMOps.
2. **Tester la clause** : ExÃ©cute le banc de test de rÃ©fÃ©rence et calcule :
   - Le taux de **PrÃ©cision EstimÃ©e** (% de vrais positifs).
   - Le taux de **Rappel de Doctrine** (% des cas conformes couverts).
   - **Alerte de RÃ©gression** : En cas de baisse du rappel ou d'introduction de faux nÃ©gatifs, un bandeau d'alerte rouge signale le risque de rupture de rÃ©tro-compatibilitÃ©.
3. **Soumettre Ã  la revue** : Verse la clause formulÃ©e dans la boÃ®te de rÃ©ception des revues (`/kb/reviews`) sous l'autoritÃ© de l'expert connectÃ© (`X-Actor-Email`).

---

## 7. RÃ©fÃ©rentiels RÃ©glementaires & DÃ©claration de Couverture (`/kb/frameworks`) â€” Lot A10

L'espace RÃ©fÃ©rentiels permet d'ingÃ©rer des cadres rÃ©glementaires et normes externes (ex: NIS2, ISO 27001, RGPD, SecNumCloud, DORA), de les instruire exigence par exigence et d'Ã©mettre une attestation formelle de couverture opposable.

### 7.1 TÃ©lÃ©versement Multi-Format
Depuis `/kb/frameworks`, tÃ©lÃ©versez le document rÃ©glementaire :
- **Formats supportÃ©s** : PDF (`.pdf`), HTML (`.html`), Texte brut (`.txt`), Markdown (`.md`), Word (`.docx`).
- **Taille maximale** : 20 Mo par fichier.
- **Extraction** : Le systÃ¨me dÃ©coupe automatiquement le document en exigences unitaires (`Article`, `Clause`, `Section`) et prÃ©-attribue le domaine de gouvernance.

### 7.2 Revue Ligne par Ligne Interactive (`/kb/frameworks/[id]`)
Chaque exigence rÃ©glementaire dispose de son cycle d'instruction :
1. **Correspondances et CritÃ¨res AssistÃ©s par l'IA** :
   - **Auto-enrichissement dÃ¨s l'ingestion** : DÃ¨s le dÃ©coupage du document, Archinex mobilise son modÃ¨le local (`LocalLlmClient`) pour prÃ©-remplir les critÃ¨res d'acceptation opÃ©rationnels et les correspondances doctrinales Ã©tiquetÃ©s `llm-derived`.
   - **Bouton Â« Auto-enrichir par l'IA Â»** : Disponible en haut de l'Ã©cran pour relancer ou enrichir un rÃ©fÃ©rentiel complet en un clic.
   - **Bouton Â« SuggÃ©rer correspondances IA Â»** : Permet de rÃ©gÃ©nÃ©rer unitairement sur une ligne spÃ©cifique les liaisons et critÃ¨res recommandÃ©s sans dÃ©pendre d'un LLM sur le Hub LLMOps.
2. **DÃ©cisions Unitaires** :
   - **Accepter** : L'exigence est alignÃ©e sur les contrÃ´les et principes sÃ©lectionnÃ©s.
   - **Amender** : PrÃ©ciser des notes d'adaptation opÃ©rationnelle ou des restrictions spÃ©cifiques.
   - **Rejeter** : Refuser l'applicabilitÃ© de l'exigence avec un **motif obligatoire circonstanciÃ©** (rÃ¨gle constitutionnelle IV).
3. **ContrÃ´le d'Habilitation par Domaine** : Seul l'expert propriÃ©taire du domaine de l'exigence (`ownedDomains`) peut statuer (code HTTP 403 sinon).

### 7.3 DÃ©claration Formelle de Couverture Opposable (Porte G6)
Lorsque l'instruction est terminÃ©e :
- Cliquez sur **"DÃ©clarer la Couverture Opposable"**.
- **ContrÃ´le d'ExhaustivitÃ© (409 Conflict)** : Si des exigences non rÃ©solues (en attente) subsistent, la dÃ©claration est formellement bloquÃ©e avec la liste des exigences Ã  finaliser.
- **Attestation Souveraine (200 OK)** : DÃ¨s lors que 100% des exigences sont acceptÃ©es, amendÃ©es ou rejetÃ©es avec motif, l'attestation de conformitÃ© scellÃ©e est Ã©mise et archivÃ©e.

---

## 8. Banc d'Ã‰valuation Doctrinal & Retours DÃ©bats (`/kb/evals`) â€” Lot A9

L'espace Ã‰valuations permet de mesurer objectivement la prÃ©cision et le rappel de la doctrine architecturale sur le jeu de test canonique `check_option_v1`, d'enrichir le jeu de donnÃ©es par annotation humaine qualifiÃ©e, et de remonter les dÃ©saccords observÃ©s en sÃ©ance de dÃ©libÃ©ration.

### 8.1 Inspection & Annotation du Jeu de Test (`check_option_v1`)
Le jeu de test de rÃ©fÃ©rence `check_option_v1` regroupe des cas d'Ã©valuation reprÃ©sentatifs des arbitrages architecturaux :
- **Habilitation Requise (403 Forbidden)** : L'annotation et la modification de la vÃ©ritÃ© terrain (*ground truth*) sont strictement rÃ©servÃ©es aux experts dÃ©tenteurs du rÃ´le `kb:evaluate`. Les relecteurs standards (`kb:review`) disposent d'un accÃ¨s en lecture seule.
- **Statuts d'Annotation** :
  - `human_verified` : Cas formellement qualifiÃ© et validÃ© par un expert humain assermentÃ©.
  - `disputed` : Cas faisant l'objet d'une controverse ou d'un dÃ©saccord doctrinal ouvert.
  - `needs_review` : Nouveau cas issu d'un retour de dÃ©libÃ©ration nÃ©cessitant instruction.
- **Ã‰dition des Attendus** : PossibilitÃ© de modifier le verdict attendu (`conform`, `non_conform`, `conditional`), la justification textuelle et la liste des clauses doctrinales de rÃ©fÃ©rence (`expected_clauses`).

### 8.2 ExÃ©cution du Benchmark & Validation de la Porte G6
Depuis la console `/kb/evals`, cliquez sur **"Lancer le Benchmark"** :
- **Calcul du Rappel RÃ©el** : Le taux de rappel est calculÃ© rigoureusement sur les cas vÃ©rifiÃ©s par l'humain (`human_verified_cases`), garantissant l'absence de biais synthÃ©tique.
- **CritÃ¨re de Porte QualitÃ© G6** : Le taux de rappel doit impÃ©rativement atteindre ou dÃ©passer **80%** ($\ge 0.80$) pour valider la Porte G6 (*Atelier & Evals ValidÃ©s*).
- **Rapport de RÃ©gression** : Identification immÃ©diate des faux nÃ©gatifs ou des dÃ©gradations de rappel par rapport au passage prÃ©cÃ©dent.

### 8.3 Boucle de RÃ©troaction sur les DÃ©bats Doctrinaux
En cours de dÃ©libÃ©ration (`/deliberation`), chaque argument appuyÃ© sur une clause doctrinale dispose d'un bouton d'alerte :
1. **Signaler un DÃ©saccord** : Cliquez sur l'icÃ´ne de signalement Ã  cÃ´tÃ© de la rÃ©fÃ©rence KB.
2. **Formulaire Modal CirconstanciÃ©** :
   - Motif : Faux positif (`false_positive`), faux nÃ©gatif (`false_negative`), ambiguÃ¯tÃ© de la clause (`ambiguity`) ou doctrine obsolÃ¨te (`outdated_doctrine`).
   - RÃ¨gle alternative suggÃ©rÃ©e et justification circonstanciÃ©e.
3. **Instruction & Conversion** : Les signalements sont injectÃ©s dans la file d'attente d'Ã©valuation (`/kb/evals`), permettant aux curateurs KB de convertir le retour en nouveau cas de test ou en proposition d'amendement doctrinal.

---

## 9. Tableau de Bord KB, Publication ScellÃ©e (Porte G7) & Campagnes (`/kb/dashboard`) â€” Lot A11

Le Tableau de Bord de Gouvernance constitue la tour de contrÃ´le de la doctrine architecturale d'entreprise, permettant de superviser l'ensemble des indicateurs de santÃ©, de sceller les versions officielles (Porte G7) et de piloter les campagnes d'enrichissement ciblÃ©es.

### 9.1 Tour de ContrÃ´le & SantÃ© ConsolidÃ©e
Depuis `/kb/dashboard`, quatre cartes de bord synthÃ©tisent l'Ã©tat opÃ©rationnel :
- **Doctrine Active** : Nombre total d'actifs indexÃ©s ventilÃ©s par typologie (principes fondamentaux, patrons d'architecture, dÃ©cisions ADR, contrÃ´les automatisÃ©s, termes du glossaire).
- **BoÃ®te de Revue (Porte G5)** : Nombre de dossiers en attente et en retard d'instruction, avec calcul du dÃ©lai moyen de traitement.
- **Couverture RÃ©fÃ©rentiels** : Pourcentage d'exigences normatives couvertes et opposables sur l'ensemble des cadres ingÃ©rÃ©s (ex: NIS2, ISO 27001).
- **Rappel Benchmark (Porte G6)** : Taux de conformitÃ© sur le jeu de test de rÃ©fÃ©rence `check_option_v1`, attestant de l'Ã©ligibilitÃ© de la doctrine ($\ge 80\%$).

> [!WARNING]
> **Bandeau d'Alerte Mode DÃ©mo Ã‰phÃ©mÃ¨re** : Lorsque le moteur LLMOps s'exÃ©cute sur une enclave mÃ©moire non persistante (`storage.mode = "demo"`), un bandeau d'avertissement permanent signale que les modifications doctrinales seront purgÃ©es au redÃ©marrage du conteneur.

### 9.2 Scellement Cryptographique & Publication Officielle (Porte G7)
L'acte de publication fige l'Ã©tat de la doctrine dans un instantanÃ© immuable et opposable :
1. **Habilitations Strictes (403 Forbidden)** : Seuls les experts dotÃ©s du rÃ´le `kb:admin` ou `kb:maintain` (ou administrateurs de plateforme) sont autorisÃ©s Ã  dÃ©clencher la publication.
2. **ContrÃ´le d'Ã‰ligibilitÃ© Porte G7 (409 Conflict)** : La publication est rigoureusement bloquÃ©e tant que :
   - Des revues critiques en retard subsistent dans la boÃ®te de rÃ©ception (Porte G5 non respectÃ©e).
   - Le taux de rappel calculÃ© sur les cas d'Ã©valuation vÃ©rifiÃ©s par l'humain est infÃ©rieur Ã  80% (Porte G6 non validÃ©e).
3. **Scellement SHA-256 & Versionnage** :
   - Saisie du journal d'Ã©volution (*changelog*) officiel.
   - GÃ©nÃ©ration de l'identifiant d'instantanÃ© (`snapshot-YYYY-MM-DD-<hash>`) et incrÃ©mentation de version (ex: `v1.2.0`).
   - Calcul et archivage de l'empreinte cryptographique SHA-256 scellÃ©e avec badge d'authenticitÃ©.

### 9.3 Campagnes d'Enrichissement CiblÃ©es
Pour combler les lacunes doctrinales identifiÃ©es par les architectes ou auditeurs :
- **Lancer une Campagne** : DÃ©finition d'un titre, domaine (`architecture`, `security`, `cloud`, `data`, `network`), type d'actif cible (`pattern`, `control`, `principle`), volume attendu de clauses et Ã©chÃ©ance.
- **Suivi de Progression** : Visualisation en direct du taux d'avancement (clauses validÃ©es vs objectif) et clÃ´ture automatique au terme de la campagne.

---

## 10. DÃ©pannage FrÃ©quent

- **"Arbitrage refusÃ© (blocages actifs)"** : VÃ©rifiez que toutes les options sont Ã©valuÃ©es, qu'aucune objection n'est ouverte et que la couverture des rÃ©fÃ©rentiels projet est complÃ¨te.
- **"403 Habilitation insuffisante"** : Seul le Lead Architect ou un expert affectÃ© au domaine du sujet (ex: `infrastructure`) peut enregistrer la dÃ©cision.
- **"403 Interdit : domaine non possÃ©dÃ©"** : Lors de l'examen d'un candidat KB ou d'une exigence rÃ©glementaire, vous devez Ãªtre explicitement propriÃ©taire du domaine concernÃ© (`ownedDomains`).
- **"403 Habilitation d'Ã©valuation manquante"** : Seul un expert dÃ©tenteur du rÃ´le `kb:evaluate` peut annoter le jeu de test canonique ou modifier le ground truth d'un cas d'Ã©valuation.
- **"403 Habilitation de publication manquante"** : La publication officielle et le scellement de la doctrine requiÃ¨rent impÃ©rativement les rÃ´les `kb:admin` ou `kb:maintain`.
- **"409 Conflit : Conditions de la Porte G7 non remplies"** : La publication est formellement bloquÃ©e tant que des revues critiques en retard subsistent ou que le rappel benchmark est infÃ©rieur au seuil de 80%.
- **"Porte G6 non atteinte (Rappel < 80%)"** : Le taux de rappel calculÃ© sur les cas vÃ©rifiÃ©s par un expert humain est insuffisant. VÃ©rifiez les clauses doctrinales associÃ©es ou annotez les cas litigieux.
- **"409 Conflit : exigences non couvertes restantes"** : Toutes les exigences d'un rÃ©fÃ©rentiel doivent avoir Ã©tÃ© instruites (acceptÃ©es, amendÃ©es ou rejetÃ©es) avant de pouvoir Ã©mettre la dÃ©claration de couverture.
- **"409 Conflit d'Ã©tat"** : Le candidat a dÃ©jÃ  Ã©tÃ© acceptÃ© ou rejetÃ© dÃ©finitivement.
- **"413 Fichier trop volumineux"** : La taille maximale autorisÃ©e pour le tÃ©lÃ©versement de rÃ©fÃ©rentiel est de 20 Mo.
- **"Mode Hors-Ligne (Offline)"** : En l'absence de serveur LLMOps joignable sur le rÃ©seau local, Archinex bascule sur l'instantanÃ© scellÃ© sans interruption de service.
- **"Jeton d'invitation expirÃ©"** : Les invitations d'experts sont valables strictement 7 jours. Demandez Ã  un administrateur d'Ã©mettre une nouvelle invitation.

---

## 11. Scellement et Export du Dossier d'Engagement (Lots A16 Ã  A21)

La publication finale d'un projet d'architecture s'appuie sur le format standardisÃ© **Dossier d'Engagement ScellÃ©** (`EngagementBundle`), directement consommable par Document Engine et Document Studio.

### 11.1 Scellement et DÃ©rivations DÃ©terministes (A16 & A21)
- **Sceau canonique SHA-256** : CalculÃ© selon le profil partagÃ© `canonical-json-v1`, assurant un rÃ©sultat identique indÃ©pendamment de l'ordre des clÃ©s ou de l'environnement d'exÃ©cution.
- **RÃ¨gle d'or Ã©pistÃ©mique** : Seul ce qui a Ã©tÃ© expressÃ©ment validÃ© par une personne humaine habilitÃ©e (ou confirmÃ© dans le journal de rÃ©utilisation avec validation des hypothÃ¨ses) est exportÃ© au niveau `asserted`. Les propositions IA restent au niveau `proposed`.
- **Enveloppe Suite & SnapshotRef** : L'instantanÃ© scellÃ© est encapsulÃ© dans `SuiteSnapshotEnvelope` et produit une rÃ©fÃ©rence dÃ©tachable `SnapshotRef` `{ sourceSystem, snapshotId, checksum, producedAt }` voyageant sÃ©parÃ©ment pour vÃ©rification d'intÃ©gritÃ© par les consommateurs.
- **Projection de maturitÃ©** : Pour conformitÃ© avec la suite (`L0_named` Ã  `L4_specified`), le statut local `L5_archived` est projetÃ© en `L4_specified`.

### 11.2 BoÃ®te de Dialogue d'Export & Bandeau Provisoire (A17)
Accessible depuis le dialogue d'homologation (`FreezeSectionDialog`) :
- **SÃ©lection obligatoire de la confidentialitÃ©** : `internal`, `confidential`, `secret` ou `public`. L'export est refusÃ© si non renseignÃ©.
- **Bandeau "Dossier Provisoire"** : AffichÃ© en jaune/ambre avec la liste prÃ©cise des blocages tant que le dossier comporte des sujets non mÃ»rs (`< L3_decided`) ou des conflits d'architecture ouverts.
- **Ã‰carts bloquants & Ã‰lÃ©ments proposÃ©s** : Mise en Ã©vidence visuelle immÃ©diate des points nÃ©cessitant une revue.
- **Historique immuable** : Consultation de la liste des dossiers scellÃ©s avec horodatage, auteur et condensat SHA-256.

### 11.3 Export OSCAL NIST SSP (A19)
- Projection de la matrice de conformitÃ© rÃ©glementaire (ex: NIS2, ISO 27001) au standard international NIST OSCAL System Security Plan v1.0.0.
- **Garantie d'intÃ©gritÃ©** : Seules les exigences associÃ©es Ã  des contrÃ´les `asserted` portent l'Ã©tat `implemented` (`satisfied`). Les propositions IA portent l'Ã©tat `planned` avec un avertissement explicite.

### 11.4 DiffÃ©rentiel entre Dossiers & RÃ©troaction Doctrinale (A19)
- **Comparateur de dossiers (`diffEngagementBundles`)** : DÃ©tecte les ajouts, suppressions et modifications entre deux versions scellÃ©es, et signale toute **rÃ©gression Ã©pistÃ©mique** (`asserted` $\rightarrow$ `proposed`).
- **Retour vers la capitalisation (`extractBundleKbCandidates`)** : Les dÃ©cisions validÃ©es natives crÃ©Ã©es au cours du projet sont automatiquement extraites comme candidats pour la base de connaissances et dÃ©posÃ©es dans la boÃ®te de revue d'experts au statut `in_review`.

### 11.5 Projections Visuelles en Phase 3 (Rendu & Homologation)
En Phase 3 (Â« Rendu & Homologation Â»), Archinex permet de visualiser et d'exporter l'architecture retenue sous trois prismes complÃ©mentaires via le sÃ©lecteur Mermaid d'`ArtifactRegenerationHub` et le fragment `HldFragmentView` :
1. **ðŸŽ¯ Architecture SpÃ©cifiÃ©e (Cible)** *(Vue par dÃ©faut)* : Diagramme de conteneurs et de flux (C4 / Flowchart) matÃ©rialisant la topologie de la solution retenue, ses composants embarquÃ©s autonomes (agents, mÃ©trologie, console), ses interfaces avec le SI existant (alarmes SNMP, mÃ©triques API, logs Syslog TLS) et les nÅ“uds cibles.
2. **ðŸ”„ ChaÃ®ne de DÃ©ploiement & Homologation** : Diagramme de sÃ©quence modÃ©lisant la chaÃ®ne de confiance et de validation humaine (construction du paquet signÃ© par l'Ã©diteur/titulaire, soumission au guichet d'homologation/recette, approbation formelle et dÃ©ploiement contrÃ´lÃ© vers les agents).
3. **âš–ï¸ Graphe DÃ©cisionnel (AuditabilitÃ©)** : Graphe Ã©pistÃ©mique traÃ§ant l'arbre causal de la dÃ©libÃ©ration (hypothÃ¨ses, Ã©noncÃ©s prouvÃ©s, conflits et options retenues) pour la traÃ§abilitÃ© d'audit.

Pour les sujets d'infrastructure et d'environnements (ex. *Socle 3 plateformes, prÃ©-prod iso-Ã©tat* du projet Lulu), Archinex projette automatiquement la topologie Ã  trois niveaux (Production, PrÃ©-production Iso-Ã‰tat rÃ©pliquant l'Ã©tat technique et accueillant l'Ã©tat candidat, Test RÃ©duit avec Test-RAN) ainsi que la filiÃ¨re de qualification usine chez les fournisseurs avec contrÃ´le d'audit et de reprÃ©sentativitÃ©. L'isolation des contextes garantit qu'aucun outillage ou libellÃ© d'un projet tiers (ex. RATP/PCC) n'est injectÃ© dans les rendus d'un autre projet.

Ces schÃ©mas sont directement intÃ©grÃ©s dans le fragment Markdown HLD exportÃ© (`renderHldFragmentMarkdown`) et tÃ©lÃ©chargeables au format `.mmd`.

---



### 11.6 SÃ©lecteur de Sujets et PrÃ©-filtrage L4 en Phase 3
En Phase 3 (Â« Rendu & Homologation Â»), un bandeau supÃ©rieur dÃ©diÃ© (`Phase3SubjectSelector`) permet d'explorer et de basculer entre les sujets d'architecture :
1. **ðŸŽ¯ PrÃ©-filtrage par dÃ©faut L4 SpÃ©cifiÃ©s** : Isole immÃ©diatement les sujets dont l'architecture technique a Ã©tÃ© entiÃ¨rement spÃ©cifiÃ©e (composants autonomes, chaÃ®ne de dÃ©ploiement WAPT, flux rÃ©seau Ã©tiquetÃ©s) et prÃªts pour l'homologation.
2. **âš–ï¸ Bascule rapide vers L3+ ou Tous** : Permet de visualiser Ã©galement les sujets arbitrÃ©s ou en cours de cadrage si nÃ©cessaire.
3. **ðŸ“ Segmentation par Lots / Parties** : Permet d'isoler un sous-ensemble (ex. LOT-02 Socle Infra ou LOT-05 Ops).
4. **ðŸ’¬ Conservation dans le fil de dÃ©libÃ©ration** : Ce mÃªme filtre par Lots/Parties est accessible dans la colonne latÃ©rale du fil de dÃ©libÃ©ration (`SubjectConversationList`), avec mÃ©morisation de l'Ã©tat actif dans le projet.


### 11.7 LisibilitÃ© des Diagrammes : AperÃ§u Plein Ã‰cran au Maintien du Clic
Pour faciliter la lecture des graphes d'architecture denses (topologie C4, sÃ©quences de dÃ©ploiement, arbres de causalitÃ©) :
1. **Maintien du clic (Press & Hold)** : En maintenant le clic gauche enfoncÃ© sur n'importe quel diagramme Mermaid, celui-ci s'ouvre instantanÃ©ment en plein Ã©cran agrandi sur fond sombre.
2. **Retour immÃ©diat** : DÃ¨s que le bouton de la souris est relÃ¢chÃ©, le plein Ã©cran se referme sans perturber le scroll ou l'Ã©tat de la page.
3. **Plein Ã©cran fixe & Zoom** : Il est Ã©galement possible de verrouiller l'affichage en plein Ã©cran via le bouton dÃ©diÃ© dans la barre d'outils ou de naviguer avec la touche Ã‰chap.


### 11.8 Cycle de Vie & RÃ©activitÃ© en Direct des Artefacts Graphiques
Les diagrammes et rendus techniques d'Archinex (Mermaid C4, sÃ©quences de dÃ©ploiement, SysML, Structurizr) sont conÃ§us pour Ã©liminer tout risque de dÃ©rive documentaire (*No Doc Drift*) :
1. **Liaison formelle au projet (`projectId`)** : Chaque diagramme porte formellement l'identifiant unique du projet et son nom dans le titre du sous-graphe racine (`subgraph SYSTEM["SystÃ¨me : ${projectName} (...) [Projet: ${projectId}]"]`). Aucune rÃ¨gle en dur ni aucun nom de client tiers n'est figÃ© dans le code.
2. **RÃ©activitÃ© en temps rÃ©el lors de la frappe (Workbench L4)** : Lorsque vous rÃ©digez ou Ã©ditez la spÃ©cification technique dans l'atelier du sujet (`SubjectThreadView`), chaque frappe met immÃ©diatement Ã  jour le store rÃ©actif (`deliberationStore.setDetailedSpec`). Les projections graphiques sont dÃ©finies sous forme d'expressions dÃ©rivÃ©es Svelte 5 (`$derived`) et se recalculent instantanÃ©ment sans nÃ©cessiter de rechargement de page.
3. **Moments de rÃ©gÃ©nÃ©ration des artefacts** :
   - **En direct (Svelte 5 `$derived`)** : DÃ¨s qu'une option est retenue dans la Matrice, qu'une motivation est modifiÃ©e, ou que la spÃ©cification L4 est Ã©ditÃ©e.
   - **Ã€ la demande (Bouton Â« RÃ©gÃ©nÃ©rer Â»)** : Le bouton d'actualisation dans l'en-tÃªte d'`ArtifactRegenerationHub` permet de re-synchroniser explicitement les donnÃ©es depuis l'API serveur ou de recharger le graphe d'architecture.
   - **Lors du scellement d'homologation (Jalon L5)** : Lors de la signature cryptographique du livrable (`freezeSubjectSnapshot`), l'empreinte SHA-256 scelle dÃ©finitivement la version des artefacts, les rendant opposables et inaltÃ©rables dans le temps.

## 12. DÃ©monstrateur & Ensemencements DÃ©mo ("Lulu")

Pour prÃ©parer rapidement une session de dÃ©mo ou des tests interactifs sans ressaisie manuelle, Archinex fournit un ensemencement dÃ©diÃ© du dossier rÃ©el **Lulu Lot 1** :

``bash
# RÃ©initialisation Ã  l'Ã©tat "Juste AprÃ¨s Ingestion" (7 sujets L1_framed, 0 dÃ©cision scellÃ©e)
npm run seed:lulu
``n
Cette commande rÃ©initialise l'espace projet `lulu-lot1-noc` dans la base SQLite locale (`dev.db`) et insÃ¨re l'audit J0 de 92 clauses dans l'historique des dÃ©pouillements. Elle permet de dÃ©rouler en direct les 4 scÃ©narios de dÃ©libÃ©ration :
1. **Cas nominal** (`SUBJ-LULU-01`) : arbitrage fluide sur la matrice d'options 3 DC & RTO UDR.
2. **DÃ©bat contradictoire** (`SUBJ-LULU-03`) : controverse infra/sÃ©curitÃ© sur l'oscillateur GNSS 30j et levÃ©e d'objection.
3. **Contradiction rÃ©glementaire** (`SUBJ-LULU-05`) : blocage Porte G3 sur violation GSMA SGP.22 / NIS2 et alignement souverain.
4. **Capitalisation doctrinale** (`SUBJ-LULU-02`) : passage Porte G4, qualification de portabilitÃ© et transmission au Knowledge Hub LLMOps.



---

## 13. Paquets de DÃ©cision ExÃ©cutables (EDP) & Oracles OPA [ExpÃ©rimental]

Dans le cadre du lot expÃ©rimental (`ARCHINEX_EXPERIMENTAL_EDP=1`), Archinex permet de lier Ã  chaque dÃ©cision d'architecture arbitrÃ©e un **Paquet de DÃ©cision ExÃ©cutable** (EDP). Ce paquet permet de confronter automatiquement les dÃ©cisions d'architecture de haut niveau (HLD) aux configurations et manifestes techniques rÃ©els ou planifiÃ©s (LLD).

### 13.1 Activation du Mode ExpÃ©rimental
Le sous-systÃ¨me EDP est strictement hermÃ©tique et n'altÃ¨re en rien le fonctionnement standard d'Archinex s'il n'est pas activÃ© :
```bash
# Activation via variable d'environnement (Linux / macOS)
export ARCHINEX_EXPERIMENTAL_EDP=1

# Activation sous Windows PowerShell
$env:ARCHINEX_EXPERIMENTAL_EDP="1"
```

### 13.2 Visualisation dans l'IHM Workbench (`EdpCard`)
Lorsque le drapeau est actif, la fiche de chaque dÃ©cision affiche un panneau dÃ©diÃ© **Paquet de DÃ©cision ExÃ©cutable** :
- **Badge d'Ã©tat** : `PROPOSÃ‰`, `VALIDÃ‰` ou `âš ï¸ STALE (CADUC)`.
- **Mode de production** : `human-authored` (rÃ©digÃ© par l'architecte) ou `llm-proposed-human-approved` (assistÃ© par l'IA sous chaÃ®ne dÃ©terministe).
- **Validateur humain (Invariant II)** : Nom et rÃ´le de l'architecte ayant formellement homologuÃ© le paquet.
- **Score de mutation** : Pourcentage de mutants tuÃ©s par la suite d'auto-test (exigence de 100 %).
- **Dernier verdict** : Statut d'Ã©valuation (`COMPLIANT`, `VIOLATED`, `INSUFFICIENT_INPUT`, `NOT_APPLICABLE`) et liste des violations constatÃ©es.
- **Actions disponibles** :
  - *Valider le Paquet (G3)* : rÃ©servÃ© aux rÃ´les d'architectes habilitÃ©s (`Lead Architect`, `Domain Architect`).
  - *Contester (Human Statement)* : ouvre un formulaire d'objection architecturale motivÃ©e (**Invariant III**).

### 13.3 VÃ©rification Hors-Ligne sur un Cas Simple (`edp verify`)
Les intÃ©grateurs peuvent tester la conformitÃ© de leurs artefacts en local, sans accÃ¨s rÃ©seau :

```bash
# 1. VÃ©rification du paquet de rÃ©fÃ©rence ADR-012 sur une entrÃ©e conforme :
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input edp/examples/adr012-baremetal/mocks/pass.json

# 2. VÃ©rification sur une entrÃ©e dÃ©faillante (violation BMC URL / OOB IP) :
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input edp/examples/adr012-baremetal/mocks/fail_rule_2_bmc_url_mismatch.json
```

### 13.4 ExÃ©cution de la Porte d'Architecture CI (`edp-gate`)
Pour valider l'intÃ©gritÃ© globale d'un paquet en intÃ©gration continue (schÃ©ma, tests OPA, mutation Ã  100 % et vÃ©rification d'entrÃ©es) :
```bash
# ExÃ©cution de la porte d'architecture complÃ¨te :
npx tsx scripts/edp-gate.ts
```
Codes de sortie retournÃ©s :
- **0** (`compliant`) : Tous les contrÃ´les et artefacts sont conformes.
- **1** (`violated`) : DÃ©faillance architecturale dÃ©tectÃ©e.
- **2** (`insufficient_input`) : EntrÃ©e incomplÃ¨te ou source manquante (anti-vacuitÃ©).
- **3** (`unavailable`) : OPA absent ou anomalie d'exÃ©cution.


### 13.5 Pile Docker d'IntÃ©gration & Outillage (Nautobot, Batfish, OPA Server)
Pour tester les dÃ©cisions et oracles dans un environnement d'intÃ©gration rÃ©el :
- **DÃ©marrage de la stack d'outils** :
  ```powershell
  cd deploy\integrator-tools
  .\tools.ps1 up      # DÃ©marre Nautobot 2.x, PostgreSQL 15, Redis 7, Batfish et OPA Server
  .\tools.ps1 status  # Affiche les URLs d'accÃ¨s et l'Ã©tat des conteneurs
  .\tools.ps1 test    # Valide la connectivitÃ© GraphQL Nautobot et l'API REST OPA
  ```
- **Points d'accÃ¨s fournis** :
  - **Nautobot Web UI** : `http://localhost:8080` (admin / adminpassword / Token `0123456789abcdef0123456789abcdef01234567`)
  - **Nautobot GraphQL** : `http://localhost:8080/api/graphql/`
  - **Batfish API** : `http://localhost:9997`
  - **OPA Server REST** : `http://localhost:8181/v1/data`

### 13.6 Phase 4 DÃ©diÃ©e Â« Refinement & Hydratation Â», Matrice KAOS Multi-Axes & Simulateur de Drift
Pour sÃ©parer clairement la dÃ©libÃ©ration HLD (Phase 2) et l'homologation documentaire (Phase 3) de l'ingÃ©nierie d'exÃ©cution LLD, un **4Ã¨me grand onglet de phase** est disponible en haut du projet (`/deliberation?posture=refinement`) :
- **Atelier Plein Ã‰cran Â« Phase 4 : Refinement & Hydratation Â» (`Phase4RefinementHub`)** :
  - **Colonne Gauche â€” Matrice KAOS des 5 Axes Obligatoires (`requires_aspect` â†’ `implemented_by`)** : affiche pour le sujet sÃ©lectionnÃ© le statut de chaque sous-axe obligatoire (*1. Substrat Compute*, *2. Plan Hors-Bande OOB*, *3. Zonage SÃ©curitÃ© NIS2*, *4. FidÃ©litÃ© Environnements Dev/Recette/Prod*, *5. RÃ©silience Ã‰lectrique 2N*), les clauses de la spÃ©cification rattachÃ©es et un bouton **`ComplÃ©ter tous les axes manquants`** (ou liaison axe par axe).
  - **Colonne Droite â€” Hydratation LLD & Oracle OPA Multi-Axes (`multi_axis_refinement.rego`)** : gÃ©nÃ¨re l'inventaire LLD multi-axes (`nautobot_planned_devices`, `k8s_manifests`, `security_zones`, `environments`, `power_feeds`) et l'Ã©value rÃ©ellement via OPA contre `data.ontology`.
  - **Simulateur de DÃ©rive CMDB (Drift)** : permet de simuler en un clic une dÃ©rive sur chacun des 5 axes (serveur Whitebox non homologuÃ©, dÃ©salignement IP BMC/OOB, dÃ©sactivation du proxy OAM, recette non Iso-Prod, perte d'une adduction PDU 2N) et de constater la violation Rego correspondante.
- **Visualiseur & Ã‰diteur de Triplets dans `/knowledge?view=ontology`** :
  - Accessible depuis l'onglet **`ðŸ•¸ï¸ Ontologie & Triplets ({S, V, O})`** du Graphe de Connaissances (`/knowledge`).
  - Permet d'inspecter l'arbre `Concept HLD â†’ Sous-Axes Requis â†’ Feuilles & Oracles` et d'ajouter ou supprimer des triplets `{ Sujet, Verbe, ComplÃ©ment }` Ã  la volÃ©e.

### 13.7 DÃ©monstration Bout-en-Bout (Â§14 Lulu Lot 3 â†” Lot 1) & Graphe de RÃ©conciliation Multi-Objets (`npm run seed:demo`)
La commande `npm run seed:demo` configure et ensemence le parcours complet de la **Phase 1 (Appropriation)** Ã  la **Phase 4 (Raffinement, Hydratation & RÃ©conciliation)** sur l'exigence **`Â§14 Â· HÃ©bergement Lots 2/3, RAN tiers et cellules mobiles : sÃ©curitÃ© contre souplesse`** (`sub_lulu-avec-options-et-criteres-proposes_89`) :
- **Exécution 100 % Autonome & Idempotente sur Base Vierge** : Le script auto-initialise au besoin le projet, l'engagement, le sujet §14 ainsi que l'administrateur démo par défaut (dmin@archinex.local / dmin123) si la base est vide. Il peut ainsi être exécuté directement sur une base neuve sans aucun prérequis de seed préalable.
- **Cumul de variantes (OU inclusif)** : gÃ©nÃ¨re simultanÃ©ment les deux pools Sylva (`sylva-cnf-sriov-dpdk` pour l'hÃ©bergement des CNF SecGW/DEA et `sylva-standard-nis2` pour l'hÃ©bergement standard isolÃ© NIS2).
- **ModÃ©lisation exhaustive et rÃ©conciliation multi-domaine (7 classes d'objets liÃ©es par le pivot `tenant_ref = "org-lot3-mno"`)** :
  1. `partner_organizations` : `org-lot3-mno` (OpÃ©rateur Tiers Lot 3) & `org-lot2-ran` (Cellules Mobiles Lot 2).
  2. `external_shadow_nodes` (3GPP TS 28.620 NRM) : `ext-mme-lot3-01` (`ExternalMMEFunction`) & `ext-ran-cell-mobile-01` (`ExternalENodeBFunction`).
  3. `internal_mediation_nodes` : `secgw-lot1-01` â†’ `dea-lot1-01` â†’ `hss-lot1-01`.
  4. `ip_underlay_links` (`EP_RP`) : `link-ip-lot3-secgw1` (`100.64.14.0/30`, VLAN 1403, BFD).
  5. `ipsec_tunnels` : `tun-ipsec-esp-lot3-secgw1` (`IPsec-ESP-IKEv2`, `AES-256-GCM`, `DH-20-ECP384`).
  6. `service_mediation_flows` (`EP_S6a`) : `flow-s6a-lot3-to-hss1` (mÃ©diation obligatoire par `secgw-lot1-01` et `dea-lot1-01`).
  7. `sla_and_monitoring_contracts` (TM Forum SID GB922) : `sla-lot3-hosting-s6a` (`REQ-Lot1-1343`) & `probe-noc-s6a-lot3` (`REQ-Lot1-1274`).
