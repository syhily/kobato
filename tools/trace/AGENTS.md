# `@kobato/trace`

Optional DEV-only OpenObserve container tooling. `pnpm dev`, `pnpm test`, and `pnpm build` never import it and never need Docker. The scripts own exactly three things: the throwaway container + volume, the 1-day dev retention policy, and the local credentials state file. Everything else — RUM token, privacy pipeline, dashboards, runtime — is provisioned by the SERVER during the admin connection test. Nothing here writes `kobato.config.json` or provisions OpenObserve assets.

- `src/up.ts` / `down.ts` / `init.ts` / `provision.ts` / `status.ts` — container lifecycle and one-shot setup; `src/smoke.ts` — the real end-to-end signal check.
- Shared protocol names come from `@kobato/telemetry`; dashboard/VRL assets are read from the server-owned `packages/server/src/domains/observability/assets` (never copied).
- Nothing here is imported by the server or by `pnpm test`.

Full manual: `docs/manual/Trace.md`.

## Commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm run trace:up`     | Start `openobserve/openobserve:v1.1.2` on `127.0.0.1:5080`. Idempotent. |
| `pnpm run trace:init`   | Apply the 1-day dev retention and print the admin-panel values.         |
| `pnpm run trace:status` | Container, dashboards, per-stream retention, RUM pipeline state.        |
| `pnpm run trace:down`   | Stop/remove the container; `--volumes` also deletes telemetry + state.  |
| `pnpm run trace:smoke`  | Full end-to-end smoke (Docker + Playwright; not part of `pnpm test`).   |

## Admin panel

Settings → Observability: endpoint `http://127.0.0.1:5080`, organization `default` (the site name doubles as the O2 organization), username `kobato-dev@example.invalid`, password = `adminPassword` from `tmp/openobserve/state.json` (0600, never printed). Enable tracing, server logs, and frontend RUM, save, then press **Test connection** — the server provisions the RUM token, privacy pipeline, and dashboards and starts the runtime.

## Container defaults

`openobserve/openobserve:v1.1.2` (pinned), container `kobato-openobserve-dev`, volume `kobato-openobserve-dev-data`, bound to `127.0.0.1:<port>` (default `5080`) only. CORS origins are the exact `http://localhost:4321` / `http://127.0.0.1:4321` (never a wildcard), fixed at container creation — change the app port/origins before the first `trace:up`, or run `trace:down` first. O2 env: `ZO_MMDB_DISABLE_DOWNLOAD=true`, `ZO_HTTP_REAL_IP_SOURCE=RightmostXForwardedFor`, `ZO_MAX_FILE_RETENTION_TIME=10`, `ZO_COMPACT_INTERVAL=10`. Browser RUM relays through the app origin (`/api/rum/intake`), so the app flow needs no OpenObserve CORS.

## Environment overrides

`KOBATO_TRACE_STATE_DIR`, `KOBATO_TRACE_PORT`, `KOBATO_TRACE_ENDPOINT`, `KOBATO_TRACE_CONTAINER`, `KOBATO_TRACE_VOLUME`, `KOBATO_TRACE_ORG`, `KOBATO_TRACE_ROOT_EMAIL`, `KOBATO_TRACE_ROOT_PASSWORD`, `KOBATO_TRACE_RUM_TOKEN`, `KOBATO_TRACE_APPLICATION_ID`, `KOBATO_TRACE_APP_PORT`, `KOBATO_TRACE_CORS_ORIGINS`; smoke only: `KOBATO_TRACE_SMOKE_KEEP=1` (keep the temp dir + throwaway container/volume), `KOBATO_TRACE_SMOKE_HEADLESS=0` (run the browser headed).

## Ownership and safety

Container/volume names stay in the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` grammar, every resource carries the `kobato.trace=development` label, and `down --volumes` refuses any Docker resource this tooling does not own. State lives in the ignored `tmp/openobserve/state.json` (0600).
