# `@kobato/telemetry`

The isomorphic browser/server observability protocol shared with development tooling.

- `rum.ts` owns the browser-safe RUM bootstrap and same-origin intake vocabulary.
- `logs.ts`, `metrics.ts`, and `pipeline.ts` own OpenObserve stream names, metric names, and privacy-pipeline identity.
- No OpenTelemetry SDK, OpenObserve client, Docker, retention mutation, React, or server config. Runtime adapters live in `@kobato/server`; local container tooling lives in `@kobato/trace`.
- Allowed deps: `@kobato/settings` only. Tests: `tests/unit/` under `shared-unit`.
