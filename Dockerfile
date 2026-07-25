# NOTE: glibc (bookworm) base, not alpine — postject 1.0.0-alpha.6 corrupts
# the .gnu.hash table of the official musl node binary when injecting the
# SEA blob (inserts a third PT_LOAD segment and shifts the first page), so
# dlopen'd native addons (.node) can no longer resolve napi_* symbols from
# the main program. On the glibc binary the injected result is intact.
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Enable and activate the pnpm version pinned in package.json.
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

# Install dependencies first so source changes don't invalidate the layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Build the SEA single executable: react-router build + tsdown bundle + SEA
# blob + postject injection (see scripts/sea/build.ts). The copied node
# binary and the sharp / @napi-rs/canvas platform packages pnpm installs
# here are glibc builds, matching the debian runtime stage below.
COPY . .
RUN pnpm run sea:build

FROM debian:bookworm-slim AS runtime

# tini — PID 1 init for proper signal handling.
# postgresql-client-18 — for pg_dump / psql in backup jobs. bookworm only
# ships client 15 (pg_dump refuses newer servers), so use the PGDG repo —
# the same source the official postgres images use. Matches the pg18
# client the old alpine-based image shipped.
# libstdc++6 — the official Node binary the SEA executable is copied from
# links against it dynamically; debian:bookworm-slim doesn't ship it.
# wget — for the HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -qO /usr/share/keyrings/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo 'deb [signed-by=/usr/share/keyrings/pgdg.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 tini libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user. uid/gid 1000 matches the `node` user of the old
# node-based image so existing /data volumes stay writable.
RUN groupadd --gid 1000 kobato && useradd --uid 1000 --gid kobato --create-home --shell /usr/sbin/nologin kobato

# The runtime image contains no node and no node_modules — just the binary.
COPY --from=build /app/dist-sea/kobato /usr/local/bin/kobato
COPY --from=build /app/dist-sea/kobato.sha256 /usr/local/bin/kobato.sha256

ENV NODE_ENV=production
ENV server__host=0.0.0.0
ENV server__port=4321

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4321/health || exit 1

# Ensure the data volume mount is writable by the non-root runtime user.
# The app creates subdirectories (fonts, storage, analytics, audit, maxmind)
# under DATA_PATH at startup. /etc/kobato holds the converged config file
# (created on first boot, env overrides written back — see
# src/server/infra/config.ts).
RUN mkdir -p /data /etc/kobato && chown -R kobato:kobato /data /etc/kobato

USER kobato

ENTRYPOINT ["tini", "--"]
CMD ["kobato", "--config", "/etc/kobato/config.json"]
