# Rapport de Spike Technique : Instanciation de Blueprints Logiques en Objets Nautobot 'Planned' (Design Builder)

> **Référence** : Issue #183 (Spike EDP)  
> **Auteur** : Lead Architect Archinex  
> **Date** : 29 octobre 2026  
> **Statut de Décision** : **NO-GO pour l'instanciation live à chaud au stade HLD** / **GO pour l'export découplé et fixtures enregistrées (Mode Air-Gap)**

---

## 1. Contexte & Objectif du Spike

Le projet EDP vise à confronter les décisions d'architecture haut niveau (HLD) à des topologies LLD simulées via le statut `status: planned` dans l'outil d'inventaire et DCIM Nautobot.
Ce spike évalue la faisabilité d'instancier automatiquement un Blueprint logique abstrait (issu d'une décision Archinex) en objets concrets dans Nautobot via l'extension **Design Builder** (Network to Code), avant d'engager tout développement lourd d'orchestration bidirectionnelle.

---

## 2. Évaluation des Questions Critères

### Q1. Rejouer un design est-il idempotent ?
- **Constat** : **Partiellement**.
- **Analyse** : L'exécution répétée d'un même job Design Builder recrée ou réinitialise les relations entre équipements et interfaces si les identifiants uniques (*slugs* ou clés métier) ne sont pas strictement verrouillés. En l'absence d'un verrou d'état externe (*state lock* de type Terraform/OpenTofu), un rejeu avec des légères variations de paramètres crée des doublons d'interfaces ou des collisions de noms d'équipements (`IntegrityError: duplicate key value`).

### Q2. Le décommissionnement défait-il tout proprement ?
- **Constat** : **Non (présence d'orphelins)**.
- **Analyse** : Les objets de premier ordre (`Device`) créés par le Blueprint peuvent être supprimés en cascade, mais les objets d'infrastructure transverses (pools de préfixes IP, tags, types de câblage et groupes de VLANs) restent alloués. La suppression d'un Blueprint laisse des résidus nécessitant un ramasse-miettes manuel.

### Q3. L'allocation automatique de préfixes / adresses IP par Nautobot est-elle utilisable au stade HLD ?
- **Constat** : **Inadaptée au stade HLD**.
- **Analyse** : Au stade HLD, l'adressage IP réel n'est pas encore défini et ne doit en aucun cas être fixé (violation de la pureté de l'intension, Invariant I et Issue #169). Forcer Nautobot à allouer des plages IP concrètes pollue le plan d'adressage IPAM d'entreprise pour des architectures qui peuvent encore être rejetées ou profondément révisées lors des arbitrages G3.

### Q4. Quelles versions de Nautobot et de Design Builder sont compatibles ?
- **Constat** :
  - Nautobot v2.2+ requiert `nautobot-design-builder` $\ge 2.0.0$.
  - Des ruptures d'API GraphQL et de modèles relationnels (notamment la gestion des statuts via des modèles relationnels plutôt que des enums statiques) rendent la maintenance d'un connecteur bidirectionnel très coûteuse entre versions mineures.

### Q5. Les statuts `planned` se comportent-ils comme attendu par les oracles Rego ?
- **Constat** : **Oui**.
- **Analyse** : Les objets marqués avec `status: "planned"` sont correctement isolés des flux de télémétrie de production et apparaissent fidèlement dans les requêtes GraphQL filtrées (`devices(status: "planned")`). Côté oracle OPA, ce filtrage est parfaitement exploitable.

### Q6. Quel est le coût d'exploitation de la pile ?
- **Constat** : **Disproportionné pour la phase HLD**.
- **Analyse** : Maintenir une instance live Nautobot avec PostgreSQL, Redis, Celery workers et Nautobot Design Builder pour chaque atelier d'architecture ou environnement de test CI alourdit considérablement l'infrastructure de développement (empreinte mémoire > 4 Go, temps de démarrage > 90s).

---

## 3. Décision Finale & Recommandation Architecturale

### **Décision : NO-GO pour l'instanciation live à chaud / GO pour les Mocks & Exports Découplés**

1. **Abandon de l'instanciation à chaud dans un Nautobot live depuis Archinex** :
   - L'architecture ne doit pas dépendre d'une connexion réseau active vers un orchestrateur Nautobot pour délibérer ou valider une décision.
   - Le couplage direct violerait le principe d'autonomie hors-ligne (*air-gap* et mode avion) d'Archinex.

2. **Consécration du modèle découplé par Adaptateurs & Fixtures (#179)** :
   - Les intégrateurs réseau qui disposent d'un Nautobot exécutent le script d'export GraphQL hors-bande (`nautobot-export.ts`) pour générer le payload `nautobot_planned_devices`.
   - Archinex et `edp verify` consomment ce fichier localement avec provenance certifiée SHA-256 sans aucune dépendance réseau.
   - Les tests unitaires et la CI s'appuient à 100 % sur les fixtures validées et la garde de mutation.
