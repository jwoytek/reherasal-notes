# =============================================================================
# Ovature Application Dockerfile
# =============================================================================
# Multi-stage build:
#   1. Builder stage: Install dependencies and build the Vite frontend
#   2. Production stage: Minimal runtime with Express server
#
# Usage:
#   docker build -t ovature-app -f deploy/docker/Dockerfile .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source files and build
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy Netlify functions (these are the API handlers)
COPY --from=builder /app/netlify ./netlify

# Copy the Express server wrapper
COPY deploy/docker/server.cjs ./server.cjs

# Copy package files and install production dependencies only
COPY package*.json ./
COPY netlify/functions/package*.json ./netlify/functions/

# Install production dependencies for both main app and functions
RUN npm ci --omit=dev && \
    cd netlify/functions && npm ci --omit=dev && \
    npm cache clean --force

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "server.cjs"]
