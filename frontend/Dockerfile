# ==========================================
# Family Feud Frontend - Production Dockerfile
# Multi-stage build with Vite & Nginx Alpine
# ==========================================

# Stage 1: Build Application
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY index.html ./

# Install all dependencies
RUN npm ci

# Copy public static assets and source code, then build production bundle
COPY public ./public
COPY src ./src
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx Alpine
# ==========================================
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration with SPA routing & reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

