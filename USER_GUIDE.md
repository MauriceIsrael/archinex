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

## 4. Dépannage Fréquent

- **"Arbitrage refusé (blocages actifs)"** : Vérifiez que toutes les options sont évaluées, qu'aucune objection n'est ouverte et que la couverture des référentiels projet est complète.
- **"403 Habilitation insuffisante"** : Seul le Lead Architect ou un expert affecté au domaine du sujet (ex: `infrastructure`) peut enregistrer la décision.
- **"Mode Hors-Ligne (Offline)"** : En l'absence de serveur LLMOps joignable sur le réseau local, Archinex bascule sur l'instantané scellé sans interruption de service.
