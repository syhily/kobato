<!-- markdownlint-disable MD033 MD041 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/server/assets/defaults/images/blog-poster-dark.png">
  <img alt="Kobato" src="src/server/assets/defaults/images/blog-poster.png">
</picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily)
— the engine behind [且听书吟](https://yufan.me). It runs on React Router 8 (SSR), Hono, and oRPC.
It provide a built-in `/admin` console for everything.
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

- Node.js 24+
- TimescaleDB 17+
- Redis 7+

## Quick start

Docker is recommended for local development.

```bash
pnpm run docker:dev
```

Copy `.env.example` to `.env` and set the database and Redis URLs:

```bash
cp .env.example .env
# DATABASE_URL=postgres://postgres:postgres@localhost:5433/kobato
# REDIS_URL=redis://localhost:6380
# SESSION_SECRET=$(openssl rand -hex 32)
# ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Install dependencies and start the dev server:

```bash
pnpm install
pnpm run dev
```

On first boot, open `/admin/setup` and enter the setup token printed in the console to create the admin account.
Settings are seeded automatically.

## Configuration

Most settings are managed in the admin dashboard.
Database and session secrets are configured via environment variables:

| Variable         | Description                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection URL, e.g. `postgres://user:pass@localhost:5432/kobato`                 |
| `REDIS_URL`      | Redis connection URL, e.g. `redis://localhost:6379`                                          |
| `SESSION_SECRET` | HMAC secret for cookies. Generate with `openssl rand -hex 32`                                |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting secrets in the database. Generate with `openssl rand -hex 32` |
| `DATA_PATH`      | Root data directory for fonts, dead-letter files, and MaxMind DB                             |

See `.env.example` for the full list of options.

## Testing

For fast local feedback without Docker, run unit tests and snapshot tests only:

```bash
pnpm run test:fast
```

Full coverage uses an ephemeral docker compose stack (tmpfs-backed Postgres and Redis that are discarded on stop):

```bash
pnpm run docker:test
pnpm run test
```

## Deployment

### Docker Compose (recommended)

The root `docker-compose.yml` runs the app with TimescaleDB and Redis on an isolated internal network.
Neither database is exposed to the host.

Launch the stack with randomly generated secrets:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 16) \
REDIS_PASSWORD=$(openssl rand -hex 16) \
SESSION_SECRET=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
docker compose up -d
```

Optional overrides:

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
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  -e SESSION_SECRET=... \
  -e ENCRYPTION_KEY=... \
  kobato
```

### Zeabur

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/TK7XLK?referralCode=syhily)

## Scripts

```bash
pnpm run dev         # development server
pnpm run build       # production build
pnpm run test        # run tests
pnpm run test:fast   # run unit and snapshot tests without Docker
pnpm run fmt   # formatting
pnpm run lint  # lint
pnpm run type  # TypeScript check
pnpm run db:gen      # generate Drizzle migrations
pnpm run docker:dev  # start dev components
pnpm run docker:test # start test components
```

## Design assets

[`kobato.sketch`](kobato.sketch) is a Sketch template for the kobato favicon, logo, and branding assets.

## License

[MIT](LICENSE)
