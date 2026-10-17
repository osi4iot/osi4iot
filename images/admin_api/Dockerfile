# ---------- Stage 1: build ----------
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.11.2
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
 && pnpm prune --prod

# ---------- Stage 2: execution ----------
FROM node:24-alpine
ENV NODE_ENV=production

RUN apk add --no-cache tzdata curl ca-certificates \
 && update-ca-certificates

WORKDIR /app
RUN mkdir -p /app/logs && chown node:node /app/logs

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

USER node
EXPOSE 3200
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD curl --fail --insecure http://localhost:3200/health || exit 1
CMD ["node", "build/index.js"]