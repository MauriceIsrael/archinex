# Plan d'Évaluation de l'Expérience : Paquets de Décision Exécutables (EDP)

Ce document fige les critères d'évaluation objectifs et mesurables pour décider de la promotion ou de l'abandon du thème expérimental EDP (Lot A12, Issue #189).

---

## 1. Critères d'Évaluation Définis (C1 à C5)

| Identifiant | Intitulé du Critère | Métrique Cible | Méthode de Mesure |
| :--- | :--- | :--- | :--- |
| **C1** | **Diversité & Couverture des Domaines** | Au moins 2 EDP de domaines distincts validés avec score de mutation de 100 %. | Exécution de `scripts/edp-mutation-gate.ts` sur `adr012-baremetal` (infrastructure physique) et `adr015-security-zones` (sécurité réseau NIS2). |
| **C2** | **Détection de Défauts & Anti-Vacuité** | 100 % des défauts injectés détectés (dont omission de champ et violation de contrainte). | Évaluation des mocks Red/Green de chaque EDP via `verifyEdp()`, vérification du rejet des mutants. |
| **C3** | **Acceptation au Premier Essai par LLM** | Journalisation et mesure du taux d'acceptation par la chaîne déterministe. | Exécution de `validateAndAcceptEdpDraft()` sur un banc de propositions d'EDP et mesure des échecs par étape. |
| **C4** | **Autonomie des Intégrateurs Hors Ligne** | Obtention d'un lot de preuves scellé sans réseau en moins de 15 minutes. | Guide intégrateur documenté (`docs/edp/integrator-guide.md`) et validation d'exécution autonome avec binaire OPA local. |
| **C5** | **Rétractation Automatique & Vérité** | Bascule immédiate à l'état `stale` lors d'un changement d'antécédent ou d'ontologie. | Test unitaire de cascade de rétractation `retractEdpOnAntecedentChange()` (Invariant VI). |

---

## 2. Règle Constitutionnelle de Promotion
La promotion vers la branche principale (`main`) ne pourra être décidée que si les 5 critères C1 à C5 sont satisfaits et formalisés dans un ADR de promotion (`ADR-016`).
