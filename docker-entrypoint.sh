#!/bin/sh
set -e

echo "🚀 Starting Archinex Container on port ${PORT:-8080}..."

# Ensure directory for SQLite exists
mkdir -p /app/prisma

# Push Prisma schema to SQLite database and seed initial data
echo "📦 Running Prisma DB push..."
npx prisma db push --skip-generate --accept-data-loss

echo "🌱 Running Seed..."
npx tsx prisma/seed.ts || true

echo "✨ Database initialized. Starting SvelteKit server..."
exec node build/index.js
