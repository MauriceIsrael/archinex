# Spécification : Gel & Export Scellé (`freeze-export`)

## ADDED Requirements

### Requirement: Gel Granulaire par Section
Le système SHALL permettre le gel officiel d'une section du HLD de manière granulaire et indépendante des autres sections du document. Le jalon de maturité est évalué par sujet et non globalement au document.

### Requirement: Barrière d'Homologation (Gating de Gel)
Le système SHALL bloquer toute tentative de gel d'une section tant que :
- L'un des sujets dont dépend la section est sous le niveau requis (`L3_decided` pour un HLD, `L4_specified` pour un dossier d'exécution).
- Il subsiste au moins un conflit ouvert (`open_conflicts > 0`) non arbitré sur le périmètre de la section.
- La section porte des hypothèses `assumed` non rattachées à des antécédents prouvés.

### Requirement: Scellement des Références Externes Immuables (`ExternalRef`)
Lors de l'opération de gel d'une section, le système SHALL convertir l'ensemble des références aux actifs de doctrine (décisions, patrons, contrôles) en références scellées immuables :
- Format canonique : `KH:<AssetId>@v<Version>` ou `KH:<AssetId>@sha256:<Empreinte>`.
- Aucune référence mutable ne peut subsister dans une section gelée.

### Requirement: Export d'Artefacts Opposables & Diagrammes
Le système SHALL générer à partir de la section gelée un export opposable pour les dossiers d'homologation :
- Condensat cryptographique global SHA-256 scellant le contenu et la liste des énoncés prouvés.
- Export des diagrammes d'architecture au format Mermaid normalisé (syntaxe sécurisée, libellés protégés) et export compatible Structurizr / Draw.io.
- Projection bureautique (Markdown / DOCX) respectant la grammaire épistémique : affirmation assurée pour le `designed`/`verified`, citation attribuée pour le `stated-by-client`, exclusion du `assumed`.

---

## Scenarios

#### Scenario: Gel réussi d'une section stabilisée par le Lead Architect
- **GIVEN** la section §4.2 `Synchronisation` au niveau `L3_decided` sans conflit ouvert
- **WHEN** le `Lead Architect` déclenche l'action « Geler la section »
- **THEN** les références sont converties en `ExternalRef` immuables (ex: `KH:ADR-0014@v1.2`)
- **AND** un condensat SHA-256 de la section est généré et horodaté.

#### Scenario: Refus de gel sur section comportant un conflit ouvert
- **GIVEN** une section comportant un conflit non arbitré entre deux choix d'architecture
- **WHEN** un utilisateur tente de geler la section
- **THEN** le système refuse l'action avec l'erreur `OPEN_CONFLICT_GATING_VIOLATION`
- **AND** l'utilisateur est invité à effectuer l'arbitrage préalable dans le panneau dédié.
