# Spécification : Le Moteur de Rétractation (`retractation-engine`)

## ADDED Requirements

### Requirement: Traçabilité des Antécédents et des Règles
Le système SHALL enregistrer pour chaque énoncé dérivé la liste exhaustive de ses antécédents directs (`based_on : [S-xxxx, KH:ADR-xxxx]`) ainsi que l'identifiant de la règle formelle ayant permis son inférence (`applied_rule`).

### Requirement: Invalidation de Clôture Logique (Truth Maintenance)
Le système SHALL implémenter un mécanisme déterministe de maintenance de vérité :
- Dès qu'un énoncé antécédent $S_{source}$ est contesté, arbitré défavorablement ou supprimé ($S_{source} \bot$) :
  1. Le système identifie l'ensemble de la fermeture transitive des énoncés dérivés $S_{dérivés}$.
  2. Chaque énoncé dérivé perd sa justification formelle et est immédiatement rétrogradé au statut épistémique **`assumed`**.
  3. Si la maturité d'un sujet (ex: `L3_decided`) reposait sur la preuve de ces énoncés, le sujet est rétrogradé vers son niveau antérieur (ex: `L2_decomposed` ou `L1_framed`).
  4. La mention `provisoire` (`is_provisional: true`) est réactivée sur la section associée.

### Requirement: Signalement Visuel Immédiat
Le système SHALL répercuter instantanément toute rétractation sur l'interface :
- Notification d'alerte indiquant l'effet domino de la modification.
- Actualisation en temps réel de la ligne concernée sur le Board de maturité (baisse de niveau, apparition de nouveaux bloquants).
- Réapparition de l'hypothèse en ligne `supposé` dans le brouillon-appât.

---

## Scenarios

#### Scenario: Rétrogradation en cascade après suppression d'un antécédent
- **GIVEN** l'énoncé `S-0042` (`confidence: designed`) dépendant de l'antécédent `S-0031`
- **WHEN** l'architecte infirme ou supprime `S-0031`
- **THEN** le système rétrograde automatiquement `S-0042` au statut `assumed`
- **AND** le sujet `Synchronisation` retombe de `L3_decided` à `L2_decomposed`.

#### Scenario: Réactivation de la bannière provisoire
- **GIVEN** une section HLD dont tous les sujets étaient mûrs
- **WHEN** un antécédent clé d'infrastructure est contesté
- **THEN** la section réaffiche immédiatement le badge `Provisoire`
- **AND** toute tentative de gel ou d'export officiel pour cette section est bloquée.
