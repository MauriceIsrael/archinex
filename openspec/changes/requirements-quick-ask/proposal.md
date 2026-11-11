# Proposition : Interrogation Rapide des Exigences par Chatbot Contextuel (`requirements-quick-ask`)

## 1. Contexte & Problématique

Lors de l'instruction ou de la délibération sur un appel d'offres (RFP/CCTP), les architectes ont régulièrement besoin de vérifier un point factuel dans le dossier d'exigences sans quitter le sujet sur lequel ils travaillent :
- *« Les exigences imposent-elles 3 datacenters ? »*
- *« Y a-t-il une contrainte sur le RPO/RTO ou la localisation des sauvegardes ? »*
- *« Quelles clauses mentionnent le chiffrement ou NIS2 ? »*

Aujourd'hui, l'architecte doit soit parcourir manuellement les tableaux d'appropriation / fragments HLD, soit exporter les exigences pour les chercher à la main.
Par ailleurs, introduire un RAG externe complet (type Dify + base vectorielle dédiée) poserait trois problèmes :
1. **Faux négatifs sur les requêtes d'absence ou d'agrégation** : un découpage vectoriel top-$k$ peine à prouver qu'une contrainte n'existe pas ou à repérer des formulations implicites (*« tri-site »*, *« 3 zones de disponibilité »*, *« N+2 »* pour *« 3 DC »*).
2. **Perte de l'état épistémique et métier** : les exigences dans Archinex (`Requirement`) portent déjà une criticité (`bloquant`, `majeur`, `info`), une disposition proposée par le modèle vs décidée par un humain (`deliberated`, `evacuated`, `clarification_needed`, `to_qualify`), et des liens vers les `Subject`.
3. **Complexité d'exploitation et étanchéité souveraine** : un outil tiers duplique les données, contourne l'autorisation projet (`authorizeProjectAccess`) et alourdit l'architecture air-gap / locale.

## 2. Objectifs

Fournir un assistant d'interrogation rapide (« Quick-Ask Exigences ») directement intégré à Archinex :
1. **Accès instantané et non bloquant** : une palette/fenêtre flottante (ou tiroir détachable) ouverte par raccourci clavier (`Ctrl+K` / `Cmd+K` ou `Alt+/`) depuis n'importe quelle posture du workbench (`src/routes/deliberation/+page.svelte`), laissant l'espace de travail visible en arrière-plan.
2. **Réponses exhaustives et sourcées** : exploitation en priorité des exigences déjà extraites et structurées en base (`RequirementSource` + `Requirement`), avec citation systématique des `clauseRef`, de l'extrait pertinent et du statut épistémique/disposition de chaque clause.
3. **Maîtrise des coûts et de la latence multi-utilisateurs** : structuration déterministe du préfixe de prompt + activation du **Prompt Caching** (Anthropic `cache_control: ephemeral` / réutilisation KV-cache Ollama) pour éviter de recalculer ou facturer à plein tarif le corpus d'exigences à chaque question d'équipe.
4. **Mode dégradé / grands corpus** : repli automatique sur un pré-filtrage hybride local (lexical + cosinus via `ollamaEncoder`) ou un balayage par lots lorsque la fenêtre du modèle local configuré est inférieure à la taille du dossier.

## 3. Ancrage dans la Constitution d'Archinex

1. **Invariant II (Interdiction Absolue `verified × llm-derived`)** :
   Les réponses du chatbot sont strictement informatives (`llm-derived` / lecture assistée). Elles ne modifient aucune exigence, aucune disposition et aucun énoncé, et ne confèrent jamais le statut `verified`.
2. **Invariant III (Le Silence n'est Jamais une Approbation)** :
   Le chatbot signale explicitement les clauses en statut `clarification_needed` ou `to_qualify`, ainsi que les zones d'ambiguïté, sans jamais conclure à une validation implicite.
3. **Invariant VIII (Non-Linéarité & Posture 1 : Appropriation Permanente)** :
   L'Invariant VIII stipule que tout architecte peut *à tout instant* réactiver la posture « Appropriation » pour se faire confirmer une exigence ou lever une incompréhension sans bloquer le reste du projet. Le raccourci clavier global matérialise directement cette capacité transverse.

## 4. Hors périmètre (Non-goals)

- Pas d'intégration Dify ni d'ajout de base vectorielle externe (Qdrant/Weaviate/Milvus) dans ce lot.
- Pas d'écriture automatique dans la base de délibération depuis le chat (pas de création directe de `Statement`, `Subject` ou de décision humaine ; le chat reste en lecture seule, avec éventuellement un lien de navigation vers la clause ou le sujet concerné).
- Pas de chat multi-projets ou sur corpus réglementaires externes non rattachés au projet (traitable ultérieurement via LLMOps).
