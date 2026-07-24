# Chups Analytics plugin — multi-stage Next.js 16 (standalone) image for Coolify.
# The publishing pipeline builds this with buildpack "dockerfile".

# ---- deps: install with a clean, reproducible lockfile --------------------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the standalone server ---------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run: minimal runtime ---------------------------------------------------
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Coolify/pipeline inject PORT; Next standalone honours it.
ENV PORT=8080
EXPOSE 8080

# Standalone output = server + only the deps it actually needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# manifest.json is read at runtime by GET /manifest.
COPY --from=build /app/manifest.json ./manifest.json
# db/schema.sql shipped so it can be applied against the plugin's DB.
COPY --from=build /app/db ./db

CMD ["node", "server.js"]
