# Index des Architecture Decision Records (ADR) — Archinex

Ce répertoire regroupe les décisions d'architecture structurantes d'Archinex. Chaque ADR documente le contexte, la décision retenue, les alternatives écartées et les conséquences opérationnelles.

| Identifiant | Titre | Statut | Date | Périmètre |
| :--- | :--- | :--- | :--- | :--- |
| [ADR-016](ADR-016-promotion-edp-experimental.md) | Décision de Promotion du Sous-Système Expérimental EDP | Accepté *(amendé 2026-11-21)* | 2026-10-29 | Promotion d'EDP dans le tronc commun |
| [ADR-017](ADR-017-nautobot-point-unique-reconciliation.md) | Nautobot, point unique de réconciliation bidirectionnelle entre Archinex et le réel | Proposé | 2026-11-21 | Réconciliation LLD, connecteurs derrière Nautobot (#375) |
| [ADR-018](ADR-018-knowledge-hub-souverain-decouplage-3-tiers.md) | Découplage en 3 Tiers et Knowledge Hub Souverain (LLMOps) | Accepté | 2026-11-22 | Séparation code / runtime DB / Hub souverain (#252, #253) |
| [ADR-019](ADR-019-edp-oracles-opa-rego-deterministes.md) | Oracles Déterministes EDP sur Open Policy Agent (OPA / Rego v1) | Accepté | 2026-11-22 | Choix OPA/Rego, 4 verdicts, `data.ontology`, garde de mutation |
| [ADR-020](ADR-020-interdiction-repli-silencieux-production.md) | Interdiction de Repli Silencieux en Production (Politique Fail-Closed) | Accepté | 2026-11-22 | Zéro fallback silencieux (Hub, OPA, Nautobot, `JWT_SECRET`) |

Pour le modèle de parcours unifié et le glossaire, voir [`docs/concepts.md`](../concepts.md).
