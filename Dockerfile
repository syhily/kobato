FROM node:24-alpine AS build
WORKDIR /app

# Enable and activate the pnpm version pinned in package.json.
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# Install dependencies first so source changes don't invalidate the layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN NODE_ENV=production pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app

# tini — PID 1 init for proper signal handling.
# postgresql-client — for pg_dump / pg_restore in backup jobs.
RUN apk add --no-cache tini postgresql-client

# Install runtime native deps from the lockfile so production images use the
# exact versions tested locally, not the latest matching semver range.
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts keeps the root `prepare` script from running `npx husky`
# in a stage that has no devDependencies and no .git directory. The native
# dependencies that actually need postinstall builds are rebuilt explicitly.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts
RUN pnpm rebuild @napi-rs/canvas sharp

COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4321/health || exit 1

# Ensure the data volume mount is writable by the non-root runtime user.
# The app creates subdirectories (fonts, storage, analytics, audit, maxmind)
# under DATA_PATH at startup.
RUN mkdir -p /data && chown -R node:node /data

USER node

ENTRYPOINT ["tini", "--"]
CMD ["node", "./build/server/index.js"]
