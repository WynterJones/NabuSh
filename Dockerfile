# Nabu — one image, two roles.
#
# The web service and the worker service are the same image started with a
# different NABU_MODE. Shipping one artefact is what keeps the Railway template
# to a single private-image credential and the upgrade path to a single tag bump.
#
# Deliberately NOT using Next's standalone output: the worker needs the TypeScript
# sources and the full dependency tree at runtime, and carrying two copies of
# node_modules to save a couple of hundred megabytes is a bad trade for a
# self-hosted product where "it just works after upgrade" is the whole promise.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders so module-level config checks pass while Next collects page data.
# ARG (not ENV) so these never persist into the final image's metadata — the
# real values arrive at runtime from Railway.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ARG NABU_SECRET="build-time-placeholder-secret"
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json next.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh \
  && addgroup -g 1001 -S nabu \
  && adduser -u 1001 -S nabu -G nabu \
  && chown -R nabu:nabu /app

USER nabu
EXPOSE 3000

# tini reaps zombies and forwards SIGTERM, so the worker's graceful drain of
# in-flight runs actually fires on a Railway redeploy.
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
