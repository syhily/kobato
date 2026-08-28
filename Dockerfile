# NOTE: glibc (bookworm) base, not alpine. The historical blocker was a
# postject .gnu.hash corruption bug on the official musl node binary;
# postject is gone (`--build-sea` is the only injector now), but musl
# remains unverified for SEA injection — stay on the known-good glibc base.
FROM node:26-bookworm-slim AS build
WORKDIR /app

# pnpm, matching the packageManager field (11.24.0). Node 25+ images no
# longer bundle Corepack, so install pnpm globally from npm instead.
RUN npm install -g pnpm@11.24.0

# patchelf — the SEA build rewrites the sharp addon's rpath to `$ORIGIN`
# so the extracted flat dir is self-contained (see scripts/sea/assets.ts).
RUN apt-get update \
    && apt-get install -y --no-install-recommends patchelf \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so source changes don't invalidate the layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Build the SEA single executable: react-router build + vite bundle +
# `--build-sea` injection (see scripts/sea/build.ts). The copied node
# binary and the sharp / @napi-rs/canvas platform packages pnpm installs
# here are glibc builds, matching the debian runtime stage below.
COPY . .
RUN pnpm run sea:build

FROM debian:bookworm-slim AS runtime

# tini — PID 1 init for proper signal handling.
# libstdc++6 + libatomic1 — the official Node 26 binary the SEA executable
# is copied from links against both dynamically; debian:bookworm-slim
# ships neither.
# wget — for the HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget tini libstdc++6 libatomic1 \
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
# under `storage.data` at startup. /etc/kobato holds the converged config
# file (created on first boot, env overrides written back — see
# src/server/infra/config.ts).
RUN mkdir -p /data /etc/kobato && chown -R kobato:kobato /data /etc/kobato

USER kobato

ENTRYPOINT ["tini", "--"]
CMD ["kobato", "--config", "/etc/kobato/config.json"]
