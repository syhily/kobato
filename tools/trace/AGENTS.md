# `@kobato/trace`

Optional DEV-only OpenObserve container tooling. `pnpm dev`, `pnpm test`, and `pnpm build` never import it and never need Docker. The scripts own exactly three things: the throwaway container + volume, the 1-day dev retention policy, and the local credentials state file. Everything else — RUM token, privacy pipeline, dashboards, runtime — is provisioned by the SERVER during the admin connection test. Nothing here writes `kobato.config.json`, and nothing here is imported by the server or by `pnpm test`.

- `src/up.ts` / `down.ts` / `init.ts` / `provision.ts` / `status.ts` — container lifecycle; `src/smoke.ts` — the real end-to-end signal check.
- Shared protocol names come from `@kobato/telemetry`; dashboard/VRL assets are read from `packages/server/src/domains/observability/assets` (never copied).

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

Settings → Observability: endpoint `http://127.0.0.1:5080`, organization `default`, username `kobato-dev@example.invalid`, password = `adminPassword` from `tmp/openobserve/state.json` (0600, never printed). Enable tracing, server logs, and frontend RUM, save, then press **Test connection** — the server provisions the rest.

## Container defaults

Pinned `v1.1.2`, container/volume `kobato-openobserve-dev(-data)`, bound to `127.0.0.1` only. CORS origins are the exact `http://localhost:4321` / `http://127.0.0.1:4321` (never a wildcard), fixed at container creation — change the app port/origins before the first `trace:up`, or run `trace:down` first. Browser RUM relays through the app origin (`/api/rum/intake`).

Environment overrides: `KOBATO_TRACE_{STATE_DIR,PORT,ENDPOINT,CONTAINER,VOLUME,ORG,ROOT_EMAIL,ROOT_PASSWORD,RUM_TOKEN,APPLICATION_ID,APP_PORT,CORS_ORIGINS}`; smoke only: `KOBATO_TRACE_SMOKE_KEEP=1`, `KOBATO_TRACE_SMOKE_HEADLESS=0`.

## Ownership and safety

Container/volume names stay in the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` grammar, every resource carries the `kobato.trace=development` label, and `down --volumes` refuses any Docker resource this tooling does not own.
