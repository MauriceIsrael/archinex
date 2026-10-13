# Parité entre le dossier d'Archinex et l'instantané du Hub

Le Hub est l'émetteur unique de l'instantané d'un engagement vers la suite (LLMOps `SUITE-MAP` §7ter, archinex#34). Le dossier
scellé d'Archinex n'est conservé que « jusqu'à la parité ». Ce document dit où on en est, **mesuré** sur un scénario construit des
deux côtés (`tests/contract/hub-parity-live.test.ts`, contre un vrai Hub), et ce qui reste pour retirer l'émission locale.

## Ce que le Hub porte, et si le contenu coïncide

Le même état est monté deux fois : dans la base d'Archinex (dossier scellé par l'assemblage) et dans un vrai Hub 1.30 (par les gestes
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
| `compliance` | **non éprouvée par ce scénario** | le Hub porte la couverture *déclarée* exigence → contrôle depuis le contrat **1.28** (K17) ; **l'export d'Archinex n'a jamais calculé cette section** (elle vaut `[]`), il n'y a donc rien à comparer ni à retirer. Voir ci-dessous |
| `architecture` | **absente du Hub** | éléments et relations |
| `reuse_log` | **absente du Hub** | confirmations de réutilisation, hypothèse par hypothèse |
| `glossary` | **absente du Hub** | glossaire |

Sur ce que le Hub porte : **aucun écart de contenu**. La liste des sections absentes est figée par le test : si le Hub en gagne
une, le test échoue et ce tableau doit suivre.

## La couverture déclarée exigence → contrôle (K17, contrat 1.30)

Le Hub n'apparie aucun texte et ne vérifie rien. Il énonce une **chaîne de déclarations**, lisible dans son instantané :
exigence ← sujet qui la porte ← décision du sujet → élément de la base que la décision cite → contrôle que cet élément met en œuvre
(dans l'instantané de connaissances épinglé). Une ligne est `allocated` tant qu'une décision **affirmée** la soutient,
`proposed` si seules des décisions proposées le font, et **jamais `verified`**. Abaisser une décision d'affirmée à proposée change
la section et le sceau.

Pour qu'une ligne existe, **la décision doit citer** l'élément de la base : Archinex transmet les références de l'**option
retenue** (`Option.kbRefs`, dédoublonnées) dans `based_on`. Une option retenue qui ne cite rien ne déclare aucun contrôle.
La matrice de traçabilité d'un projet basculé affiche la colonne « Contrôles déclarés » ; Archinex refuse un instantané du Hub dont
une ligne serait « vérifiée » ou fondée sur autre chose qu'une décision.

Ce que cela n'est pas : un contrôle que l'exigence devrait viser et qu'aucune décision ne déclare **n'est pas listé** (l'établir
demanderait un appariement de texte hors de l'instantané épinglé). Les manques G3 dérivés ne sont pas non plus dans l'instantané.

## Ce que cela autorise, et ce que cela interdit

- **Projet basculé** : le Hub seul émet. Une matrice de traçabilité se produit depuis son instantané (exigences, décisions
  affirmées par une personne, sujets, décisions d'architecture, contrôles déclarés). Il manque au Hub, donc à ces documents : les vues
  d'architecture et l'attribution du RFP source.
- **Projet non basculé** : Archinex garde son dossier, y compris pour les documents qui exigent une section absente du Hub (OSCAL,
  vues d'architecture). **Retirer l'émission locale avant que le Hub porte ces sections ferait disparaître ces documents.**
- Ce qui est propre au poste de travail ne passe jamais au Hub : la proposition brute du modèle (« à qualifier »), les critères,
  options, arguments et débats.

## Pour retirer l'émission locale

Il manque au Hub, dans l'ordre où les documents en ont besoin : le journal de réutilisation, les éléments
d'architecture, le document source. Chacun est un lot côté Hub avec son propre test de parité ici.

## Relancer la mesure

```bash
# dans LLMOps (branche portant le contrat 1.30) : un serveur de contrat avec les jetons arx-token (eng:delegate) et
# suite-token (eng:service), sur le port 8099
LLMOPS_LIVE_URL=http://127.0.0.1:8099 npx vitest run \
  tests/contract/hub-requirements-live.test.ts \
  tests/contract/hub-parity-live.test.ts \
  tests/contract/hub-traceability-route-live.test.ts \
  tests/contract/hub-compliance-live.test.ts
```

Sans `LLMOPS_LIVE_URL`, ces tests sont ignorés.
