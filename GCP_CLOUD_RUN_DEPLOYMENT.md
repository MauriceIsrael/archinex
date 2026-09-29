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
  --set-env-vars NODE_ENV=production,DATABASE_URL="file:/app/prisma/dev.db",JWT_SECRET="archinex-remote-gcp-validation-secret-key-2026",LLMOPS_BASE_URL="https://llmops-mcp-server-344571265365.europe-west1.run.app",LLMOPS_AUTH_TOKEN="demo-public-2026-08",LLMOPS_ENGAGEMENT="nordwave-mcx-2027"
```

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
