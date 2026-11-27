# Kobato app — the backend

`apps/kobato` (package name `kobato`) is the backend deployable (ADR-0009, ADR-0011 §4): the `@kobato/server` Hono app
that `src/server.ts` boots through `startKobato`, carrying the `/rpc/*` oRPC transport and serving the workspace — the
admin, editor, and auth SPA that lives in `packages/web/admin` (`@kobato/web-admin`) — under `/admin/*` and `/editor/*`.
It holds no React Router project of its own: the workspace's client tree is built by its own package and located through
the package, never through the working directory. The feeds, the sitemap, robots.txt, manifest.webmanifest, and the
`/tags` + `/search` 301s are sayaka's, and every public resource (images, storage, embedded fonts, branding assets, the
Webmention receive, the RUM intake) is a `public.*` procedure pair that sayaka serves. The public site lives in
`apps/sayaka` and reaches kobato over oRPC and the two forwarded path families. Backend in `@kobato/server`, contracts
in `@kobato/api`, the shared leaves in `packages/shared`. `apps/kobato/package.json` is the version source of truth for
every package and for the `__APP_*__` build globals of both the backend bundle and the workspace build.

- `src/server.ts` — the backend entry: it calls `startKobato` (`@kobato/server/bootstrap/start-kobato`) with the
  workspace build's location and, in production, lets the package bind the listener or, under Vite, hands over the dev
  server's `httpServer`, and default-exports the app; it carries no `import.meta.hot.accept()` — the dev host loads this
  graph through `ssrLoadModule`, whose runner has `hmr: false`, so an HMR boundary here would be dead code (pinned by
  `tests/arch/server-public-surface.test.ts`). The boot sequence and the workspace-serving app (middleware pipeline +
  `/admin/assets/*` statics + shell documents + 404) live in `@kobato/server` (`bootstrap/start-kobato`,
  `http/kobato-app`, `http/spa-shell`) — nothing of it is here.
- `src/server/` — what only the app knows: `client-assets-root` (`clientAssetsRoot()` — under the kobato SEA binary it
  resolves the assets from the VFS `client/` prefix; on disk it resolves `@kobato/web-admin/package.json` through
  `createRequire(import.meta.url)` and takes that package's `build/client`, whatever the working directory) and
  `dev-server-ref` (reads the Vite dev server from the `globalThis` slot in dev).
- `vite.config.ts` — the backend dev host: a Vite SSR server (`appType: 'custom'`, port 4320) whose only plugin is
  `honoDevHost` (`@kobato/pack/vite/hono-dev-host`: `@hono/vite-dev-server` with the node adapter, no client-script
  injection), loading `src/server.ts` and serving its default export for every request outside Vite's own paths. The
  plugin publishes the Vite dev server on the `globalThis` slot before the entry evaluates, so `startKobato` adopts its
  `httpServer` as the lifecycle's server instead of binding a port. A server-side edit re-evaluates the invalidated
  modules and the entry on the NEXT request (the dev host sends no HMR update; `import.meta.hot` is `undefined` for this
  graph — Vite's `ssrLoadModule` runs its compat module runner with `hmr: false`, so `import.meta.hot.data` is not a
  usable carrier), and the plugin marks the process as a dev host on a second `globalThis` slot
  (`Symbol.for('kobato.server.dev-host')`) before any module loads; `@kobato/server/infra/dev-host-state` reads that
  marker and keeps the run-once state there — the flags for the migrations, the secrets migration + settings refresh +
  job start (`bootStepsRan`), and the observability runtime; the carried values (the content and analytics engine
  handles, the job registry's entries, the scheduler's registered-job list, the GeoIP reader promise); and each module's
  previous disposer — so a re-evaluation neither repeats a run-once step, re-opens an engine, duplicates a scheduler,
  nor stacks a signal handler. The marker exists only inside the dev host: a production bind boot and every test process
  see no store and run every step (`tools/pack/tests/unit/vite/hono-dev-host.test.ts` pins that the plugin sets it
  before the entry evaluates).
- `vite.backend.config.ts` — the backend bundle: `src/server.ts` in, `build/server/index.js` out (chunks under
  `build/server/assets/`), with `processWorkerEntryPlugin` writing `build/server/process-worker.js` beside it.
- `tests/` — `arch/`, `unit/`, `it/`, `browser/`, `e2e/`; see `tests/AGENTS.md`.
- Imports: `@/...` app source, `@tests/...` app test helpers, `@kobato/<package>/...` product code — the workspace
  through `@kobato/web-admin/...` (tests only). No relative specifiers outside the documented exceptions (root
  `AGENTS.md`).
- `drizzle-orm` is a tests-only devDependency (seed/assertion code); production source never imports it.

## Build & dev

- `pnpm -C apps/kobato build` = `vite build --config vite.backend.config.ts`: the backend bundle only. The root
  `pnpm run build` builds the workspace first (`pnpm -C packages/web/admin build` → `packages/web/admin/build/client`),
  then this bundle, then sayaka.
- `pnpm dev` (root) runs the backend on `127.0.0.1:4320` (`vite apps/kobato` from the repository root): `/rpc/*`,
  `/health`, and `/ready` answer here. The workspace dev server (`pnpm dev:admin`, 4321) proxies those three path
  families to this port, so a browser never talks to 4320 directly; a `/admin/*` document requested on 4320 is answered
  by `startKobato`'s shell handler from whatever `build/client` the workspace package holds (500 when it has never been
  built) — the dev-middleware documents live on the workspace's own origin.
- `pnpm start` runs `node ./apps/kobato/build/server/index.js` — the backend bundle, which finds the workspace build
  through `@kobato/web-admin` from any working directory. `pnpm run sea:build` (root) turns the same outputs into the
  `dist-sea/kobato` SEA binary, which serves `/admin/assets/*` (the shell's `index.html` included) out of its embedded
  VFS `client/` prefix — the asset collection (`tools/pack/src/sea/assets.ts`) reads `packages/web/admin/build/client`
  through the package as well.
