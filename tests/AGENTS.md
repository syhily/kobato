# Test conventions

Conventions for the `tests/` directory.

## Layout

Tests are split into four Vitest workspace projects plus two live-instance
suites (HTTP e2e and real-browser Playwright). **The first three mirror the
`src/` layout:**

- **`tests/unit/`** — Pure logic, no DB, fastest feedback loop.
  If you test `src/shared/utils/paths.ts`, the test lives at `tests/unit/shared/utils/paths.test.ts`.
- **`tests/it/`** — Integration / end-to-end tests that need a real database.
  If you test `src/server/domains/posts/services/cms-posts.ts`, the test lives at `tests/it/server/domains/posts/services/cms-posts.test.ts`.
- **`tests/snaps/`** — React SSR snapshot tests (render-to-string, no DB).
  If you test `src/ui/public/post/PostListViews.tsx`, the test lives at `tests/snaps/ui/public/post/post-list-views.test.tsx`.
- **`tests/inkling/`** — The dissolved inkling editor suite (jsdom, globals
  off like the other projects), mirroring `src/inkling` internally. It
  carries its own `vitest.config.ts`; run it with
  `npx vitest run --project inkling` (alias `pnpm test:inkling`). Its helpers
  live in `tests/inkling/utils/` — including the `test-editor.ts` harness that
  registers the card decorate adapter — NOT in `tests/_helpers/`.
- **`tests/e2e/`** — True HTTP e2e: tests drive a real kobato instance (the
  SEA binary booted by `scripts/sea/e2e.ts`) over plain `fetch`. No
  in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`** (the
  root config lists projects explicitly) — run it via `pnpm run sea:e2e`,
  which boots the instance and injects the `KOBATO_E2E_BASE_URL` /
  `KOBATO_E2E_ADMIN_EMAIL` / `KOBATO_E2E_ADMIN_PASSWORD` env contract,
  plus `KOBATO_E2E_DATABASE` (the throwaway per-run SQLite path) as the
  one sanctioned seam for state no HTTP surface can stage (e.g. flipping
  `user.login_method` for the magic-link journey) — reach for it only
  when no admin RPC exists, and always restore what you flip. Mail never
  leaves the machine: mail-dependent journeys point the `mail` settings
  at the in-process SMTP capture server in `#/_helpers/e2e-mail` and
  extract secrets (OTP code, signin link) from the captured bytes.
- **`tests/browser/`** — Real-Chromium journeys (Playwright) for behavior
  jsdom cannot prove: the admin sidebar's logo/search/active-menu edge alignment,
  consistent toolbar-control sizing, the settings language switch (dirty-card flush veto,
  Portal focus, cross-tab sparse save), a non-settings document keeping its
  state on a peer locale change, the public comment composer loading only the
  active locale's Inkling labels, and a post's `contentLanguage` DOM contract.
  **Not part of `pnpm test`** and not a Vitest project — run
  `pnpm run test:browser` (boots a throwaway SEA instance, or targets
  `KOBATO_BROWSER_BASE_URL` — an external target gets the same staged post +
  settings baseline, so never point it at production) / `pnpm run sea:browser [binary]` (always boots
  the built binary). The runner injects
  `KOBATO_BROWSER_BASE_URL` + `KOBATO_BROWSER_ADMIN_EMAIL` /
  `KOBATO_BROWSER_ADMIN_PASSWORD` / `KOBATO_BROWSER_POST_SLUG`;
  `support/global-setup.ts` stages one published post (comments enabled,
  `contentLanguage: 'ar'`) and resets the general settings baseline through
  the admin HTTP surface — no real config or secret is read. Local runs
  default to the system Google Chrome channel; `KOBATO_BROWSER_CHANNEL`
  overrides it and CI installs/sets `chromium`. One worker, files serial: the
  journeys share one instance whose settings they mutate and restore.
  `KOBATO_BROWSER_TEST_GREP` narrows a debugging run. The managed runner exits
  non-zero when `dist-sea/kobato` is missing — never a silent skip; CI uses
  `sea:browser`, which always requires the built binary.

Cross-cutting integration tests still live inside `tests/it/` under the primary domain they exercise — there is no `features/` bucket.

### Single-purpose rule

**One test file must not mix purposes.** If a file contains both unit tests (pure logic, mocks only) and integration tests (hits DB / real RPC), split it before moving:

- Unit tests go to `tests/unit/<mirrored-path>.test.ts`
- Integration tests go to `tests/it/<mirrored-path>.test.ts`
- Snapshot tests go to `tests/snaps/<mirrored-path>.test.tsx`

## Test utilities

- Import test utilities (`describe`, `it`, `expect`, `vi`) from `vitest`.

## Infrastructure requirements

Zero services. `tests/it/` runs on a shared in-memory SQLite database
per test file (`createTestDatabase()` returns the lifecycle global —
integration tests behave like unit tests with a real engine); flows
that need a real file (backup/restore, WAL assertions) opt into
`createTestDatabaseFile()` explicitly. Analytics tests use a per-run
DuckDB sidecar file (`tests/_helpers/analytics-db.ts`). `tests/unit/`
and `tests/snaps/` skip the DB bootstrap entirely.

### Local development

Run tests normally — no Docker, no env setup:

```bash
pnpm run test
```

Or run a single project:

```bash
npx vitest run --project unit
npx vitest run --project it
npx vitest run --project snaps
npx vitest run --project inkling
```

Real-browser journeys (builds/uses the SEA binary or an external instance):

```bash
pnpm run test:browser                 # managed throwaway instance by default
pnpm run sea:browser dist-sea/kobato  # always the SEA binary
KOBATO_BROWSER_HEADLESS=0 pnpm run test:browser
```

Artifacts (trace / screenshot / video on failure) and the HTML report land in
`tmp/browser-results` and `tmp/browser-report` — both under the ignored `tmp/`.

### CI

GitHub Actions needs no service containers — the suite is self-contained.

Real-browser journeys are separate from `pnpm test`:
`.github/workflows/ci.yml`'s `build` job runs `sea:build` + bundled Chromium +
`pnpm run sea:browser` on **pull_request** events only; plain pushes there run
just the production build. `.github/workflows/sea.yml` also runs the same
journeys from its `build` / `build-develop` jobs. Both install Chromium with
`pnpm exec playwright install --with-deps chromium` and set
`KOBATO_BROWSER_CHANNEL=chromium`.

### Worker isolation (integration only)

- **SQLite**: one in-memory database per test file (`:memory:` is
  per-connection; the harness returns the lifecycle global so direct
  users and `getDb()` consumers share it; db-lifecycle migrates it at
  import). `closeTestDatabase` is a no-op on the global — its lifetime
  is the module graph's. `clearAllTables(db)` also resets
  `sqlite_sequence` so seeded ids restart at 1.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh
  migrated temp file — required for backup/restore (VACUUM INTO, file
  swaps) and WAL/pragma assertions.
- **DuckDB**: analytics tests open a per-run sidecar file via
  `createTestAnalyticsDb()` from `#/_helpers/analytics-db` and close it
  with `closeTestAnalyticsDb(handle)`.
- Tests that write tables should call `clearAllTables(db)` in `beforeEach` to reset state between cases within the same worker.
- Tests that exercise the real (unmocked) rate limiter should additionally call `__resetRateLimitsForTests()` from `@/server/infra/rate-limit` in `beforeEach` — the limiter is a process-level Map, so per-IP/email budgets otherwise leak across tests within a file.

## TypeScript pragmatism

Test code is not production code — its primary goal is to verify behavior, not to
model perfect types. Inside `tests/` (including mocks, spies, and fixtures),
strict type-checking may be relaxed when it would otherwise add unreasonable
ceremony:

- `any`, `as`, and `ts-expect-error` are acceptable escapes when a mock shape,
  test double, or fixture is intentionally partial or diverges from the real
  type.
- Prefer the narrowest escape possible; reach for `any` only after `as` or a
  partial type annotation proves too verbose.

## Imports

- **All test utilities live in `tests/_helpers/`** — there is no `tests/it/_helpers/` or per-project helpers directory. The one exception is `tests/inkling/`, which keeps its own `tests/inkling/utils/` harness (see Layout).
- Import helpers using the `#/_helpers/<name>` alias:
  - `#/_helpers/catalog` — mock data factories
  - `#/_helpers/render` — SSR render helpers (snapshots)
  - `#/_helpers/mock-react-query` — `mockTanstackQuery()`, the canonical
    `@tanstack/react-query` module mock. Import it before the component
    imports, call once at module scope, and rebind slots on the returned
    control singleton per test. Only hand-roll a `vi.mock` for react-query
    when the mock must BEHAVE (call-order routing, option capture,
    `initialData` pass-through).
  - `#/_helpers/stubs/dialog` — SSR-safe `@/ui/components/dialog` double:
    `vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))`
- Setup stubs the noise, `_helpers` owns the doubles. `tests/unit/setup.ts`
  and `tests/snaps/setup.ts` register inert global stubs for `sonner` and
  `@/ui/admin/settings/useSettingsMutation` — do NOT copy those `vi.mock`
  blocks into new test files. A file declares its own mock for them only
  when it asserts on `toast` or programs `commit` (a file-level `vi.mock`
  overrides the setup-level one). The real `useDebouncedSearch` returns
  `['', setter]` under SSR — never stub it with that exact value; stub it
  only when a test drives the search text.
  `tests/unit/setup.ts` also imports `@date-fns/tz` up front so `TZDate`
  binds the real `Date` constructor before any test file calls
  `vi.useFakeTimers()` — a fake-Date-derived `TZDate` silently falls back
  to the system timezone and breaks `computeNextRun` whenever the system
  zone differs from the settings zone.
  - `#/_helpers/blog-settings` — test settings bundle
  - `#/_helpers/lexical` — Lexical editor-state fixtures (`emptyLexicalBody`,
    `lexicalBodyWith`, `lexicalParagraph`, `lexicalHeading`, `lexicalImage`,
    `lexicalMusicPlayer`) + `stubMusicResolver` for `saveBody` inputs
  - `#/_helpers/deep-freeze` — recursive `Object.freeze` for fixtures that
    must stay mutation-proof across tests
  - `#/_helpers/dom-structure` — normalized DOM-tree diff for markup parity
    pins (a rendered React tree vs its hand-written HTML twin)
  - `#/_helpers/i18n-literals` — the AST scanner behind
    `tests/unit/arch/ui-i18n-literals.test.ts` (JSX text incl. expression
    children, copy-bearing JSX attributes, toast / `DomainError` / `titleMeta`
    strings, locale-less `toLocale*`, exact locale literals) plus its exact
    file/rule/snippet allowlist; whole-file content libraries (the vendored
    quote bank, the fallback catalog) are excluded before they are read or
    parsed, and scan roots grow per migration slice
  - `#/_helpers/integration-db` — DB creation / teardown (integration only)
  - `#/_helpers/analytics-db` — DuckDB sidecar creation / seeding / teardown
    (analytics integration tests)
  - `#/_helpers/db` — query helpers (integration only)
  - `#/_helpers/mock-ctx` — mock auth context (integration only)
  - `#/_helpers/request-context` — `makeRequestContext`, the single
    canonical `RequestContext` stub factory (never hand-roll rc literals;
    safe to import from `vi.mock('@/server/http/request-context', …)`
    factories — no runtime edge to the mocked module)
  - `#/_helpers/context` — `makeRouteContext` / `makeLoaderArgs` wrappers
    that set the stub on a `RouterContextProvider` for direct loader/action
    tests
  - `#/_helpers/silence-local-storage-warning` — drops Node's experimental
    `localStorage` getter warning (lib0 probes it at module load inside the
    inkling composer graph); every other warning still reaches stderr. Called
    by the unit / it / snaps project setups.
  - `#/_helpers/auth-context-mock` — `createRequestContextMockModule()` for
    `vi.mock('@/server/http/request-context', ...)` when a test invokes a
    handler without a real `RouterContextProvider`
  - `#/_helpers/rpc-call` — oRPC test caller (integration only)
  - `#/_helpers/session` — session fixtures (integration only)
  - `#/_helpers/fetch` — fetch mocks (integration only)
  - `#/_helpers/comments-leaf` — provider factory for the three
    leaf-facing comments contexts (comment-item tests)
- `#/_helpers/e2e-client` — cookie-jar HTTP client + real signin (e2e only)
- `#/_helpers/e2e-rpc` — oRPC-over-HTTP caller (e2e only)
- `#/_helpers/e2e-mail` — loopback SMTP capture server + mail decoders
  (OTP code / magic-link extraction; e2e only)
- `#/*` is mapped to `./tests/*` in `tsconfig.json` and resolved by Vitest.
- `@/*` continues to map to `src/*`.
