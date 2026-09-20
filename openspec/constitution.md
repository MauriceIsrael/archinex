# Constitution d'Archinex : Les Invariants de la Délibération

Cette constitution définit les principes cardinaux, non négociables et vérifiables qui gouvernent le développement et le comportement du système **Archinex** (Workbench UI d'Architecture Système et de Convergence Homme-Agents).

---

## Invariant I : L'Énoncé est l'Atome Unique (Les 5 Facettes)

Tout objet manipulé, mémorisé ou affiché par Archinex est un **Énoncé** (*Statement*). Un énoncé n'est valide et réutilisable que s'il porte ses 5 facettes :
1. **Contenu** : Un triplet contraint `sujet · prédicat en liste blanche · valeur` (ex: `site-mcx-nord · has_property · holdover ≥ 30 j`).
2. **Justification** : Sa provenance explicite (`ANSWERS Q-xxxx`, `BASED_ON KH:ADR-xxxx@vVersion`, `RULE xxxx`).
3. **Autorité** : Son auteur, son rôle et son mode de production (`human-authored`, `llm-proposed-human-approved`, `llm-derived`).
4. **Maturité** : Le palier du sujet (`L0_named` à `L4_specified`) et son statut épistémique (`verified`, `designed`, `vendor-stated`, `stated-by-client`, `assumed`).
5. **Révisabilité** : La liste de ses antécédents et ce qui s'effondre avec lui si l'un d'eux est invalidé.

---

## Invariant II : Interdiction Absolue `verified × llm-derived`

Les deux axes épistémiques (Statut et Mode de production) sont orthogonaux, avec une interdiction formelle et bloquante :
- Un énoncé dérivé par un LLM sans relecture humaine (`llm-derived`) **ne peut en aucun cas** porter le statut `verified`.
- Tout énoncé prétendant au statut `verified` exige formellement une preuve locale ou un audit validé par un humain habilité (`validator` identifié avec rôle et horodatage).
- L'interface et l'API rejettent toute tentative d'affichage ou d'enregistrement violant cette règle.

---

## Invariant III : Le Silence n'est Jamais une Approbation (Règle du Capteur)

Le brouillon produit en permanence n'est pas un livrable, mais un **capteur**.
- **Correction ou Contestation explicite** : L'architecte corrige ou conteste $\rightarrow$ Un énoncé attribué `human-authored` entre dans le graphe, portant le diff et l'antécédent rectifié.
- **Absence de réaction (Silence)** : L'architecte lit et passe à autre chose $\rightarrow$ **Rien n'entre dans le graphe**. Le manque et l'incertitude restent ouverts.
- Aucun agent ne peut déduire d'une absence d'objection qu'une hypothèse est validée.

---

## Invariant IV : Le Brouillon est un Appât Percutant, Pas un Texte Lisse

Un texte bien écrit et fluide endort la vigilance : l'expert hoche la tête et les manques critiques restent invisibles.
- Le brouillon généré doit être **manifestement un brouillon** : style télégraphique, références de patterns (`KH:ADR-...`), conséquences chaînées jusqu'au coût chiffré en k€ ou en ressources.
- Il doit être un **appât percutant** :
  1. **Poser des questions précises** sur les zones d'ombre.
  2. **Proposer des alternatives divergentes et documentées** (ex: *Variante A* vs *Variante B* dégradée mais moins coûteuse).
  3. **Parler strictement dans le langage technique précis de l'expert du domaine** (normes exactes, acronymes techniques, métriques MTIE, tolérances).
- Aucune phrase complète ni tournure diplomatique de complaisance (« il est recommandé », « une attention particulière sera portée ») n'est autorisée.

---

## Invariant V : Deux Portes Humaines Uniques et Infranchissables

Le système multi-agents avance seul sur l'extraction, la détection de manques et la proposition de brouillons, mais il s'arrête strictement devant deux portes réservées aux architectes humains :
1. **L'approbation d'une règle candidate** (Tour 8 du dialogue) : Transformer une régularité observée en règle pérenne du graphe de doctrine (qui s'appliquera à tous les dossiers futurs).
2. **L'arbitrage d'une contradiction** (Tour 11 du dialogue) : Résoudre un conflit entre une contrainte locale et une décision antérieure (`ADR superseded`, motif consigné, auteur engagé).

---

## Invariant VI : Rétractation par Défaut (Maintenance de Vérité)

La base de connaissances ne doit jamais vieillir silencieusement.
- Lorsqu'un antécédent devient caduc, contesté ou invalidé ($S_1 \bot$), la clôture logique est rompue.
- Tous les énoncés dérivés ($S_2$) sont immédiatement rétrogradés au statut `assumed`.
- Le Board de maturité et le HLD reflètent instantanément cette réouverture du sujet.

---

## Invariant VII : Rôles Formels et Souveraineté du Lead Architect

Pour préserver la rigueur et l'auditabilité :
- Aucun nom de personne physique n'est codé en dur : le système manipule des **Rôles**.
- Le **Lead Architect** est le modérateur final : il détient seul l'autorité d'arbitrage final sur les conflits structurants, valide le passage des jalons de maturité majeurs et signe le gel d'homologation des sections.
- Les **Domain Expert Architects** (Réseau, Sécu NIS2, Cloud, etc.) instruisent les questions spécialisées et contestent les appâts sur leur périmètre.
