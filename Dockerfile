# Stride - Student Financial Health Navigator
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:20-alpine AS builder

# Install build dependencies for native modules (DuckDB)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install dependencies (with native module compilation)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the frontend
RUN pnpm build:frontend

# Stage 2: Production
FROM node:20-alpine AS production

# Install runtime dependencies for DuckDB
RUN apk add --no-cache libc6-compat libstdc++

WORKDIR /app

# Install pnpm for production
RUN npm install -g pnpm@10

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install production dependencies only
# Note: prepare script is conditional, skips husky if not installed
RUN pnpm install --frozen-lockfile --prod

# Copy built output from builder stage
COPY --from=builder /app/packages/frontend/.output ./packages/frontend/.output

# Create data directory for DuckDB
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV DUCKDB_PATH=/app/data/stride.db

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the server
CMD ["node", "packages/frontend/.output/server/index.mjs"]
