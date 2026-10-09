# Developer Guide — Archinex Deliberation Workbench

> **Guide technique pour les développeurs et contributeurs d'Archinex.**

---

## 1. Principes d'Ingénierie & Invariants de Code

Pour préserver l'intégrité épistémique du workbench, tout développement sur Archinex doit observer les règles suivantes :

1. **Svelte 5 Runes Exclusifs** : Aucun store Svelte hérité (`writable`, `derived`, `get`) ni slot. Tout état réactif utilise `$state`, `$derived`, `$props` et les classes réactives `.svelte.ts`.
2. **Étanchéité Domaine / Vue** : La logique métier d'arbitrage, de calcul de DAG, de détection de diffs et de projection réside obligatoirement dans `src/lib/domain/` sous forme de fonctions pures testables unitairement sans dépendance au DOM.
3. **Cryptographie Isomorphe** : Ne jamais réintroduire `import { createHash } from 'crypto'` dans les fichiers partagés avec le client Vite. Toujours utiliser `universalSha256` depuis `$lib/validation/epistemicEnvelope`.
4. **Zéro Warning / Zéro Erreur** : Le projet applique une tolérance zéro sur `svelte-check`. Tout avertissement d'accessibilité (ex: input sans label associé) doit être corrigé immédiatement.

---

## 2. Environnement de Développement & Commandes

### 2.1 Installation
```bash
git clone https://github.com/votre-orga/archinex.git
cd archinex
npm install
```

### 2.2 Configuration Locale (`.env`)
```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="archinex-super-secret-key-change-in-production"
GEMINI_API_KEY="votre-cle-api-pour-les-agents-ia"
```

### 2.3 Initialisation de la Base de Données
```bash
npx prisma db push
npx prisma db seed
```

### 2.4 Lancement du Serveur de Développement
```bash
npm run dev
# Accès : http://localhost:5173/deliberation
```

---

## 3. Matrice de Tests & Cycle de Validation

Avant tout commit ou proposition d'évolution, le développeur doit exécuter la chaîne de vérification complète :

```bash
# 1. Tests unitaires, contractuels et d'intégration Vitest
npm run test

# 2. Vérification de typage et de syntaxe Svelte 5
npm run check

# 3. Compilation de production avec l'adaptateur Node
npm run build

# Raccourci tout-en-un
npm run verify
```

### Organisation des Tests (`tests/`)
- `tests/contract/epistemic-statement.test.ts` : Validation des enveloppes et rejet des combinaisons interdites (`verified × llm-derived`).
- `tests/contract/telegraphic-draft.test.ts` : Rendu télégraphique et conformité au filtre anti-blabla.
- `tests/contract/maturity-board.test.ts` : Tri dynamique par déblocages et détection de stagnation (> 14 jours).
- `tests/contract/diff-sensor.test.ts` : Capture de rectifications textuelles en énoncés auditables et règle du silence.
- `tests/contract/dialectic-recall.test.ts` : Détection automatique des collisions de doctrine et rappels ADRs.
- `tests/contract/retractation-engine.test.ts` : Parcours du graphe causal direct (DAG) et clôture logique d'invalidation.
- `tests/contract/freeze-export.test.ts` : Barrière de certification, références immuables et scellement SHA-256.
- `tests/integration/deliberation-workflow.test.ts` : Scénario d'intégration complet d'élicitation et de scellement.

---

## 4. Ajout d'une Règle ou d'un Nouveau Format de Projection

Pour ajouter un nouveau format cible de projection (ex: Terraform ou PlantUML C4) :
1. Déclarer le générateur déterministe dans `src/lib/domain/artifactProjections.ts`.
2. Connecter le générateur à la méthode `freezeSectionAndGenerateSnapshot` dans `src/lib/domain/freezeExport.ts`.
3. Ajouter l'onglet correspondant dans `src/lib/components/deliberation/ArtifactRegenerationHub.svelte`.
4. Rédiger un test contractuel vérifiant l'absence de dérive dans `tests/contract/freeze-export.test.ts`.

---

## 5. Intégration continue

`.github/workflows/verify.yml` exécute `npm run verify` sur un clone propre à chaque push et pull request. Une PR rouge ne se fusionne pas. Pour reproduire localement : `cp .env.example .env && npx prisma db push && npm run verify`.

Les tests « live » (vrai LLMOps) et les parcours Playwright ne tournent pas en CI : ils sont ignorés sans `LLMOPS_LIVE_URL` ou Docker. Lancez-les avant une fusion qui touche l'intégration LLMOps.

## 6. Évaluer l'audit des exigences d'un RFP

Le pipeline (`src/lib/server/ingest/arckitRequirementsPipeline.ts`) appelle le modèle configuré (`LLM_PROVIDER`, `ANTHROPIC_API_KEY`…). Pour mesurer sa qualité sur un RFP, face à l'analyse d'un architecte :

```bash
npm run eval:requirements -- examples/lumicc-noc/rfp-section4-noc.md \
  --reference examples/lumicc-noc/reference-analysis.json --out eval-results/lumicc.json
```

L'indicateur critique est le **faux négatif dangereux** (clause jugée à délibérer par l'expert mais évacuée par le pipeline) : il doit être à zéro. Le script sort en code 1 si l'intégrité n'est pas respectée, 2 si le modèle est injoignable.

Règles à respecter dans `src/` :
- Aucune référence, nom de projet ou exigence propre à un RFP : le garde-fou `npm run check:denylist` et un test du pipeline le vérifient.
- Les analyses de référence (écrites à la main) vivent dans `examples/`, jamais dans `src/`.
- Toute nouvelle règle d'intégrité s'ajoute dans `applyClassificationInvariants` ou `applySubjectInvariants` (fonctions pures, testées sans LLM).

