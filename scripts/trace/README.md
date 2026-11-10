# OpenObserve development trace/RUM setup (ADR-0012)

Optional local observability for **development only**. Normal `pnpm dev`,
`pnpm test`, and `pnpm build` never import these scripts and never need
Docker. Everything runs in one loopback container on the developer machine;
there is no Collector, no SaaSS endpoint, and no production activation path.

## Quick start

```bash
pnpm run trace:up      # start openobserve/openobserve:v1.1.2 on 127.0.0.1:5080
pnpm run trace:init    # RUM token, 1-day retention, privacy pipeline, 4 dashboards
# merge tmp/openobserve/kobato.trace.json into kobato.config.json
pnpm run dev
pnpm run trace:status  # container, dashboards, stream retention, pipeline state
pnpm run trace:down    # stop/remove container; add --volumes to delete telemetry
```

`trace:up` creates a dedicated named volume (`kobato-openobserve-dev-data`
by default). It is completely separate from Kobato's SQLite/DuckDB files,
backup archives, and the SEA binary. Deleting the volume deletes every trace,
metric, RUM, and server log row.

Generated development credentials live inside the worktree's already-ignored
`tmp/openobserve/state.json` (mode `0600`), never in tracked files. The scripts
never print the root password or RUM token. Override the directory with
`KOBATO_TRACE_STATE_DIR` if needed.

`state.json` is validated by a strict Zod schema. Container/volume overrides
must stay in the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>`
namespace. Volumes are created with `kobato.trace=development`, and
`down --volumes` refuses to remove any Docker resource whose name or label is
not owned by this tooling; corrupt/tampered state cannot target unrelated
containers or volumes.

## Container

| Item           | Default                                       |
| -------------- | --------------------------------------------- |
| Image (pinned) | `openobserve/openobserve:v1.1.2`              |
| Container      | `kobato-openobserve-dev`                      |
| Volume         | `kobato-openobserve-dev-data`                 |
| Host binding   | `127.0.0.1:5080` only                         |
| O2 root email  | `kobato-dev@example.invalid` (synthetic)      |
| CORS origins   | `http://localhost:4321,http://127.0.0.1:4321` |
| WAL flush      | 10 s (so metrics are queryable quickly)       |
| GeoIP download | disabled (`ZO_MMDB_DISABLE_DOWNLOAD=true`)    |

Environment overrides: `KOBATO_TRACE_PORT`, `KOBATO_TRACE_CONTAINER`,
`KOBATO_TRACE_VOLUME`, `KOBATO_TRACE_ORG`, `KOBATO_TRACE_ROOT_EMAIL`,
`KOBATO_TRACE_ROOT_PASSWORD`, `KOBATO_TRACE_APPLICATION_ID`,
`KOBATO_TRACE_APP_PORT`, `KOBATO_TRACE_CORS_ORIGINS`.

CORS is set when the container is created. Change the app port/origins before
the first `trace:up` (or run `trace:down` first). Values are exact origins,
comma-separated, never a wildcard. The browser RUM SDK authenticates with
`?o2-api-key=<RUM client token>` (a query parameter), not a custom header, so
the O2 default CORS header allowlist is sufficient.

MaxMind GeoIP download is disabled. O2 `v1.1.2` otherwise fetches ~59 MB of
`.mmdb` files on startup and blocks `/healthz` until the download completes,
which made container restarts slow and network-dependent. The local stack never
inspects GeoIP fields (the privacy pipeline drops them), so the container is
created with `ZO_MMDB_DISABLE_DOWNLOAD=true`; startup stays offline and
deterministic.

## `kobato.config.json`

`trace:init` writes a ready-to-merge fragment:

```json
{
  "trace": {
    "enabled": true,
    "logs": { "enabled": true },
    "endpoint": "http://127.0.0.1:5080",
    "organization": "default",
    "serverAuthorizationHeader": "Basic …",
    "sampleRate": 1,
    "includeRedactedSql": false,
    "frontend": {
      "enabled": true,
      "applicationId": "kobato-dev",
      "clientToken": "rum…",
      "sessionSampleRate": 100
    }
  }
}
```

- `serverAuthorizationHeader` is the complete server-only OTLP header value
  (`Basic base64(<O2 root email>:<password>)` in this local setup). The server
  derives `/api/<org>/v1/traces`, `/api/<org>/v1/metrics`, and
  `/api/<org>/v1/logs` from `endpoint`.
- `trace.logs.enabled` is the server-log export switch and is **default off**.
  It is a subordinate gate: `trace.enabled=true` is required, and
  `logs=true`/`trace=false` emits one field-name-only warning while the server
  pipeline stays disabled. Development only; production stays inert. Restart
  `pnpm dev` after changing it (boot-time snapshot).
- `frontend.clientToken` is a separate, least-privilege RUM token. It is
  visible to the browser by design; the server header is not.
- `trace.enabled=false` or a production build emits nothing. The server
  remains a no-op when the configuration is incomplete.
- Restart `pnpm dev` after changing `kobato.config.json`; it is a boot-time
  snapshot.

The fragment contains credentials. Keep it out of version control (it lives in
the state directory, not the repo) and do not paste it into issues.

## Retention

OpenObserve OSS retention is **day-granular**. The shortest per-stream value is
`data_retention: 1` (24 hours is not representable), so `trace:init` sets one
day on every relevant stream:

- `_rumdata` (RUM/errors),
- `default` (OTLP traces in this single-org instance),
- `kobato_logs` (privacy-projected server logs),
- `http_server_*`, `ssr_*`, `db_operation_*`, `cache_lookup_*`, `image_*`,
  `event_loop_*` metric streams.

The server-wide `ZO_COMPACT_DATA_RETENTION_DAYS` fallback has a 3-day minimum.
A stream created **after** `trace:init` keeps that fallback until the next
`pnpm run trace:init`, which applies the 1-day setting to newly observed
streams. `trace:status` reports each relevant stream's current retention.

## Dashboards

`scripts/trace/assets/dashboards/*.json` are versioned OpenObserve v8
dashboards. `trace:init` imports/updates them by title:

| File               | Dashboard            | Focus                                                                                  |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------- |
| `overview.json`    | Kobato — Overview    | request/error rate, P50/P95/P99, slow routes, LCP/INP/CLS/TTFB                         |
| `server.json`      | Kobato — Server      | SSR, oRPC, SQLite/DuckDB, cache, event-loop, trace table, log severity/scope           |
| `browser.json`     | Kobato — Browser     | views, Web Vitals, long tasks, resources, sanitized errors                             |
| `correlation.json` | Kobato — Correlation | RUM resource trace IDs, the matching server spans, and the correlated server log lines |

Notes:

- OTLP trace stream is `default`; select `service_name = 'kobato'`.
- Histogram metrics split into `<name>_count`, `<name>_sum`, `<name>_bucket`
  streams; O2 does not put rows in the base histogram stream. Counters and
  histograms are exported with **DELTA temporality**, so each row is the
  increment for one 10s export interval. Dashboard panels therefore `sum(value)`
  within a time bucket (a true per-bucket total) and never re-sum a cumulative
  snapshot; gauges keep their last value.
- The Browser/Overview INP column is `view_inp_us`. O2 flattens the SDK's
  `view.performance.inp.duration` to `view_performance_inp_duration` in
  nanoseconds; the pipeline converts it to a floating microsecond value
  (`40_000_000` → `40000`). A missing interaction is stored as `null`, never a
  fake `0` sample. Web Vitals use the numeric
  `view_largest_contentful_paint`, `view_cumulative_layout_shift`, and
  `view_first_byte` fields.
- All RUM nanosecond duration fields in dashboard SQL (LCP/FCP/TTFB/
  `view_loading_time`/`resource_duration`/`long_task_duration`) are divided by
  `1000.0` and aliased `_us`; `view_inp_us` is already microseconds. The asset
  contract test rejects a new RUM duration query without that conversion.
- The Server dashboard includes outbound `http.client` spans plus
  `image_queue_duration_sum` and `image_execution_duration_sum` panels, and the
  `cache_lookup_count` panel. Because the exporter uses DELTA temporality,
  every `_sum`/`_count` row is an export-interval increment; the panels total
  those increments per minute (`sum(value)`), which the asset contract test
  pins. Averaging them (`avg(value)`) would report a mean increment, not a
  total, and re-summing cumulative snapshots would grow without bound. The DEV
  inline image path records queue wait `0` by construction so that queue stream
  exists; this verifies the stream/query shape and the `total_queue_ms` column,
  not a real queue wait. Execution duration is real and `total_execution_ms`
  must be positive.
- Correlation is shown as separate tables (RUM resources with `_o2_trace_id`,
  server spans, then `kobato_logs` lines) because O2 `_search` does not join a
  logs stream to a traces stream in one query. Join on `trace_id`/`span_id` in
  the UI/export; the dashboards never fake a cross-stream SQL join.

### Correlation matrix (what is exact)

| Pair                         | Join key                                                                     | Precision                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| RUM ↔ server trace           | W3C `traceparent`; `_o2_trace_id` equals the server `trace_id`               | Exact for browser-initiated Fetch/XHR; an initial hard document load has no browser-side parent |
| Server trace ↔ server log    | OTel log-record span context (`trace_id` **and** `span_id`)                  | Exact: both ids come from the request's active `http.server` span                               |
| Server metric ↔ server trace | same fixed resource + closed route/status dimensions + dashboard time bucket | **Approximate only.** There is no TraceID join.                                                 |

Metrics carry **no TraceID exemplar**: `@opentelemetry/sdk-metrics` 3.1.0 and
the 0.301.x OTLP transformer do not implement exemplars, and the DELTA reader
does not retain the emitting context. Never add `trace_id`/`span_id` as metric
labels (unbounded cardinality and a new privacy surface) and never substitute
log rows for metric rows. The Correlation dashboard's
“Slow server requests” table is the honest drill-down: it lists the slowest
real `http.server` spans in the dashboard time bucket with route/status/method
columns. Adding `http_route` / `http_response_status_code` predicates is the
manual step a dashboard user takes for the aggregate being inspected; it is not
a per-metric-point exemplar join.

- Server log panels read `kobato_logs` (stream type `logs`). The real O2
  v1.1.2 columns are `body`, `severity` (text), `severity_number`, `log_scope`,
  `http_request_method`, `http_response_status_code`, `trace_id`, `span_id`,
  `service_name`, `service_version`, `deployment_environment`, and
  `_timestamp`; these are the exact names returned by `_search` and are what
  the smoke asserts. O2 does not expose `msg`, `req`/`res`, headers, URL, query,
  request id, pid, or hostname because the projection never emits them.

## Server logs (`kobato_logs`)

`trace.logs.enabled` (default off) turns on the DEV server-log pipeline. It is
subordinate to `trace.enabled`: there is no log export without tracing, and
production ignores both. `trace:init` writes `logs.enabled: true` into the
fragment.

- The Pino writable forwards each serialized line to the sink slot only when
  the DEV runtime installed one. stdout is written first and stays
  byte-identical with or without a sink.
- `src/server/infra/trace/log-record.ts` projects each line to a closed record.
  `debug`/`trace`, malformed/oversized lines, marker-bearing messages, and the
  telemetry subsystem's own `trace` scope are dropped. HTTP records never read
  the original message: the body is exactly `HTTP request completed`,
  `HTTP request rejected` (4xx), or `HTTP request failed` (5xx or error+).
  Non-HTTP bodies are static server messages only (an AST contract test rejects
  interpolated/concatenated log messages); control characters are stripped and
  the body is bounded to 200 code units.
- Allowed attributes: `log.scope` (closed grammar; defaults to `http` for HTTP
  records and `app` otherwise), `http.request.method`,
  `http.response.status_code`, `error.type`, and `error.category` (the existing
  closed error projector). Request id, URL, query, headers, pid/hostname,
  arbitrary context, error message/stack/cause, and every other field never
  leave the process.
- The record is emitted through the OTel logs SDK without passing a context,
  so the SDK attaches the active W3C trace/span ids. A log emitted inside a
  request carries the same `trace_id`/`span_id` as its `http.server` span. An
  unsampled trace still has valid ids; a log outside any span has none.
- Export is direct OTLP/HTTP to `/api/<org>/v1/logs` with the server credential
  and `stream-name: kobato_logs` (the shared `TRACE_LOG_STREAM` constant), a
  bounded `BatchLogRecordProcessor` (1024 queue / 256 batch / 1s delay / 3s
  timeout), and record limits of 8 attributes / 256 characters. OpenObserve
  v1.1.2 creates the independent `kobato_logs` logs stream (verified by the
  real smoke).
- A log-pipeline failure (construction or sink-slot conflict) degrades only
  logs; traces/metrics keep running. Stop detaches the sink first, then shuts
  the providers (tracer, meter, logs) through the inherited bounded timeout;
  provider shutdown performs its own flush. The handle's `forceFlush` is a
  separate operation and is not part of the stop path.
- There is no Pino transport, no admin settings surface, no production
  activation path, and no persistent retry queue. When OpenObserve is
  unavailable the bounded queue drops records and the site continues.

## RUM privacy pipeline

`scripts/trace/assets/rum-privacy.vrl` is installed as the `after_flatten`
function `kobato_rum_privacy_drop` and wired into the realtime pipeline
`kobato_rum_privacy` on `_rumdata`. It is the **authoritative, fail-closed
storage boundary** for OpenObserve. The VRL builds a fresh `safe` object from
an explicit allowlist and assigns `. = safe`; every field not named in that
allowlist is deleted by construction — including a future SDK field nobody
has added to a denylist.

Preserved allowlist:

- identity/correlation: `type`, `date`, `application_id`, `service`, `version`,
  `source`, `env`, `sdk_version`, `o2tags`, `session_id`, `session_type`,
  `view_id`, `view_name`, `view_url`, `_o2_trace_id`, `_o2_span_id`,
  `_o2_parent_span_id`;
- small O2/SDK metadata: format/sdk names, sampling rates, rule rate, document
  version, `_timestamp`, discarded flag;
- Web Vitals/timings: `view_largest_contentful_paint`,
  `view_cumulative_layout_shift`, `view_first_byte`, FCP, DOM/load timings,
  event counts, `view_loading_type`, and the derived `view_inp_us`;
- resources: type/url/status/duration, phase timings, delivery/render-blocking
  labels, and power-of-two `resource_size_bucket` /
  `resource_transfer_size_bucket`;
- long tasks: duration/blocking/entry type/frozen flag;
- errors: closed `error_type`, `error_source`, `error_handling`,
  `error_category`, `error_code`.

Removed by omission: `ip`, `geo_info_*`, `user_agent_*`, `device_*`, `usr_*`,
`account_*`, `context_*`, `request_*`/`response_*`, `display_*`, headers,
exact byte counts, DOM selectors, raw `view_performance_*` objects, error
messages/stacks, and any unknown field (the smoke injects a real RUM event with
an unknown field carrying a secret and verifies it is absent).

Limitations and SDK behaviour:

- **`trace:init` is mandatory before enabling frontend RUM.** It installs the
  pipeline `kobato_rum_privacy` with `allowlist-version=1` and
  `vrl-sha256=<hash>`. On DEV startup the server queries O2's pipeline **and
  function** APIs with the server-only OTLP credential. It validates the
  pipeline name/version/hash, enabled state, exact 3-node/2-edge
  input→function→output graph, source stream `_rumdata`/logs,
  `after_flatten=true`, and hashes the actual stored function body (after
  removing O2's ` \n .` sentinel) against the shared expected hash. Only then
  do the root loader and CSP expose the browser bootstrap. The probe has a
  1.5 s timeout and fails safe: server traces/metrics continue, but frontend
  RUM is withheld. The DEV runtime rechecks every 15 s (single, cleared on
  stop/HMR) and can re-enable the gate at runtime. A DEV-only
  `/api/dev/rum/status` endpoint returns only `{enabled: boolean}` with
  `no-store`; the browser polls every 10 s, calls
  `setTrackingConsent('not-granted')` on false/error to stop future assembly for
  an already-open page, and calls `stopSession()` on the first
  granted→not-granted transition. The slim SDK has no public API to discard an
  already-queued pre-consent batch (it may flush once); the smoke waits for the
  `_rumdata` row count and latest `_timestamp` to stay unchanged for a
  quiescence window, then asserts no new rows. Its tamper body preserves event
  fields and only invalidates the stored function hash, so it cannot appear
  stopped merely by dropping `date`. If the root loader withholds the bootstrap while the gate is
  closed, the page suspends: consent is revoked but the SDK handle, route,
  and status poll stay alive. It restores `granted` on recovery when DNT/GPC
  still allow and calls the slim SDK's `startView(current route id)` in the
  same document; no reload or navigation is involved, so unsaved editor input
  is preserved. Maximum detection window is ~25 s
  (15 s server + 10 s browser). The status path is excluded from RUM
  activity/tracing and resource events; production mounts no endpoint and the
  CSP is unchanged. The smoke tampers while a browser is open, waits for quiescence after the
  allowed final flush, restores the body, and checks that the same tab/editor
  resumes in place via data polling (same document, unsaved input unchanged,
  no `goto`). A green full rerun is still required for this scenario.
- The slim SDK's `beforeSend` uses `limitModification`: only declared field
  paths (e.g. `error.message`, `error.stack`, `view.url`, `resource.url`,
  `context`) are copied back onto the event. An arbitrary delete in a
  `beforeSend` clone is ignored by the SDK. The browser policy redacts those
  declared fields (including overwriting the raw error stack), but O2's
  pipeline is the storage-time enforcement point for everything else.
- The allowlist is explicit by design. Unknown fields are dropped, not
  preserved. Safe new fields require an intentional allowlist change and a
  smoke rerun.
- `error_stack` is intentionally not retained in O2. Errors keep type, source,
  handling, and closed category/code fields.

## Real smoke

```bash
pnpm run trace:smoke
```

Requires Docker and Playwright Chromium (or the locally installed Chrome). It
starts a **throwaway** O2 container/volume and a throwaway DEV server/config,
seeds synthetic admin + post data, and drives Chromium through:

- a public page with every secret fixture in the raw URL,
- an SPA navigation whose path/query carry the search/SQL fixtures,
- a real same-origin oRPC call (CSRF token read from the page),
- a real uncaught browser error whose message is a fixture,
- a real Chromium admin login and admin SPA navigation,
- an editor open + synthetic title save,
- an admin oRPC upload of a generated 6000×4000 JPEG (the DEV inline sharp
  path, measured as a slow operation),
- a scheduled post whose due time fires the real `content.scheduled-publish`
  `job.run`, and
- a missing post request that produces a traced 404, and
- real server HTTP response logs whose `trace_id`/`span_id` must match the same
  request's `http.server` span in the independent `kobato_logs` stream, and
- a real RUM event with an unknown secret-bearing field plus
  `view_performance_inp_duration=40_000_000` (asserted stored as `40000` us).

It then queries OpenObserve for the stored traces/metrics/RUM/server logs and
checks the waterfall, W3C trace-id correlation, the `kobato_logs` stream and
its real O2 columns, log↔span trace/span-id correlation, the closed log
projection (no request/response/URL/query/request-id/error content), Web
Vitals/resources/SPA views, metrics, 1-day retention (including
`kobato_logs`), dashboard panel SQL, the fail-closed RUM privacy pipeline, and
the absence of every fixture. The required-panel set includes Overview/Server/
Browser/Correlation key panels (`ov-ttfb`, `br-vitals`, `sv-cache`,
`sv-outbound`, image queue/exec, etc.); every panel query executes, while
`ov-errors` and `sv-outbound` are explicitly allowed to be empty when there is
no 5xx/outbound data. Synthetic known values assert the µs conversion through
the actual panel SQL. A delta-temporality check compares the sparse image
`_count`/`_sum` point count with the per-collection `event_loop_delay` gauge
point count — a cumulative exporter would re-emit the image series on every
collection and fail without relying on wall-clock timing. Finally it stops O2,
proves the site still serves,
checks the queue remains bounded, stops the DEV server cleanly, restarts O2, and
verifies no outage-window spans are replayed. It also repeats 5 server requests
and 3 browser navigations with telemetry off and prints both raw sample arrays
and medians for a local, non-universal overhead comparison. Everything is cleaned up on success and on failure. `KOBATO_TRACE_SMOKE_KEEP=1` keeps the temp directory and the
throwaway container/volume for debugging.

Last verified on 2026-11-10 against `v1.1.2`: 33/33 checks, 479 server spans,
695 RUM rows, 132 rows in the independent `kobato_logs` stream (17 stored
columns, 10 verified), 26 HTTP metric rows (15 columns, no `trace_id`/`span_id`
labels), 29 dashboard panel queries (all 29 returned rows), 43 relevant streams
at 1-day retention, 28.9 MB process-tree RSS growth over 200 outage requests, 0
replayed outage spans, and 0 replayed outage log rows. The same run exercised a
real Chromium admin login + admin SPA navigation, an editor save, a 0.95 s
inline DEV image transform via the admin oRPC client, a real `job.run`, a traced
404, a content-hash verified startup gate, an offline-startup
frontend-withheld check, a same-document tamper-reject/recover check (no
navigation or reload, unsaved input preserved), the image `_sum` panels
returning `total_queue_ms`/`total_execution_ms`, and the delta-temporality point
check. Server-log evidence: an HTTP response log and the `http.server` span of
the same request shared `trace_id` and `span_id` (`HTTP request completed`,
GET 302), log `service_name`/`service_version` matched the trace resource, and
the stored rows carried none of the fixtures or
request/response/URL/query/request-id/pid/hostname/error columns.

Local overhead comparison from that single run (5 server requests / 3 browser
navigations per phase, after one warm-up each; raw samples in ms):

```text
server  ON  [20.1, 17.6, 16.5, 20, 16.7]      median 17.6
        OFF [24.4, 23.8, 18, 17.8, 17.4]      median 18.0
nav     ON  [363.9, 364.7, 361.9]             median 363.9
        OFF [352.9, 344.4, 358.3]             median 352.9
LCP     ON  [156, 156, 156]                   median 156
        OFF [152, 152, 152]                   median 152
```

These are single-machine, single-run observations with large variance, not a
general performance guarantee.

`trace:smoke` is not part of `pnpm test`; unit/integration builds never require
Docker or Playwright. The production-bundle guard
`tests/unit/arch/production-rum-bundle.test.ts` is run explicitly in the CI
build job after `pnpm run build`/`sea:build`, because the ordinary test job
runs before a build exists and skips it.

## Troubleshooting

- `Bind for 127.0.0.1:5080 failed`: another process/container owns the port.
  Remove it or set `KOBATO_TRACE_PORT`.
- A stale container created by a failed first run can lack its published port.
  Run `pnpm run trace:down -- --volumes` and `pnpm run trace:up`.
- `trace:status` says "retention server default": no stream existed at init
  time. Send one request, then rerun `pnpm run trace:init`.
- O2 UI/API login uses the credentials in the state file; the scripts never
  echo them.
