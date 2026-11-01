# Conception Détaillée : Paquet de Décision Exécutable (EDP) (Lot A12 - Expérimental)

## 1. Vue d'Ensemble des Composants

L'architecture EDP s'articule autour de quatre couches fondamentales :

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Niveau HLD : Intension Pure                     │
│  - Décision d'architecture (Porte G3)                                  │
│  - Contexte sémantique & Liaisons ontologiques (URNs LLMOps)           │
│  - Contrôle de pureté (Zéro IP / MAC / Hostname pointé)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Paquet EDP & Oracle Rego / OPA                     │
│  - edp.schema.json (Contrat formel de l'EDP)                           │
│  - policies/lib/edp_common.rego (Bibliothèque standard à 4 verdicts)  │
│  - Auto-tests unitaires & Fixtures Red/Green (Adresses RFC réservées)  │
│  - Garde de mutation (edp-mutation-gate.ts)                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Niveau LLD / Raffinement : Extension                 │
│  - refined_input.schema.json (Données d'extension + Provenance)        │
│  - Adaptateurs : Sylva / CAPI (Helm) & Nautobot (Objets Planned)       │
│  - Détection anti-vacuité (insufficient_input si données manquantes)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Vérification & CI/CD Gate                         │
│  - opaRunner.ts (Exécuteur sécurisé et déterministe)                   │
│  - Commande 'edp verify' & Rapport de preuves scellé                   │
│  - Script CI 'edp-gate'                                                │
│  - Visualisation IHM Workbench & Maintenance de vérité (Invariant VI)  │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Modèle de Données & Schémas JSON

### 2.1 Schéma EDP (`src/lib/schemas/edp.schema.json`)
Le schéma structure l'EDP en 5 blocs indispensables :
- `metadata` : Identifiant unique, titre, statut (`draft`, `proposed`, `validated`, `stale`, `retracted`), révision, et référence vers la décision délibérative (`subjectId`, `decisionId`, `version`).
- `decision_context` : Problème résolu, décision retenue, compromis (*trade-offs*), et liaisons ontologiques (`ontology_bindings` avec URN et révision).
- `refinement_contract` : Déclaration des sources d'entrées attendues (`expected_inputs` : nom de la source, chemin facultatif, version de schéma requise).
- `verification_oracle` : Moteur (`opa`), point d'entrée Rego (`data.<namespace>.status`), fichiers de politique (avec nom, hash SHA-256 et contenu), suite d'auto-test et manifeste des mutants ciblés.
- `provenance` : Mode de production (`human-authored`, `llm-proposed-human-approved`, `llm-derived`), date de création, et validateur humain (`id`, `role`, `timestamp`) obligatoire pour tout passage au statut `validated`.

### 2.2 Schéma d'Entrée de Raffinement (`src/lib/schemas/refined_input.schema.json`)
Définit la forme des données injectées dans l'oracle lors de la vérification :
- `sources` : Map des sources déclarées, contenant chacune :
  - `provenance` : Métadonnées d'audit (`tool`, `version`, `command`, `sha256`, `generated_at`).
  - `content` : Données structurées (manifestes, topologie d'équipements planifiés).
- Tout flux sans provenance ou omettant une source attendue provoque le verdict `insufficient_input`.

## 3. Contrôle de Pureté de l'Intension (`src/lib/domain/edp/intentionPurity.ts`)

Pour garantir l'étanchéité HLD / LLD :
- Analyse lexicale et regex du texte dans `decision_context`.
- Détection des adresses IPv4, IPv6, des préfixes CIDR, des adresses MAC et des noms d'hôtes pleinement qualifiés / pointés.
- Liste blanche d'exceptions autorisées :
  - Numéros de versions logicielles (ex. `RKE2 1.28`, `5.5`).
  - Références de standards et spécifications (ex. `3GPP TS 23.501`, `RFC 5737`).
  - Indicateurs techniques usuels (ex. `5QI 128-254`, `VLAN 100`, `MTU 1500`).
  - Exemples syntaxiques balisés (ex. `<IP>`, `${NODE_IP}`).
- Fonction pure, sans I/O ni dépendance externe.

## 4. Oracles OPA & Bibliothèque Commune Rego (`policies/lib/edp_common.rego`)

Convention standard de statut de conformité :
```rego
package archinex.edp.common

# Extraction sûre de l'hôte (évite le piège des correspondances partielles 'contains')
host_of(url) = host { ... }

# Détection des sources d'entrées requises manquantes ou vides
missing_inputs(input_obj, required_paths) = missing { ... }

# Construction du statut standard
status = {
    "edp_id": edp_id,
    "verdict": verdict, # compliant | violated | not_applicable | insufficient_input
    "applicable": is_applicable,
    "violations": violations_list,
    "missing_inputs": missing_list
}
```

## 5. Garde de Mutation (`scripts/edp-mutation-gate.ts`)

Pour prévenir les règles factices ou non couvertes :
- Génère des mutants en désactivant alternativement chaque clause de négation (`deny` / règle de violation).
- Exécute la suite d'auto-test OPA contre chaque mutant.
- Exige un score de mutation de 100 % (chaque mutant doit faire échouer au moins un test).
- Échoue avec code de retour non nul si un mutant survit.

## 6. Persistance Prisma & Rétractation

- Modèle additif `ExecutableDecisionPackage` dans `prisma/schema.prisma`.
- Validation stricte de l'Invariant II : refus catégorique de `validated` si `production_mode === "llm-derived"` sans validateur humain.
- Écoute des événements de cycle de vie de la décision : si la décision est invalidée ou révisée, l'EDP est automatiquement basculé à `stale`.

