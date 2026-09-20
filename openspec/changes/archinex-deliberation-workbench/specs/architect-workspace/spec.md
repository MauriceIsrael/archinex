# Spécification : Le Poste de Travail de l'Architecte (`architect-workspace`)

## ADDED Requirements

### Requirement: L'Espace de Travail Unifié en 3 Zones
Le système SHALL organiser l'environnement opérationnel quotidien de l'architecte selon trois zones complémentaires, épurées de toute complexité sémantique brute (zéro affichage de code SPARQL ou de graphe RDF textuel) :
1. **Le Canal de Délibération (Discord / Chat intégré)** : Espace d'échange naturel entre pairs et avec les agents spécialisés, doté de commandes rapides (`/why`, `/gaps`, `/regenerate`) et de cartes d'action interactives (`[Valider]`, `[Rejeter]`).
2. **Le Document Vivant (HLD Télégraphique Collaboratif)** : Espace d'atterrissage éditable en place, affichant les lignes `retenu`, `supposé`, `conflit`, `manque`, les variantes A/B, les coûts chiffrés et le rendu visuel instantané (Mermaid inline).
3. **La Tour de Contrôle & Hub d'Artefacts (Dashboard Archinex)** : Vue d'orientation affichant le Board classé par `unlocks`, la jauge des gaps de maturité, et le centre de régénération des artefacts tiers.

### Requirement: Les 4 Services de SmartMemory pour l'Architecte
Le système SHALL intégrer SmartMemory comme un exocortex d'architecture invisible et bienveillant, offrant à l'architecte :
1. **L'Induction de Règles en Direct (Tour 8)** : Détection en arrière-plan des régularités de décision lors des discussions et proposition de formalisation en règle d'entreprise générale en 1 clic.
2. **L'Inspecteur de Justification (« Pourquoi ? »)** : Clic sur n'importe quel élément du document ou d'un schéma pour afficher instantanément sa généalogie complète (exigence cliente d'origine, décision transverse associée, validateur humain, horodatage).
3. **Le Simulateur d'Impact Prédictif** : Capacité pour l'architecte de simuler la modification ou la suppression d'un énoncé avant validation, avec restitution en quelques secondes de la liste des conteneurs, exigences ou niveaux de maturité qui s'effondrent.
4. **La Réduction d'Ambiguïté (Human-in-the-Loop)** : Formulation automatique de questions de clarification précises lorsque les hypothèses d'un agent manquent de fondement logique.

### Requirement: Génération & Régénération Déterministe d'Artefacts (Architecture-as-Data)
Le système SHALL garantir que tous les schémas d'architecture et fichiers de configuration techniques découlent strictement des énoncés prouvés du graphe (Single Source of Truth) :
1. **Schémas d'Architecture Régénérables** :
   - Rendu Mermaid inline dans le document pour le feedback immédiat.
   - Export Structurizr DSL (`.dsl`) / LikeC4 pour la navigation dynamique C4 (Contexte $\rightarrow$ Conteneurs $\rightarrow$ Composants).
   - Export SysML v2 / SysON pour l'ingénierie système critique.
2. **Fichiers de Configuration Interprétables** :
   - Profils réseau standardisés (ex: profils JSON/XML de synchronisation PTP G.8275.1).
   - Squelettes d'Infrastructure as Code (Terraform/OpenTofu HCL, Helm, Kubernetes).
3. **Contrat de Régénération sans Dérive (*No Doc Drift*)** :
   - Toute modification d'un énoncé acté répercute instantanément la mise à jour des schémas et des fichiers de configuration via une action unifiée `sync-artifacts`.
   - Affichage d'un diff visuel d'impact avant écrasement des fichiers de configuration.

### Requirement: Mode « Focus Sujet » Décloisonné
Le système SHALL permettre à l'architecte d'isoler son attention en un clic sur un sujet du Board :
- L'éditeur HLD zoome et met en surbrillance la section concernée.
- Le salon de délibération ouvre ou bascule sur le fil de discussion (thread Discord) dédié au sujet.
- SmartMemory filtre ses suggestions et règles pour n'afficher que celles pertinentes au domaine du sujet.

---

## Scenarios

#### Scenario: Régénération synchronisée d'un schéma C4 et d'un fichier de configuration
- **GIVEN** un énoncé d'architecture modifiant le nombre de serveurs d'horloge de 1 à 2 sur le site Nord
- **WHEN** l'architecte valide la modification et déclenche l'action `sync-artifacts`
- **THEN** le diagramme Mermaid du HLD est recalculé avec les 2 serveurs
- **AND** le fichier `model.dsl` de Structurizr ajoute le second conteneur dans le conteneur Datacenter
- **AND** le fichier de configuration JSON PTP intègre les deux adresses IP GrandMaster sans divergence manuelle.

#### Scenario: Interrogation instantanée de justification (« Pourquoi ? »)
- **GIVEN** une ligne du HLD spécifiant une liaison chiffrée IPsec MACsec
- **WHEN** l'architecte clique sur le bouton « Pourquoi ? »
- **THEN** le panneau SmartMemory affiche : « Découlant de l'exigence client Q-0012, imposé par la doctrine transverse KH:ADR-0005@v2.0 (conformité NIS2), validé par le Lead Architect le 15/09/2026 ».

#### Scenario: Simulation d'impact avant modification d'une hypothèse
- **GIVEN** l'hypothèse `holdover ≥ 30 j` sur le site Nord
- **WHEN** l'architecte teste une alternative `holdover = 24 h` dans le simulateur d'impact
- **THEN** SmartMemory alerte : « Invalide l'ADR-0014, rétrograde le sujet Synchronisation à L1_framed et fait chuter la disponibilité annuelle sous les 99.999% »
- **AND** l'architecte dispose des éléments chiffrés pour arbitrer en connaissance de cause.

#### Scenario: Carte d'action interactive dans Discord
- **GIVEN** une discussion technique aboutie sur le salon Discord du projet
- **WHEN** l'agent détecte un consensus sur le protocole PTP G.8275.1
- **THEN** le bot poste une carte interactive contenant le triplet extrait et deux boutons : `[Valider l'Énoncé]` et `[Rejeter]`
- **AND** le clic du Lead Architect sur `[Valider]` inscrit directement l'énoncé attribué dans le graphe Archinex.
