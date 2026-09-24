# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Only production deps in the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Compiled output + assets the runtime reads at start (word bank, migrations).
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY src/data ./dist/data
# Privacy / Terms / delete-account pages served at /legal/* (routes/legal.ts).
COPY legal ./legal

# Run as the built-in non-root user.
USER node
EXPOSE 4000

# Basic container healthcheck against the readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
