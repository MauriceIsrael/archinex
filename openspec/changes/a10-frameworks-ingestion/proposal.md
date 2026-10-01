# Proposition d'Évolution : Référentiels Réglementaires (Lot A10 - Issue #5)

## 1. Contexte & Problématique
Dans le cadre de la conformité d'architecture souveraine, les projets doivent se conformer à des référentiels réglementaires stricts (ex: NIS2, ISO 27001, RGPD, SecNumCloud, DORA). Actuellement, la gestion de ces référentiels nécessite des manipulations manuelles ou des feuilles de calcul déconnectées du référentiel doctrinal central.

Le **Lot A10 (Issue #5)** vise à intégrer directement dans Archinex un cycle complet de gestion des référentiels :
1. **Téléversement Multi-Format** (`.pdf`, `.html`, `.txt`, `.md`, `.docx` jusqu'à 20 Mo) pour ingérer et découper automatiquement les référentiels en exigences granulaires.
2. **Revue Ligne par Ligne Interactive** avec propositions de liaisons doctrinales assistées par LLM local (marquées `llm-derived`, validées par Zod).
3. **Contrôle d'Habilitation Souverain** : seules les décisions émises par les experts possédant le domaine de l'exigence (`ownedDomains`) sont acceptées.
4. **Déclaration de Couverture Opposable** : scellement de la conformité via `POST /api/frameworks/{fw}/coverage-declaration` avec détection et blocage 409 Conflict si des exigences non traitées subsistent.

## 2. Portée de la Solution
- **Téléversement & Parsing** : Endpoint `POST /api/frameworks/ingestions` supportant les formats déclarés, avec validation de taille (< 20 Mo) et extraction des articles/sections en exigences unitaires.
- **Consultation & Navigation** : Route `/kb/frameworks` (liste des référentiels) et `/kb/frameworks/[id]` (revue interactive et détaillée des exigences).
- **Décisions d'Examen** : Acceptation, amendement (notes et liens KB) et rejet (avec motif obligatoire circonstancié).
- **Assistance Doctrinale Locale** : Endpoint `POST /api/frameworks/ingestions/[id]/requirements/[reqId]/suggest-links` pour suggérer des correspondances de principes ou contrôles.
- **Déclaration Formelle de Couverture** : Endpoint `POST /api/frameworks/[fw]/coverage-declaration` vérifiant l'exhaustivité de traitement et générant une attestation de couverture.

## 3. Conformité Constitutionnelle
- **Identité d'Acteur** : Transmission de `X-Actor-Email` sur toutes les actions d'examen et de déclaration.
- **Invariant II (Contrôle Humain)** : Les suggestions d'associations doctrinales par LLM sont validées par Zod, étiquetées `llm-derived` et ne font foi qu'après validation explicite de l'expert.
- **Zéro Rejet Non Motivé** : Rejet impossible sans justification textuelle.
- **Intégrité Opposable (409 Conflict)** : Déclaration de couverture impossible si une exigence reste en attente (`pending`).
