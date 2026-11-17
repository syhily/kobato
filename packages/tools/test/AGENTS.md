# @kobato/test — shared test utilities

All shared test utilities live here (`src/`) — there are no per-project helpers directories. The one exception is `packages/inkling/tests/utils/` (see `packages/inkling/tests/AGENTS.md`).

## Infrastructure requirements

Zero services. The `it` projects run on a shared in-memory SQLite database per test file (`createTestDatabase()` returns the lifecycle global); flows that need a real file (backup/restore, WAL assertions) opt into `createTestDatabaseFile()` explicitly. Analytics tests use a per-run DuckDB sidecar file (`analytics-db.ts`). The `unit` and `snaps` projects skip the DB bootstrap entirely.

## Import surface

Import helpers as `@kobato/test/<name>.ts`:

- `catalog` — mock data factories
- `render` / `i18n-render` — SSR render helpers (snapshots)
- `mock-react-query` — `mockTanstackQuery()`, the canonical `@tanstack/react-query` module mock. Import it before the component imports, call once at module scope, rebind slots on the returned control singleton per test. Hand-roll a `vi.mock` only when the mock must BEHAVE (call-order routing, option capture, `initialData` pass-through).
- `stubs/dialog` — SSR-safe dialog double: `vi.mock('@kobato/web/ui/components/dialog.tsx', () => import('@kobato/test/stubs/dialog.tsx'))`
- `blog-settings` — test settings bundle
- `lexical` — Lexical editor-state fixtures (`emptyLexicalBody`, `lexicalBodyWith`, `lexicalParagraph`, `lexicalHeading`, `lexicalImage`, `lexicalMusicPlayer`) + `stubMusicResolver` for `saveBody` inputs
- `deep-freeze` — recursive `Object.freeze` for fixtures that must stay mutation-proof across tests
- `dom-structure` — normalized DOM-tree diff for markup parity pins (a rendered React tree vs its hand-written HTML twin)
- `i18n-literals` — the AST scanner behind `apps/kobato/tests/arch/ui-i18n-literals.test.ts` (JSX text, copy-bearing attributes, toast / `DomainError` / `titleMeta` strings, locale-less `toLocale*`, exact locale literals) plus its exact file/rule/snippet allowlist; whole-file content libraries are excluded before parsing
- `analytics-db` — DuckDB sidecar creation / seeding / teardown (closes settle in-flight batcher flushes before touching connections)
- `request-context` — `makeRequestContext`, the single canonical `RequestContext` stub factory (never hand-roll rc literals; safe to import from `vi.mock('@kobato/server/http/request-context.ts', …)` factories — no runtime edge to the mocked module)
- `context` — `makeRouteContext` / `makeLoaderArgs` wrappers that set the stub on a `RouterContextProvider` for direct loader/action tests
- `silence-local-storage-warning` — drops Node's experimental `localStorage` getter warning (lib0 probes it at module load inside the inkling composer graph); every other warning still reaches stderr. Called by the unit / it / snaps project setups.
- `auth-context-mock` — `createRequestContextMockModule()` for `vi.mock('@kobato/server/http/request-context.ts', ...)` when a test invokes a handler without a real `RouterContextProvider`
- `comments-leaf` — provider factory for the three leaf-facing comments contexts (comment-item tests)
- Integration-only helpers: `integration-db` (DB creation / teardown), `db` (query helpers), `mock-ctx` (mock auth context), `rpc-call` (oRPC test caller), `session` (session fixtures), `fetch` (fetch mocks)
- E2e-only helpers: `e2e-client` (cookie-jar HTTP client + real signin), `e2e-rpc` (oRPC-over-HTTP caller), `e2e-mail` (loopback SMTP capture server + mail decoders for OTP code / magic-link extraction)

## Setup files

`setup/unit.ts` and `setup/snaps.ts` register inert global stubs for `sonner` and `@kobato/web/ui/admin/settings/useSettingsMutation` — do NOT copy those `vi.mock` blocks into new test files. A file declares its own mock only when it asserts on `toast` or programs `commit` (a file-level `vi.mock` overrides the setup-level one). The real `useDebouncedSearch` returns `['', setter]` under SSR — never stub it with that exact value; stub it only when a test drives the search text.

`setup/unit.ts` imports `@date-fns/tz` up front so `TZDate` binds the real `Date` constructor before any test file calls `vi.useFakeTimers()` — a fake-Date-derived `TZDate` silently falls back to the system timezone and breaks `computeNextRun` whenever the system zone differs from the settings zone.

Setup stubs the noise, `@kobato/test` owns the doubles.

## Worker isolation

- **SQLite**: one in-memory database per test file (`:memory:` is per-connection; the harness returns the lifecycle global so direct users and `getDb()` consumers share it; db-lifecycle migrates it at import). `closeTestDatabase` is a no-op on the global — its lifetime is the module graph's. `clearAllTables(db)` also resets `sqlite_sequence` so seeded ids restart at 1, wipes the per-process filesystem cache (`file-store::wipeCache`) AND its L1 memory tier (`memory-store::__resetMemoryCacheForTests`), and drops the generation memo.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh migrated temp file — required for backup/restore (VACUUM INTO, file swaps) and WAL/pragma assertions.
- **DuckDB**: open a per-run sidecar file with `createTestAnalyticsDb()` from `analytics-db.ts` and close it with `closeTestAnalyticsDb(handle)`; these files run in the dedicated `duckdb` project (see `apps/kobato/tests/AGENTS.md`). `closeTestAnalyticsDb` first joins any in-flight batcher flush (`settleAllBatchers`) — closing connections under an in-flight append is a native use-after-free. For the same reason a `resetAllBatchers()` that precedes a handle close MUST be awaited (`reset` detaches instances synchronously; its promise joins their flushes).
- Tests that write tables should call `clearAllTables(db)` in `beforeEach` to reset state between cases within the same worker.
