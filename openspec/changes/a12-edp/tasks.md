# Tâches d'Implémentation : Paquet de Décision Exécutable (EDP) (Lot A12 - Expérimental)

## Palier 1 : Spécifications, Schémas & Invariants (Fondations)
- [x] 1. Cadrage OpenSpec & Invariants (#167)
  - [x] 1.1 Créer `openspec/changes/a12-edp/` (.openspec.yaml, proposal.md, design.md, tasks.md)
  - [x] 1.2 Citer et documenter les impacts des Invariants I, II, III, IV, V, VI, VII et X
  - [x] 1.3 Fixer le vocabulaire du verdict (`compliant | violated | not_applicable | insufficient_input`)
  - [x] 1.4 Documenter le cadre expérimental (`ARCHINEX_EXPERIMENTAL_EDP=1` et branche `experimental/edp`)
- [ ] 2. JSON Schema du Paquet de Décision Exécutable + Fixtures (#168)
  - [ ] 2.1 Créer `src/lib/schemas/edp.schema.json`
  - [ ] 2.2 Créer au moins 2 fixtures valides (dont ADR-012) et 8 fixtures invalides
  - [ ] 2.3 Écrire les tests paramétrés de validation de schéma
- [ ] 3. Contrôle de Pureté de l'Intension (#169)
  - [ ] 3.1 Créer `src/lib/domain/edp/intentionPurity.ts` (détection IPv4, IPv6, CIDR, MAC, hostname pointé)
  - [ ] 3.2 Implémenter la liste blanche d'exceptions (versions, 3GPP, 5QI, exemples balisés)
  - [ ] 3.3 Écrire les tests unitaires purs (zéro faux positif)
- [ ] 4. Contrat d'Entrée de Raffinement (`refined_input`) (#170)
  - [ ] 4.1 Créer `src/lib/schemas/refined_input.schema.json` avec métadonnées de provenance
  - [ ] 4.2 Créer le validateur de complétude `src/lib/domain/edp/validateRefinedInput.ts`
  - [ ] 4.3 Écrire les tests de contrat (refus des entrées incomplètes, vides ou non déclarées)

## Palier 2 : Moteur OPA, Bibliothèque Rego & EDP Référence
- [ ] 5. Exécuteur OPA déterministe (#171)
  - [ ] 5.1 Créer `src/lib/server/edp/opaRunner.ts` (timeout, typage strict, gestion d'indisponibilité)
  - [ ] 5.2 Créer le script de téléchargement et vérification SHA-256 d'OPA pour la CI
  - [ ] 5.3 Tests de contrat avec faux binaire et binaire absent (`unavailable`, jamais `pass`)
- [ ] 6. Bibliothèque Rego commune & convention de verdict à 4 états (#175)
  - [ ] 6.1 Créer `policies/lib/edp_common.rego` (`host_of`, `missing_inputs`, statut standard)
  - [ ] 6.2 Écrire la suite de tests OPA unitaires
- [ ] 7. EDP de référence ADR-012 (substrat bare-metal) (#180)
  - [ ] 7.1 Intégrer le paquet `edp/examples/adr012-baremetal/`
  - [ ] 7.2 Corriger l'hôte BMC, la détection des champs absents et isoler l'ontologie
  - [ ] 7.3 Fournir le mock conforme et les mocks à défaut unique par règle
- [ ] 8. Garde de mutation (#176)
  - [ ] 8.1 Créer le script `scripts/edp-mutation-gate.ts`
  - [ ] 8.2 Valider le score de mutation 6/6 sur l'EDP ADR-012
- [ ] 9. Contrat des fixtures (#172)
  - [ ] 9.1 Créer le validateur de fixtures (1 pass, 1 fail par règle, adresses de doc RFC 5737/3849)
  - [ ] 9.2 Remplacer les adresses privées du PoC ADR-012 par les plages réservées

## Palier 3 : Ontologie & Persistance
- [ ] 10. Client d'ontologie & contrôle des liaisons (#173)
  - [ ] 10.1 Créer le client de lecture d'ontologie (mode fixture hors ligne + API)
  - [ ] 10.2 Vérifier la présence des URNs et la révision (`stale_binding` si décalage)
- [ ] 11. Compilateur de projections (#181)
  - [ ] 11.1 Compiler l'ontologie vers des données OPA (`data.ontology`) avec hash SHA-256
  - [ ] 11.2 Détecter les littéraux dupliqués
- [ ] 12. Persistance des EDP & Invariant II (#174)
  - [ ] 12.1 Ajouter le modèle Prisma `ExecutableDecisionPackage`
  - [ ] 12.2 Imposer l'interdiction `verified × llm-derived` sans validateur humain habilité
- [ ] 13. Rétractation automatique (#177)
  - [ ] 13.1 Basculer l'EDP à `stale` dès qu'un antécédent devient caduc (Invariant VI)

## Palier 4 : Vérification, Adaptateurs & CI Gate
- [ ] 14. Commande et service `edp verify` (#182)
  - [ ] 14.1 Exécuter l'oracle sur une entrée fournie et sceller le lot de preuves
- [ ] 15. Adaptateur Sylva / CAPI (#178)
  - [ ] 15.1 Rendu Helm vers `k8s_manifests` (fixtures hors ligne)
- [ ] 16. Adaptateur Nautobot (#179)
  - [ ] 16.1 Export GraphQL `status: planned` vers `nautobot_planned_devices`
- [ ] 17. Spike instanciation Blueprint vers Nautobot Planned (#183)
  - [ ] 17.1 Rédiger le rapport de faisabilité et d'architecture go/no-go
- [ ] 18. Garde d'architecture CI `edp-gate` (#185)
  - [ ] 18.1 Créer le script d'orchestration de vérification pour la CI

## Palier 5 : Rédaction Assistée, IHM & Évaluation Finale
- [ ] 19. Rédaction assistée par LLM d'un EDP (#184)
  - [ ] 19.1 Chaîne d'acceptation déterministe avec passage obligatoire par la Porte G3
- [ ] 20. Fiche EDP dans l'IHM Workbench (#186)
  - [ ] 20.1 Composant UI dédié sur la décision (statut, verdict, mutations, validation)
- [ ] 21. Second EDP de référence (Zoning de Sécurité) (#187)
  - [ ] 21.1 Implémenter l'EDP d'isolation de zones de sécurité (test de généralité)
- [ ] 22. Guide intégrateur (#188)
  - [ ] 22.1 Rédiger la documentation d'exécution d'EDP hors ligne
- [ ] 23. Plan d'évaluation & décision de promotion (#189)
  - [ ] 23.1 Rédiger le rapport d'évaluation globale et la recommandation de promotion

