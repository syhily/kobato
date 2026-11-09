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
metric, and RUM row.

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
  derives `/api/<org>/v1/traces` and `/api/<org>/v1/metrics` from `endpoint`.
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
- `http_server_*`, `ssr_*`, `db_operation_*`, `cache_lookup_*`, `image_*`,
  `event_loop_*` metric streams.

The server-wide `ZO_COMPACT_DATA_RETENTION_DAYS` fallback has a 3-day minimum.
A stream created **after** `trace:init` keeps that fallback until the next
`pnpm run trace:init`, which applies the 1-day setting to newly observed
streams. `trace:status` reports each relevant stream's current retention.

## Dashboards

`scripts/trace/assets/dashboards/*.json` are versioned OpenObserve v8
dashboards. `trace:init` imports/updates them by title:

| File               | Dashboard            | Focus                                                          |
| ------------------ | -------------------- | -------------------------------------------------------------- |
| `overview.json`    | Kobato — Overview    | request/error rate, P50/P95/P99, slow routes, LCP/INP/CLS/TTFB |
| `server.json`      | Kobato — Server      | SSR, oRPC, SQLite/DuckDB, cache, event-loop, trace table       |
| `browser.json`     | Kobato — Browser     | views, Web Vitals, long tasks, resources, sanitized errors     |
| `correlation.json` | Kobato — Correlation | RUM resource trace IDs and the matching server span table      |

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
- Correlation is shown as two tables (RUM resources with `_o2_trace_id`, then
  server spans) because O2 `_search` does not join a logs stream to a traces
  stream in one query. Join on `trace_id` in the UI/export.

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
- a real RUM event with an unknown secret-bearing field plus
  `view_performance_inp_duration=40_000_000` (asserted stored as `40000` us).

It then queries OpenObserve for the stored traces/metrics/RUM and checks the
waterfall, W3C trace-id correlation, Web Vitals/resources/SPA views, metrics,
1-day retention, dashboard panel SQL, the fail-closed privacy pipeline, and the
absence of every fixture. The required-panel set includes Overview/Server/
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

Last verified on 2026-11-09 against `v1.1.2`: 29/29 checks, 644 server spans,
706 RUM rows, 24 HTTP metric rows, 25 dashboard panel queries (24 with rows),
20.3 MB RSS growth over 200 outage requests, and 0 replayed outage spans.
The same run exercised a real Chromium admin login + admin SPA navigation, an
editor save, a 1.04 s inline DEV image transform via the admin oRPC client, a
real `job.run`, a traced 404, a content-hash verified startup gate, an
offline-startup frontend-withheld check, a same-document tamper-reject/recover
check (no navigation or reload, unsaved input preserved), the image `_sum`
panels returning `total_queue_ms`/`total_execution_ms`, and the delta-temporality
point check.

Local overhead comparison from that single run (5 server requests / 3 browser
navigations per phase, after one warm-up each; raw samples in ms):

```text
server  ON  [21.2, 19.2, 17.3, 22.2, 20.2]    median 20.2
        OFF [120.6, 31.2, 29, 33.3, 22.6]     median 31.2
nav     ON  [387.9, 380.3, 383.3]             median 383.3
        OFF [385.5, 371.1, 367.9]             median 371.1
LCP     ON  [160, 164, 160]                   median 160
        OFF [172, 156, 156]                   median 156
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
