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
Content is stored as **Lexical** editor state and authored through the built-in **inkling** editor; saved server-side HTML projections power SSR, feeds, and search.

This repository is the complete product: public site, admin SPA, API, SSR renderer, install gate, and database migrations.
The whole deployment is one process — content lives in an embedded **SQLite** database, analytics in an
embedded **DuckDB** sidecar. There is no database server to run, back up, or upgrade.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it maps the folder-scoped
> docs covering the import boundaries, the four-layer `src/server/` graph, the
> install contract, and the API permission matrix.

Manuals: [Configuration](docs/manual/Configuration.md) ·
[Deployment](docs/manual/Deployment.md)

## Features

- Posts, pages, categories, tags, and comments — all managed in a built-in `/admin` console
- Lexical content model with the built-in inkling editor
- Per-section settings (general, SEO, assets, comments, navigation, and more)
- First-party analytics with optional GeoIP enrichment
- Optional S3-compatible object storage for media

## Requirements

- Node.js 26+ for development (the SEA binary deployment needs no runtime); `pnpm run sea:build` requires Node.js 26

No database server: SQLite and DuckDB are embedded.

## Quick start

Install dependencies and start the dev server:

```bash
pnpm install
pnpm run dev
```

On first boot a `kobato.config.json` is created in the repo root
(gitignored) — fill in the two secrets (see [Configuration](docs/manual/Configuration.md)
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

## Scripts

```bash
pnpm run dev         # development server
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
