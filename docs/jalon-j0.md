# Jalon J0 : rejouer un dossier réel

Le jalon J0 (le « lot 0 » de la note *La trace du raisonnement*) répond à une seule question : **le système voit-il des choses que l'équipe n'a pas vues, sans en cacher d'importantes ?** S'il échoue, le reste du plan n'a pas lieu d'être. Il se joue avec le modèle réellement utilisé (Claude par API), sur un RFP déjà traité dont on connaît l'issue.

La règle d'or : **le juge est écrit avant la mesure, par quelqu'un qui n'a pas vu la sortie.** Sans cela, la mesure ne prouve rien.

## 0. Préalables

1. Exécuter la version qui contient l'audit en étapes (branche fusionnée). Contrôle visuel : après l'import, le bandeau dit « Méthodologie ArcKit · Propositions du modèle à relire » et un compteur « À qualifier » apparaît. Si vous voyez des sujets `ADR-NOC-01` à `04`, vous exécutez l'ancien audit câblé.
2. Une clé : `ANTHROPIC_API_KEY` dans `.env`. Facultatif : `ANTHROPIC_MODEL` pour choisir le modèle. Notez le modèle utilisé, il figure dans le rapport.
3. Un RFP **déjà traité**, dont vous connaissez l'issue : la réponse remise, les avenants, les mauvaises surprises d'exécution. Le mieux documenté, pas le plus gros.

## 1. Écrire le juge (avant de lancer quoi que ce soit)

Deux listes, figées et datées.

**A. L'analyse de référence** (lisible par la machine). Copiez `examples/reference-template.json`. Listez :
- les **points durs** : les dilemmes qui méritaient un débat d'architecture, avec les clauses qui les portent ;
- les **clarifications** : les questions que vous auriez posées au donneur d'ordre.

**B. Les angles ratés à l'époque** (lecture humaine). Une liste, une ligne par angle, tirée des avenants, incidents et surprises d'exécution. Pour chacun, une colonne vide « retrouvé par le système ? » à remplir à l'étape 5.

Puis figez : `git add` et commit avec la date. Le commit est la preuve que le juge précède la mesure.

> Le fichier `examples/lumicc-noc/reference-analysis.json` provient de l'ancien audit câblé et son auteur n'est pas établi. Il ne peut servir de juge qu'après relecture par un architecte qui ne l'a pas produit. Pour un test sans enjeu, il suffit ; pour décider, écrivez le vôtre.

## 2. Fixer les critères de décision (avant de compter)

Valeurs proposées, à ajuster **maintenant**, pas après :

| Mesure | Critère proposé | Pourquoi |
|---|---|---|
| Faux négatifs dangereux (clause de référence évacuée) | **0**, non négociable | Une exigence importante sortie du débat est l'erreur la plus coûteuse. |
| Rappel « à délibérer » | ≥ 80 % | Le système doit voir l'essentiel de ce qui compte. |
| Part « à qualifier » | ≤ 30 % | Au-delà, le tri reste à faire à la main et l'outil ne fait pas gagner de temps. |
| Angles ratés retrouvés (liste B) | ≥ 3 | C'est la valeur ajoutée : voir ce que l'équipe n'avait pas vu. |
| Bruit parmi les sujets et questions | < 50 % | Au-delà, on lit plus qu'on ne gagne. |

## 3. Lancer

```bash
npm run eval:requirements -- chemin/vers/le-rfp.md \
  --reference chemin/vers/votre-reference.json \
  --report eval-results/rapport-1.md --out eval-results/resultat-1.json
```

**Lancez deux fois** (`rapport-2.md`). Le modèle n'est pas déterministe : si les deux passes divergent beaucoup sur les sujets ou les évacuations, la mesure d'une seule passe est fragile.

Si le statut n'est pas `ok` (lots en échec, regroupement impossible), lisez les avertissements : une clé invalide, un délai dépassé ou une réponse tronquée se voient là. Relancez avant de conclure quoi que ce soit.

## 4. Lire le rapport, section par section

Le rapport répond aux questions que l'on se pose en voyant les sujets sortir.

| Section | Question à se poser | Que faire |
|---|---|---|
| **Lecture rapide** | Les proportions sont-elles plausibles ? | Une évacuation à 90 % ou à 0 % est suspecte. |
| **Pourquoi ces sujets** | Pour chaque clause : la tension citée est-elle réelle ? Le regroupement est-il un vrai dilemme, ou un simple thème ? | Un sujet sans tension précise est à reformuler ou à fusionner. |
| **À qualifier par vous** | Pourquoi le système n'a-t-il pas osé ? | Trancher une à une : promouvoir en sujet, ou évacuer avec un motif écrit. Les clauses bloquantes arrivent ici par construction. |
| **À clarifier** | La question est-elle précise et utile ? | Les envoyer au donneur d'ordre pendant la période de questions. |
| **Évacuations proposées** | Y a-t-il une clause que *vous* auriez débattue ? | Relire **toutes** les clauses « majeur », un échantillon des « info ». Chaque erreur trouvée est un faux négatif. |
| **Comparaison avec la référence** | Où le système s'écarte-t-il de votre juge ? | Voir l'étape 6. |

## 5. Compter

1. **Mesure automatique** : les chiffres du rapport (rappel, faux négatifs dangereux, appariement des points durs).
2. **Mesure humaine** : reprenez votre liste B. Pour chaque angle raté à l'époque, cherchez-le dans les sujets, leurs questions pour le sachant, et les clarifications. Notez « retrouvé » ou « non ». Notez aussi le **bruit** : parmi les sujets et questions que le système soulève, combien sont sans intérêt.

## 6. Interpréter les écarts

| Symptôme | Cause probable | Action |
|---|---|---|
| Faux négatif dangereux > 0 | Le modèle trouve la clause banale, ou le motif d'évacuation est plausible mais faux | Lire le motif. Renforcer la consigne du classement, ou changer de modèle. **Ne pas poursuivre tant que ce chiffre n'est pas à 0.** |
| Beaucoup de « à qualifier » | Beaucoup de clauses bloquantes (jamais évacuées automatiquement), ou des lots en échec | Regarder `qualifyReason` : « clause bloquante » est normal, « classement indisponible » est une panne à relancer. |
| Sujets trop gros ou trop fins | Le regroupement est approximatif | Fusionner ou scinder à la main (boutons de l'écran de revue). Si c'est systématique, ajuster la consigne de regroupement. |
| Points durs de référence sans sujet correspondant | Le modèle a dispersé ou écarté ces clauses | Regarder dans quels états elles sont tombées. |
| Deux passes très différentes | Le résultat dépend du tirage | Mesurer plusieurs fois et retenir le pire cas pour décider. |

## 7. Décider, par écrit, sur une page

À remplir et à committer à côté du juge :

```
RFP : …                       Modèle : …                    Date : …
Critères fixés le … (avant la mesure), dans le commit …

Faux négatifs dangereux : … (critère : 0)
Rappel « à délibérer »  : …  (critère : ≥ 80 %)
Part « à qualifier »    : …  (critère : ≤ 30 %)
Angles ratés retrouvés  : …/…  (critère : ≥ 3)
Bruit                   : …  (critère : < 50 %)
Écart entre les deux passes : …

Décision : GO / CORRIGER puis rejouer / ARRÊT
Motif en trois lignes : …
```

Le piège à éviter : trouver l'outil « intéressant » et continuer sans chiffre. Un GO se justifie par des critères écrits avant, pas par une impression.

## Et les clauses qui ne deviennent pas des sujets ?

À la confirmation de l'import, l'état de **chaque** clause est enregistré avec le projet : la proposition du modèle (disposition, motif, modèle, date) et, séparément, ce que vous avez confirmé. Les sujets retenus portent la liste des clauses qu'ils couvrent.
- le dossier scellé les exporte (`requirements[]` : état, motif, niveau `asserted`/`proposed`/`open`, auteur, date), avec une lacune pour chaque clause « à qualifier » ou « à clarifier » ;
- le rapport d'audit reste utile pour relire : « Télécharger le rapport d'audit », ou `--report` en ligne de commande ;
- une clause évacuée à tort se récupère à l'écran de revue par « Promouvoir en Sujet Archi », ou plus tard par `PATCH /api/projects/{id}/requirements/{SRC-xxxx:clause}` (pas encore d'écran dédié) ;
- seule la décision d'un humain identifié rend une clause `asserted` dans le dossier ; une évacuation décidée exige un motif.
