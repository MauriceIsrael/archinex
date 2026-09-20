# Spécification : Écoute Multi-Canale & Maïeutique Constructive (`dialectic-dialogue-recall`)

## ADDED Requirements

### Requirement: Capture Multi-Canale des Dialogues (Humain-Humain & Humain-Agent)
Le système SHALL capturer et analyser les flux de discussion tenus entre architectes humains, ainsi qu'entre architectes et agents IA. Cette capture s'effectue :
- Directement via le panneau de délibération intégré à l'interface Archinex.
- Via des connecteurs d'ingestion vers des salons de projet collaboratifs tiers (ex: Webhook / Bot de salon Discord de projet ou canal Slack/Teams dédié).
- Chaque message capturé est horodaté et rattaché au rôle de son émetteur.

### Requirement: Accompagnement Pédagogique & Cadrage Initial (Phase 1)
Le système SHALL proposer un mode pédagogique guidé lors de l'ingestion d'un document amont (RFP, CCTP, HLD V0) :
- Expliciter de manière claire et accessible les exigences clés des standards réglementaires et industriels applicables (ex: profils de synchronisation 3GPP MCX, exigences de résilience et de journalisation NIS2).
- Restituer les principes directeurs d'architecture de l'entreprise (`KH:P-xxxx`) en lien avec le périmètre du projet pour aligner la compréhension collective de l'équipe avant d'entamer la conception.

### Requirement: Rappel Proactif de Doctrine & Décisions Antérieures (Phase 2)
Le système SHALL agir en séance comme un catalyseur de mémoire institutionnelle :
- Analyser les échanges en temps réel et identifier les entités ou dilemmes d'architecture abordés.
- Interroger le *Knowledge Plane* pour détecter les décisions antérieures (`KH:ADR-xxxx`) ou les retours d'expérience (`REX`) pertinents.
- Émettre proactivement une fiche de rappel contextuelle dans le fil de discussion (ex: *« Ce dilemme a été tranché dans ADR-0014 : l'architecture Tier IV a été retenue pour les sites nodaux afin de garantir 30 jours de holdover. Souhaitez-vous vous aligner ou initier un arbitrage de dérogation ? »*).
- Empêcher la réouverture stérile de débats déjà arbitrés, accélérant ainsi la convergence vers la décision.

### Requirement: Animation Maïeutique & Confrontation Constructive
Le système SHALL animer activement la délibération en formulant des questions ouvertes et des confrontations d'hypothèses :
- Mettre en tension deux exigences contradictoires non arbitrées pour forcer l'émergence d'une solution créative.
- Proposer des pistes de compromis documentées (ex: architecture hybride, périmètre pilote réduit).

---

## Scenarios

#### Scenario: Ingestion et analyse d'un fil de discussion Discord de projet
- **GIVEN** un salon Discord dédié au projet d'architecture
- **WHEN** deux architectes débattent du dimensionnement des liaisons inter-sites et s'accordent sur un débit cible
- **THEN** le connecteur capture l'échange
- **AND** l'agent élicitation propose au Lead Architect un énoncé candidat formalisant ce consensus.

#### Scenario: Rappel proactif d'une décision antérieure lors d'un échange
- **GIVEN** les architectes discutant de la redondance d'alimentation sur le site sud
- **WHEN** un participant propose une solution mono-source
- **THEN** le système affiche immédiatement dans le fil : « *Rappel : La directive NIS2 et KH:ADR-0008 imposent une double adduction secourue sur tout site classé essentiel* »
- **AND** l'équipe réoriente instantanément la conception pour se conformer au standard.

#### Scenario: Acculturation pédagogique lors du dépouillement d'un RFP
- **GIVEN** l'import d'un nouveau cahier des charges client (RFP)
- **WHEN** l'équipe démarre la Phase 1 (Appropriation)
- **THEN** le workbench présente une synthèse pédagogique des 5 standards majeurs requis et des principes d'entreprise pré-activés.
