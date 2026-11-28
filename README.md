<!-- markdownlint-disable MD033 MD041 --> <picture> <source media="(prefers-color-scheme: dark)" srcset="packages/server/src/assets/defaults/images/blog-poster-dark.png"> <img alt="Kobato" src="packages/server/src/assets/defaults/images/blog-poster.png"> </picture>

# Kobato (こばと。)

> _"A little bird carrying hope, one letter at a time."_

**Kobato** is a self-hosted blog CMS built by [Yufan Sheng](https://github.com/syhily) — the engine behind
[且听书吟](https://yufan.me). It runs on React Router 8, Hono, and oRPC, split into two deliverables: `kobato`, the
backend with the built-in `/admin` console (a SPA), and `sayaka`, the server-rendered public site. Content is stored as
**Lexical** editor state and authored through the built-in **inkling** editor; saved server-side HTML projections power
SSR, feeds, and search.

This repository is the complete product: backend, public site, admin SPA, API, install gate, and database migrations.
`kobato` runs as one process with an embedded **SQLite** database and an embedded **DuckDB** analytics sidecar; `sayaka`
is a stateless server that talks to it over oRPC. There is no database server to run, back up, or upgrade.

> **Contributors:** start at [AGENTS.md](AGENTS.md) — it maps the workspace (every package, its responsibility, and the
> dependency rules) plus the folder-scoped docs covering the import boundaries, the six-root `packages/server/src/`
> graph, the install contract, and the API permission matrix; each package documents itself further in its own
> `AGENTS.md`.

Manuals: [Configuration](docs/manual/Configuration.md) · [Deployment](docs/manual/Deployment.md) ·
[Headless](docs/manual/Headless.md)

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

Install dependencies and start the two dev processes — the backend, then the workspace (two terminals):

```bash
pnpm install
pnpm run dev         # the backend on http://127.0.0.1:4320
pnpm run dev:admin   # the workspace on http://127.0.0.1:4321, proxying /rpc to the backend
```

On first boot a `kobato.config.json` is created in the repo root (gitignored) — fill in the two secrets (see
[Configuration](docs/manual/Configuration.md) for the file shape). The database files create themselves under
`storage.data` (`./data` by default):

```jsonc
{
  "security": {
    "sessionSecret": "", // openssl rand -hex 32
    "encryptionKey": "", // openssl rand -hex 32
  },
}
```

Open `http://127.0.0.1:4321/admin/setup` and enter the setup token printed in the console to create the admin account.
Settings are seeded automatically. Open it on the workspace dev server's origin, not the backend's (4320): the backend
answers an `/admin/*` document from the workspace's built client tree, which a fresh clone lacks until `pnpm run build`.

`pnpm run build` is the alternative: it builds the workspace (`apps/kobato/build/workspace/client`) before the backend
bundle, so `pnpm start` — the built backend — serves the workspace itself from one origin, at the port
`kobato.config.json` names, with no dev server. `pnpm run dev:public` adds the public site's dev server on port 4322.

## Testing

The suite is fully self-contained — integration tests run against a shared in-memory SQLite database (temp files only
for file-backed flows) and temp-file DuckDB sidecars, so no Docker or services are needed:

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
pnpm run dev         # the backend dev server (127.0.0.1:4320)
pnpm run dev:admin   # the workspace dev server (127.0.0.1:4321), proxying /rpc to the backend
pnpm run dev:public  # the public site dev server (port 4322)
pnpm run build       # production build
pnpm run test        # run tests
pnpm run test:unit   # run unit tests only
pnpm run test:snaps  # run snapshot tests only
pnpm run fmt         # formatting
pnpm run lint        # lint + type check
pnpm run db:gen      # generate Drizzle migrations
```

## Design assets

[`kobato.sketch`](kobato.sketch) is a Sketch template for the kobato favicon, logo, and branding assets.

## License

[MIT](LICENSE)
