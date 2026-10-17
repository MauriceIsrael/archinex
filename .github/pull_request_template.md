<!--
TITRE : type(portée) [Hub …] : résumé court

  [Hub ≥ 1.35]               la PR EXIGE du Hub un contrat d'au moins 1.35 (version minimale)
  [Hub ≥ 1.35 · inst. ≥ 1.8] idem, avec la version de l'instantané scellé quand elle compte
  [Hub → 1.36]               la PR est celle qui CRÉE ce contrat côté Hub (lien vers la PR LLMOps ci-dessous)
  [Hub —]                    indépendante du Hub

Exemples : « test(hub) [Hub ≥ 1.35] : les tests live acceptent tout instantané 1.x ≥ 1.7 »
           « feat(hub) [Hub ≥ 1.31] : lire la couverture exigence → contrôle »

LE NUMÉRO SE PREND À L'OUVERTURE, pas à l'écriture : les contrats se croisent (plusieurs lots en parallèle ont déjà pris 1.33,
1.34 puis 1.35 sous les pieds d'une PR). Avant de l'écrire : relire CONTRACT_VERSION de `main` du Hub ET lister les PR ouvertes du
Hub qui annoncent un contrat ; si un autre lot l'a réservé, prendre le suivant et le dire dans la PR.

Supprimer ce commentaire avant de publier.
-->

## Contrat du Hub

| | |
|---|---|
| Exige du Hub (minimum) | contrat ≥ … / aucun |
| Crée ou modifie côté Hub | contrat … (PR LLMOps#…) / aucun |
| Instantané scellé (`schemaVersion`) | ≥ … / sans objet |
| Éprouvé contre | Hub `main` au contrat … (serveur de contrat), le … |

## Contexte

<!-- Pourquoi cette PR : le constat, avec la preuve (échec, log, lien). Un faux problème ne se corrige pas. -->

## Ce qui change

<!-- Par grands blocs. Signaler un commit séparable s'il touche le code d'une autre PR. -->

## Vérification

- [ ] `npm run verify` vert sur **cette tête** (4 portes : denylist, vitest, svelte-check, build)
- [ ] La CI de la PR est verte après le dernier rebase ou la dernière mise à jour depuis `main`
- [ ] Tests « live » rejoués contre un Hub au contrat annoncé ci-dessus (`docs/testing.md`) : _N réussis / N_
- [ ] Aucune assertion sur une **version exacte** d'un contrat ou d'un schéma du Hub dans les tests live (famille + minimum, pas `toBe('1.7')`)
- [ ] Docs et `CHANGELOG.md` à jour

<!-- Chiffres réels : fichiers, tests réussis / ignorés / échecs. Ne pas arrondir un échec en « flaky » sans l'avoir rejoué seul. -->

## Limites (dites, pas masquées)

<!-- Ce qui n'est pas fait, pas mesuré, pas éprouvé ; ce qui dépend d'une autre PR ou d'une décision. -->

## À décider

<!-- Points qui reviennent à la personne qui relit. Fermer une issue (« closes ») seulement si elle est vraiment soldée. -->
