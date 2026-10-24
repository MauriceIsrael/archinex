#!/bin/sh
set -e

echo "🚀 Starting Archinex Container on port ${PORT:-8080}..."

# Validation de sécurité du secret JWT (#141)
# En production, refuser de démarrer si JWT_SECRET est absent, < 32 caractères,
# ou égal à une valeur publique connue (Dockerfile, développement, exemple, CI).
if [ "${NODE_ENV:-production}" = "production" ]; then
  KNOWN_PUBLIC_SECRETS="
archinex-super-secret-production-jwt-key-2026
dev-secret-change-me-in-production-min-32-chars!!
change-me-min-32-chars-random-string-000
archinex-super-secret-key-change-in-production
ci-only-secret-not-used-anywhere-else-0123456789
"

  if [ -z "${JWT_SECRET:-}" ]; then
    echo "❌ [SÉCURITÉ] Variable JWT_SECRET manquante en production." >&2
    echo "   JWT_SECRET est obligatoire pour signer les jetons de session (HS256)." >&2
    echo "   Générez un secret aléatoire fort d'au moins 32 caractères avec :" >&2
    echo "     openssl rand -hex 32" >&2
    echo "   Puis transmettez-le au conteneur (ex. Cloud Run : --set-secrets JWT_SECRET=archinex-jwt-secret:latest)." >&2
    exit 1
  fi

  if [ "${#JWT_SECRET}" -lt 32 ]; then
    echo "❌ [SÉCURITÉ] JWT_SECRET trop court (${#JWT_SECRET} caractères, minimum 32 requis)." >&2
    echo "   Générez un secret aléatoire fort d'au moins 32 caractères avec :" >&2
    echo "     openssl rand -hex 32" >&2
    exit 1
  fi

  for known in $KNOWN_PUBLIC_SECRETS; do
    if [ "$JWT_SECRET" = "$known" ]; then
      echo "❌ [SÉCURITÉ] JWT_SECRET utilise une valeur publique connue et non sécurisée ('$known')." >&2
      echo "   Cette clé publique permettrait de forger des jetons d'administration sans mot de passe." >&2
      echo "   Générez un secret aléatoire propre d'au moins 32 caractères avec :" >&2
      echo "     openssl rand -hex 32" >&2
      echo "   Puis injectez-le via votre gestionnaire de secrets (ex. Cloud Run : --set-secrets JWT_SECRET=archinex-jwt-secret:latest)." >&2
      exit 1
    fi
  done
fi

# Ensure directory for SQLite exists
mkdir -p /app/prisma

# Push Prisma schema to SQLite database
echo "📦 Running Prisma DB push..."
npx prisma db push --accept-data-loss

# Premier administrateur : créé seulement si aucun n'existe et si ARCHINEX_BOOTSTRAP_ADMIN_EMAIL est défini
# (ARCHINEX_BOOTSTRAP_ADMIN_PASSWORD facultatif : sinon un mot de passe est généré et affiché une fois dans ce journal).
# Les autres comptes se créent depuis l'interface d'administration (/admin).
echo "👤 Checking initial administrator..."
npx tsx prisma/bootstrap-admin.ts

# Jeu de démonstration (comptes @archinex.local / @example.com aux mots de passe PUBLICS : admin123, user123).
# Jamais par défaut : à n'activer que sur une instance de démonstration sans donnée réelle.
if [ "${ARCHINEX_SEED_DEMO:-}" = "1" ]; then
  echo "⚠️  ARCHINEX_SEED_DEMO=1 : comptes de démonstration à mots de passe publics. Ne pas exposer de données réelles."
  npx tsx prisma/seed.ts
fi

echo "✨ Database initialized. Starting SvelteKit server..."
exec node build/index.js
