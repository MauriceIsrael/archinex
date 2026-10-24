# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY scripts/patch-adapter-node.mjs ./scripts/
RUN npm ci --legacy-peer-deps

COPY . .

# Generate Prisma Client & Build SvelteKit application
ENV DATABASE_URL="file:/app/prisma/dev.db"
RUN npx svelte-kit sync && npx prisma generate
RUN npm run build
RUN npm prune --production --legacy-peer-deps

# ── Stage 2: Production Runner ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init libstdc++

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/prisma/dev.db"

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/lib/server/dbUrl.ts /app/src/lib/server/prismaFactory.ts ./src/lib/server/
COPY --from=builder /app/build ./build
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
