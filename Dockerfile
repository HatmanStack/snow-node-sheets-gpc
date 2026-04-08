# Pinned Node 20 LTS Alpine by digest for reproducible, immutable builds.
# Bump manually when patching: docker pull node:20-alpine && docker inspect ...
FROM node:20-alpine@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c

WORKDIR /usr/src/app

# Install only production deps with a deterministic lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source. .dockerignore excludes secrets, tests, VCS.
COPY index.js ./
COPY src ./src
COPY public ./public

# Drop privileges.
USER node

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "index.js"]
