<!-- markdownlint-disable MD033 MD041 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/server/assets/defaults/images/blog-poster-dark.png">
  <img alt="Kobato" src="src/server/assets/defaults/images/blog-poster.png">
</picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily)
— the engine behind [且听书吟](https://yufan.me). It runs on React Router 8 (SSR), Hono, and oRPC,
with a built-in `/admin` console for everything.
Content is stored as **PortableText** and authored through a Tiptap editor that round-trips losslessly to the wire format.

This repository is the complete product: public site, admin SPA, API, SSR renderer, install gate, and database migrations.
The whole deployment is one process — content lives in an embedded **SQLite** database, analytics in an
embedded **DuckDB** sidecar. There is no database server to run, back up, or upgrade.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it documents the import
> boundaries, the four-layer `src/server/` graph, the install contract, and the
> API permission matrix.

## Features

- Posts, pages, categories, tags, and comments — all managed in a built-in `/admin` console
- PortableText content model with a Tiptap editor
- Per-section settings (general, SEO, assets, comments, navigation, and more)
- First-party analytics with optional GeoIP enrichment
- Optional S3-compatible object storage for media

## Requirements

- Node.js 24+ (development and building from source only — the SEA binary deployment needs no runtime)

No database server: SQLite and DuckDB are embedded.

## Quick start

Install dependencies and start the dev server:

```bash
pnpm install
pnpm run dev
```

On first boot a `kobato.config.json` is created in the repo root
(gitignored) — fill in the two secrets (see [Configuration](#configuration)
for the file shape). The database files create themselves under
`storage.data` (`./data` by default):

```jsonc
{
  "security": {
    "sessionSecret": "", // openssl rand -hex 32
    "encryptionKey": "", // openssl rand -hex 32
  },
}
```

Open `/admin/setup` and enter the setup token printed in the console to
create the admin account. Settings are seeded automatically.

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

See `kobato.config.example.json` for the annotated file shape.

## Testing

The suite is fully self-contained — integration tests run against
per-worker SQLite/DuckDB temp files, so no Docker or services are needed:

```bash
pnpm run test
```

For fast local feedback, run unit tests and snapshot tests only:

```bash
pnpm run test:fast
```

## Deployment

### Docker Compose (recommended)

The root `docker-compose.yml` runs the app as a single container — the
SQLite content database and the DuckDB analytics sidecar are embedded
files on the `kobato_data` volume, so there is no database service.

Launch with randomly generated secrets:

```bash
SESSION_SECRET=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
docker compose up -d
```

Optional overrides (compose forwards them to the app env; they are written
into `/etc/kobato/config.json` on first boot and persist in the
`kobato_config` volume):

- `HOST` — default `0.0.0.0`
- `PORT` — default `4321`
- `LOG_LEVEL` — default `info`

Migrations run automatically at boot. Backups copy the content database
file (`/data/kobato.db`) — the admin console's backup job does exactly
that; the analytics sidecar is expendable telemetry and excluded.

### Build your own image

Use the included [`Dockerfile`](Dockerfile) to build locally:

```bash
docker build -t kobato .
docker run -p 4321:4321 \
  -e security__sessionSecret=... \
  -e security__encryptionKey=... \
  -v kobato_data:/data \
  -v kobato_config:/etc/kobato \
  kobato
```

### SEA binary (bare metal)

Every release also ships a self-contained single executable — no Node.js
runtime, no `node_modules`, no database server. The server bundle, client
assets, and database migrations are embedded in the binary; the native
packages (sharp, canvas, DuckDB) are extracted to a cache directory on
first run. Targets: glibc Linux, x64 and arm64.

Download `kobato-linux-x64.tar.gz` (or `kobato-linux-arm64.tar.gz`) and its
`.sha256` sidecar from the [latest release](../../releases/latest), verify,
extract, and install:

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

A minimal systemd unit:

```ini
[Unit]
Description=Kobato blog CMS
After=network-online.target

[Service]
Type=simple
Environment=security__sessionSecret=change-me
Environment=security__encryptionKey=change-me
Environment=storage__data=/var/lib/kobato
ExecStart=/usr/local/bin/kobato
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

The binary can update itself: in the admin console, open the version
dialog → 检查更新 → 立即更新. It downloads the release asset for the current
platform, verifies the sha256, swaps the executable in place (the previous
one is kept as `kobato.bak` for manual rollback), and restarts. Self-update
is intentionally unavailable inside Docker — upgrade containers by pulling
a new image instead.

### Zeabur

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/TK7XLK?referralCode=syhily)

## Scripts

```bash
pnpm run dev         # development server
pnpm run build       # production build
pnpm run test        # run tests
pnpm run test:fast   # run unit and snapshot tests only
pnpm run fmt         # formatting
pnpm run lint        # lint
pnpm run type        # TypeScript check
pnpm run db:gen      # generate Drizzle migrations
pnpm run docker:dev  # start the legacy Postgres dev stack (unused by the SQLite dev flow)
```

## Design assets

[`kobato.sketch`](kobato.sketch) is a Sketch template for the kobato favicon, logo, and branding assets.

## License

[MIT](LICENSE)
