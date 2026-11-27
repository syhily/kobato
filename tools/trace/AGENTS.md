# `@kobato/trace`

Optional DEV-only OpenObserve container tooling: `pnpm dev`, `pnpm test`, and `pnpm run build` never import it and never
need Docker. The scripts own exactly the throwaway container + volume, the 1-day dev retention policy, and the local
credentials state file; everything else (RUM token, privacy pipeline, dashboards, runtime) is provisioned by the SERVER
during the admin connection test. Nothing here writes `kobato.config.json`. Full manual: `docs/manual/Trace.md`.

- `src/{up,down,init,provision,status}.ts` — container lifecycle; `src/smoke.ts` — the end-to-end signal check, which
  boots the three DEV servers through `@kobato/test/instance/dev-instance`, signs in and stages through
  `@kobato/test/instance/client`, and takes its ports and sleeps from `@kobato/test/process`.
- Protocol names come from `@kobato/settings/telemetry`; dashboard/VRL assets are read from
  `packages/server/src/domains/observability/assets` (never copied).

## Commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm run trace:up`     | Start `openobserve/openobserve:v1.1.2` on `127.0.0.1:5080`. Idempotent. |
| `pnpm run trace:init`   | Apply the 1-day dev retention and print the admin-panel values.         |
| `pnpm run trace:status` | Container, dashboards, per-stream retention, RUM pipeline state.        |
| `pnpm run trace:down`   | Stop/remove the container; `--volumes` also deletes telemetry + state.  |
| `pnpm run trace:smoke`  | Full end-to-end smoke (Docker + Playwright; not part of `pnpm test`).   |

## Admin panel

Settings → Observability: endpoint `http://127.0.0.1:5080`, organization `default`, username
`kobato-dev@example.invalid`, password = `adminPassword` from `tmp/openobserve/state.json` (0600, never printed). Enable
tracing, server logs, and frontend RUM, save, then **Test connection** provisions the rest.

## Container defaults and safety

- Pinned `v1.1.2`; container/volume `kobato-openobserve-dev(-data)`; bound to `127.0.0.1` only; CORS origins exactly
  `http://localhost:4321` / `http://127.0.0.1:4321`, fixed at container creation — change the app port/origins before
  the first `trace:up`, or run `trace:down` first. Browser RUM relays through the app origin (`/api/rum/intake`).
- Env overrides:
  `KOBATO_TRACE_{STATE_DIR,PORT,ENDPOINT,CONTAINER,VOLUME,ORG,ROOT_EMAIL,ROOT_PASSWORD,RUM_TOKEN,APPLICATION_ID,APP_PORT,CORS_ORIGINS}`;
  smoke only: `KOBATO_TRACE_SMOKE_KEEP=1`, `KOBATO_TRACE_SMOKE_HEADLESS=0`.
- Names stay in the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` grammar, every resource carries the
  `kobato.trace=development` label, and `down --volumes` refuses any Docker resource this tooling does not own.
