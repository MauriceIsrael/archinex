# Référentiels réglementaires : de la source officielle à la décision conforme

Ce guide décrit comment charger un texte réglementaire (NIS2, RGPD, CRA…) dans LLMOps pour qu'Archinex :

- joigne ses exigences au contexte de chaque sujet ;
- juge la conformité des options ;
- refuse de retenir une option non conforme sans écart accepté et justifié.

**Principe :** rien n'entre en vigueur sans l'expert du domaine. Le découpage du texte et les propositions (critères d'acceptation, clauses vérifiables) sont des brouillons. Un humain accepte, amende ou rejette chaque exigence, puis déclare la couverture.

## 0. Prérequis (une fois)

1. **LLMOps à jour.** La branche qui contient les sources officielles et les découpeurs doit être fusionnée (`claude/regulatory-frameworks`). Redémarrez ensuite le serveur avec `python scripts/serve_local.py`. Aucune reconstruction manuelle n'est nécessaire : la publication (étape 5) met à jour la base servie.
2. **Archinex à jour.** `npx prisma db push`, `npx prisma generate`, puis redémarrez.
3. **Identités.** LLMOps reconnaît les gens par l'**e-mail de leur compte Archinex**. Chaque e-mail doit correspondre à un responsable déclaré dans `data/kb/owners.yaml` (LLMOps). Créez dans Archinex (page Utilisateurs) un compte par rôle utilisé :

   | Rôle LLMOps | Handle | E-mail du compte Archinex | Sert à |
   |---|---|---|---|
   | `kb:maintain`, `kb:admin` | `@maintainers` | celui de `@maintainers` | déposer une source, charger des propositions, publier ; peut aussi relire tous les domaines |
   | propriétaire de `security-governance`, `incident-handling` | `@security-compliance-team` | celui de ce handle | relire les exigences NIS2 et CRA de son domaine |
   | propriétaire de `data-protection`, `privacy` | `@data-protection-officer` | **à renseigner** dans `owners.yaml` (aucun aujourd'hui) | relire les exigences RGPD |
   | propriétaire de `risk-management` | `@ciso-office` | celui de ce handle | relire les exigences de gestion des risques |

   **Seul ?** Une personne peut tenir tous les rôles : un compte Archinex par rôle, avec des adresses en `+` (`prenom.nom+maint@…`, `+secu`, `+dpo`) qui arrivent dans la même boîte. Changer de compte rend chaque acte attribuable au bon rôle. La règle « personne ne valide sa propre décision » reste vérifiée par rôle.
4. **Notifications (facultatif).** Pour recevoir sur un salon Discord les demandes de revue adressées aux responsables, définissez dans l'environnement de LLMOps (`.env`, jamais dans le dépôt) : `OWNER_DISCORD_WEBHOOK=https://discord.com/api/webhooks/…`.

## 1. Déposer la source officielle

**Point d'entrée : Archinex, menu du compte (en haut à droite) → « Référentiels & Couverture » (`/kb/frameworks`), bloc « Téléverser un nouveau référentiel ».** Compte : mainteneur.

| Référentiel | Code | Version | Fichier (dépôt LLMOps) |
|---|---|---|---|
| NIS2 | `NIS2` | `2022/2555` | `data/sources/frameworks/NIS2/CELEX_32022L2555_EN.html` |
| RGPD | `RGPD` | `2016/679` | `data/sources/frameworks/RGPD/CELEX_32016R0679_EN.html` |
| CRA | `CRA` | `2024/2847` | `data/sources/frameworks/CRA/CELEX_32024R2847_EN.html` |

Les empreintes SHA-256 et les commandes pour retélécharger les textes sont dans `data/sources/frameworks/README.md`.

Résultat attendu : une ingestion « reviewing » avec 19 exigences pour NIS2, 43 pour le RGPD et 29 pour le CRA, chacune avec son texte légal mot pour mot.

## 2. Charger les propositions (s'il y en a)

Sur l'écran de l'ingestion, cliquez **« Charger des propositions (JSON) »** avec le compte mainteneur. Pour NIS2, le fichier est `data/proposals/frameworks/NIS2-2022-2555.link-proposals.json` (dépôt LLMOps). Il contient les critères d'acceptation proposés pour les 9 exigences qui n'avaient pas encore de contrôle.

Ces propositions viennent du modèle : elles apparaissent en violet, « proposés par le modèle — à accepter, amender ou rejeter ».

## 3. Relire chaque exigence

Compte : responsable du domaine de l'exigence, ou mainteneur. Pour chaque ligne :

- **Accepter** si le texte et les critères d'acceptation proposés conviennent.
- **Amender** pour corriger ou compléter les critères d'acceptation (un par ligne) ou les liens vers la doctrine. Un amendement vide est refusé.
- **Rejeter** si l'exigence ne s'applique pas aux architectures que vous concevez. Le motif est obligatoire.

À vérifier :

- **Le critère d'acceptation est vérifiable sur une architecture** (« les accès d'administration exigent une authentification multifacteur »), pas une paraphrase du texte légal.
- **Les obligations des autorités** (États membres, CSIRT) ont été exclues au découpage : signalez-en une si elle reste.
- **RGPD et CRA : contrôles existants.** Les contrôles `RGPD-REQ-*` et `CRA-REQ-*` portent des identifiants internes absents des nouveaux manifestes. Deux voies :
  - adopter les identifiants par article et rendre les anciens obsolètes ;
  - reporter leurs critères par amendement, par exemple `RGPD-REQ-BREACH-02` → `RGPD-ART33-1` et `RGPD-ART34-1`, `RGPD-REQ-PRIVACY-01` → `RGPD-ART25-1` et `RGPD-ART25-2`, `CRA-REQ-VULN-01` → `CRA-ANXI-PII-1` et `CRA-ANXI-PII-2`.

## 4. Publier les exigences validées

Cliquez **« Publier les exigences validées »** avec le compte mainteneur. Archinex enchaîne deux opérations :

1. l'application : création des contrôles acceptés ou amendés ;
2. la **publication de la base** servie.

Sans la publication, ni le contexte des sujets ni le juge de conformité ne voient les nouveaux contrôles. Si l'écran signale « publication échouée », relancez le bouton.

## 5. Déclarer la couverture

Cliquez **« Déclarer la couverture opposable »** avec un compte d'expert. Tant qu'une exigence attendue n'est pas active et validée, LLMOps refuse et liste ce qui manque. Recommencez une fois la liste vide.

## 6. Valider les clauses vérifiables

Les clauses « exige / interdit » qui permettent de juger automatiquement une option sont en **brouillon** (`checks_status: draft`) :

- NIS2 21(2) : c (sauvegardes, PRA), d (fournisseurs), e (logiciels hors support, développement sécurisé), h (chiffrement), j (authentification multifacteur) ;
- RGPD : journalisation, notification sous 72 h.

Tant qu'elles sont en brouillon, Archinex affiche « À vérifier » sans bloquer.

Pour les rendre opposables, l'expert relit chaque clause dans le fichier du contrôle (`data/kb/controls/<CODE>/<ID>.md`, dépôt LLMOps) : termes déclencheurs, termes attendus, message. Il passe ensuite `checks_status` à `validated` par une PR, puis publie (`POST /api/knowledge/publications`). Les contrôles promus à l'étape 4 n'ont pas de clause : il faut les ajouter de la même façon (voir l'issue LLMOps #91).

## 7. Déclarer les référentiels applicables d'un espace

Dans Archinex :

- **Nouvel espace depuis un RFP :** l'étape 2 de l'assistant propose, cochés, les référentiels que cite le RFP.
- **Espace existant :** phase **Appropriation**, panneau « Référentiels réglementaires applicables ». Les propositions viennent du dossier d'exigences enregistré.

Une fois confirmés :

- ils sont transmis à LLMOps ;
- leurs contrôles actifs accompagnent chaque sujet ;
- la matrice affiche la conformité de chaque option ;
- à l'arbitrage, une option qui viole une **règle validée** ne peut être retenue qu'en acceptant l'écart avec une justification, et l'écart apparaît dans le fragment de HLD.

## Exemple : RFP de supervision d'un opérateur luxembourgeois

Référentiels cités par le RFP et état de leur prise en charge :

| Référentiel | Cité | Source dans LLMOps | Action |
|---|---|---|---|
| NIS2 (art. 21 explicitement) | oui | officielle, 19 exigences | étapes 1 à 6, avec les propositions |
| RGPD | oui (plusieurs exigences) | officielle, 43 exigences | étapes 1 à 6 ; décider du sort des `RGPD-REQ-*` |
| Cyber Resilience Act | oui | officielle, 29 exigences | étapes 1 à 6 |
| Directive CER (2022/2557) | oui | **aucune** | écrire un découpeur (`pipelines/frameworks/splitters/cer.yaml`) et récupérer le texte EUR-Lex |
| ISO/IEC 27001, 27005, ISO 22301, ISO 14001 | oui | **non ingérables** : normes payantes et protégées | fournir une copie sous licence pour un découpeur ; à défaut, seuls des critères paraphrasés sont possibles |
| Exigences de l'ANSSI luxembourgeoise | oui | **aucune** | identifier les textes applicables |

## Dépannage

| Symptôme | Cause et remède |
|---|---|
| 403 au dépôt ou à la publication | Le compte Archinex n'a pas l'e-mail d'un handle `kb:maintain` (étape 0.3). |
| 403 à la revue d'une ligne | Le compte n'est pas propriétaire du domaine de l'exigence ni mainteneur. |
| Les nouveaux contrôles n'apparaissent pas dans les sujets | La base n'a pas été publiée (étape 4), ou les référentiels de l'espace ne sont pas déclarés (étape 7). |
| Publication en erreur 500 sous Windows | LLMOps antérieur à la correction UTF-8 : lancez Python avec `-X utf8` ou mettez LLMOps à jour. |
| « LLMOps injoignable » dans la fenêtre de décision | Serveur LLMOps arrêté : la conformité n'est pas vérifiée, rien n'est bloqué. |
