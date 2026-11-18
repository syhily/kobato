# `@kobato/trace`

Optional DEV-only OpenObserve container tooling: retention, provisioning, privacy assets, and `trace:smoke`.

- `src/up.ts` / `down.ts` / `init.ts` / `provision.ts` / `status.ts` — container lifecycle and one-shot setup; `src/smoke.ts` — the real end-to-end signal check.
- Shared protocol names come from `@kobato/telemetry`; dashboard/VRL assets are read from the server-owned `packages/server/src/domains/observability/assets` (never copied).
- Nothing here is imported by the server or by `pnpm test`; operational details and the privacy contract live in `README.md`.
