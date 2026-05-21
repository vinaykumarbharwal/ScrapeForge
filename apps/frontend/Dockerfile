# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root configurations for workspaces
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies
RUN npm ci

# Copy frontend source and build configurations
COPY apps/frontend/ ./apps/frontend/
WORKDIR /app/apps/frontend
RUN npm run build

# Stage 2: Production Nginx stage
FROM nginx:stable-alpine
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Expose Nginx port
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
