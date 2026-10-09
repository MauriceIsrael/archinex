# Déploiement d'Archinex sur Google Cloud Run (GCP)

Ce guide permet de déployer Archinex sur votre compte GCP pour pouvoir tester, manipuler et valider l'interface utilisateur à distance sans restriction de `localhost`.

---

## 1. Prérequis sur votre poste

1. **Google Cloud SDK (`gcloud`)** installé et authentifié :
   ```bash
   gcloud auth login
   ```
2. **Projet GCP configuré** :
   ```bash
   gcloud config set project <VOTRE_PROJECT_ID>
   ```
3. **Services GCP activés** (une seule fois par projet) :
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

---

## 2. Déploiement Cloud Run avec connexion LLMOps

Depuis la racine du projet `archinex`, lancez :

```bash
gcloud run deploy archinex \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300s \
  --set-env-vars NODE_ENV=production,DATABASE_URL="file:/app/prisma/dev.db",LLMOPS_BASE_URL="https://llmops-mcp-server-344571265365.europe-west1.run.app",LLMOPS_ALLOWED_HOSTS="llmops-mcp-server-344571265365.europe-west1.run.app",LLMOPS_ENGAGEMENT="nordwave-mcx-2027" \
  --set-secrets JWT_SECRET=archinex-jwt-secret:latest,LLMOPS_AUTH_TOKEN=archinex-llmops-service-token:latest
```

> **Le jeton `demo-public-2026-08` ne convient plus.** Il n'a aucun scope de gouvernance : `/me`, la boîte de revue, les
> évaluations, les référentiels, la promotion et la santé répondraient `403`. `LLMOPS_AUTH_TOKEN` doit être le **jeton de
> service** déclaré côté LLMOps dans le secret `llmops-engagement-tokens` (variable `ENGAGEMENT_TOKENS`), avec les scopes
> de gouvernance **et** l'engagement :
>
> ```
> demo-public-2026-08:nordwave-mcx-2027;<jeton-de-service>:kb:review,kb:delegate,nordwave-mcx-2027
> ```
>
> Le jeton de service ne quitte jamais le serveur Archinex (secret Cloud Run, jamais dans le bundle client).

### Règle « air-gap » et liste d'hôtes autorisés

Par défaut, le client LLMOps refuse tout hôte hors réseau local (dont `*.run.app`) : c'est la protection des RFP. Pour un
LLMOps déployé sur Cloud Run, **autorisez-le nommément** avec `LLMOPS_ALLOWED_HOSTS` (hôtes séparés par des virgules ;
`*.suffixe` pour tous les sous-domaines d'un suffixe, jamais le domaine nu). Un hôte absent de la liste reste bloqué ; ne
listez que le service LLMOps de l'organisation. Sans cette variable, tous les écrans de gouvernance répondent « enclave locale
non configurée ».

### Délais

Les délais sont **par opération** (`src/lib/server/llmops/client.ts`) : lectures moteur historiques 1,5 s (au-delà, LLMOps est déclaré injoignable),
lectures de gouvernance 15 s, soumission/revue/simulation/contrôles à blanc 30 s, exécution d'évaluation 60 s, upload de
référentiel 150 s, application d'une ingestion, promotion et publication 300 s. `LLMOPS_TIMEOUT_MS` impose un délai
**uniforme** (diagnostic) ; la requête Cloud Run est portée à 300 s pour la même raison. Un dépassement de délai à la soumission
d'un candidat n'invente jamais d'identifiant : l'erreur invite à vérifier la file avant de renvoyer.

### Côté LLMOps (prérequis)

Instance Cloud SQL, secrets `llmops-engagement-tokens` et `llmops-governance-db-url`, e-mails et rôles réels des experts dans
`data/kb/owners.yaml` : voir `docs/deployment.md` §5 du dépôt LLMOps. Un expert sans e-mail enregistré reçoit `403`.

### Instance active en production :
- **URL Archinex** : `https://archinex-344571265365.europe-west1.run.app`
- **Serveur LLMOps connecté** : `https://llmops-mcp-server-344571265365.europe-west1.run.app` (Région `europe-west1`)
- **Vérification de synchronisation en direct** : `GET https://archinex-344571265365.europe-west1.run.app/api/llmops?action=sync` (statut : `live`)

---

## 3. Comptes pré-configurés pour la délibération

Une fois sur l'URL Cloud Run, connectez-vous avec :

- **Lead Architect / Administrateur :**
  - Email : `admin@example.com`
  - Mot de passe : `admin123`
  - Rôle : `lead_architect` (droits de scellement L3/L4/L5, validation Tour 8 & 11)

- **Architecte Expert :**
  - Email : `user@example.com`
  - Mot de passe : `user123`
  - Rôle : `infra_expert_architect` / `contributor`

---

## 4. Mise à jour après modifications

À chaque nouvelle fonctionnalité ou nouveau lot validé par les tests :

```bash
gcloud run deploy archinex --source . --region europe-west1
```
Le déploiement est sans interruption de service (rolling update automatique).


## Modèle d'embeddings (similarité sémantique)

Archinex calcule les vecteurs (LLMOps n'embarque aucun modèle). En production, `toy-bow` est refusé : définir
`EMBEDDING_MODEL` et `EMBEDDING_OLLAMA_URL` (serveur Ollama joignable depuis Cloud Run, par exemple via un
connecteur VPC) ; `LLMOPS_ALLOWED_HOSTS` ne concerne que LLMOps. Inventaire des modèles :
`OLLAMA_URL=… node scripts/ollama-models.mjs`. Détails : `docs/llmops-integration.md` §7 bis.
