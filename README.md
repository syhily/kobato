<!-- markdownlint-disable MD001 MD033 MD041 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/server/assets/defaults/images/blog-poster-dark.png">
  <img alt="Yufan Blog Logo" src="src/server/assets/defaults/images/blog-poster.png">
</picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily) — the engine that powers the personal site [且听书吟](https://yufan.me). It runs on React Router 7 (SSR), Hono, and oRPC. Posts, pages, taxonomies, comments, images, music, and per-section settings all live in TimescaleDB and are edited from the built-in `/admin` console. Bodies are stored as **PortableText** and authored through a Tiptap editor that round-trips losslessly to the wire format.

The repository is the whole product: the public site, the admin SPA, the API perimeter, the SSR renderer, the install gate, and the database schema/migrations.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it documents the import boundaries, the four-layer `src/server/` graph, the install contract, and the API permission matrix.

## Highlights

- **TimescaleDB-backed content model.** Posts (`/posts/:slug`) and pages (`/:slug`) share one global slug namespace; categories, tags, and friends are first-class taxonomies with referential integrity. Page drafts get an admin-only preview overlay; future-dated posts stay excluded until publish time.
- **PortableText body, Tiptap editor.** A single `@/shared/pt/schema` Zod dialect is the wire format. The PT ↔ ProseMirror bridge (`@/shared/pt/bridge`) is a single file; standard blocks map to Tiptap built-ins, custom blocks (`image`, `code`, `mathBlock`, `mermaid`, `musicPlayer`, `solution`, `footnoteDefinition`, `table`) ride a generic `blockCard` node. Round-trip is contract-tested.
- **Typed API, end-to-end.** Every HTTP call goes through `/rpc/*` via oRPC. Procedures are declared from one of four base procedures (`publicProc` / `authedProc` / `authorProc` / `adminProc`) and the browser client is built from `typeof apiRouter`. Zod DTOs in `shared/contracts/` are paired with compile-time parity assertions against `shared/types/`.
- **Section-scoped settings.** 14 JSONB rows under `setting` — `blog.general`, `blog.assets`, `blog.navigation`, `blog.socials`, `blog.content`, `blog.sidebar`, `blog.comments`, `blog.seo`, `blog.footer`, `blog.mail`, `blog.cache`, `blog.rateLimit`, `blog.search`, `blog.fonts`. Each section saves independently so concurrent admin tabs cannot race.
- **Two-stage install gate.** Until an admin row exists, every request redirects to `/admin/setup`. After admin creation, stage 2 at `/admin/setup/settings` writes the 14 settings rows atomically.
- **Optional object storage.** S3 (or any S3-compatible bucket) is gated by `assets.storage.enabled`. Off by default — the library is read-only and uploads return 503 until a settings flip. Generated Vite assets ship with the build image; S3 is for user media only.
- **First-party analytics.** Visit ingestion + dashboards backed by TimescaleDB, with optional MaxMind GeoLite2 enrichment.

## Stack

| Layer      | Choice                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| App router | React Router 7 framework mode, SSR (`react-router.config.ts`)                               |
| HTTP host  | Hono via `react-router-hono-server` — perimeter middlewares, resource routers, oRPC mount   |
| API        | oRPC (`@orpc/server` + `@orpc/client`) at `/rpc/*`, Zod input/output, OpenAPI export in dev |
| UI         | React 19, TSX only, shadcn/ui (Base UI variant) under `src/ui/components/`                  |
| Styling    | Tailwind CSS v4 (`src/assets/styles/tailwind.css`), one token cascade for public + admin    |
| Editor     | Tiptap (ProseMirror) ↔ PortableText bridge; SSR via `@portabletext/react`                   |
| Data       | Postgres (Drizzle), Redis (sessions, rate limits, generated-image caches)                   |
| Assets     | S3-compatible bucket, opt-in per blog                                                       |
| Build      | Vite, Vitest, Oxlint, Oxfmt, TypeScript (`npm run` scripts)                                 |

## Architecture

Five cooperating top-level layers under `src/` with a one-way import graph (`routes → server / ui / client / shared`; `server → shared`; `shared` stays isomorphic).

```text
src/
├── routes/      Route modules grouped into public/, auth/, admin/
├── server/      SSR-only: infra/, domains/, http/, render/
├── client/      Hooks, oRPC client, browser-only code
├── ui/          Pure-props React components (public, admin, shadcn primitives, PortableText renderer)
├── shared/      Isomorphic config, contracts, DTO types, PT schema, utils
├── assets/      Fonts, icons, global CSS
└── server.ts    Hono entry / SSR adapter
```

The `src/server/` tree is itself four layers, in strict order (`infra → domains → http`, `domains → render → http`):

- **`infra/`** — Drizzle pool, Redis storage, generic HTTP vocabulary, email, search, env, logger, rate limiter, slug pipeline. Zero business knowledge.
- **`domains/`** — One folder per business concept (`auth`, `catalog`, `pages`, `posts`, `comments`, `images`, `music`, `friends`, `taxonomies`, `settings`, `users`, `analytics`, `pt`, …). Locked vocabulary: `schema.ts / repo.ts / service.ts / projection.ts / cache.ts`.
- **`http/`** — Hono entry, oRPC procedure base, controllers, middlewares, resource routers (RSS, sitemap, OG, redirects), React Router loaders. Orchestration only — no business rules.
- **`render/`** — SSR output products: SEO meta, RSS/Atom, OG images, calendar SVGs, avatar fetch, react-prerender drain, image post-processing. Never persists.

Deeper rationale and the rules each layer enforces live in [AGENTS.md](AGENTS.md) and the subdirectory `AGENTS.md` files.

## Quick start

```bash
git clone https://github.com/syhily/kobato
cd kobato
cp .env.example .env
# Edit .env — see "Environment variables" below
npm install
npm run dev
```

First boot redirects every request to `/admin/setup` until an admin row exists; stage 2 at `/admin/setup/settings` then seeds the 14 settings rows. After that the public site is live and the admin console at `/admin` is available to the new admin user.

### Environment variables

All configuration is read from `.env` (gitignored). Copy `.env.example` and fill in the values.

#### Required

| Variable         | Description                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection URL, e.g. `postgres://user:pass@host:5432/db`                           |
| `REDIS_URL`      | Redis connection URL for sessions, rate limiting, and cache buckets, e.g. `redis://host:6379` |
| `SESSION_SECRET` | HMAC key for signing session cookies. Generate with `openssl rand -hex 32`                    |

#### Recommended

| Variable         | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting API keys and S3 credentials stored in the database. Any string works (SHA-256 derived). Generate with `openssl rand -hex 32`. When set, secrets are encrypted before every DB write and decrypted on read. When unset, secrets are stored as plaintext (not recommended for production). See [Secret encryption](#secret-encryption) below for migration steps. |

#### Optional

| Variable                  | Default   | Description                                                                                                                                                                              |
| ------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                    | `0.0.0.0` | HTTP listen address                                                                                                                                                                      |
| `PORT`                    | `4321`    | HTTP listen port (1–65535)                                                                                                                                                               |
| `DB_POOL_MAX`             | `20`      | Max Postgres connections per process                                                                                                                                                     |
| `DB_STATEMENT_TIMEOUT_MS` | `30000`   | Per-query timeout in ms                                                                                                                                                                  |
| `LOG_LEVEL`               | `info`    | One of: `debug`, `info`, `warn`, `error`                                                                                                                                                 |
| `MAXMIND_DB_PATH`         | —         | Path to GeoLite2-City `.mmdb`. When set, analytics records include geo data (country/region/city/lat/lon/timezone). Download from [MaxMind](https://www.maxmind.com/en/geolite2/signup). |

### Secret encryption

The `mail.apiKey`, `assets.storage.secretAccessKey`, and `search.search.apiKey` fields are stored in Postgres JSONB. Set `ENCRYPTION_KEY` to encrypt them at the application layer with AES-256-GCM.

**New deployments:** set `ENCRYPTION_KEY` before the first launch. Secrets will be encrypted from the start.

**Existing deployments (migrating from plaintext):**

```bash
# 1. Add to .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 2. Run the one-shot migration script
npx tsx scripts/encrypt-settings-secrets.ts
```

The migration script reads the three secret-containing rows, encrypts any plaintext values, and writes them back. Safe to re-run — already-encrypted values are skipped. After migration, `decryptIfNeeded` transparently handles both encrypted and (straggler) plaintext values.

## Admin console

The `/admin` SPA shares one Tiptap editor for posts and pages with a three-layer UX: top toolbar (image library / music picker / link / table / hr / undo-redo), floating bubble menus for text and table selections, and a `/`-driven slash menu for block insertion. Cells are inline-only and the image block is a React NodeView for inline alt + caption editing.

The console also covers user management, sessions, taxonomy CRUD, the analytics dashboard (overview + realtime), an image library with inline category/friend uploads (locked to 1280×425), a music library with per-track lyrics, and per-section settings pages.

## Commands

```bash
npm run dev              # dev server + HMR
npm run fmt:check        # check formatting (oxfmt)
npm run lint             # lint (oxlint)
npm run typecheck        # type-check (tsc + react-router typegen)
npm run test             # run tests with coverage (vitest)
npm run build            # production build
npm run db:generate      # Drizzle migration from schema edits
```

Package manager is npm (see `packageManager` in `package.json`). Use `npm install` / `npm uninstall` / `npm update` for dependency changes.

## Configuration

Runtime behaviour is driven by the `setting` table — **one JSONB row per section** under `scope='blog.<section>'`. There is no checked-in `blog.config.ts` or global defaults file; each section's schema lives beside its service in `src/server/domains/settings/` and the registry in `sections.ts` maps section ↔ DB scope ↔ Zod schema ↔ bundle key.

The S3 toggle, credentials, bucket, asset CDN host, and upload limits all live under `setting('blog.assets')` (edited at `/admin/settings/assets`) — not in env vars. The dispatcher reads the toggle on every PUT/DELETE so flipping storage on/off does not require a redeploy.

## Deployment

The [Dockerfile](Dockerfile) runs `npm run build` against a Node 24 Alpine base and ships `build/` with `npm run start` (`node ./build/server/index.js`). Default listen port `4321`. Generated Vite assets are **not** uploaded to S3 by the build; object storage is reserved for user media. Migrations under `drizzle/` are copied into the runtime image and applied by your deployment workflow before boot.

## License

- **Source code:** [MIT](LICENSE) — © Yufan Sheng
- **Fonts in logo design:** [licenses/](licenses)
