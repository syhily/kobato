# Trace: local OpenObserve for development

`scripts/trace/` runs a single-container OpenObserve instance for local development.
It is optional: normal `pnpm dev`, `pnpm test`, and `pnpm build` never import these
scripts and never need Docker. Everything runs on the developer machine,
loopback-only, with no Collector and no SaaS endpoint.

OpenObserve itself is a released product capability: a deployed site is configured in
**Admin → Settings → Observability**, and the SERVER owns the OpenObserve lifecycle —
connection test, organization, RUM client token, privacy pipeline, dashboards, and
boot auto-upgrade. These scripts keep only what a deployed site must not own:

- a throwaway dev container + dedicated volume,
- the 1-day dev retention policy,
- the status/smoke glue around that container.

Nothing here writes `kobato.config.json`; there is no `trace.*` configuration surface.

## Quick start

```bash
pnpm run trace:up      # start openobserve/openobserve:v1.1.2 on 127.0.0.1:5080
pnpm run trace:init    # apply dev retention + print the admin-panel values
pnpm run dev
# Admin → Settings → Observability: enter endpoint/organization/username/password,
# enable tracing + server logs + frontend RUM, save, then "Test connection".
pnpm run trace:status  # container, dashboards, stream retention, pipeline state
pnpm run trace:down    # stop/remove container; add --volumes to delete telemetry
```

## Commands

| Command                 | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm run trace:up`     | Pull the pinned image if missing, create/reuse the container, wait for `/healthz`. Idempotent.       |
| `pnpm run trace:init`   | Wait for health, apply 1-day retention to every relevant stream, print the admin-panel values.       |
| `pnpm run trace:status` | Read-only report: container/volume, admin values, dashboards, per-stream retention, RUM pipeline.    |
| `pnpm run trace:down`   | Stop and remove the container. `--volumes` (alias `--purge`) also deletes the volume and state file. |
| `pnpm run trace:smoke`  | Full end-to-end smoke against a throwaway container + DEV server. Not part of `pnpm test`.           |

## Admin panel values

Enter these in **Admin → Settings → Observability**:

| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Endpoint     | `http://127.0.0.1:5080` (plain HTTP is allowed for loopback) |
| Organization | `default` (the site name doubles as the O2 organization)     |
| Username     | `kobato-dev@example.invalid`                                 |
| Password     | `adminPassword` from `tmp/openobserve/state.json` (0600)     |

Then enable **tracing**, **server logs**, and **frontend RUM**, save, and press
**Test connection**. The test verifies the credentials, ensures the organization,
probes the version, installs the RUM token / privacy pipeline / four dashboards, and
starts the runtime — no restart, no config file. The same section is the single
configuration source in production.

`trace:init` intentionally does not write the settings row itself: the password column
is encrypted with a key derived inside the SERVER process, so the script only prints
the non-secret values and points at the state file for the password. A dev script
duplicating that crypto path could corrupt an encrypted row.

## Container defaults

| Item           | Default                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Image (pinned) | `openobserve/openobserve:v1.1.2`                                                                              |
| Container      | `kobato-openobserve-dev`                                                                                      |
| Volume         | `kobato-openobserve-dev-data`                                                                                 |
| Host binding   | `127.0.0.1:5080` only                                                                                         |
| O2 root email  | `kobato-dev@example.invalid` (synthetic)                                                                      |
| CORS origins   | `http://localhost:4321,http://127.0.0.1:4321`                                                                 |
| GeoIP download | disabled (`ZO_MMDB_DISABLE_DOWNLOAD=true`)                                                                    |
| Real-IP source | `RightmostXForwardedFor` (`ZO_HTTP_REAL_IP_SOURCE`)                                                           |
| Fast ingest    | `ZO_MAX_FILE_RETENTION_TIME=10`, `ZO_COMPACT_INTERVAL=10` (fresh data queryable in seconds, not the defaults) |

CORS is fixed at container creation. Change the app port/origins before the first
`trace:up` (or run `trace:down` first). Values are exact origins, comma-separated,
never a wildcard. Browser RUM posts to the same-origin `/api/rum/intake` relay and the
server forwards to OpenObserve, so the app flow never needs O2 CORS; the configured
origins only keep direct browser→O2 debugging (and the O2 UI embedded from the dev
origin) working.

GeoIP download is disabled because O2 `v1.1.2` otherwise fetches ~59 MB of `.mmdb`
files on startup and blocks `/healthz` until the download completes, making restarts
slow and network-dependent. Without the database the geo enrichment is simply all-null
(and the privacy pipeline stores nothing either way), so startup stays offline and
deterministic.

`ZO_HTTP_REAL_IP_SOURCE=RightmostXForwardedFor` makes the RUM middleware resolve the
address the Kobato relay writes into `X-Forwarded-For` (the trusted-proxy-resolved
client) instead of the relay's TCP peer. A production OpenObserve used with
`observability.frontend.clientIdentity: forward` needs the same variable; without it
every batch enriches from the relay's own address.

## Environment variables

| Variable                      | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `KOBATO_TRACE_STATE_DIR`      | State directory (default `<worktree>/tmp/openobserve`).            |
| `KOBATO_TRACE_PORT`           | Host port (default `5080`).                                        |
| `KOBATO_TRACE_ENDPOINT`       | Endpoint recorded in state (default `http://127.0.0.1:<port>`).    |
| `KOBATO_TRACE_CONTAINER`      | Container name (default `kobato-openobserve-dev`).                 |
| `KOBATO_TRACE_VOLUME`         | Volume name (default `kobato-openobserve-dev-data`).               |
| `KOBATO_TRACE_ORG`            | Organization (default `default`).                                  |
| `KOBATO_TRACE_ROOT_EMAIL`     | O2 root email (default `kobato-dev@example.invalid`).              |
| `KOBATO_TRACE_ROOT_PASSWORD`  | O2 root password (default: generated, stored in the state file).   |
| `KOBATO_TRACE_RUM_TOKEN`      | RUM token recorded in state (normally created by the server).      |
| `KOBATO_TRACE_APPLICATION_ID` | Application id recorded in state (default `kobato-dev`).           |
| `KOBATO_TRACE_APP_PORT`       | Dev app port used to derive CORS origins (default `4321`).         |
| `KOBATO_TRACE_CORS_ORIGINS`   | Exact comma-separated origins (default derived from the app port). |
| `KOBATO_TRACE_SMOKE_KEEP`     | `1` keeps the smoke's temp dir and throwaway container/volume.     |
| `KOBATO_TRACE_SMOKE_HEADLESS` | `0` runs the smoke's Chromium headed instead of headless.          |

## Credentials and state

`trace:up` writes generated development credentials to the worktree's already-ignored
`tmp/openobserve/state.json` (mode `0600`), never to tracked files. The scripts never
print the root password; override the directory with `KOBATO_TRACE_STATE_DIR`.

The state file is validated by a strict Zod schema. Container/volume overrides must
stay in the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` namespace.
Every container/volume is created with the `kobato.trace=development` label, and
`down --volumes` refuses to remove any Docker resource whose name or label is not
owned by this tooling — corrupt/tampered state cannot target unrelated containers or
volumes. The volume is completely separate from Kobato's SQLite/DuckDB files, backup
archives, and the SEA binary; deleting it deletes every trace, metric, RUM, and server
log row.

## Retention

OpenObserve OSS retention is **day-granular**. The shortest per-stream value is
`data_retention: 1` (24 hours is not representable), so the dev tooling sets one day
on every relevant stream:

- `_rumdata` (RUM/errors),
- `default` (OTLP traces in this single-org instance),
- `kobato_logs` (privacy-projected server logs),
- `http_server_*`, `ssr_*`, `db_operation_*`, `cache_lookup_*`, `image_*`,
  `event_loop_*` metric streams.

Streams are created lazily by the first ingest: a `trace:init` run before any request
reports "no telemetry streams exist yet" and must be repeated later (one request, then
`pnpm run trace:init` again). Newly observed streams keep the server-wide
`ZO_COMPACT_DATA_RETENTION_DAYS` fallback (3-day minimum) until the next `trace:init`.
`trace:status` reports each relevant stream's current retention.

The SERVER applies retention only when the admin opts in via
`observability.retentionDays` (0, the default, keeps whatever the OpenObserve instance
is configured with) and never touches the dev container. The scripts deliberately
never provision the pipeline/dashboards: the server's provisioning is the single
writer for those assets, idempotent by title/name, so a stale dashboard from an old
manual run is simply updated on the next connection test.

## Server logs (`kobato_logs`)

`observability.logs.enabled` (default off) turns on the server-log pipeline in every
build, development and production alike. It is subordinate to tracing: no log export
without an active trace pipeline.

- stdout stays byte-identical with or without OpenObserve; the sink only receives a
  copy of each serialized Pino line.
- Each line is projected to a closed record: `debug`/`trace` levels, malformed or
  oversized lines, marker-bearing messages, and the telemetry subsystem's own records
  are dropped. HTTP records never carry the original message — the body is exactly
  `HTTP request completed`, `HTTP request rejected` (4xx), or `HTTP request failed`
  (5xx). Request id, URL, query, headers, pid/hostname, and error content never leave
  the process.
- A log emitted inside a request carries the same `trace_id`/`span_id` as its
  `http.server` span.
- Export is direct OTLP/HTTP with a bounded batch processor; when OpenObserve is
  unavailable records are dropped and the site continues. A log-pipeline failure
  degrades only logs — traces/metrics keep running.

Stored columns in O2 `v1.1.2` are exactly: `body`, `severity`, `severity_number`,
`log_scope`, `http_request_method`, `http_response_status_code`, `trace_id`,
`span_id`, `service_name`, `service_version`, `deployment_environment`, and
`_timestamp`. There is no `msg`, `req`/`res`, header, URL/query, request id, pid, or
hostname column, because the projection never emits them.

## RUM privacy pipeline

`src/server/domains/observability/assets/rum-privacy.vrl` is installed by the SERVER
as the `after_flatten` function `kobato_rum_privacy_drop`, wired into the realtime
pipeline `kobato_rum_privacy` on `_rumdata`. It is the authoritative, fail-closed
storage boundary: the VRL builds a fresh `safe` object from an explicit allowlist and
assigns `. = safe`, so every field not named in that allowlist is deleted by
construction — including a future SDK field nobody has denylisted.

Preserved: identity/correlation ids (`session`, `view`, `_o2_trace_id`/`_o2_span_id`),
route template and small SDK metadata, Web Vitals and timings (including the derived
`view_inp_us`), resource timings with power-of-two size buckets, long-task fields, and
closed error fields (`error_type`/`error_source`/`error_handling`/`error_category`/
`error_code`).

Removed by omission: `ip`, city/lat-long geo detail, UA version strings and the raw
`user_agent`, `device_*`/`usr_*`/`account_*`/`context_*`, headers, exact byte counts,
DOM selectors, raw performance objects, error messages/stacks, and any unknown field.
The five coarse identity fields (`geo_info_country`, `geo_info_country_iso_code`,
`user_agent_*_family`) survive only when populated, which requires
`observability.frontend.clientIdentity: forward` — a consent-gated mode. In the
default `anonymous` mode they stay null and store nothing.

Configuring and testing the connection is mandatory before frontend RUM can enable:
that is what installs the pipeline. At runtime the server verifies the pipeline
name/version/hash, enabled state, exact input→function→output graph, and the stored
function body hash; the probe fails safe (server signals continue, browser RUM is
withheld) and rechecks every 15 s. The browser polls `/api/rum/status` every 10 s, so
a tampered or offline pipeline is detected within about 25 s and the relay closes with
it. The browser never learns the OpenObserve origin, the RUM client token, or a
widened CSP: all RUM traffic relays through `/api/rum/intake` with the token injected
server-side.

The smoke injects a real RUM event carrying an unknown secret-bearing field and
verifies the field is absent from storage; the allowlist is intentional, and a safe
new field requires an allowlist change plus a smoke rerun.

## Dashboards

Four versioned OpenObserve v8 dashboards live in
`src/server/domains/observability/assets/dashboards/`, bundled into the server and
installed/upserted by title during the connection test (retry via the
`admin.observability.provision` procedure):

| File               | Dashboard            | Focus                                                                        |
| ------------------ | -------------------- | ---------------------------------------------------------------------------- |
| `overview.json`    | Kobato — Overview    | request/error rate, P50/P95/P99, slow routes, LCP/INP/CLS/TTFB               |
| `server.json`      | Kobato — Server      | SSR, oRPC, SQLite/DuckDB, cache, event-loop, trace table, log severity/scope |
| `browser.json`     | Kobato — Browser     | views, Web Vitals, long tasks, resources, sanitized errors                   |
| `correlation.json` | Kobato — Correlation | RUM resource trace ids, matching server spans, correlated server log lines   |

Notes for reading or extending the panel SQL:

- The OTLP trace stream is `default`; filter `service_name = 'kobato'`.
- Histogram metrics split into `<name>_count`, `<name>_sum`, `<name>_bucket` streams;
  the base histogram stream holds no rows. Counters and histograms are exported with
  **DELTA temporality**, so each row is one 10 s export interval's increment: panels
  `sum(value)` within a time bucket and never re-sum a cumulative snapshot; gauges
  keep their last value.
- All RUM nanosecond duration fields (LCP/FCP/TTFB/loading time/resource/long task)
  are divided by `1000.0` and aliased `_us`; `view_inp_us` is already microseconds
  (O2 flattens `view.performance.inp.duration` to `view_performance_inp_duration`
  in ns). A missing interaction is `null`, never a fake `0`. An asset contract test
  rejects a RUM duration query without the conversion.
- Correlation is shown as separate tables (RUM resources with `_o2_trace_id`, server
  spans, `kobato_logs` lines) because O2 `_search` cannot join a logs stream to a
  traces stream in one query; join on `trace_id`/`span_id` in the UI.
- Correlation precision: RUM ↔ server trace is exact through W3C `traceparent` for
  browser-initiated Fetch/XHR (an initial hard document load has no browser-side
  parent); server trace ↔ server log is exact (same active span). Metric ↔ trace is
  **approximate only** — there is no exemplar/TraceID join, `trace_id`/`span_id` must
  never become metric labels (unbounded cardinality, privacy), and the slow-request
  table is a drill-down over real `http.server` spans in the dashboard time bucket.

## Smoke test

```bash
pnpm run trace:smoke
```

Requires Docker and Playwright Chromium (or a locally installed Chrome). It starts a
**throwaway** O2 container/volume and a throwaway DEV server whose config carries no
tracing keys, seeds synthetic admin + post data, then configures observability through
the real product path over HTTP (settings save → `testConnection` → status polling →
enable logs + RUM → `/api/rum/status` gate opens). It drives Chromium through a public
page with secret fixtures, an SPA navigation, a real oRPC call, an uncaught browser
error, an admin login/navigation, an editor save, a large image transform, a scheduled
`job.run`, and a traced 404; then queries OpenObserve for the stored
traces/metrics/RUM/server logs, the waterfall, W3C correlation, the closed log
columns, 1-day retention, every dashboard panel query, the fail-closed privacy
pipeline, and the absence of every fixture. Finally it stops O2, proves the site
still serves, restarts O2, and verifies no outage-window data is replayed. Everything
is cleaned up on success and on failure.

Not part of `pnpm test`: unit/integration builds never require Docker or Playwright.

## CI

The ordinary CI test job runs before any build exists, so the production-bundle guard
`tests/unit/arch/production-rum-bundle.test.ts` runs explicitly in the CI build job
after `pnpm run build` (push) or `pnpm run sea:build` (PR); it scans the real
`build/client` and `build/server` output for OpenObserve/RUM and server OTel markers.
`trace:smoke` itself is a local tool and is not wired into CI.

## Troubleshooting

- `Bind for 127.0.0.1:5080 failed`: another process/container owns the port. Remove
  it or set `KOBATO_TRACE_PORT`.
- A stale container created by a failed first run can lack its published port. Run
  `pnpm run trace:down -- --volumes` and `pnpm run trace:up`.
- `trace:status` says "retention server default": no stream existed at init time.
  Send one request, then rerun `pnpm run trace:init`.
- The observability panel reports "unverified": the connection fingerprint is
  invalidated by any endpoint/organization/username/password change and by a rotated
  `security.encryptionKey`. Re-run the connection test.
- O2 UI/API login uses the credentials in the state file; the scripts never echo them.
