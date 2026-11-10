# OpenObserve development container

Optional local observability for **development only**. `pnpm dev`, `pnpm test`, and
`pnpm build` never import these scripts and never need Docker. The scripts run one
loopback-only container with a dedicated volume and own exactly three things: the
throwaway container + volume, the dev-only 1-day stream retention, and the local
credentials state file. Everything else — RUM token, privacy pipeline, dashboards,
runtime — is provisioned by the SERVER during the admin connection test. These
scripts never provision OpenObserve assets and never write `kobato.config.json`.

Full manual: [docs/manual/Trace.md](../../docs/manual/Trace.md)

## Commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm run trace:up`     | Start `openobserve/openobserve:v1.1.2` on `127.0.0.1:5080`. Idempotent. |
| `pnpm run trace:init`   | Apply the 1-day dev retention and print the admin-panel values.         |
| `pnpm run trace:status` | Container, dashboards, per-stream retention, RUM pipeline state.        |
| `pnpm run trace:down`   | Stop/remove the container; `--volumes` also deletes telemetry + state.  |
| `pnpm run trace:smoke`  | Full end-to-end smoke (Docker + Playwright; not part of `pnpm test`).   |

## Admin panel (Settings → Observability)

Endpoint `http://127.0.0.1:5080`, organization `default` (the site name doubles as
the O2 organization), username `kobato-dev@example.invalid`, password =
`adminPassword` from `tmp/openobserve/state.json` (mode 0600, never printed). Enable
tracing, server logs, and frontend RUM, save, then press **Test connection** — that
provisions the RUM token, privacy pipeline, and dashboards and starts the runtime.

## Container defaults

| Item         | Default                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Image        | `openobserve/openobserve:v1.1.2` (pinned)                                                                                                   |
| Container    | `kobato-openobserve-dev`                                                                                                                    |
| Volume       | `kobato-openobserve-dev-data`                                                                                                               |
| Binding      | `127.0.0.1:<port>` only, default port `5080`                                                                                                |
| CORS origins | exact `http://localhost:4321`, `http://127.0.0.1:4321` (never a wildcard)                                                                   |
| O2 env       | `ZO_MMDB_DISABLE_DOWNLOAD=true`, `ZO_HTTP_REAL_IP_SOURCE=RightmostXForwardedFor`, `ZO_MAX_FILE_RETENTION_TIME=10`, `ZO_COMPACT_INTERVAL=10` |

CORS is fixed at container creation: change the app port/origins before the first
`trace:up`, or run `trace:down` first. Browser RUM relays through the app origin
(`/api/rum/intake`), so the app flow needs no OpenObserve CORS.

## Environment overrides

`KOBATO_TRACE_STATE_DIR`, `KOBATO_TRACE_PORT`, `KOBATO_TRACE_ENDPOINT`,
`KOBATO_TRACE_CONTAINER`, `KOBATO_TRACE_VOLUME`, `KOBATO_TRACE_ORG`,
`KOBATO_TRACE_ROOT_EMAIL`, `KOBATO_TRACE_ROOT_PASSWORD`, `KOBATO_TRACE_RUM_TOKEN`,
`KOBATO_TRACE_APPLICATION_ID`, `KOBATO_TRACE_APP_PORT`, `KOBATO_TRACE_CORS_ORIGINS`;
smoke only: `KOBATO_TRACE_SMOKE_KEEP=1` (keep temp dir + throwaway container/volume),
`KOBATO_TRACE_SMOKE_HEADLESS=0` (run the browser headed).

## Ownership and safety

Container/volume names stay in the closed `kobato-openobserve-dev` /
`kobato-trace-smoke-<8hex>` grammar, every resource carries the
`kobato.trace=development` label, and `down --volumes` refuses any Docker resource
this tooling does not own. State lives in the ignored `tmp/openobserve/state.json` (0600).
