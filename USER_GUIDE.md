# Archinex · Guide Utilisateur

Bienvenue dans le guide d'utilisation de la plateforme **Archinex** — Moteur de co-conception architecturale et d'arbitrage opposable.

---

## 1. Authentification & Profils

Le système utilise une gestion de session sécurisée avec hachage **bcrypt**.

- **Mode Visiteur (Anonyme)** :
  - Lorsqu'aucun utilisateur n'est authentifié, l'application est restreinte au **Dashboard Global** (« Executive Cockpit »).
  - Le menu latéral et le tiroir mobile n'exposent que le tableau de bord et un lien direct vers la mire de connexion.
  - Les espaces de travail (`/workspaces`), l'atelier de délibération (`/deliberation`), et le graphe de connaissances (`/knowledge`) sont protégés par un garde serveur (`requireAuth`) qui redirige automatiquement vers `/login?redirectTo=...`.
  - Après authentification, l'utilisateur est automatiquement redirigé vers sa destination initiale.
- **Connexion** : Rendez-vous sur `/login` avec votre adresse e-mail et mot de passe.
- **Rôles supportés** :
  - `lead_architect` : Responsable d'architecture, habilité à arbitrer tous les domaines et à homologuer les spécifications L4 et sceller les livrables L5.
  - `domain_expert` / `domain_architect` : Expert technique spécialisé (infrastructure, sécurité, réseau, cloud, data). Habilité à arbitrer les sujets relevant de ses domaines attribués.
  - `contributor` : Participe aux débats, évalue les options et propose des alternatives.
  - `viewer` : Consultation seule du tableau de maturité et des dossiers.

### 1.1 Contrôles de Navigation & Indicateurs Globaux
L'en-tête supérieur de l'application est accessible en permanence depuis n'importe quelle page :
- **Pastille de connectivité LLMOps** : Affiche l'état de synchronisation avec le Knowledge Hub (`Connecté`, `Local` ou `En synchronisation...`). Cliquez dessus à tout moment pour forcer une resynchronisation ou tester la liaison distante.
- **Menu d'aide méthodologique** : L'icône `?` ouvre l'accès direct au guide interactif *« Comment décider ? »*, explicitant les 4 leviers de décision formelle (L2→L3, Diff, Porte G4, Scellement L5).
- **Préférences** : Sélecteur de langue (Français / Anglais / Espagnol) et sélecteur de thème (Clair / Sombre / Système).

---

## 2. Déroulé d'un Projet de Co-Conception

Chaque sujet d'architecture traverse une chaîne rigoureuse de maturation en 6 étapes :

### 2.0 Ergonomie de l'Espace Sujet Unifié (Workbench de Délibération)
Lorsqu'un sujet est sélectionné dans l'arbre de gauche, tout l'écran de droite forme un **Espace Sujet Unifié** sans redondance :
- **Possibilité de replier la liste des sujets (`⇥ Replier` / `📂 Sujets`)** : un bouton dans l'en-tête de la liste permet de masquer la colonne latérale pour allouer 100% de la largeur de l'écran (12 colonnes) à la délibération. Le bouton `📂 Sujets` dans l'en-tête supérieur permet de la redéplier instantanément.
- **En haut : Timeline horizontale de maturation (`L0 Nommé` → `L5 Archivé`)** : ouverte par défaut sur le prochain jalon à franchir (et inspectable au clic sur n'importe quel jalon `L0..L5`), elle présente en grille horizontale les critères de passage ainsi que les **actions humaines et agents IA contextualisées au jalon** (`Reformuler`, `@proposer`, `@verifier`, `@challenger`, `@synthesizer`, `Trancher dans la Matrice`, `📦 Préparer les candidats KB (G4)`).
- **4 Volets Unifiés (Vue Split Fil + Matrice activée par défaut sur grand écran, désactivable via « Pleine largeur »)** :
  1. **Délibération & Cadrage** : bandeau de cadrage compact sur 2 lignes (Question centrale + pastilles Hypothèse, Dilemme, RFP, Questions métier, dépliable à la demande), objections ouvertes épinglées, fil contradictoire et composeur structuré. Lorsqu'une décision est actée (`L3+`), un raccourci direct « Candidats KB (G4) » permet de basculer et défiler vers la section de capitalisation.
  2. **Options, Matrice, Arbitrage & Capitalisation Porte G4** :
     - *Contextualisation par niveau* : en phase de cadrage (`L0/L1`), un bandeau pédagogique guide la recherche d'alternatives sans encombrer l'écran de formulaires d'arbitrage inaccessibles.
     - *Arbitrage & Affirmation (`L3+`)* : matrice multicritères, arbitrage formel, affirmation collégiale `K16` et extraction des faits `K18`.
     - *Capitalisation doctrinale (`Porte G4`)* : panneau `CapitalizationPanel` intégré avec appel à l'action proéminent « ✨ Préparer les Candidats KB maintenant » pour extraire et transmettre patterns, amendements et REX anonymisés à LLMOps.
  3. **Doctrines, RFP & Brouillon** : doctrines LLMOps applicables, règles citées dans le débat et spécification télégraphique (5 colonnes, épurée de tout onglet redondant en lecture seule).
  4. **Cascade & Règles** : questions en cascade post-décision, arbre généalogique de découverte et règles du projet.

### Étape 1 : Cadrage du Sujet
1. Ouvrez le sujet depuis la **Matrice d'Allocation d'Effort** ou la liste des sujets.
2. Définissez le **Problème / Dilemme d'Architecture** (ex: *Sélection de la solution de stockage persistant pour les clusters bare-metal*).
3. Le sujet passe du niveau `L0_named` au niveau `L1_framed`.

### Étape 2 : Critères & Alternatives Contrastées (Onglet 1)
1. **Critères** : Ajoutez au moins deux critères pondérés (technique, réglementaire/sécurité, coût, résilience).
2. **Options** : Formulez au moins deux options d'architecture viables. Vous pouvez saisir une alternative manuellement ou solliciter l'agent *Proposer* pour compléter la matrice.
3. **Matrice d'Évaluation** : Notez chaque option sur l'échelle [-2; +2] avec une justification textuelle concise. Dès que toutes les options sont évaluées, le sujet atteint le niveau `L2_decomposed`. Chaque colonne d'option présente un badge distinctif (`Option A`, `Option B`), un titre complet enveloppé sur plusieurs lignes (sans tronquage) et un bouton d'information « Détails » dépliant son résumé technique.

### Étape 3 : Débat Multi-Agents Contradictoire (Onglet 2)
1. Cliquez sur **Lancer le débat multi-agents**.
2. Quatre agents interviennent en boucle bornée (3 tours maximum) :
   - **Proposer** valorise les options et apporte des fondements concrets ;
   - **Challenger** soulève les objections et les risques critiques ;
   - **Verifier** confronte les choix aux règles de doctrine KB d'entreprise ;
   - **Synthesizer** résume le compromis clé à trancher.
3. **Action humaine obligatoire** : Vous pouvez répondre aux arguments et clore les objections ouvertes (*répondre* ou *accepter le risque avec justification*).

### Étape 4 : Suivi de la Maturité Calculée
Le niveau de maturité est calculé en temps réel. Si le sujet n'est pas prêt, la bannière d'alerte liste les blocages actifs :
- Objections ouvertes non résolues ;
- Violations de règles doctrinales sans dérogation ;
- Référentiels réglementaires projet (ex: NIS2, SecNumCloud) incomplets.

### Étape 5 : Arbitrage Opposable (Porte G3 - Onglet 4)
Dès que tous les blocages sont levés :
1. Sélectionnez l'option retenue.
2. Renseignez le motif d'écartement pour chaque alternative rejetée.
3. Exposez la motivation d'arbitrage et qualifiez sa réversibilité (*réversible*, *coûteuse*, *structurante/irréversible*).
4. Cliquez sur **Prononcer l'arbitrage opposable**. Le sujet passe au niveau scellé `L3_decided`.

### Étape 6 : Capitalisation vers le Knowledge Hub LLMOps (Porte G4)
Une fois le sujet arbitré, la section de capitalisation s'active :
1. Cliquez sur **Préparer les Candidats KB**.
2. Archinex analyse la décision et génère automatiquement :
   - Un candidat `new_asset` (nouveau pattern architectural) si l'option retenue n'a pas de règle préalable ;
   - Un candidat `amendment` pour chaque violation acceptée avec dispense motivée ;
   - Un candidat `rex` résumant le compromis.
3. **Revue humaine préalable (Invariant III)** : Modifiez le titre, le résumé, la clause ou les motifs avant tout envoi. Vos modifications sont prises en compte en toute sécurité (adresses IP, disques chiffrés et noms propres sont anonymisés automatiquement).
4. Cliquez sur **Transmettre à LLMOps (Porte G4)** pour enrichir la doctrine d'entreprise.
5. Suivez le statut d'examen (*En cours d'examen*, *Accepté & Intégré*, *Rejeté*) directement depuis la fiche.

---

## 3. Administration & Contrôle d'Accès (Casbin)

L'onglet **Administration** permet aux administrateurs de :
- Gérer les comptes utilisateurs et leurs domaines techniques (`x-user-domains`) ;
- Ajuster les politiques de sécurité Casbin (règles `p` et groupements `g`) ;
- Superviser les événements d'audit et la journalisation des arbitrages.

---

## 4. Gouvernance Knowledge Hub & Comptes Experts (Lot A6)

Archinex permet de gérer la communauté des experts doctrbraux intervenant sur la base de connaissances (KB) :

### Inviter un Expert KB (Administrateurs)
1. Rendez-vous dans **Administration** > onglet **Experts KB**.
2. Cliquez sur **Inviter un expert**.
3. Renseignez le nom, l'email professionnel, le handle unique (ex: `@sec-lead`), les domaines techniques couverts et les rôles KB :
   - `kb:review` : Voter et statuer sur les candidats de règles ;
   - `kb:evaluate` : Piloter et annoter les bancs de tests et évaluations ;
   - `kb:maintain` : Éditer et adapter les clauses de doctrine ;
   - `kb:admin` : Gouvernance et publication des versions KB.
4. Un lien d'activation sécurisé valable 7 jours à usage unique est généré. Copiez-le et transmettez-le à l'expert.

### Activer son Compte Expert
1. L'expert accède au lien reçu (`/invite?token=...`).
2. Il définit son mot de passe sécurisé.
3. Dès validation, le jeton est scellé et l'expert est immédiatement activé et synchronisé avec LLMOps (`delegated: true`).

### Consulter son Profil Expert (`/kb/me`)
- Depuis le menu utilisateur en haut à droite, sélectionnez **Profil Expert KB**.
- Visualisez votre handle canonique, votre statut de délégation auprès de LLMOps, vos rôles KB actifs et le nombre de revues doctrinales en attente.

---

## 5. Boîte de Réception et Examen Expert des Candidats KB (`/kb/reviews`) — Porte G5

Les experts disposant du rôle `kb:review` participent à la collégialité doctrinale du Knowledge Hub.

### 5.1 Boîte de Réception (`/kb/reviews`)
- **Accès direct** : Via le menu utilisateur en haut à droite > **Boîte de Revue KB**.
- **Séparation des tâches & Prévention de l'auto-évaluation** : Conformément à la règle constitutionnelle des 4 yeux (Hub contrat 1.37), un expert ne peut ni examiner ni s'auto-évaluer sur une clause dont il est l'auteur. Par défaut, la boîte de réception active le filtre *« À examiner uniquement (exclure mes clauses) »* afin de ne présenter pour examen que les clauses rédigées par des tiers.
- **Consultation de ses propres clauses** : Si le filtre est décoché, les clauses rédigées par l'expert connecté apparaissent avec le badge explicite *« Votre clause (Auteur) »* et le bouton d'action bascule de **Examiner** à **Consulter (Auteur)** (l'auto-évaluation étant rigoureusement impossible).
- **Alertes de Retard (&ge; 5 jours ouvrés)** : Les candidats dont l'échéance `due_at` est dépassée sont mis en évidence par un bandeau d'alerte et un badge rouge animé (le décompte exclut les clauses propres de l'expert lorsqu'elles sont masquées).
- **Filtres** : Filtrez par domaine de compétence (`security`, `cloud`, etc.), par nature d'actif (`principle`, `new_asset`, `amendment`, `rex`), ou isolez uniquement les retards critiques.
- **Centre de Notifications** : La cloche en haut à droite affiche les alertes instantanées de gouvernance (assignations, demandes d'avis, rappels) avec acquittement de lecture.

### 5.2 Espace d'Examen (`/kb/reviews/[id]`)
En cliquant sur **Examiner** sur un candidat, l'expert accède à son espace de décision :
1. **Les 7 Contrôles Automatiques LLMOps (Gate G5)** :
   - `schema_validity` : Validité structurelle de la clause.
   - `clarity_score` : Indice de clarté sémantique et assertivité (score / 100).
   - `testability` : Testabilité des prédicats sous forme d'assertions formelles.
   - `non_duplication` : Détection de chevauchement ou doublon avec le référentiel existant.
   - `sovereign_compliance` : Contrôle de conformité souveraine et air-gap (interdiction d'exfiltration).
   - `domain_alignment` : Alignement avec le périmètre de gouvernance.
   - `architectural_impact` : Analyse d'impact et de cascade de révisabilité.
2. **Décision d'Examen Opposable** :
   - **Accepter** : Valide le candidat. *Règle constitutionnelle* : si le candidat est de type `principle`, un 2nd avis collégial est automatiquement déclenché et notifié à un pair avant validation finale.
   - **Amender** : Permet de reformuler directement le texte de la clause avec consignation du motif.
   - **Rejeter** : Exige impérativement un motif explicite circonstancié (le rejet sans motif est bloqué).
   - **Contrôle d'habilitation domaine** : Si vous ne possédez pas le domaine du candidat, toute action terminale renvoie un refus d'autorisation (403 Forbidden).
3. **Collégialité & Délégation** :
   - **Assigner à un pair** : Transférer l'examen à un autre expert identifié par son handle (ex: `@cloud-architect`).
   - **Solliciter un 2nd avis ou un conseil** : Ouvrir une demande de revue complémentaire datée.
   - **Fil de discussion** : Échanger des remarques et clarifications en direct sur la clause.

---

### 5.3 Réutiliser une décision déjà validée (« deuxième RFP »)

Quand un sujet du RFP ressemble à une décision déjà validée, Archinex la **propose** ; il ne la réutilise jamais de lui-même, quel que soit le score (tolérance zéro).

1. Cliquez sur **Examiner les hypothèses**. La fenêtre liste les hypothèses de la décision (volumes, contraintes, état de l'existant) : **aucune n'est présumée valide**.
2. Jugez **chacune** : *Valide*, *Invalide* ou *Inconnue* (note facultative). Tant que ce n'est pas fait, les issues de réutilisation restent grisées.
3. Choisissez l'issue : *Réutiliser tel quel* (toutes valides), *Réutiliser avec exception* (commentaire obligatoire), *Rejeter, hypothèse rompue* (la question est **réouverte**), *Rejeter, pas le même sujet* (raison obligatoire, **réaffichée** la fois suivante) ou *Reporter*.
4. Une décision **sans hypothèses documentées**, ou **remplacée**, ne peut pas être réutilisée : documentez d'abord ses hypothèses par un amendement dans la boîte de revue.

Seules les issues de réutilisation marquent la clause « Conforme (Réutilisé) », avec qui l'a validée et sur quelles hypothèses. Un rejet ou un report laisse la question ouverte et le dit.

### 5.4 Vérification du découpage PDF sur échantillon & Rapport d'extraction (Issue #50)

Avant d'exécuter l'audit ou la factorisation sémantique d'un document, Archinex affiche un rapport d'extraction synthétique avec contrôle de cohérence :
1. **Rapport d'extraction & Taux de couverture** :
   - Indication du nombre de pages et du nombre d'exigences découpées.
   - Calcul de la couverture textuelle (`coverageRate`) avec seuil d'avertissement si elle est inférieure à 60 %.
   - Synthèse des motifs détectés (`REQ-Lot1-*`, `Art. *`, `Clause *`, `§*`) et mise en évidence du motif dominant.
2. **Détection explicite des anomalies** :
   - Trous dans la numérotation séquentielle avec affichage des plages manquantes (ex: `REQ-Lot1-13 .. REQ-Lot1-14`).
   - Doublons disambiguïsés avec suffixe `#2` (renvois ou tableaux de synthèse).
   - Références sans numéro explicite (`REQ-Lot1-?`) ou atypiques.
   - Clauses anormalement courtes (< 25 caractères) ou volumineuses (> 2 500 caractères).
   - Pages sans exigence identifiée (pages de garde, tables des matières, etc.).
3. **Échantillon de vérification humaine côte à côte** :
   - Présentation de toutes les anomalies prioritaires complétées de clauses de contrôle.
   - Vue côte à côte : clause extraite à gauche, extrait de la page source correspondante du PDF (avec numéro de page) à droite.
   - Possibilité d'accepter l'échantillon ou de signaler une clause problématique.
4. **Traçabilité & Persistance** :
   - La validation humaine est persistée avec l'exécution (`FactorizationRun`) et rappelée dans la synthèse des résultats.
   - Une exécution lancée sans validation humaine préalable est marquée comme telle avec avertissement explicite.

## 6. Atelier de Doctrine & Simulation de Clauses (`/kb/workshop`) — Lot A8

L'Atelier de Doctrine permet aux experts (`kb:maintain`, `kb:review`, `kb:admin`) de formuler de nouvelles clauses de doctrine, de définir des prédicats formels vérifiables par machine, de simuler l'impact sur un banc de test et de détecter d'éventuelles régressions de rappel avant soumission.

### 6.1 Modèles d'Actifs & Gabarits Officiels
En haut de l'atelier, sélectionnez le gabarit adapté :
- **Principe Fondamental (`principle`)** : Orientation stratégique pérenne (soumis à double-revue collégiale).
- **Patron d’Architecture (`pattern`)** : Solution éprouvée à un problème récurrent dans un contexte donné.
- **Décision Architecturale (`decision`)** : ADR formel motivé avec alternatives écartées.
- **Règle de Contrôle (`control`)** : Assertion de conformité automatique (sécurité, réseau, résilience).
- **Terme du Glossaire (`glossary`)** : Définition canonique sans ambiguïté sémantique.
- **Règle Standard (`rule`)** : Exigence normative générale.
- **Amendement (`amendment`)** : Évolution ciblée d'une règle existante.

### 6.2 Prédicats Testables (Machine-Readable)
Au-delà du texte libre en Markdown, chaque clause structure ses contraintes formelles :
- **`WHEN` (Contexte d'activation)** : Condition déclenchant la règle (ex: *Dans tout composant manipulant des clés cryptographiques*).
- **`EXPECT` (Assertion vérifiée)** : Résultat attendu non négociable (ex: *L'utilisation d'un HSM souverain certifié est requise*).
- **`REQUIRES` (Prérequis obligatoires)** : Dépendances préalables (ex: *PKI interne, audit log signée*).
- **`FORBIDS` (Anti-patrons proscrits)** : Pratiques strictement interdites (ex: *Clé en clair, export non chiffré*).

### 6.3 Validation à Blanc & Simulateur d'Impact en Direct
1. **Validation à blanc** : Vérifie en temps réel la complétude des champs et calcule l'estimation des 7 contrôles automatiques LLMOps.
2. **Tester la clause** : Exécute le banc de test de référence et calcule :
   - Le taux de **Précision Estimée** (% de vrais positifs).
   - Le taux de **Rappel de Doctrine** (% des cas conformes couverts).
   - **Alerte de Régression** : En cas de baisse du rappel ou d'introduction de faux négatifs, un bandeau d'alerte rouge signale le risque de rupture de rétro-compatibilité.
3. **Soumettre à la revue** : Verse la clause formulée dans la boîte de réception des revues (`/kb/reviews`) sous l'autorité de l'expert connecté (`X-Actor-Email`).

---

## 7. Référentiels Réglementaires & Déclaration de Couverture (`/kb/frameworks`) — Lot A10

L'espace Référentiels permet d'ingérer des cadres réglementaires et normes externes (ex: NIS2, ISO 27001, RGPD, SecNumCloud, DORA), de les instruire exigence par exigence et d'émettre une attestation formelle de couverture opposable.

### 7.1 Téléversement Multi-Format
Depuis `/kb/frameworks`, téléversez le document réglementaire :
- **Formats supportés** : PDF (`.pdf`), HTML (`.html`), Texte brut (`.txt`), Markdown (`.md`), Word (`.docx`).
- **Taille maximale** : 20 Mo par fichier.
- **Extraction** : Le système découpe automatiquement le document en exigences unitaires (`Article`, `Clause`, `Section`) et pré-attribue le domaine de gouvernance.

### 7.2 Revue Ligne par Ligne Interactive (`/kb/frameworks/[id]`)
Chaque exigence réglementaire dispose de son cycle d'instruction :
1. **Correspondances et Critères Assistés par l'IA** :
   - **Auto-enrichissement dès l'ingestion** : Dès le découpage du document, Archinex mobilise son modèle local (`LocalLlmClient`) pour pré-remplir les critères d'acceptation opérationnels et les correspondances doctrinales étiquetés `llm-derived`.
   - **Bouton « Auto-enrichir par l'IA »** : Disponible en haut de l'écran pour relancer ou enrichir un référentiel complet en un clic.
   - **Bouton « Suggérer correspondances IA »** : Permet de régénérer unitairement sur une ligne spécifique les liaisons et critères recommandés sans dépendre d'un LLM sur le Hub LLMOps.
2. **Décisions Unitaires** :
   - **Accepter** : L'exigence est alignée sur les contrôles et principes sélectionnés.
   - **Amender** : Préciser des notes d'adaptation opérationnelle ou des restrictions spécifiques.
   - **Rejeter** : Refuser l'applicabilité de l'exigence avec un **motif obligatoire circonstancié** (règle constitutionnelle IV).
3. **Contrôle d'Habilitation par Domaine** : Seul l'expert propriétaire du domaine de l'exigence (`ownedDomains`) peut statuer (code HTTP 403 sinon).

### 7.3 Déclaration Formelle de Couverture Opposable (Porte G6)
Lorsque l'instruction est terminée :
- Cliquez sur **"Déclarer la Couverture Opposable"**.
- **Contrôle d'Exhaustivité (409 Conflict)** : Si des exigences non résolues (en attente) subsistent, la déclaration est formellement bloquée avec la liste des exigences à finaliser.
- **Attestation Souveraine (200 OK)** : Dès lors que 100% des exigences sont acceptées, amendées ou rejetées avec motif, l'attestation de conformité scellée est émise et archivée.

---

## 8. Banc d'Évaluation Doctrinal & Retours Débats (`/kb/evals`) — Lot A9

L'espace Évaluations permet de mesurer objectivement la précision et le rappel de la doctrine architecturale sur le jeu de test canonique `check_option_v1`, d'enrichir le jeu de données par annotation humaine qualifiée, et de remonter les désaccords observés en séance de délibération.

### 8.1 Inspection & Annotation du Jeu de Test (`check_option_v1`)
Le jeu de test de référence `check_option_v1` regroupe des cas d'évaluation représentatifs des arbitrages architecturaux :
- **Habilitation Requise (403 Forbidden)** : L'annotation et la modification de la vérité terrain (*ground truth*) sont strictement réservées aux experts détenteurs du rôle `kb:evaluate`. Les relecteurs standards (`kb:review`) disposent d'un accès en lecture seule.
- **Statuts d'Annotation** :
  - `human_verified` : Cas formellement qualifié et validé par un expert humain assermenté.
  - `disputed` : Cas faisant l'objet d'une controverse ou d'un désaccord doctrinal ouvert.
  - `needs_review` : Nouveau cas issu d'un retour de délibération nécessitant instruction.
- **Édition des Attendus** : Possibilité de modifier le verdict attendu (`conform`, `non_conform`, `conditional`), la justification textuelle et la liste des clauses doctrinales de référence (`expected_clauses`).

### 8.2 Exécution du Benchmark & Validation de la Porte G6
Depuis la console `/kb/evals`, cliquez sur **"Lancer le Benchmark"** :
- **Calcul du Rappel Réel** : Le taux de rappel est calculé rigoureusement sur les cas vérifiés par l'humain (`human_verified_cases`), garantissant l'absence de biais synthétique.
- **Critère de Porte Qualité G6** : Le taux de rappel doit impérativement atteindre ou dépasser **80%** ($\ge 0.80$) pour valider la Porte G6 (*Atelier & Evals Validés*).
- **Rapport de Régression** : Identification immédiate des faux négatifs ou des dégradations de rappel par rapport au passage précédent.

### 8.3 Boucle de Rétroaction sur les Débats Doctrinaux
En cours de délibération (`/deliberation`), chaque argument appuyé sur une clause doctrinale dispose d'un bouton d'alerte :
1. **Signaler un Désaccord** : Cliquez sur l'icône de signalement à côté de la référence KB.
2. **Formulaire Modal Circonstancié** :
   - Motif : Faux positif (`false_positive`), faux négatif (`false_negative`), ambiguïté de la clause (`ambiguity`) ou doctrine obsolète (`outdated_doctrine`).
   - Règle alternative suggérée et justification circonstanciée.
3. **Instruction & Conversion** : Les signalements sont injectés dans la file d'attente d'évaluation (`/kb/evals`), permettant aux curateurs KB de convertir le retour en nouveau cas de test ou en proposition d'amendement doctrinal.

---

## 9. Tableau de Bord KB, Publication Scellée (Porte G7) & Campagnes (`/kb/dashboard`) — Lot A11

Le Tableau de Bord de Gouvernance constitue la tour de contrôle de la doctrine architecturale d'entreprise, permettant de superviser l'ensemble des indicateurs de santé, de sceller les versions officielles (Porte G7) et de piloter les campagnes d'enrichissement ciblées.

### 9.1 Tour de Contrôle & Santé Consolidée
Depuis `/kb/dashboard`, quatre cartes de bord synthétisent l'état opérationnel :
- **Doctrine Active** : Nombre total d'actifs indexés ventilés par typologie (principes fondamentaux, patrons d'architecture, décisions ADR, contrôles automatisés, termes du glossaire).
- **Boîte de Revue (Porte G5)** : Nombre de dossiers en attente et en retard d'instruction, avec calcul du délai moyen de traitement.
- **Couverture Référentiels** : Pourcentage d'exigences normatives couvertes et opposables sur l'ensemble des cadres ingérés (ex: NIS2, ISO 27001).
- **Rappel Benchmark (Porte G6)** : Taux de conformité sur le jeu de test de référence `check_option_v1`, attestant de l'éligibilité de la doctrine ($\ge 80\%$).

> [!WARNING]
> **Bandeau d'Alerte Mode Démo Éphémère** : Lorsque le moteur LLMOps s'exécute sur une enclave mémoire non persistante (`storage.mode = "demo"`), un bandeau d'avertissement permanent signale que les modifications doctrinales seront purgées au redémarrage du conteneur.

### 9.2 Scellement Cryptographique & Publication Officielle (Porte G7)
L'acte de publication fige l'état de la doctrine dans un instantané immuable et opposable :
1. **Habilitations Strictes (403 Forbidden)** : Seuls les experts dotés du rôle `kb:admin` ou `kb:maintain` (ou administrateurs de plateforme) sont autorisés à déclencher la publication.
2. **Contrôle d'Éligibilité Porte G7 (409 Conflict)** : La publication est rigoureusement bloquée tant que :
   - Des revues critiques en retard subsistent dans la boîte de réception (Porte G5 non respectée).
   - Le taux de rappel calculé sur les cas d'évaluation vérifiés par l'humain est inférieur à 80% (Porte G6 non validée).
3. **Scellement SHA-256 & Versionnage** :
   - Saisie du journal d'évolution (*changelog*) officiel.
   - Génération de l'identifiant d'instantané (`snapshot-YYYY-MM-DD-<hash>`) et incrémentation de version (ex: `v1.2.0`).
   - Calcul et archivage de l'empreinte cryptographique SHA-256 scellée avec badge d'authenticité.

### 9.3 Campagnes d'Enrichissement Ciblées
Pour combler les lacunes doctrinales identifiées par les architectes ou auditeurs :
- **Lancer une Campagne** : Définition d'un titre, domaine (`architecture`, `security`, `cloud`, `data`, `network`), type d'actif cible (`pattern`, `control`, `principle`), volume attendu de clauses et échéance.
- **Suivi de Progression** : Visualisation en direct du taux d'avancement (clauses validées vs objectif) et clôture automatique au terme de la campagne.

---

## 10. Dépannage Fréquent

- **"Arbitrage refusé (blocages actifs)"** : Vérifiez que toutes les options sont évaluées, qu'aucune objection n'est ouverte et que la couverture des référentiels projet est complète.
- **"403 Habilitation insuffisante"** : Seul le Lead Architect ou un expert affecté au domaine du sujet (ex: `infrastructure`) peut enregistrer la décision.
- **"403 Interdit : domaine non possédé"** : Lors de l'examen d'un candidat KB ou d'une exigence réglementaire, vous devez être explicitement propriétaire du domaine concerné (`ownedDomains`).
- **"403 Habilitation d'évaluation manquante"** : Seul un expert détenteur du rôle `kb:evaluate` peut annoter le jeu de test canonique ou modifier le ground truth d'un cas d'évaluation.
- **"403 Habilitation de publication manquante"** : La publication officielle et le scellement de la doctrine requièrent impérativement les rôles `kb:admin` ou `kb:maintain`.
- **"409 Conflit : Conditions de la Porte G7 non remplies"** : La publication est formellement bloquée tant que des revues critiques en retard subsistent ou que le rappel benchmark est inférieur au seuil de 80%.
- **"Porte G6 non atteinte (Rappel < 80%)"** : Le taux de rappel calculé sur les cas vérifiés par un expert humain est insuffisant. Vérifiez les clauses doctrinales associées ou annotez les cas litigieux.
- **"409 Conflit : exigences non couvertes restantes"** : Toutes les exigences d'un référentiel doivent avoir été instruites (acceptées, amendées ou rejetées) avant de pouvoir émettre la déclaration de couverture.
- **"409 Conflit d'état"** : Le candidat a déjà été accepté ou rejeté définitivement.
- **"413 Fichier trop volumineux"** : La taille maximale autorisée pour le téléversement de référentiel est de 20 Mo.
- **"Mode Hors-Ligne (Offline)"** : En l'absence de serveur LLMOps joignable sur le réseau local, Archinex bascule sur l'instantané scellé sans interruption de service.
- **"Jeton d'invitation expiré"** : Les invitations d'experts sont valables strictement 7 jours. Demandez à un administrateur d'émettre une nouvelle invitation.

---

## 11. Scellement et Export du Dossier d'Engagement (Lots A16 à A21)

La publication finale d'un projet d'architecture s'appuie sur le format standardisé **Dossier d'Engagement Scellé** (`EngagementBundle`), directement consommable par Document Engine et Document Studio.

### 11.1 Scellement et Dérivations Déterministes (A16 & A21)
- **Sceau canonique SHA-256** : Calculé selon le profil partagé `canonical-json-v1`, assurant un résultat identique indépendamment de l'ordre des clés ou de l'environnement d'exécution.
- **Règle d'or épistémique** : Seul ce qui a été expressément validé par une personne humaine habilitée (ou confirmé dans le journal de réutilisation avec validation des hypothèses) est exporté au niveau `asserted`. Les propositions IA restent au niveau `proposed`.
- **Enveloppe Suite & SnapshotRef** : L'instantané scellé est encapsulé dans `SuiteSnapshotEnvelope` et produit une référence détachable `SnapshotRef` `{ sourceSystem, snapshotId, checksum, producedAt }` voyageant séparément pour vérification d'intégrité par les consommateurs.
- **Projection de maturité** : Pour conformité avec la suite (`L0_named` à `L4_specified`), le statut local `L5_archived` est projeté en `L4_specified`.

### 11.2 Boîte de Dialogue d'Export & Bandeau Provisoire (A17)
Accessible depuis le dialogue d'homologation (`FreezeSectionDialog`) :
- **Sélection obligatoire de la confidentialité** : `internal`, `confidential`, `secret` ou `public`. L'export est refusé si non renseigné.
- **Bandeau "Dossier Provisoire"** : Affiché en jaune/ambre avec la liste précise des blocages tant que le dossier comporte des sujets non mûrs (`< L3_decided`) ou des conflits d'architecture ouverts.
- **Écarts bloquants & Éléments proposés** : Mise en évidence visuelle immédiate des points nécessitant une revue.
- **Historique immuable** : Consultation de la liste des dossiers scellés avec horodatage, auteur et condensat SHA-256.

### 11.3 Export OSCAL NIST SSP (A19)
- Projection de la matrice de conformité réglementaire (ex: NIS2, ISO 27001) au standard international NIST OSCAL System Security Plan v1.0.0.
- **Garantie d'intégrité** : Seules les exigences associées à des contrôles `asserted` portent l'état `implemented` (`satisfied`). Les propositions IA portent l'état `planned` avec un avertissement explicite.

### 11.4 Différentiel entre Dossiers & Rétroaction Doctrinale (A19)
- **Comparateur de dossiers (`diffEngagementBundles`)** : Détecte les ajouts, suppressions et modifications entre deux versions scellées, et signale toute **régression épistémique** (`asserted` $\rightarrow$ `proposed`).
- **Retour vers la capitalisation (`extractBundleKbCandidates`)** : Les décisions validées natives créées au cours du projet sont automatiquement extraites comme candidats pour la base de connaissances et déposées dans la boîte de revue d'experts au statut `in_review`.

### 11.5 Projections Visuelles en Phase 3 (Rendu & Homologation)
En Phase 3 (« Rendu & Homologation »), Archinex permet de visualiser et d'exporter l'architecture retenue sous trois prismes complémentaires via le sélecteur Mermaid d'`ArtifactRegenerationHub` et le fragment `HldFragmentView` :
1. **🎯 Architecture Spécifiée (Cible)** *(Vue par défaut)* : Diagramme de conteneurs et de flux (C4 / Flowchart) matérialisant la topologie de la solution retenue, ses composants embarqués autonomes (agents, métrologie, console), ses interfaces avec le SI existant (alarmes SNMP, métriques API, logs Syslog TLS) et les nœuds cibles.
2. **🔄 Chaîne de Déploiement & Homologation** : Diagramme de séquence modélisant la chaîne de confiance et de validation humaine (construction du paquet signé par l'éditeur/titulaire, soumission au guichet d'homologation/recette, approbation formelle et déploiement contrôlé vers les agents).
3. **⚖️ Graphe Décisionnel (Auditabilité)** : Graphe épistémique traçant l'arbre causal de la délibération (hypothèses, énoncés prouvés, conflits et options retenues) pour la traçabilité d'audit.

Pour les sujets d'infrastructure et d'environnements (ex. *Socle 3 plateformes, pré-prod iso-état* du projet LUMICC), Archinex projette automatiquement la topologie à trois niveaux (Production, Pré-production Iso-État répliquant l'état technique et accueillant l'état candidat, Test Réduit avec Test-RAN) ainsi que la filière de qualification usine chez les fournisseurs avec contrôle d'audit et de représentativité. L'isolation des contextes garantit qu'aucun outillage ou libellé d'un projet tiers (ex. RATP/PCC) n'est injecté dans les rendus d'un autre projet.

Ces schémas sont directement intégrés dans le fragment Markdown HLD exporté (`renderHldFragmentMarkdown`) et téléchargeables au format `.mmd`.

---



### 11.6 Sélecteur de Sujets et Pré-filtrage L4 en Phase 3
En Phase 3 (« Rendu & Homologation »), un bandeau supérieur dédié (`Phase3SubjectSelector`) permet d'explorer et de basculer entre les sujets d'architecture :
1. **🎯 Pré-filtrage par défaut L4 Spécifiés** : Isole immédiatement les sujets dont l'architecture technique a été entièrement spécifiée (composants autonomes, chaîne de déploiement WAPT, flux réseau étiquetés) et prêts pour l'homologation.
2. **⚖️ Bascule rapide vers L3+ ou Tous** : Permet de visualiser également les sujets arbitrés ou en cours de cadrage si nécessaire.
3. **📁 Segmentation par Lots / Parties** : Permet d'isoler un sous-ensemble (ex. LOT-02 Socle Infra ou LOT-05 Ops).
4. **💬 Conservation dans le fil de délibération** : Ce même filtre par Lots/Parties est accessible dans la colonne latérale du fil de délibération (`SubjectConversationList`), avec mémorisation de l'état actif dans le projet.


### 11.7 Lisibilité des Diagrammes : Aperçu Plein Écran au Maintien du Clic
Pour faciliter la lecture des graphes d'architecture denses (topologie C4, séquences de déploiement, arbres de causalité) :
1. **Maintien du clic (Press & Hold)** : En maintenant le clic gauche enfoncé sur n'importe quel diagramme Mermaid, celui-ci s'ouvre instantanément en plein écran agrandi sur fond sombre.
2. **Retour immédiat** : Dès que le bouton de la souris est relâché, le plein écran se referme sans perturber le scroll ou l'état de la page.
3. **Plein écran fixe & Zoom** : Il est également possible de verrouiller l'affichage en plein écran via le bouton dédié dans la barre d'outils ou de naviguer avec la touche Échap.


### 11.8 Cycle de Vie & Réactivité en Direct des Artefacts Graphiques
Les diagrammes et rendus techniques d'Archinex (Mermaid C4, séquences de déploiement, SysML, Structurizr) sont conçus pour éliminer tout risque de dérive documentaire (*No Doc Drift*) :
1. **Liaison formelle au projet (`projectId`)** : Chaque diagramme porte formellement l'identifiant unique du projet et son nom dans le titre du sous-graphe racine (`subgraph SYSTEM["Système : ${projectName} (...) [Projet: ${projectId}]"]`). Aucune règle en dur ni aucun nom de client tiers n'est figé dans le code.
2. **Réactivité en temps réel lors de la frappe (Workbench L4)** : Lorsque vous rédigez ou éditez la spécification technique dans l'atelier du sujet (`SubjectThreadView`), chaque frappe met immédiatement à jour le store réactif (`deliberationStore.setDetailedSpec`). Les projections graphiques sont définies sous forme d'expressions dérivées Svelte 5 (`$derived`) et se recalculent instantanément sans nécessiter de rechargement de page.
3. **Moments de régénération des artefacts** :
   - **En direct (Svelte 5 `$derived`)** : Dès qu'une option est retenue dans la Matrice, qu'une motivation est modifiée, ou que la spécification L4 est éditée.
   - **À la demande (Bouton « Régénérer »)** : Le bouton d'actualisation dans l'en-tête d'`ArtifactRegenerationHub` permet de re-synchroniser explicitement les données depuis l'API serveur ou de recharger le graphe d'architecture.
   - **Lors du scellement d'homologation (Jalon L5)** : Lors de la signature cryptographique du livrable (`freezeSubjectSnapshot`), l'empreinte SHA-256 scelle définitivement la version des artefacts, les rendant opposables et inaltérables dans le temps.

## 12. Démonstrateur & Ensemencements Démo (LUMICC / "Lulu")

Pour préparer rapidement une session de démo ou des tests interactifs sans ressaisie manuelle, Archinex fournit un ensemencement dédié du dossier réel **LUMICC Lot 1** :

``bash
# Réinitialisation à l'état "Juste Après Ingestion" (7 sujets L1_framed, 0 décision scellée)
npm run seed:lulu
``n
Cette commande réinitialise l'espace projet `lumicc-lot1-noc` dans la base SQLite locale (`dev.db`) et insère l'audit J0 de 92 clauses dans l'historique des dépouillements. Elle permet de dérouler en direct les 4 scénarios de délibération :
1. **Cas nominal** (`SUBJ-LUMICC-01`) : arbitrage fluide sur la matrice d'options 3 DC & RTO UDR.
2. **Débat contradictoire** (`SUBJ-LUMICC-03`) : controverse infra/sécurité sur l'oscillateur GNSS 30j et levée d'objection.
3. **Contradiction réglementaire** (`SUBJ-LUMICC-05`) : blocage Porte G3 sur violation GSMA SGP.22 / NIS2 et alignement souverain.
4. **Capitalisation doctrinale** (`SUBJ-LUMICC-02`) : passage Porte G4, qualification de portabilité et transmission au Knowledge Hub LLMOps.



---

## 13. Paquets de Décision Exécutables (EDP) & Oracles OPA [Expérimental]

Dans le cadre du lot expérimental (`ARCHINEX_EXPERIMENTAL_EDP=1`), Archinex permet de lier à chaque décision d'architecture arbitrée un **Paquet de Décision Exécutable** (EDP). Ce paquet permet de confronter automatiquement les décisions d'architecture de haut niveau (HLD) aux configurations et manifestes techniques réels ou planifiés (LLD).

### 13.1 Activation du Mode Expérimental
Le sous-système EDP est strictement hermétique et n'altère en rien le fonctionnement standard d'Archinex s'il n'est pas activé :
```bash
# Activation via variable d'environnement (Linux / macOS)
export ARCHINEX_EXPERIMENTAL_EDP=1

# Activation sous Windows PowerShell
$env:ARCHINEX_EXPERIMENTAL_EDP="1"
```

### 13.2 Visualisation dans l'IHM Workbench (`EdpCard`)
Lorsque le drapeau est actif, la fiche de chaque décision affiche un panneau dédié **Paquet de Décision Exécutable** :
- **Badge d'état** : `PROPOSÉ`, `VALIDÉ` ou `⚠️ STALE (CADUC)`.
- **Mode de production** : `human-authored` (rédigé par l'architecte) ou `llm-proposed-human-approved` (assisté par l'IA sous chaîne déterministe).
- **Validateur humain (Invariant II)** : Nom et rôle de l'architecte ayant formellement homologué le paquet.
- **Score de mutation** : Pourcentage de mutants tués par la suite d'auto-test (exigence de 100 %).
- **Dernier verdict** : Statut d'évaluation (`COMPLIANT`, `VIOLATED`, `INSUFFICIENT_INPUT`, `NOT_APPLICABLE`) et liste des violations constatées.
- **Actions disponibles** :
  - *Valider le Paquet (G3)* : réservé aux rôles d'architectes habilités (`Lead Architect`, `Domain Architect`).
  - *Contester (Human Statement)* : ouvre un formulaire d'objection architecturale motivée (**Invariant III**).

### 13.3 Vérification Hors-Ligne sur un Cas Simple (`edp verify`)
Les intégrateurs peuvent tester la conformité de leurs artefacts en local, sans accès réseau :

```bash
# 1. Vérification du paquet de référence ADR-012 sur une entrée conforme :
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input edp/examples/adr012-baremetal/mocks/pass.json

# 2. Vérification sur une entrée défaillante (violation BMC URL / OOB IP) :
npx tsx scripts/edp-verify.ts \
  --edp edp/examples/adr012-baremetal/edp.json \
  --input edp/examples/adr012-baremetal/mocks/fail_rule_2_bmc_url_mismatch.json
```

### 13.4 Exécution de la Porte d'Architecture CI (`edp-gate`)
Pour valider l'intégrité globale d'un paquet en intégration continue (schéma, tests OPA, mutation à 100 % et vérification d'entrées) :
```bash
# Exécution de la porte d'architecture complète :
npx tsx scripts/edp-gate.ts
```
Codes de sortie retournés :
- **0** (`compliant`) : Tous les contrôles et artefacts sont conformes.
- **1** (`violated`) : Défaillance architecturale détectée.
- **2** (`insufficient_input`) : Entrée incomplète ou source manquante (anti-vacuité).
- **3** (`unavailable`) : OPA absent ou anomalie d'exécution.


### 13.5 Pile Docker d'Intégration & Outillage (Nautobot, Batfish, OPA Server)
Pour tester les décisions et oracles dans un environnement d'intégration réel :
- **Démarrage de la stack d'outils** :
  ```powershell
  cd deploy\integrator-tools
  .\tools.ps1 up      # Démarre Nautobot 2.x, PostgreSQL 15, Redis 7, Batfish et OPA Server
  .\tools.ps1 status  # Affiche les URLs d'accès et l'état des conteneurs
  .\tools.ps1 test    # Valide la connectivité GraphQL Nautobot et l'API REST OPA
  ```
- **Points d'accès fournis** :
  - **Nautobot Web UI** : `http://localhost:8080` (admin / adminpassword / Token `0123456789abcdef0123456789abcdef01234567`)
  - **Nautobot GraphQL** : `http://localhost:8080/api/graphql/`
  - **Batfish API** : `http://localhost:9997`
  - **OPA Server REST** : `http://localhost:8181/v1/data`
