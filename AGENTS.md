# Règles d'Ingénierie & Généralisation — Archinex

## 1. Zéro Couplage Exemple (« L'exemple n'est jamais la règle »)
Lorsque l'utilisateur décrit un besoin ou un problème en s'appuyant sur un cas particulier (ex. un sujet `carto`/`SIG`, un projet `DEMOLULU`/`LULUDEMO`, une capacité `IoT`, un protocole ou un équipement précis) :
- **Traiter l'exemple comme un cas de test**, jamais comme une constante métier dans le code de production (`src/`).
- **Interdiction de coder en dur** dans `src/` :
  - des identifiants de projet, de sujet ou de clause (`sub_lulu_*`, `REQ-Lot1-*`, etc.) ;
  - des libellés d'interface utilisateur mentionnant des numéros de section ou des composants propres à un seul projet (ex. `(§9.4/§11)` dans un titre générique) ;
  - des paramètres d'environnement ou domaines fonctionnels d'un composant existant réutilisés par commodité pour un autre (ex. `ref(param.gis.*)` dans un composant émergent générique) ;
  - des valeurs pré-remplies d'exemple dans les champs de saisie (`$state('iot-gateway')` -> utiliser `$state('')` + `placeholder`).
- **Dériver dynamiquement** les listes de composants candidats, domaines, paramètres et relations à partir de l'ontologie, de la taxonomie TOGAF unifiée et du catalogue actif du projet.

## 2. Alerte Explicite de Spécificité (Obligatoire)
Si, pour des raisons techniques (absence de données dans le catalogue, fallback nécessaire, archétype prédéfini ou contrainte d'un module existant), une implémentation doit introduire :
- un **fallback statique** (liste par défaut si le catalogue est vide),
- un **archétype ciblé** (mots-clés ou règles dédiés à une famille technique),
- ou une **hypothèse de domaine** (ex. rattachement à un domaine fonctionnel ou un paramètre d'overlay spécifique),

l'agent **DOIT** le signaler explicitement à l'utilisateur dans sa réponse sous la rubrique :
> **⚠️ Alerte Spécificité / Hypothèse de portée** : préciser exactement *où* (fichier + fonction), *pourquoi* (contrainte technique) et *quel est le comportement hors-cas*.

## 3. Encodage UTF-8 Strict
Tous les fichiers source, configurations, documents et fragments `changelog.d/` doivent être encodés en **UTF-8 sans BOM** et vérifiés sans caractères de remplacement (``) ni mojibake.
