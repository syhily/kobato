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
- TimescaleDB 17+

## Quick start

Docker is recommended for local development.

```bash
pnpm run docker:dev
```

Install dependencies and start the dev server:

```bash
pnpm install
pnpm run dev
```

On first boot a `kobato.config.json` is created in the repo root
(gitignored) — edit it to point at the dev database and generate the two
secrets (see [Configuration](#configuration) for the file shape):

```jsonc
{
  "database": { "url": "postgres://postgres:postgres@localhost:5433/kobato" },
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

| Variable                       | Config path                   | Description                                                      |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------- |
| `database__url`                | `database.url`                | PostgreSQL connection URL                                        |
| `security__sessionSecret`      | `security.sessionSecret`      | HMAC secret for cookies. Generate with `openssl rand -hex 32`    |
| `security__encryptionKey`      | `security.encryptionKey`      | AES-256-GCM key for encrypting secrets in the database           |
| `storage__data`                | `storage.data`                | Root data directory for fonts, dead-letter files, and MaxMind DB |
| `server__host`                 | `server.host`                 | Listen address, default `0.0.0.0`                                |
| `server__port`                 | `server.port`                 | Listen port, default `4321`                                      |
| `database__poolMax`            | `database.poolMax`            | Postgres pool size, default `20`                                 |
| `database__statementTimeoutMs` | `database.statementTimeoutMs` | Per-query timeout, default `30000`                               |
| `database__restoreRole`        | `database.restoreRole`        | Optional low-privilege role used during restore                  |
| `storage__defaultFont`         | `storage.defaultFont`         | Optional fallback font file copied into `<data>/fonts`           |
| `server__loggingLevel`         | `server.loggingLevel`         | `debug` / `info` / `warn` / `error` / `silent`                   |

See `kobato.config.example.json` for the annotated file shape.

## Testing

For fast local feedback without Docker, run unit tests and snapshot tests only:

```bash
pnpm run test:fast
```

Full coverage uses an ephemeral docker compose stack (tmpfs-backed Postgres that is discarded on stop):

```bash
pnpm run docker:test
pnpm run test
```

## Deployment

### Docker Compose (recommended)

The root `docker-compose.yml` runs the app with TimescaleDB on an isolated internal network.
The database is not exposed to the host.

Launch the stack with randomly generated secrets:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 16) \
SESSION_SECRET=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
docker compose up -d
```

Optional overrides (compose forwards them to the app env; they are written
into `/etc/kobato/config.json` on first boot and persist in the
`kobato_config` volume):

- `HOST` — default `0.0.0.0`
- `PORT` — default `4321`
- `DB_POOL_MAX` — default `20`
- `DB_STATEMENT_TIMEOUT_MS` — default `30000`
- `LOG_LEVEL` — default `info`

Run database migrations before starting the app. The `drizzle/` folder is included in the image.

### Build your own image

Use the included [`Dockerfile`](Dockerfile) to build locally:

```bash
docker build -t kobato .
docker run -p 4321:4321 \
  -e database__url=... \
  -e security__sessionSecret=... \
  -e security__encryptionKey=... \
  -v kobato_data:/data \
  -v kobato_config:/etc/kobato \
  kobato
```

### SEA binary (bare metal)

Every release also ships a self-contained single executable — no Node.js
runtime, no `node_modules`. The server bundle, client assets, and database
migrations are embedded in the binary; the native packages
(sharp, canvas) are extracted to a cache directory on first run. Targets:
glibc Linux, x64 and arm64. You still need an external TimescaleDB 17+.

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
After=network-online.target postgresql.service

[Service]
Type=simple
Environment=database__url=postgres://user:pass@127.0.0.1:5432/kobato
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
pnpm run test:fast   # run unit and snapshot tests without Docker
pnpm run fmt         # formatting
pnpm run lint        # lint
pnpm run type        # TypeScript check
pnpm run db:gen      # generate Drizzle migrations
pnpm run docker:dev  # start dev components
pnpm run docker:test # start test components
```

## Design assets

[`kobato.sketch`](kobato.sketch) is a Sketch template for the kobato favicon, logo, and branding assets.

## License

[MIT](LICENSE)
