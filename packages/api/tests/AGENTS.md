# API test conventions

- `tests/unit/` (`api-unit`) pins the SDK without an engine or a DOM: the contract shapes at the root (`contract`,
  `public-contracts` / `account-contracts` / `admin`, the per-domain wire pins, the `defineProcedure` factory, and the
  frozen `publicRead` / `csrfExempt` / `requestTimeoutMs` / `requestBodyLimit` key sets), the React-free transport under
  `client/`, and the browser assembly under `browser/` — `client.iso.test.ts` (the singleton's header assembly) and
  `use-notifications.test.ts` (the notifications read-state cache patch over a real `QueryClient`). There is no `it/` or
  `snaps/` tree: nothing here boots a server or renders markup.
- The two projects are defined in `@kobato/test/projects/api-projects.ts` and share the node environment and
  `@kobato/test/setup/node`: `api-unit` runs on shared workers (`isolate: false`); a file that registers module mocks
  (`vi.mock`) is named `*.iso.test.ts` and runs in `api-iso-unit` (`threads`, `isolate: true` — a fresh context per
  file); a mock-free file (`vi.spyOn` on a local instance included) keeps the plain suffix. Run with
  `pnpm test packages/api`.
- Tests import production code through the package specifier (`@kobato/api/...`) and never reach a UI package, an app,
  or the server; `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture;
  `tests/utils/notifications.ts` is the workspace-canonical notification cache fixture (`makeNotificationItem` and the
  tab seed/read helpers, shared with the kit's `notifications-drawer.read-state.test.tsx`) (`packages/api/AGENTS.md`).
