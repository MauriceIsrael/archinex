#!/bin/sh
set -e

echo "🚀 Starting Archinex Container on port ${PORT:-8080}..."

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
