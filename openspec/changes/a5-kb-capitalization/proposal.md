# Proposition A5 — Capitalisation vers la Base de Connaissances (Porte G4)

## Contexte
Après l'arbitrage opposable d'un sujet d'architecture (Porte G3, Lot A4), les décisions prises doivent enrichir le patrimoine commun de l'organisation sans polluer la doctrine existante ni exfiltrer de données sensibles. Archinex ne stocke aucune règle de doctrine : c'est le Knowledge Hub LLMOps qui héberge et arbitre les candidats de doctrine.

## Objectifs
1. **Génération pure des candidats (`buildKbCandidates`)** :
   - `new_asset` (pattern) si l'option retenue n'a pas d'antécédent doctrinal (`kbRefs` vide).
   - `amendment` (dérogation/exception) pour chaque violation acceptée avec justification.
   - `rex` (retour d'expérience) systématique résumant le dilemme, les options écartées et le compromis.
2. **Anonymisation stricte avant soumission** :
   - Suppression systématique du nom du projet, du client, des sites, des participants, des adresses IP (IPv4 & IPv6) et des volumes/disques chiffrés.
3. **Revue et modification humaine préalable (Invariant III & feedback utilisateur)** :
   - L'architecte peut prévisualiser, éditer et valider chaque candidat avant tout envoi vers LLMOps.
   - Rien n'est envoyé de manière autonome par un agent ou un automate.
4. **Suivi d'état des candidats** :
   - Affichage des statuts retournés par LLMOps (`in_review`, `accepted`, `rejected` avec motif) dans la fiche de décision.
5. **Dépréciation du flux legacy `harvestSubjectToKnowledgeBase`** :
   - Remplacement par le flux formalisé de capitalisation G4.
6. **Cas de test e2e IT cloud platform (Porte G4)** :
   - Validation de la chaîne complète sur un cas d'architecture IT pur sans biais fournisseur.
