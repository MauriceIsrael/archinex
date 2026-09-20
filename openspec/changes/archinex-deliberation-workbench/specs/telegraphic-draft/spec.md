# Spécification : Le Brouillon-Appât Télégraphique (`telegraphic-draft`)

## ADDED Requirements

### Requirement: Structure Télégraphique du Brouillon-Appât
Le système SHALL restituer l'état de chaque section du HLD sous la forme d'un rendu télégraphique structuré, sans prose narrative ni phrases de transition. Le rendu comprend obligatoirement :
- Un en-tête identifiant le paragraphe, le nom du sujet, son niveau de maturité (`L0_named` à `L4_specified`) et son statut de complétude (`provisoire` si `is_provisional: true`).
- La ligne `retenu` : Les choix actés et ancrés dans la doctrine transverse (`KH:ADR-...@vVersion`, `PAT-...`).
- La ligne `supposé` : Les hypothèses de travail non encore démontrées (`assumed`), accompagnées de leurs conséquences directes.
- La ligne `conflit` : Les contradictions ouvertes avec d'autres décisions ou doctrines nécessitant un arbitrage humain.
- Les lignes `manque` : Les questions ouvertes (`Q-xxxx`) affectées aux rôles d'experts compétents.
- La ligne `variante` : Au moins une proposition divergente (ex: *Variante B* dégradée ou alternative) pour tout sujet non stabilisé sous L3.

### Requirement: Appât Percutant & Langage de l'Expert
Le système SHALL concevoir le brouillon non pas comme une synthèse passive, mais comme une **provocation délibérée** propre à faire réagir l'architecte expert :
1. **Questions ciblées** : Chaque manque doit formuler l'arbitrage manquant précis (ex: `MTIE toléré en holdover ?`).
2. **Chaînage des conséquences & chiffrage** : Les hypothèses doivent être projetées le long du graphe de dépendances jusqu'à leur traduction matérielle et financière chiffrée (`cost_hint`, ex: `⇒ rubidium/site ⇒ Tier IV nord ⇒ +1 salle technique · +180 k€`).
3. **Langage technique d'expert** : L'appât doit impérativement employer le jargon précis, les acronymes métier reconnus et les normes officielles du domaine (ex: `PTP G.8275.1`, `GNSS`, `holdover`, `NIS2`, `3GPP MCX`).

### Requirement: Test de Non-Régression du Ton (Bannissement du Bla-bla)
Le système SHALL appliquer un filtre d'évaluation automatique rejetant toute tentative de génération réintroduisant de la prose lissée :
- Interdiction stricte de toute phrase complète de plus de 15 mots.
- Liste noire de tournures diplomatiques (« il est recommandé », « une attention particulière sera portée », « il convient de noter », « conformément aux bonnes pratiques »).
- Interdiction de toute coche « ✅ Conforme » sans preuve formelle (remplacée par « couvert par X », « non couvert », « couvert sous hypothèse Y »).

---

## Scenarios

#### Scenario: Rendu d'un brouillon-appât provoquant sur un sujet non stabilisé
- **GIVEN** le sujet `Synchronisation` au niveau `L2_decomposed` avec une hypothèse `holdover ≥ 30 j`
- **WHEN** le renderer génère le brouillon de la section §4.2
- **THEN** le texte produit affiche le chiffrage `+180 k€` et la `variante B : GNSS + NTP dégradé (÷3 le coût · perd MCX prio 1)`
- **AND** le document affiche clairement la mention `provisoire` en en-tête.

#### Scenario: Réaction immédiate d'un architecte face au coût
- **GIVEN** le brouillon affichant le surcoût de 180 k€ lié au rubidium
- **WHEN** l'expert réseau consulte la section
- **THEN** l'appât déclenche une contestation immédiate de l'hypothèse plutôt qu'une validation passive par défaut.

#### Scenario: Échec du test de ton sur détection de prose lissée
- **GIVEN** un template ou un prompt générant la phrase : « *Il est recommandé de mettre en œuvre une solution PTP conforme au profil télécom G.8275.1* »
- **WHEN** le validateur de ton analyse la sortie
- **THEN** le test échoue avec le motif `BLACKLISTED_POLITE_PROSE_DETECTED`
- **AND** le texte est rejeté et renvoyé pour reformulation télégraphique.
