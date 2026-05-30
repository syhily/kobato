<!-- markdownlint-disable MD001 MD033 MD041 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/server/assets/defaults/images/blog-poster-dark.png">
  <img alt="Kobato" src="src/server/assets/defaults/images/blog-poster.png">
</picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily) — the engine that powers the personal site [且听书吟](https://yufan.me). It runs on React Router 7 (SSR), Hono, and oRPC. Posts, pages, taxonomies, comments, images, music, and per-section settings all live in TimescaleDB and are edited from the built-in `/admin` console. Bodies are stored as **PortableText** and authored through a Tiptap editor that round-trips losslessly to the wire format.

The repository is the whole product: the public site, the admin SPA, the API perimeter, the SSR renderer, the install gate, and the database schema/migrations.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it documents the import boundaries, the four-layer `src/server/` graph, the install contract, and the API permission matrix.

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

### With Docker (recommended for local development)

A `docker-compose.yml` is provided for local development with persistent data:

```bash
npm run docker:dev
```

Then configure your `.env`:

```bash
cp .env.example .env
# Set DATABASE_URL=postgres://postgres:postgres@localhost:5433/kobato
# Set REDIS_URL=redis://localhost:6380
# Generate and set SESSION_SECRET
```

Finally, install dependencies and start the dev server:

```bash
npm install
npm run dev
```

### Without Docker

```bash
git clone https://github.com/syhily/kobato
cd kobato
cp .env.example .env
# Edit .env — see below
npm install
npm run dev
```

On first boot, open `/admin/setup` in your browser to create the admin account. Settings are seeded automatically.

## Configuration

Copy `.env.example` to `.env` and set at minimum:

| Variable         | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection URL, e.g. `postgres://user:pass@localhost:5432/kobato` |
| `REDIS_URL`      | Redis connection URL, e.g. `redis://localhost:6379`                          |
| `SESSION_SECRET` | HMAC secret for cookies. Generate with `openssl rand -hex 32`                |

Optional but recommended for production:

| Variable         | Description                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting secrets in the database. Generate with `openssl rand -hex 32` |

See `.env.example` for the full list of options.

## Deployment

### Docker (recommended)

Pre-built images are published to GitHub Container Registry:

```bash
docker pull ghcr.io/syhily/kobato:latest
docker run -p 4321:4321 --env-file .env ghcr.io/syhily/kobato:latest
```

Run database migrations before starting the app. The `drizzle/` folder is included in the image.

### Build your own image

Use the included [`Dockerfile`](Dockerfile) if you prefer to build locally:

```bash
docker build -t kobato .
docker run -p 4321:4321 --env-file .env kobato
```

### Zeabur

You can also deploy Kobato with one click using the [Zeabur template](https://zeabur.com/templates/TK7XLK).

### Manual

```bash
npm ci
npm run build
node ./build/server/index.js
```

Make sure `NODE_ENV=production` and migrations have been applied.

## Testing

For running the test suite, use the dedicated test compose file which spins up **ephemeral** Postgres and Redis containers (data lives in memory and is discarded on stop):

```bash
npm run docker:test
npm run test
```

The test compose uses tmpfs-backed storage and isolated `test` credentials so tests always start from a clean slate.

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm run typecheck   # TypeScript check
npm run test        # run tests
npm run lint        # lint
npm run fmt:check   # check formatting
npm run db:generate # generate Drizzle migrations
npm run docker:dev  # start dev components
npm run docker:test # start test components
```

## License

- **Source code:** [MIT](LICENSE)
- **Fonts:** see [licenses/](licenses)
