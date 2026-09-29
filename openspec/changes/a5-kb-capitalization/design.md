# Conception A5 — Capitalisation et Anonymisation vers LLMOps

## 1. Architecture du domaine (`src/lib/domain/capitalization.ts`)

### Modèle de données & Fonction pure `buildKbCandidates`
```typescript
export interface BuildKbCandidatesInput {
  decision: Decision;
  subject: SubjectInfo;
  options: Option[];
  arguments?: Argument[];
  engagement: string;
  author: string;
  authorRole?: string;
}

export function buildKbCandidates(input: BuildKbCandidatesInput): KbCandidate[]
```

Cas de génération :
1. `new_asset` : si `retainedOption.kbRefs.length === 0`
   - Kind: `new_asset`
   - Title: `Pattern émergeant : ${retainedOption.title}`
   - Summary: synthèse de l'option retenue
   - SuggestedChange: proposition de formalisation d'un pattern réutilisable
   - Rationale: motivation issue de l'arbitrage
2. `amendment` : pour chaque violation dans `decision.acceptedViolations`
   - Kind: `amendment`
   - TargetAssetRef: `violation.typedId`
   - Title: `Proposition d'amendement / dérogation pour ${violation.typedId}`
   - Summary: justification de la dérogation
   - SuggestedChange: ajustement doctrinal ou clause d'exception suggérée
   - AcceptedViolationJustification: `violation.justification`
3. `rex` : systématique
   - Kind: `rex`
   - Title: `REX Décision : ${subject.name} - ${retainedOption.title}`
   - Summary: dilemme, options écartées et compromis
   - Rationale: `decision.rationale`

### Anonymisation (`anonymizeCandidate`, `anonymizeText`)
```typescript
export interface AnonymizationContext {
  projectNames?: string[];
  clientNames?: string[];
  siteNames?: string[];
  participantNames?: string[];
  additionalTerms?: string[];
}

export function anonymizeText(text: string, ctx: AnonymizationContext): string;
export function anonymizeCandidate(candidate: KbCandidate, ctx: AnonymizationContext): KbCandidate;
```

Règles de masquage :
- Noms explicites -> `[PROJECT]`, `[CLIENT]`, `[SITE]`, `[PARTICIPANT]`
- Adresses IPv4 et IPv6 -> `[IP]`
- Volumes chiffrés, disques `/dev/mapper/...`, `/dev/sdX`, UUID/LUKS -> `[STORAGE_VOLUME]`

## 2. Couche Serveur (`src/lib/server/projects/capitalizationDb.ts`)
- `prepareSubjectKbCandidates(subjectId, actor)` : extrait le contexte, calcule les candidats, applique l'anonymisation de premier niveau et renvoie la proposition à l'interface.
- `submitSubjectKbCandidates(subjectId, candidates, actor)` :
  - Invariant III : requiert l'action explicite d'un utilisateur.
  - Vérification d'habilitation de l'acteur (Lead Architect ou expert du domaine).
  - Ré-anonymisation de sécurité.
  - Envoi via `llmopsClient.submitCandidate(c)`.
  - Persistance des IDs retournés dans `Decision.kbCandidateIds`.
  - Enregistrement d'un `DomainEvent` (`KB_CANDIDATES_SUBMITTED`).
- `getSubjectKbCandidates(subjectId)` :
  - Récupère les IDs stockés dans `Decision.kbCandidateIds`.
  - Interroge `llmopsClient.listCandidates({ source: 'archinex', engagement })`.
  - Retourne les statuts en direct (`in_review`, `accepted`, `rejected`).

## 3. Interface Utilisateur
- `CapitalizationSection.svelte` intégrée dans `ArbitrationPanel.svelte` :
  - Si le sujet est arbitré (`L3_decided`), affiche la section « Capitalisation vers le Knowledge Hub (Porte G4) ».
  - Si aucun candidat soumis : bouton « Préparer les candidats KB » affichant les fiches éditables.
  - Possibilité pour l'utilisateur de modifier le titre, le résumé, la proposition et les motifs avant soumission (répond au besoin utilisateur explicite).
  - Bouton « Transmettre à LLMOps ».
  - Affichage de la liste des candidats soumis avec badges de statut (`in_review`, `accepted`, `rejected`) et motifs de rejet éventuels.
- Dépréciation de l'ancien bouton « Récolter dans LLMOps » dans `TelegraphicDraftView.svelte` au profit de ce flux institutionnel.
