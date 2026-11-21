### ADR-017 : Nautobot, point unique de réconciliation bidirectionnelle (#375)
- **Documentation (`docs/adr/ADR-017-nautobot-point-unique-reconciliation.md`, `ARCHITECTURE.md` §12, §13, §15, §16)** :
  - Nouvel ADR (statut : proposé) : règles de décision, tranche minimale et types d'écart, liste fermée hors périmètre, sécurité, répartition des responsabilités, emplacement des oracles, dégradation si Nautobot est indisponible.
  - Tableau « outil → alimentation depuis Nautobot → code » et classement des composants existants (adaptateurs non câblés, export GitOps direct, jumeau numérique, registre d'état IMP V2) ; sort des issues #351 à #358 ; questions ouvertes pour les mainteneurs.
  - Renvois vers l'ADR depuis `ARCHITECTURE.md`.
