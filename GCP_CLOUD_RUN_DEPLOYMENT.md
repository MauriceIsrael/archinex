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

## 2. Déploiement en une seule commande

Depuis la racine du projet `archinex`, lancez :

```bash
gcloud run deploy archinex \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,JWT_SECRET="archinex-remote-validation-key-$(openssl rand -hex 16 2>/dev/null || echo secret)"
```

### Ce qui se passe automatiquement :
1. Google Cloud Build envoie les sources et construit l'image Docker multi-stage via `Dockerfile`.
2. L'image est stockée dans Artifact Registry.
3. Le conteneur est instancié sur Cloud Run.
4. Au démarrage, `docker-entrypoint.sh` initialise le schéma SQLite Prisma et applique le seed de démarrage.
5. Une URL publique HTTPS sécurisée vous est retournée (ex: `https://archinex-xxxxxx-ew.a.run.app`).

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
