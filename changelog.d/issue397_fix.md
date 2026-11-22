### Feuille de route réordonnée, gel des connecteurs directs et recadrage du positionnement (#397)
- **Documentation d'architecture (`ARCHITECTURE.md` §16)** :
  - Réécriture complète de la section §16 selon l'ordre de priorité : P0 sécurité/intégrité → épique « Décision éclairée » (#373) → réconciliation Nautobot (#372 : tranche minimale puis cadre des connecteurs) → cœur Archinex couverture & visuels (#400, en parallèle) → généralisation (#374) → extensions aval derrière Nautobot (gelées).
  - Formalisation de la politique de gel des connecteurs directs et des appels d'écriture directe vers les outils d'implémentation jusqu'à mise en production de la tranche minimale Nautobot sur un projet réel, avec renvoi au re-cadrage des issues #351–#358 (ADR-017 / #375).
  - Ajout de la gouvernance par **revue trimestrielle du périmètre** avec liste fermée « Dans le périmètre / Hors périmètre » et reclassement des anciens Horizons 1 à 3 (retrait des formulations de « preuve mathématique »).
- **Positionnement et promesses (`README.md`)** :
  - Clarification du positionnement comme **couche d'assurance de décision**, de l'hydratation comme **interface** avec garanties explicites sur la provenance (`défaut` / `catalogue` / `réel`), et de Nautobot comme unique point de réconciliation bidirectionnel.
  - Reformulation des promesses (« énoncés arbitrés et traçables », « traçabilité vérifiable », « une annotation n'est pas une preuve ») et alignement du diagramme de boucle fermée.
