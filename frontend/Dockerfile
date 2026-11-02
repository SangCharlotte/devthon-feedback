# One Dockerfile, several stages ("multi-stage build"):
#   dev     - hot-reloading dev server, used by docker-compose.yml
#   runner  - the small production image (the default: it's the last stage)
# Only the final stage ends up in the image; build tools stay behind in earlier ones.

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- dev ----------
FROM base AS dev
# Run as the image's built-in unprivileged "node" user, not root.
RUN chown node:node /app
USER node
# Install dependencies first so this layer is cached between code changes.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN mkdir -p .next
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- production build ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js bakes the /api rewrite target into the build. "backend" is the Compose
# service name in every environment, so one image works for staging AND production.
ARG API_URL_INTERNAL=http://backend:8000
ENV API_URL_INTERNAL=$API_URL_INTERNAL
RUN npm run build

# ---------- production runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# "standalone" output = server.js + only the node_modules it actually uses.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Generous timeout: on a busy small server even starting the probe can take seconds.
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --start-interval=2s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
