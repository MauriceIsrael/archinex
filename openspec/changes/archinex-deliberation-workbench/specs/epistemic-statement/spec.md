# Spécification : L'Énoncé Épistémique (`epistemic-statement`)

## ADDED Requirements

### Requirement: Modèle de l'Énoncé à 5 Facettes
Le système SHALL représenter chaque fait, contrainte ou décision d'architecture sous la forme d'un `Statement` doté rigoureusement de ses 5 facettes :
1. **Contenu** : Triplet contraint `sujet`, `prédicat` (validé contre le dictionnaire du domaine), et `valeur` (avec unité optionnelle).
2. **Justification** : Référence explicite aux antécédents (`based_on`), à la question résolue (`answers_question`) et à la règle d'inférence (`applied_rule`).
3. **Autorité** : Identifiant de l'auteur, rôle formel, et mode de production (`production_mode`).
4. **Maturité** : Niveau du sujet rattaché (`L0_named` à `L4_specified`) et statut épistémique (`confidence`).
5. **Révisabilité** : Graphe des énoncés amont dont il dépend et déclaration des conséquences si l'énoncé s'effondre.

### Requirement: Enveloppe de Scellement Entrante (`ContributionEnvelope`)
Le système SHALL soumettre tout enregistrement d'énoncé à une enveloppe de scellement validée contenant :
- `producer` : Type de producteur (humain ou agent LLM avec modèle, fournisseur et `prompt_sha256`).
- `validator` : Identifiant de l'architecte validateur humain, rôle formel et horodatage ISO-8601 (obligatoire dès que `production_mode != human-authored`).
- `production_mode` : L'une des trois valeurs canoniques : `human-authored`, `llm-proposed-human-approved`, `llm-derived`.
- `payload_sha256` : Condensat cryptographique calculé sur le triplet de l'énoncé.

### Requirement: Interdiction Formelle du Croisement `verified × llm-derived`
Le système SHALL interdire formellement et rejeter avec un message d'erreur explicite tout énoncé combinant le statut `verified` et le mode de production `llm-derived`. Un énoncé dérivé sans relecture humaine ne peut jamais valoir preuve locale.

---

## Scenarios

#### Scenario: Enregistrement d'un énoncé rédigé par un architecte
- **GIVEN** un architecte connecté sous le rôle `Network Architect`
- **WHEN** il soumet un énoncé avec `confidence: designed` et `production_mode: human-authored`
- **THEN** l'énoncé est persisté dans le Plan Engagement du projet avec son horodatage et son empreinte SHA-256.

#### Scenario: Enregistrement d'une proposition d'agent validée par le Lead Architect
- **GIVEN** une proposition d'énoncé émise par un agent IA (`llm-proposed`)
- **WHEN** le `Lead Architect` examine et valide la proposition
- **THEN** l'enveloppe est signée avec `production_mode: llm-proposed-human-approved` et l'identifiant du validateur
- **AND** l'énoncé est accepté par le portier déterministe.

#### Scenario: Rejet d'un énoncé prétendant au statut verified sans validation humaine
- **GIVEN** un agent d'inférence autonome produisant une déduction automatique
- **WHEN** l'agent tente de soumettre l'énoncé avec `confidence: verified` et `production_mode: llm-derived`
- **THEN** le système rejette immédiatement l'opération avec l'erreur `INVALID_EPISTEMIC_COMBINATION`
- **AND** aucun enregistrement n'est créé dans le graphe.

#### Scenario: Rejet d'une contribution avec validateur manquant
- **GIVEN** un énoncé soumis avec `production_mode: llm-proposed-human-approved`
- **WHEN** le champ `validator` est vide ou omis
- **THEN** le portier renvoie une erreur de contrat `VALIDATOR_REQUIRED` et refuse l'écriture.

#### Scenario: Rejet d'une charge utile altérée (SHA mismatch)
- **GIVEN** une enveloppe de contribution dont le contenu a été altéré après signature
- **WHEN** le système recalcule le condensat SHA-256 du triplet
- **THEN** l'empreinte recalculée ne correspond pas à `payload_sha256`
- **AND** la contribution est rejetée avec l'erreur `CHECKSUM_MISMATCH`.
