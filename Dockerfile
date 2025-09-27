# Production Dockerfile for Email Assistant
FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies separately for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Healthcheck (simple ping)
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/ping || exit 1

CMD ["node","server.js"]
