# @kobato/instance — everything that runs out of process

`@kobato/instance` holds two trees: the out-of-process instance driver (the lifecycle modules at the root of `src/`,
their `client/`, and `src/process.ts`) and the Playwright journey support (`src/browser/` + `playwright.config.ts`).
Both drive a kobato or sayaka instance as a REAL separate process — over HTTP or a real browser — and never load a
source graph; the modules sit directly under `src/` so the package's one wildcard export maps every specifier
(`@kobato/instance/<module>`, `@kobato/instance/client/<name>`, `@kobato/instance/process`,
`@kobato/instance/browser/<name>`) the way every other tools package does. It is the out-of-process half of the former
`@kobato/test`; the in-process Vitest infrastructure (fixtures, doubles, setups, the project table, `repo-root`,
`vitest.base`, `vitest.define`) stayed in `@kobato/test` (`tools/test/AGENTS.md`), which this package depends on for
exactly those. It reaches `@kobato/settings` (the rate-limit defaults `seed.ts` and `split-smoke.ts` stage), the
`@kobato/base/utils` sub-tree, `@kobato/test`, and its own modules, and imports them as `@kobato/instance/<path>`
(`apps/kobato/tests/arch/package-dag.test.ts` pins both trees: the driver imports only `@kobato/settings`,
`@kobato/base/utils`, `@kobato/test/repo-root`, and its own modules; the browser support imports `@playwright/test`,
`@kobato/base/utils`, the driver's `client/`, and its own modules; the driver never reaches the browser support).
Nothing here imports `@kobato/pack`: `pack` → `instance` → `test` is the only direction between the three tooling
packages. Keep every module importable with zero side effects.

## Instance driver (`src/*.ts`, `src/client/`, `src/process.ts`)

Everything that drives a kobato instance as a REAL separate process — two halves with no dependencies between them:

- **Lifecycle** (CLI entry scripts only) — `temp.ts` (per-run temp roots and smoke databases), `sea-instance.ts` (the
  built SEA binaries as HTTP instances: `bootServer` for kobato, `bootSayakaServer` for sayaka, plus the
  `seaInstanceEnv` / `sayakaInstanceEnv` env tables), `dev-instance.ts` (the repository DEV servers:
  `bootBackendDevServer` boots kobato on a free port with the converged config (`writeDevConfig(path, port, dataDir)`
  writes that config — the isolated way to boot `pnpm dev`'s backend; the dev boot helper needs the workspace client
  build, because its readiness probe follows the install gate's 303), `bootWorkspaceDevServer` boots the workspace on
  another through the kobato app's `dev:admin` script (the backend boots through its `dev` script; both take the Vite
  passthrough flags `--host`, `--port`, `--strictPort`, `--logLevel`) with `KOBATO_DEV_BACKEND_URL` pointing at that
  backend, and `bootSayakaDevServer` boots sayaka with the caller's `SAYAKA_KOBATO_RPC_URL` — a dev instance of kobato
  is the backend plus the workspace, and suites boot either or both), `seed.ts` (plain-SQL state for STOPPED instances),
  `suite-instance.ts` (the PAIR boot: fresh kobato proves the /health 303 gate → fresh sayaka proves the / 303 gate
  through sayaka → stop kobato → seed → restart kobato behind the RUNNING sayaka; `stopSuiteInstance` SIGTERMs both and
  removes the temp root), `analytics.ts` (the DuckDB sidecar AFTER shutdown), `split-smoke.ts` (the `split:smoke` entry:
  boots the BUILT `apps/kobato` + `apps/sayaka` node servers as a pair — or, with `--sea`, the `dist-sea/kobato` +
  `dist-sea/sayaka` binaries plus two `--version` identity checks — and verifies the ADR-0009 split perimeter — install
  gate, CSP nonce/ETag/304 on the home document, modulepreload links + the inline route-warmup idle script on that
  document, the uninstalled setup shell hydrating through headless Chrome with its brand logo and favicon answering 200
  pre-install, fingerprint-asset caching, the legacy `/tags` and `/search` 301 redirects forwarded through sayaka, 404s
  for unknown category/tag/post/page slugs, ETag-bearing `/archives` and `/categories`, a seeded post detail round-trip
  (admin signin + `upsertMeta` + `publishLatest` on kobato, then 200 + Content-Language/ETag and a conditional 304 at
  sayaka), the forwarded `/admin/signin` document and its entry chunk through sayaka, forwarded bootstrap parity,
  kobato's own origin answering 404 for the former public document URLs (the Webmention receive and RUM intake paths
  included), the binary resource families served by sayaka's procedure pairs (branding assets, OG/calendar/avatar images
  byte-identical to their procedure answers, an embedded font and a storage object streaming with Range/304/416
  semantics), the two inbound protocols answered through sayaka's perimeter handlers byte-identically to the captured
  router answers (webmention invalid 400 / accepted 202 / unknown-target 404 / oversized 413 / disabled 410; RUM intake
  404 while the relay is inactive and 415 for compressed batches), and resource rate-limit keying on the
  sayaka-forwarded visitor address). In plain-node mode `split-smoke.ts` starts kobato from the temp cwd with
  `--config <tempRoot>/kobato.config.json` (config and data paths stay absolute in the temp root): kobato resolves its
  client build beside its bundle — `clientAssetsRoot()` in `apps/kobato/src/server/client-assets-root.ts` hands
  `startKobato` the app's `build/workspace/client` directory, found relative to the module's own location — never
  through the working directory; under `--sea` both binaries resolve their client assets from the VFS and the cwd is the
  temp root. The seeded-post helpers stay inline in `split-smoke.ts` — `client/http.ts`'s parameter properties are not
  plain-node type-strippable. The sayaka DEV boot runs the app's own `dev` script
  (`pnpm --filter <app> run dev --host …`) so the app-script's repoRoot cwd and app-dir positional stay authoritative.
- **`client/`** (what the live-instance suites speak) — `http.ts` (`E2eClient`, the `KOBATO_E2E_*` env contract —
  `KOBATO_E2E_BASE_URL` is kobato's origin for backend-direct checks, `KOBATO_E2E_PUBLIC_URL` is sayaka's origin for
  everything a browser reaches; the oRPC signin helpers: `bootstrapCsrfToken` → `loginAdmin` answers the
  `AuthFlowOutput` shape, `readAuthFlow` decodes it), `rpc.ts` (`callE2eRpc`; `path` is the camelCase structural router
  path — kebab-case `.route()` strings are OpenAPI metadata, not the RPC wire path), `browser-env.ts` (the
  `KOBATO_BROWSER_*` env contract; `KOBATO_BROWSER_BASE_URL` is the sayaka origin — the one listener a browser needs).

The `split:smoke` script is `node src/split-smoke.ts`. `@kobato/pack`'s `src/sea/{smoke,e2e,browser}.ts` and
`@kobato/trace`'s `src/smoke.ts` compose both halves; `apps/kobato`'s `tests/e2e` and `tests/browser` and
`apps/sayaka`'s two suites import `@kobato/instance/client/*` and `@kobato/instance/browser/*`. The trace smoke boots
all three dev servers through `dev-instance.ts` and drives the admin through the workspace origin.

- `src/process.ts` (the process primitives every CLI script shares: `fail` (the one print-and-exit failure helper),
  `sleep`, `pickFreePort`, `fetchManual`, `scrubbedParentEnv`, `watchChildExit` / `raceChildExit`) and the driver import
  only `@kobato/settings`, `@kobato/base/utils`, `@kobato/test/repo-root`, and their own modules — they drive built
  artifacts and running processes, never a source graph, and never reach `src/browser/`, the SEA pipeline, or the Vite
  plugins (pinned by `apps/kobato/tests/arch/package-dag.test.ts`).
- The config file always lives inside the per-run temp root; config vars never come from the parent env (env > file
  would silently override the converged file); seeding only touches a STOPPED database; every boot pairs with a stop
  (`stopDevServer`, `stopSuiteInstance`) that SIGTERMs the child and removes the temp root — entry scripts call it from
  `finally`. A sayaka boot survives kobato restarts (per-request upstream clients), so suite boots restart kobato behind
  a running sayaka. Never boot anything against the repository's own `kobato.config.json` / `./data`.
- Entry scripts run under plain `node` type-stripping, so every module they reach — `src/process.ts`, the lifecycle
  half, and `client/browser-env.ts` — stays free of non-strip TS syntax (no parameter properties, enums, or namespaces);
  `client/http.ts` and `client/rpc.ts` load under Vitest, Playwright, or `vite-node` only.

## Browser journeys (`src/browser/` + `playwright.config.ts`)

- `src/browser/` runs under Playwright only: `journey.ts` (signin through the oRPC auth flow, page journeys,
  console/hydration probes), `settings-api.ts` (admin HTTP staging over `client/`), `fixtures.ts` (the `test`/`expect`
  factory both apps' specs import), `global-setup.ts` (the one Playwright global setup both projects share — stages one
  post and resets the general-settings baseline through the sayaka-forwarded admin). It imports `@playwright/test`,
  `@kobato/base/utils`, the driver's `client/`, and its own modules; the driver never imports it (pinned).
- `playwright.config.ts` — the real-browser journey runner config: two projects over ONE booted pair — kobato's
  workspace journeys in `apps/kobato/tests/browser/` and sayaka's public journeys in `apps/sayaka/tests/browser/`, each
  with its own `testDir` and output dir, one shared `globalSetup` (`src/browser/global-setup.ts`), and `baseURL` = the
  sayaka origin. Every path is anchored on `REPO_ROOT` from `@kobato/test/repo-root`, so the HTML report and the
  per-project results land under `apps/<app>/tmp/` whatever directory the runner is spawned from. The browser channel is
  the bundled Chromium unless `KOBATO_BROWSER_CHANNEL` names another (set it to `chrome` to launch the installed Google
  Chrome — no Playwright browser download needed); `KOBATO_BROWSER_HEADLESS=0` shows the window.
- `@kobato/pack`'s `src/sea/browser.ts` spawns
  `pnpm --filter @kobato/instance exec playwright test --config <absolute path to this config>` and only boots
  instances, drives the browser, and reports — `test:browser` runs the journeys against `KOBATO_BROWSER_BASE_URL` when
  it is set, and otherwise boots the pair exactly like `sea:browser`.

## Live-instance suites

- `pnpm run split:smoke [--sea]` (this package's `split:smoke` script) — the ADR-0009 split perimeter smoke (54 checks)
  over the built node servers; `--sea` boots `dist-sea/kobato` + `dist-sea/sayaka` instead and adds the two `--version`
  identity checks.
- `pnpm run sea:smoke [kobato-binary]` / `sea:e2e [kobato-binary]` / `sea:browser [kobato-binary]` / `test:browser` —
  `@kobato/pack`'s entry scripts (`tools/pack/src/sea/`) over the booted pair, composing the driver above (coverage in
  `apps/kobato/tests/AGENTS.md` and `apps/sayaka/AGENTS.md`): the managed smoke (budgets, versions, probes, natives,
  worker pool, fresh-pair boot, SIGTERM ×2, cache reuse, config convergence + reduced-env restart, seeded home
  document + assets through sayaka, page views + DuckDB round-trip), the two e2e trees over the pair, and the browser
  journeys. `--external <sayaka-url>` runs only the public HTTP checks; `--binary-only` the service-free ones. A binary
  argument names the KOBATO binary; the sayaka binary is its `sayaka` sibling (same directory, same suffix), or the
  default `dist-sea/sayaka` when no argument is given. All three default to (and document) the `dist-sea` pair.
- `pnpm run trace:smoke` — `@kobato/trace`'s end-to-end signal check over the three DEV servers
  (`tools/trace/AGENTS.md`).
