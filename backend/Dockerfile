# ==========================================
# Family Feud Backend - Production Dockerfile
# Multi-stage build for optimal image size & security
# ==========================================

# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL required by Prisma engine on Alpine
RUN apk add --no-cache openssl

# Copy package descriptors
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy Prisma schema and generate Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build TypeScript to dist/
COPY src ./src
RUN npm run build

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies (OpenSSL for Prisma)
RUN apk add --no-cache openssl dumb-init

ENV NODE_ENV=production
ENV PORT=5000

# Copy package manifests and install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy compiled JavaScript output
COPY --from=builder /app/dist ./dist

# Use non-root node user for container security
USER node

EXPOSE 5000

# Use dumb-init as PID 1 to handle process signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/server.js"]

