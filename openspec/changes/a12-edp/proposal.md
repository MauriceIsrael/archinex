# Proposition : Paquet de Décision Exécutable (EDP) et Oracles OPA/Rego (Lot A12 - Expérimental)

## 1. Contexte & Problématique

Dans Archinex, le processus de délibération architecturale assistée par agents converge vers des décisions d'architecture (ADR). Cependant, lorsque le coût de génération des décisions tend vers zéro avec l'IA, la vérification devient le goulot d'étranglement majeur :
1. **Dérive théorique** : Un ADR purement textuel reste subjectif, non vérifiable automatiquement par des pipelines CI/CD ou des orchestrateurs d'infrastructure (GitOps, Sylva/CAPI, Nautobot), et dérive au fil du temps.
2. **Vacuité au stade HLD** : Au moment de la conception haut niveau (HLD), le système cible n'est pas encore instancié. Archinex ne connaît ni l'inventaire réel ni le plan d'adressage (LLD). Une règle universelle OPA évaluée naïvement sur un inventaire vide ou incomplet est vraie par vacuité (faux positif vert).
3. **Confusion intension vs extension** : Les décisions HLD doivent fixer des **règles intensionnelles** (ex. « tout équipement de type X dans la zone Y doit satisfaire Z » sur une ontologie partagée) sans jamais injecter de valeurs d'instanciation réelles (adresses IP, adresses MAC, noms d'hôtes réels).

## 2. Objectifs Architecturaux

Le Paquet de Décision Exécutable (**EDP** — *Executable Decision Package*) comble ce fossé en produisant pour chaque décision d'architecture arbitrée :
- Un contrat machine vérifiable reliant la décision à l'ontologie d'entreprise (`ontology_bindings`).
- Une politique OPA/Rego déterministe avec une suite d'auto-test et des fixtures de validation Red/Green.
- Un contrat d'entrée de raffinement (`refined_input`) empêchant toute validation par vacuité.
- Une preuve de non-régression par mutation systématique de l'oracle.

## 3. Ancrage dans la Constitution d'Archinex (Invariants)

L'EDP est un objet de premier ordre soumis à la Constitution de la Délibération d'Archinex :

1. **Invariant I (L'Énoncé est l'Atome Unique — Les 5 Facettes)** :
   Un EDP est un énoncé étendu portant obligatoirement les 5 facettes :
   - *Contenu* : Métadonnées, contexte de décision intensionnel, contrat de raffinement et oracle Rego.
   - *Justification* : Référence explicite à la décision (`subjectId`, `decisionId`, `version`) et aux URNs d'ontologie.
   - *Autorité* : Mode de production (`human-authored`, `llm-proposed-human-approved`, `llm-derived`) et signature du validateur.
   - *Maturité* : Statut (`draft`, `proposed`, `validated`, `stale`, `retracted`).
   - *Révisabilité* : Chaîne d'antécédents permettant d'invalider l'EDP si la décision source est révisée.

2. **Invariant II (Interdiction Absolue `verified × llm-derived`)** :
   Un EDP généré ou assisté par LLM est au mieux `llm-proposed-human-approved` et ne peut **JAMAIS** porter le statut `validated` (ou `verified`) sans la validation explicite d'un architecte humain habilité (`validator` identifié avec son rôle formel et son horodatage). L'API et la persistance rejettent formellement toute tentative de validation automatique sans validateur humain.

3. **Invariant III (Le Silence n'est Jamais une Approbation)** :
   L'absence d'objection ou de retour sur un EDP en statut `proposed` ne confère aucune validation implicite. L'EDP reste à l'état proposé tant qu'un humain n'a pas acté sa décision.

4. **Invariant IV (Le Brouillon est un Appât Percutant, Pas un Texte Lisse)** :
   La rédaction assistée par LLM d'un EDP produit un oracle Rego minimal, télégraphique, pointant directement sur les concepts ontologiques et exigeant des preuves immédiates (mocks défaillants ciblés).

5. **Invariant V (Deux Portes Humaines Uniques et Infranchissables)** :
   - L'EDP **naît de la Porte G3** (décision / arbitrage) : il concrétise la formalisation exécutable de la décision qui élève le sujet au jalon `L3_decided`.
   - La capitalisation de l'oracle ou des patterns Rego en référentiel d'entreprise **passe obligatoirement par la Porte G4**.

6. **Invariant VI (Rétractation par Défaut / Maintenance de Vérité)** :
   Si une décision ou un concept d'ontologie antécédent devient caduc, révisé ou invalidé ($S_1 \bot$), l'EDP associé ($S_2$) bascule automatiquement au statut `stale`. Il ne peut plus être utilisé pour certifier une conformité sans réinstruction.

7. **Invariant VII (Rôles Formels et Souveraineté du Lead Architect)** :
   Aucun identifiant nominatif en dur n'est utilisé dans les règles : seuls les rôles formels (ex. `Lead Architect`, `Domain Expert Architect`) habilitent la validation d'un EDP. Le Lead Architect tranche les arbitrages structurants.

8. **Invariant X (Matérialisation Visuelle des Gaps)** :
   L'interface de délibération matérialise immédiatement l'état de l'EDP (statut, verdict, score de mutation, couverture des fixtures) au niveau de la décision.

## 4. Vocabulaire Normatif du Verdict

L'oracle EDP s'exécute selon une convention stricte à 4 états exclusifs :
- **`compliant`** : L'entrée fournie satisfait l'ensemble des règles de la politique sans exception, et toutes les sources requises sont présentes et non vides.
- **`violated`** : L'entrée fournie contrevient à une ou plusieurs règles explicites (avec liste détaillée des violations et chemins d'accès).
- **`not_applicable`** : L'entrée ne concerne pas le périmètre d'application de la décision (critères d'applicabilité non rencontrés).
- **`insufficient_input`** : Une source requise est absente, vide, ou non documentée dans sa provenance. **Une entrée incomplète n'est jamais `compliant`**.

## 5. Cadre Expérimental

Le développement du thème EDP est rigoureusement isolé selon les règles suivantes :
- **Branche socle** : `experimental/edp` (créée depuis `main`). Toute intervention fait l'objet d'une PR ciblant cette branche.
- **Drapeau d'activation** : `ARCHINEX_EXPERIMENTAL_EDP=1`. En l'absence de ce drapeau, le comportement de l'application et les sorties existantes restent strictement inchangés (garantie de non-régression octet pour octet).
- **Intégrité contractuelle** : Aucun contrat stable existant n'est altéré ; les ajouts sont additifs et marqués comme expérimentaux.
- **Promotion** : La fusion vers `main` n'interviendra qu'à l'issue de la décision de promotion globale (issue #189).

