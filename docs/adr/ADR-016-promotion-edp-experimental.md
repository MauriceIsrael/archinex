# ADR-016 : Décision de Promotion du Sous-Système Expérimental EDP (Paquets de Décision Exécutables)

- **Statut** : Accepté (Promotion conditionnée vers phase pilote)
- **Date** : 2026-10-29
- **Auteur** : Comité d'Architecture Archinex (G3)
- **Contexte** : Évaluation finale de l'expérimentation EDP (Epic #166, Issues #167 à #189)

---

## 1. Contexte & Problématique

Jusqu'alors, les décisions d'architecture d'entreprise validées en jalon G3 étaient formulées sous forme documentaire et textuelle (ADR, spécifications). L'évaluation de leur respect sur les artefacts d'ingénierie détaillés (LLD, manifestes Kubernetes, configurations réseau) reposait sur des revues humaines sporadiques ou des assertions non vérifiables de modèles d'IA.

L'expérimentation EDP a exploré l'introduction de Paquets de Décision Exécutables encapsulant des oracles OPA/Rego v1 déterministes, couplés à une garde de mutation à 100 %, une chaîne de liaison à l'ontologie souveraine et l'interdiction constitutionnelle d'évaluation sans validation humaine habilitée (Invariant II).

---

## 2. Décision d'Architecture

Le Comité d'Architecture prononce le **GO pour la promotion** du sous-système EDP depuis la branche `experimental/edp` vers une intégration progressive dans le tronc commun, sous les conditions suivantes :

1. **Maintien du Feature Flag à l'Exécution** : Le drapeau d'environnement `ARCHINEX_EXPERIMENTAL_EDP=1` reste actif par défaut dans les environnements de production pour préserver l'étanchéité stricte des modules d'arbitrage existants.
2. **Pérennisation des Gardes Constitutionnelles** :
   - Invariant I (Vérité à 4 états : `compliant`, `violated`, `insufficient_input`, `not_applicable`).
   - Invariant II (Refus absolu du statut `validated` pour tout artefact LLM sans validateur humain identifié).
   - Invariant VI (Bascule automatique en `stale` lors de la caducité d'un antécédent).
   - Invariant X (Contrôle strict de pureté de l'intension sans adresses IP/MAC ni hostnames spécifiques).
3. **Outillage Déconnecté (Air-gap)** : La commande `edp verify` doit demeurer exécutable de manière 100 % autonome hors-ligne sans dépendance à des APIs externes.

---

## 3. Conséquences

### Positives :
- Comblement formel du fossé entre HLD et LLD avec émission de lots de preuves cryptographiques auditables.
- Résilience prouvée des oracles via la garde de mutation (zéro mutant survivant toléré).
- Réduction drastique du temps d'audit de conformité pour les intégrateurs tiers.

### Négatives & Mitigations :
- Dépendance technique envers le binaire OPA : mitigée par le téléchargement officiel épinglé v1.21.4 et le contrôle strict de son empreinte SHA-256 dans la CI.
- Nécessité de compétences d'écriture Rego pour les architectes de domaine : mitigée par la chaîne de rédaction assistée par LLM sous contrainte déterministe.
