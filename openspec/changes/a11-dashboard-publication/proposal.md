# Proposition : Tableau de Bord KB, Publication Scellée et Porte G7 (Lot A11 - Issue #6)

## 1. Contexte & Problématique
La gouvernance décentralisée de la base de connaissances d'entreprise a mis en place les profils experts (A6), la boîte de revue et les notifications (A7), l'atelier de création de clauses (A8), l'ingestion de référentiels (A10) et le banc d'évaluation (A9).
Il manque désormais la tour de contrôle finale permettant aux architectes en chef et curateurs KB de :
1. **Visualiser l'état de santé global de la doctrine** : volume d'actifs par catégorie, couverture des référentiels réglementaires, délais de traitement des revues et rappel réel sur le jeu de test.
2. **Détecter et avertir en cas de mode stockage éphémère** : affichage pérenne d'un bandeau d'alerte lorsque le serveur LLMOps tourne en mode démo (`storage.mode = "demo"` ou non persistant) afin de prévenir toute perte de données.
3. **Valider la Porte G7 et Sceller la Publication** : promotion formelle des actifs acceptés, vérification stricte des prérequis constitutionnels (zéro revue critique en retard, rappel benchmark $\ge 80\%$, aucun conflit ouvert), calcul de l'empreinte SHA-256 et émission d'un instantané immuable (`snapshot-YYYY-MM-DD-<hash>`).
4. **Orchestrer des Campagnes d'Enrichissement Ciblées** : identification des lacunes doctrinales et assignation de campagnes horodatées aux experts du domaine.

## 2. Objectifs Mesurables
- Route `GET /api/knowledge/health` agrégeant les indicateurs de santé, l'état de persistance et l'évaluation de la Porte G7.
- Route `GET` et `POST /api/knowledge/publications` réservée aux rôles `kb:admin` et `kb:maintain` (403 Forbidden sinon) avec blocage 409 si les conditions de la Porte G7 ne sont pas réunies.
- Empreinte cryptographique SHA-256 scellée et journal d'évolution (*changelog*) archivé pour chaque publication.
- Gestion des campagnes d'enrichissement ciblées (`GET`, `POST`, `PATCH /api/knowledge/campaigns`).
- Interface `/kb/dashboard` claire, responsive et intégrée à la navigation principale.
- Validation des 4 portes de qualité (`npm run verify`).
