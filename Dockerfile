FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS web
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
CMD ["npm", "start"]

FROM base AS codex-bridge
RUN mkdir -p /var/lib/oots-codex && chown node:node /var/lib/oots-codex && chmod 0700 /var/lib/oots-codex
USER node
ENV CODEX_AUTH_DIR=/var/lib/oots-codex BRIDGE_HOST=0.0.0.0 BRIDGE_PORT=4101
CMD ["node", "--import", "tsx", "server/bridge.ts"]
