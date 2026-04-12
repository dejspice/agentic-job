FROM node:20-slim AS builder

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files first for layer caching
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY prisma ./prisma/
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/

# Install all deps (workspace root)
RUN npm ci --ignore-scripts

# Copy source
COPY packages/core/src ./packages/core/src
COPY packages/api/src ./packages/api/src

# Generate Prisma client + build TypeScript
RUN npx prisma generate
RUN npm run build

# --- Production image ---
FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/core/dist ./packages/core/dist/
COPY --from=builder /app/packages/api/dist ./packages/api/dist/

# Regenerate Prisma client for production image
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "packages/api/dist/start.js"]
