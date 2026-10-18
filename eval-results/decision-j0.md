# Fiche de Décision — Jalon J0 (Audit des Exigences ArcKit)

RFP : `examples/lumicc-noc/rfp-section4-noc.md` (92 clauses)
Modèle : `claude-sonnet-5-5` (Anthropic Claude Messages API, adaptive thinking)
Date : `2026-10-18`
Critères fixés le `2026-10-18` (avant la mesure), dans le commit `bdc3e4d`

---

## Résultats de la Mesure Double-Passe

| Métrique | Critère fixé avant mesure | Passe 1 (`rapport-1.md`) | Passe 2 (`rapport-2.md`) | Verdict |
|---|:---:|:---:|:---:|:---:|
| **Faux négatifs dangereux** (clause de référence évacuée) | **0**, non négociable | **1** (`REQ-Lot1-216`) | **1** (`REQ-Lot1-216`) | ❌ **ÉCHEC** |
| **Rappel « à délibérer »** | $\ge 80\%$ | **87 %** | **89 %** | ✅ **ATTEINT** |
| **Part « à qualifier »** | $\le 30\%$ | **0 %** (0/92) | **0 %** (0/92) | ✅ **ATTEINT** |
| **Angles ratés retrouvés** (Liste B humaine) | $\ge 3$ | **4 / 4** | **4 / 4** | ✅ **ATTEINT** |
| **Bruit parmi les sujets et questions** | $< 50\%$ | **< 15 %** (12 sujets pertinents) | **< 15 %** (12 sujets pertinents) | ✅ **ATTEINT** |
| **Écart entre les deux passes** | Faible dérive | 77 délib. / 6 évac. / 9 clarif. | 75 délib. / 6 évac. / 11 clarif. | ✅ **STABLE** (2 clauses $\Delta$) |

---

## Analyse des Écarts et des Angles Ratés

### 1. Analyse du Faux Négatif Dangereux (`REQ-Lot1-216`)
- **Texte de la clause** : `REQ-Lot1-216 : Automated Incident creation (C) 50`
- **Motif d'évacuation par le modèle** : Le modèle a classé la création automatique d'incidents ITSM comme une fonction standard COTS d'outillage Helpdesk.
- **Pourquoi le juge indépendant l'avait retenue** : Dans un réseau de sécurité publique régalien (PPDR), l'automatisation de la création et de l'assignation d'incidents est en tension directe avec le degré d'intervention humaine dans la boucle de remédiation (`HP-03-AUTOMATION-SMO`).
- **Action requise** : Ajouter un mot-clé ou renforcer la consigne de classification dans ArcKit pour requalifier les clauses d'automatisation d'incidents en `to_qualify` ou `deliberated`.

### 2. Vérification de la Liste B (Angles ratés à l'époque)
1. **B-01 (Surcoût adaptateurs EMS propriétaires)** : Retrouvé dans `SUBJ-03` et `SUBJ-04` (options YANG vs EMS).
2. **B-02 (Perte visibilité MNO en cas de coupure IPsec)** : Retrouvé dans `SUBJ-05` (supervision RAN partagé).
3. **B-03 (Conflit opérationnel sur auto-remédiation non supervisée)** : Retrouvé dans `SUBJ-08` (boucle fermée vs approbation humaine).
4. **B-04 (Retard aménagement et HVAC salle de repli NOC)** : Retrouvé dans `SUBJ-01` (exigences d'autonomie > 72h et secours).

---

## Décision

**Décision : CORRIGER puis rejouer**

**Motif en trois lignes :**
1. Le pipeline démontre une forte valeur ajoutée en capturant l'ensemble des 4 angles ratés de la Liste B avec un rappel élevé (87-89 %) et une reproductibilité remarquable (12 sujets convergents sur les deux passes).
2. L'intégrité stricte (0 faux négatif dangereux) n'est cependant pas satisfaite en raison de l'évacuation de `REQ-Lot1-216` (création automatique d'incidents assimilée à tort à de la commodité ITSM).
3. Conformément aux règles méthodologiques du Jalon J0, la consigne de classification doit être renforcée avant de rejouer la mesure pour accorder le GO définitif.

