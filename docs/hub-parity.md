# Parité entre le dossier d'Archinex et l'instantané du Hub

Le Hub est l'émetteur unique de l'instantané d'un engagement vers la suite (LLMOps `SUITE-MAP` §7ter, archinex#34). Le dossier
scellé d'Archinex n'est conservé que « jusqu'à la parité ». Ce document dit où on en est, **mesuré** sur un scénario construit des
deux côtés (`tests/contract/hub-parity-live.test.ts`, contre un vrai Hub), et ce qui reste pour retirer l'émission locale.

## Ce que le Hub porte, et si le contenu coïncide

Le même état est monté deux fois : dans la base d'Archinex (dossier scellé par l'assemblage) et dans un vrai Hub 1.27 (par les gestes
du Hub : proposer, puis affirmer par une autre personne).

| Section du dossier | État | Ce qui est comparé |
| --- | --- | --- |
| `requirements` | couverte | texte, décision engagée (valeur et motif) ; contrat **1.27** |
| `subjects` | couverte | nom, maturité, exigences portées ; contrat **1.27** |
| `decisions` | couverte | option retenue, justification, alternatives écartées |
| `statements` | couverte | énoncés affirmés (valeur) |
| `gaps` | partielle | le Hub ne calcule que G1 et G2 ; les lacunes d'exigence (à qualifier, à clarifier) sont du processus d'Archinex |
| `conflicts`, `kb_references` | **non éprouvées par ce scénario** | comptées seulement ; le scénario n'en contient pas, ce n'est donc pas « couvert » |
| `source_documents` | **absente du Hub** | empreinte et version du RFP source |
| `compliance` | **absente du Hub** | matrice exigence → contrôle (K17) |
| `architecture` | **absente du Hub** | éléments et relations |
| `reuse_log` | **absente du Hub** | confirmations de réutilisation, hypothèse par hypothèse |
| `glossary` | **absente du Hub** | glossaire |

Sur ce que le Hub porte : **aucun écart de contenu**. La liste des sections absentes est figée par le test : si le Hub en gagne
une, le test échoue et ce tableau doit suivre.

## Ce que cela autorise, et ce que cela interdit

- **Projet basculé** : le Hub seul émet. Une matrice de traçabilité se produit depuis son instantané (exigences, décisions
  affirmées par une personne, sujets, décisions d'architecture). Il manque au Hub, donc à ces documents : la conformité, les vues
  d'architecture et l'attribution du RFP source.
- **Projet non basculé** : Archinex garde son dossier, y compris pour les documents qui exigent une section absente du Hub (OSCAL,
  vues d'architecture). **Retirer l'émission locale avant que le Hub porte ces sections ferait disparaître ces documents.**
- Ce qui est propre au poste de travail ne passe jamais au Hub : la proposition brute du modèle (« à qualifier »), les critères,
  options, arguments et débats.

## Pour retirer l'émission locale

Il manque au Hub, dans l'ordre où les documents en ont besoin : la conformité (K17), le journal de réutilisation, les éléments
d'architecture, le document source. Chacun est un lot côté Hub avec son propre test de parité ici.

## Relancer la mesure

```bash
# dans LLMOps (branche portant le contrat 1.27) : un serveur de contrat avec les jetons arx-token (eng:delegate) et
# suite-token (eng:service), sur le port 8099
LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run \
  tests/contract/hub-requirements-live.test.ts \
  tests/contract/hub-parity-live.test.ts \
  tests/contract/hub-traceability-route-live.test.ts
```

Sans `LLMOPS_LIVE_URL`, ces tests sont ignorés.
