<!-- markdownlint-disable MD033 MD041 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/server/src/assets/defaults/images/blog-poster-dark.png">
  <img alt="Kobato" src="packages/server/src/assets/defaults/images/blog-poster.png">
</picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily)
— the engine behind [且听书吟](https://yufan.me). It runs on React Router 8 (SSR), Hono, and oRPC,
with a built-in `/admin` console for everything.
Content is stored as **Lexical JSON** and authored through a built-in Lexical editor.

This repository is the complete product: public site, admin SPA, API, SSR renderer, install gate, and database migrations.
Deployments follow the headless topology — a **core** service (admin SSR, `/rpc` + `/api`, URL endpoints)
and an official **frontend** service (public SSR) that talks to core over HTTP, shipped as two SEA binaries
or two Docker containers. Content lives in an embedded **SQLite** database, analytics in an
embedded **DuckDB** sidecar. There is no database server to run, back up, or upgrade.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it documents the import
> boundaries, the package layout (`packages/*`, `apps/*`), the install contract, and the
> API permission matrix.

## Features

- Posts, pages, categories, tags, and comments — all managed in a built-in `/admin` console
- Lexical content model with a built-in Lexical editor (headings, lists, tables, code blocks with syntax highlighting, math, footnotes, images, and two-column layouts)
- Per-section settings (general, SEO, assets, comments, navigation, and more)
- First-party analytics with optional GeoIP enrichment
- Optional S3-compatible object storage for media

## Requirements

- Node.js 24+ for development (the SEA binary deployment needs no runtime); `pnpm run sea:build` requires Node.js 26

No database server: SQLite and DuckDB are embedded.

## Quick start

Install dependencies and start the dev servers (core on `4321`, the
public frontend on `4322`):

```bash
pnpm install
pnpm run dev
```

On first boot a `kobato.config.json` is created next to the core process
(gitignored) — fill in the two secrets (see [Configuration](#configuration)
for the file shape; env vars like `security__sessionSecret=…` also work
without a file). The database files create themselves under
`storage.data` (`./data` by default):

```jsonc
{
  "security": {
    "sessionSecret": "", // openssl rand -hex 32
    "encryptionKey": "", // openssl rand -hex 32
  },
}
```

Open `http://localhost:4321/admin/setup` and enter the setup token printed
in the console to create the admin account. Settings are seeded
automatically; the public site is served by the frontend process at
`http://localhost:4322`.

## Configuration

Most settings are managed in the admin dashboard. Infrastructure
configuration (database, secrets, data paths) lives in
**`kobato.config.json`** — always present, auto-created with defaults when
missing:

1. `--config <path>` / `-c <path>`
2. `<binary dir>/kobato.config.json` (SEA binary only)
3. `./kobato.config.json`
4. `~/.config/kobato.config.json`

The first existing file wins. Environment variables override file values
and are **written back into the file** — env is the injection mechanism,
the file converges to the effective configuration. Variable names are the
nested config path joined with a double underscore:

| Variable                     | Config path                 | Description                                                           |
| ---------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `storage__data`              | `storage.data`              | Root data directory for the databases, fonts, uploads, and MaxMind DB |
| `storage__database`          | `storage.database`          | SQLite content database file, default `<data>/kobato.db`              |
| `storage__analyticsDatabase` | `storage.analyticsDatabase` | DuckDB analytics sidecar file, default `<data>/analytics.duckdb`      |
| `security__sessionSecret`    | `security.sessionSecret`    | HMAC secret for cookies. Generate with `openssl rand -hex 32`         |
| `security__encryptionKey`    | `security.encryptionKey`    | AES-256-GCM key for encrypting secrets in the database                |
| `server__host`               | `server.host`               | Listen address, default `0.0.0.0`                                     |
| `server__port`               | `server.port`               | Listen port, default `4321`                                           |
| `storage__defaultFont`       | `storage.defaultFont`       | Optional fallback font file copied into `<data>/fonts`                |
| `server__loggingLevel`       | `server.loggingLevel`       | `debug` / `info` / `warn` / `error` / `silent`                        |

See `kobato.config.example.json` for the file shape.

## Testing

The suite is fully self-contained — integration tests run against a
shared in-memory SQLite database (temp files only for file-backed
flows) and temp-file DuckDB sidecars, so no Docker or services are
needed:

```bash
pnpm run test
```

For fast local feedback, run unit tests and snapshot tests only:

```bash
pnpm run test:unit
pnpm run test:snaps
```

## Deployment

### Docker Compose (recommended)

The root `docker-compose.yml` runs the headless topology as two services —
**core** (admin + API + the content SQLite and DuckDB sidecar files on the
`kobato_data` volume) and **frontend** (the official public SSR service,
pointing at core over the compose network). There is no database service.

Launch with randomly generated secrets:

```bash
SESSION_SECRET=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
docker compose up -d
```

Both services are reachable from the host: core on `4321`, the public
frontend on `4322` (override with `PORT` / `FRONTEND_PORT`). To make the
frontend's comment/read write-proxy trust chain work (visitor IP/UA and
comment-token forwarding), register a frontend key in the core admin and
pass its credentials:

```bash
KOBATO_FRONTEND_PRIVATE_KEY=… KOBATO_FRONTEND_KEY_ID=… docker compose up -d
```

Optional overrides (compose forwards them to the app env; they are written
into `/etc/kobato/config.json` on first boot and persist in the
`kobato_config` volume):

- `HOST` — default `0.0.0.0`
- `PORT` — default `4321` (core)
- `FRONTEND_PORT` — default `4322` (frontend)
- `LOG_LEVEL` — default `info`

Migrations run automatically at boot. Backups copy the content database
file (`/data/kobato.db`) — the admin console's backup job packs both
database files (content + the analytics sidecar) into a single
`.tar.gz` archive. Legacy content-only backups stay restorable.

### Build your own image

Use the included [`Dockerfile`](Dockerfile) (core) and
[`Dockerfile.frontend`](Dockerfile.frontend) to build locally:

```bash
docker build -t kobato .                       # core
docker build -f Dockerfile.frontend -t kobato-frontend .
docker run -p 4321:4321 \
  -e security__sessionSecret=... \
  -e security__encryptionKey=... \
  -v kobato_data:/data \
  -v kobato_config:/etc/kobato \
  kobato
docker run -p 4322:4322 -e CORE_API_URL=http://host.docker.internal:4321 kobato-frontend
```

### SEA binary (bare metal)

Every release ships two self-contained single executables — no Node.js
runtime, no `node_modules`, no database server:

- **`kobato`** — the core: admin SSR, `/rpc` + `/api`, URL endpoints. The server bundle,
  client assets, and database migrations are embedded in the binary; the native
  packages (sharp, canvas, DuckDB) are extracted to a cache directory on first run.
- **`kobato-frontend`** — the official public SSR service (no natives, no
  migrations); it needs a reachable core via `CORE_API_URL` and optionally
  `KOBATO_FRONTEND_PRIVATE_KEY` / `KOBATO_FRONTEND_KEY_ID` for the
  write-proxy trust chain.

Targets: `linux-x64`, `linux-arm64` (glibc), `darwin-arm64`,
`win32-x64`, and `win32-arm64`.

Download the archives for your platform (e.g. `kobato-linux-x64.tar.gz`
and `kobato-frontend-linux-x64.tar.gz`) and their `.sha256` sidecars from
the [latest release](../../releases/latest), verify, extract, and install:

```bash
sha256sum -c kobato-linux-x64.tar.gz.sha256
tar -xzf kobato-linux-x64.tar.gz
install -m 0755 kobato-linux-x64 /usr/local/bin/kobato
kobato --version          # prints the baked-in version
```

Configure it through `kobato.config.json` (see [Configuration](#configuration)):
on first boot the binary creates it next to itself with defaults — edit the
file, or pass `__`-style environment variables once and let them be written
into the file. `storage.data` defaults to `./data` relative to the working
directory, so set it explicitly for a system install. The natives cache
lands in `$XDG_CACHE_HOME/kobato` (override with `KOBATO_CACHE_DIR`).
Database migrations run automatically at boot; on first boot, open
`/admin/setup`.

A minimal systemd unit (core; run the frontend binary the same way with
`CORE_API_URL` and, optionally, the frontend credentials):

```ini
[Unit]
Description=Kobato blog CMS (core)
After=network-online.target

[Service]
Type=simple
# Generate real secrets with e.g. `openssl rand -hex 32` — the schema
# requires both ≥ 32 chars and encryptionKey ≥ 10 distinct characters.
Environment=security__sessionSecret=change-me
Environment=security__encryptionKey=change-me
Environment=storage__data=/var/lib/kobato
ExecStart=/usr/local/bin/kobato
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

The core binary can update itself: in the admin console, open the version
dialog → 检查更新 → 立即更新. It downloads the release asset for the current
platform, verifies the sha256, swaps the executable in place (the previous
one is kept as `kobato.bak` for manual rollback), and restarts. The
frontend binary does not self-update — roll it with your deployment
orchestration instead. Self-update is intentionally unavailable inside
Docker — upgrade containers by pulling a new image instead.

### Zeabur

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/TK7XLK?referralCode=syhily)

## Scripts

```bash
pnpm run dev         # development servers (core :4321 + frontend :4322)
pnpm run build       # production build
pnpm run test        # run tests
pnpm run test:unit   # run unit tests only
pnpm run test:snaps  # run snapshot tests only
pnpm run fmt         # formatting
pnpm run lint        # lint
pnpm run type        # TypeScript check
pnpm run db:gen      # generate Drizzle migrations
```

## Design assets

[`kobato.sketch`](kobato.sketch) is a Sketch template for the kobato favicon, logo, and branding assets.

## License

[MIT](LICENSE)
