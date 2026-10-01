# Archinex · Guide Utilisateur

Bienvenue dans le guide d'utilisation de la plateforme **Archinex** — Moteur de co-conception architecturale et d'arbitrage opposable.

---

## 1. Authentification & Profils

Le système utilise une gestion de session sécurisée avec hachage **bcrypt**.

- **Connexion** : Rendez-vous sur `/login` avec votre adresse e-mail et mot de passe.
- **Rôles supportés** :
  - `lead_architect` : Responsable d'architecture, habilité à arbitrer tous les domaines et à sceller les livrables.
  - `domain_expert` / `domain_architect` : Expert technique spécialisé (infrastructure, sécurité, réseau, cloud, data). Habilité à arbitrer les sujets relevant de ses domaines attribués.
  - `contributor` : Participe aux débats, évalue les options et propose des alternatives.
  - `viewer` : Consultation seule du tableau de maturité et des dossiers.

---

## 2. Déroulé d'un Projet de Co-Conception

Chaque sujet d'architecture traverse une chaîne rigoureuse de maturation en 6 étapes :

### Étape 1 : Cadrage du Sujet
1. Ouvrez le sujet depuis la **Matrice d'Allocation d'Effort** ou la liste des sujets.
2. Définissez le **Problème / Dilemme d'Architecture** (ex: *Sélection de la solution de stockage persistant pour les clusters bare-metal*).
3. Le sujet passe du niveau `L0_named` au niveau `L1_framed`.

### Étape 2 : Critères & Alternatives Contrastées (Onglet 1)
1. **Critères** : Ajoutez au moins deux critères pondérés (technique, réglementaire/sécurité, coût, résilience).
2. **Options** : Formulez au moins deux options d'architecture viables. Vous pouvez saisir une alternative manuellement ou solliciter l'agent *Proposer* pour compléter la matrice.
3. **Matrice d'Évaluation** : Notez chaque option sur l'échelle [-2; +2] avec une justification textuelle concise. Dès que toutes les options sont évaluées, le sujet atteint le niveau `L2_decomposed`.

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
- **Alertes de Retard (&ge; 5 jours ouvrés)** : Les candidats dont l'échéance `due_at` est dépassée sont mis en évidence par un bandeau d'alerte et un badge rouge animé.
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
1. **Correspondances Assistées par l'IA** : Cliquez sur *"Suggérer correspondances IA"* pour obtenir des propositions de liaisons doctrinales vers des contrôles ou principes existants, validées formellement et étiquetées `llm-derived`.
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

## 8. Dépannage Fréquent

- **"Arbitrage refusé (blocages actifs)"** : Vérifiez que toutes les options sont évaluées, qu'aucune objection n'est ouverte et que la couverture des référentiels projet est complète.
- **"403 Habilitation insuffisante"** : Seul le Lead Architect ou un expert affecté au domaine du sujet (ex: `infrastructure`) peut enregistrer la décision.
- **"403 Interdit : domaine non possédé"** : Lors de l'examen d'un candidat KB ou d'une exigence réglementaire, vous devez être explicitement propriétaire du domaine concerné (`ownedDomains`).
- **"409 Conflit : exigences non couvertes restantes"** : Toutes les exigences d'un référentiel doivent avoir été instruites (acceptées, amendées ou rejetées) avant de pouvoir émettre la déclaration de couverture.
- **"409 Conflit d'état"** : Le candidat a déjà été accepté ou rejeté définitivement.
- **"413 Fichier trop volumineux"** : La taille maximale autorisée pour le téléversement de référentiel est de 20 Mo.
- **"Mode Hors-Ligne (Offline)"** : En l'absence de serveur LLMOps joignable sur le réseau local, Archinex bascule sur l'instantané scellé sans interruption de service.
- **"Jeton d'invitation expiré"** : Les invitations d'experts sont valables strictement 7 jours. Demandez à un administrateur d'émettre une nouvelle invitation.


