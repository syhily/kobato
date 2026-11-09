# ADR-0012: Development-only OpenObserve tracing and privacy-minimized frontend RUM

- Status: accepted
- Date: 2026-11-09

## Context

Kobato needs a development-time observability system that explains where time is
spent across the complete user path: browser loading and interaction, network
requests, Hono middleware, React Router loaders/actions, in-process and HTTP
oRPC calls, SSR streaming, SQLite/DuckDB, caches, outbound requests, image
workers, and background jobs. The existing Pino logs and SQLite debug timings
are useful but cannot reconstruct a request waterfall or connect browser
metrics to server work.

OpenObserve is the fixed observability product. It provides trace, metric, log,
RUM, error, dashboard, and source-map surfaces in one self-hosted deployment.
This ADR does not leave a backend migration or selection track open.

The hard requirements are:

1. Real collection and reporting code exists only in development builds.
2. No telemetry is emitted until the system-level OpenObserve configuration is
   complete and explicitly enabled.
3. Server tracing and frontend RUM both ship in this iteration.
4. Telemetry is best-effort, bounded, asynchronous, and never changes request,
   rendering, navigation, or shutdown correctness.
5. Privacy comes from not collecting sensitive data, not from relying on later
   redaction alone.

## Decision

Use **manual OpenTelemetry instrumentation for the Node server**, direct
**OTLP/HTTP export to OpenObserve**, and the **OpenObserve slim browser RUM SDK**
for frontend performance. Use only W3C `traceparent`/`tracestate` propagation
between browser Fetch/XHR calls and the server.

OpenObserve runs as an optional, external development service. It is not
embedded in Kobato, started by the production binary, or included in SEA assets.
An OTel Collector is not required by the default topology.

```text
Kobato development server
  ├─ manual OTel spans + a small metric set
  └─ bounded OTLP/HTTP export ───────────────┐
                                             ▼
Browser ── slim RUM + errors + Web Vitals ── OpenObserve
   │                                      ├─ Traces
   └─ same-origin traceparent on Fetch/XHR ├─ Metrics
                                           ├─ RUM / Errors
                                           └─ Dashboards
```

### Scope and non-goals

In scope:

- Server traces and a small set of duration/count metrics.
- Initial document performance, SPA views, same-origin Fetch/XHR, static and
  dynamic resources, long tasks, Web Vitals, and sanitized browser errors.
- Local OpenObserve setup, dashboards, lifecycle handling, and privacy tests.

Explicitly out of scope:

- Production telemetry or a production activation flag.
- Session Replay, DOM recording, user interaction recording, browser console
  forwarding, and `@openobserve/browser-logs`.
- Persistent visitor identity, advertising/product analytics, or joining RUM
  sessions to the existing page-view analytics identity.
- Continuous CPU/heap profiling, general server-log ingestion, alerts, and an
  always-on OTel Collector.
- Automatic tracing of process boot and migrations. Manual instrumentation
  starts with the running server; it does not require a module-preload hook.

Node `--cpu-prof`, Chrome DevTools, Lighthouse, Playwright, and k6 remain
complementary diagnostic tools rather than additional telemetry backends.

## Configuration and activation

Add infrastructure configuration through `CONFIG_TABLE`; do not add a blog
settings section, database row, admin autosave card, or public environment
variable.

```json
{
  "trace": {
    "enabled": false,
    "endpoint": "",
    "organization": "default",
    "serverAuthorizationHeader": "",
    "sampleRate": 1,
    "includeRedactedSql": false,
    "frontend": {
      "enabled": false,
      "applicationId": "",
      "clientToken": "",
      "sessionSampleRate": 100
    }
  }
}
```

`endpoint` is the OpenObserve origin, for example
`http://127.0.0.1:5080`. The server derives the OTLP trace and metric URLs from
`endpoint` and `organization`. `serverAuthorizationHeader` is the exact
server-only authorization value supplied by the OpenObserve OTLP ingestion
setup. It is never returned by a loader or written into browser configuration.

The frontend uses a separate, least-privilege RUM client token. That token is
visible to a browser by design, but it must not be baked into a static chunk:
the root loader returns a frontend bootstrap object only when all frontend
gates pass. Rotating the server authorization value must not require rotating
the RUM token, and vice versa.

Validation rules:

- `sampleRate` is in `[0, 1]`; `sessionSampleRate` is in `[0, 100]`.
- Plain HTTP is accepted only for a loopback OpenObserve endpoint. Other hosts
  require HTTPS.
- Reject endpoint URLs containing credentials, query strings, or fragments;
  validate `organization` as a closed path-segment grammar before deriving URLs.
- Server activation requires a valid endpoint and authorization header.
- Frontend activation additionally requires `frontend.enabled`, an application
  ID, and a RUM client token.
- An enabled but incomplete configuration emits one safe startup error and
  leaves the affected pipeline disabled. It never partially initializes and
  never prevents the development site from starting.
- Configuration remains a boot-time snapshot; changes require a restart.

`KOBATO_CONFIG_FILE` is the development-tooling config-path seam (not a
telemetry switch). The Vite CLI already owns `--config`/`-c`, so
`trace:smoke` cannot pass a throwaway config through that flag; the env var
points the DEV process at a temp file while leaving the repository file
untouched. Precedence is: `--config`/`-c` > `KOBATO_CONFIG_FILE` > SEA
`<execDir>/kobato.config.json` > `<cwd>/kobato.config.json` >
`~/.config/kobato.config.json`. The env path is resolved against cwd and treated
as explicit, so it is used even before the file exists. This seam does not
activate telemetry; the normal config gates still decide.

The activation matrix is:

| Condition                                  | Result                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| Any production build, regardless of config | No provider, exporter, RUM initialization, or report |
| DEV + `trace.enabled=false`                | No-op                                                |
| DEV + enabled + valid server config        | Server traces/metrics                                |
| Above + valid frontend config              | Candidate bootstrap only; no RUM yet                 |
| Above + O2 pipeline verification succeeds  | Browser RUM is offered to the root loader and CSP    |
| Browser DNT=`1` or GPC=`true`              | Browser SDK is not even downloaded                   |

Production may retain the small pass-through facade and inert config keys, but
not the real SDKs, providers, exporters, observers, or browser RUM package.
A production config containing `trace.enabled=true` produces at most one safe
warning and remains disabled.

## Module and build boundaries

Add a technical primitive under `src/server/infra/trace/` with no domain
knowledge:

- `config.ts` — validated activation and the server-only/browser-safe config
  projections.
- `facade.ts` — no-OpenTelemetry-import surface for `withSpan`, active trace
  IDs, counters/histograms, manual spans, and lifecycle. Before initialization
  and in production it is a pass-through/no-op.
- `runtime.ts` — DEV-only tracer/meter providers, propagator, batch/periodic
  processors and readers, bounded queues, OTLP exporters, and the event-loop
  observer. It installs the facade delegate and start/stops the SQLite
  subscriber.
- `sanitize.ts` — the closed span attribute/value allowlists and error
  projector.
- `metrics.ts` — the closed metric name/attribute/dimension catalog and the
  boundary recording helpers.
- `sqlite.ts` — the trace-only diagnostics-channel subscriber, independent of
  debug logging.
- `middleware.ts`, `react-router.ts`, `route-registry.ts` — Hono request
  lifecycle, root document/`.data` span, and the matched React Router pattern
  carried back to the Hono span through the shared `Request`.

The oRPC seam lives beside the HTTP layer as `src/server/http/orpc-trace.ts`
because both `app.ts` and `ssr-caller.ts` consume it.

The browser code lives in `src/client/lib/openobserve-rum.ts` (dynamic SDK
loading, initialization, cleanup) and `src/client/hooks/use-dev-rum.ts` (root
mount and route naming). The root loader receives only a narrow browser
bootstrap projection from `infra/trace/config`; update the existing route
import boundary allowlist explicitly. No route or UI component imports the RUM
SDK directly.

All new packages are `devDependencies` with versions in the pnpm catalog. Use
only the required OTel API/SDK, async context, semantic-convention, resource,
and OTLP trace/metric exporter packages plus
`@openobserve/browser-rum-slim`. Do not install the Node auto-instrumentation
meta package, the full RUM package, browser Zone.js context packages, or a Pino
transport.

Build-time dynamic imports behind `import.meta.env.DEV` own every real SDK
entry. Production DCE plus bundle checks must prove that `@opentelemetry/*`,
`@openobserve/*`, OTLP exporter paths, and RUM initialization are absent from
client, server, and SEA outputs. A source-only `if (DEV)` test is not sufficient.

## Server instrumentation

### Request and framework lifecycle

Mount the Hono root span after trust-proxy/request-ID setup and before
compression so it covers the complete application pipeline. It extracts only
W3C trace context, starts the async context, and finishes after `next()` with
method, normalized route template, response status, and error category. Raw
path, query, headers, client address, user agent, session, and viewer identity
are never attributes. `/health` and `/ready` are excluded by default.

The Hono router only knows the React Router catch-all, so the root React
Router middleware hands its matched un-interpolated `pattern` back through the
shared `Request` object (`infra/trace/route-registry.ts`); the Hono span uses
that template. Any request whose template still cannot be resolved collapses
to the fixed `react_router` category rather than the raw path. Spans are named
`http.server`, `rr.document`/`rr.data`, `orpc.<procedure>`, `ssr.shell`, and
`ssr.stream`.

Use the existing root React Router middleware entry for a document/`.data`
span. React Router `next()` returns error responses rather than throwing, so
status comes from the response. Do not change loader/action semantics or await
streamed loader promises merely to finish a span.

Instrument oRPC at the two existing transport seams:

- The Hono `/rpc/*` bridge wraps the actual network procedure.
- `createSsrCaller` wraps the in-process procedure invocation.

Both use oRPC's official client interceptor (`RPCHandler`'s
`clientInterceptors` and `createRouterClient`'s `interceptors`), which receives
the router-procedure path; no Proxy or monkey-patch is involved. Procedure
names come from the known API router/procedure path, never input data. The two
kinds carry `orpc.transport=http|in_process` so an SSR call is not mistaken for
an HTTP hop.

At `entry.server.tsx`, separate `ssr.shell` (until shell/all-ready) from
`ssr.stream` (until stream finalization, abort, or error). Preserve current
`streamTimeout`, bot behavior, nonce handling, and error responses.

### Infrastructure and jobs

Add spans only at meaningful boundaries:

- `db.sqlite.query` through `sqlite.db.query`; use the published duration and
  current request/job context. The Trace subscriber is independent of the
  debug-log subscriber. Default attributes are engine, operation, and duration.
  Only `includeRedactedSql=true` adds SQL after `redactBoundValues`; raw expanded
  SQL and bound values are never exported.
- `db.duckdb.query` at the analytics query execution boundary, with a stable
  metric/operation name rather than generated SQL.
- `cache.lookup` with bucket ID, hit/miss, and coalesced status; never cache keys
  or parameters, which can contain slugs, titles, email addresses, or URLs.
- `http.client` around the existing outbound-fetch surface with a known provider
  or operation name, method, status, and duration; no arbitrary host or URL.
- `image.worker` with queue and execution durations, operation, and coarse byte
  bucket; no file path or storage key.
- `job.run` around the scheduler's registered task with its catalog task key;
  no entity IDs or rendered notification content.

Do not emit orphan SQLite spans when no request/job context exists. Do not add
spans to individual domain functions by default.

Export a deliberately small metric set: HTTP/server duration and count, SSR
shell/stream duration, DB operation duration/count, cache lookup count, image
queue/execution duration, and event-loop delay. Metric dimensions use the same
low-cardinality route/procedure/operation names; trace IDs, session IDs, URLs,
and entity IDs are never metric labels. Resource attributes are limited to
`service.name`, `service.version`, and `deployment.environment=development`;
host, OS, process-command, and environment detectors stay disabled.

#### Phase 3 implementation notes (infrastructure spans and metrics)

The implemented boundaries are deliberately narrower than the illustrative
names above, and they are the contract future changes must preserve:

- **Metric pipeline.** `@opentelemetry/sdk-metrics` plus
  `@opentelemetry/exporter-metrics-otlp-http`, a `PeriodicExportingMetricReader`
  (10s interval, 3s export timeout) posting directly to the derived
  `…/v1/metrics` URL, and the same fixed three-key resource as traces. The
  exporter sets `temporalityPreference: AggregationTemporalityPreference.DELTA`
  (the SDK's documented delta selector), so counters and histograms export only
  each interval's increment; up-down counters stay cumulative. OpenObserve
  stores those points as `<name>_count`/`<name>_sum` increments, which is why
  dashboard panels total them with `sum(value)` inside a bucket. The
  closed catalog in `infra/trace/metrics.ts` is exactly:
  `http.server.duration`, `http.server.requests`, `ssr.shell.duration`,
  `ssr.stream.duration`, `db.operation.duration`, `db.operation.count`,
  `cache.lookup.count`, `image.queue.duration`, `image.execution.duration`, and
  `event_loop.delay`. Dimensions are `http.request.method`/`http.route`/
  `http.response.status_code`, `ssr.outcome`, `db.engine`/`db.operation`/
  `db.outcome`, `cache.bucket`/`cache.result`/`cache.coalesced`, and
  `image.operation`/`image.size_bucket`/`image.outcome`. An undeclared metric
  name, an undeclared attribute key, or a declared key with an invalid value
  drops the measurement, and non-finite/negative values never reach the SDK.
  `span.end(endTime)` and `SpanOptions.startTime` were added to the facade so a
  backend-reported duration can produce a correct span interval.
- **Event-loop delay** is an observable gauge over `perf_hooks`
  `monitorEventLoopDelay` (20ms resolution). The monitor is created only when
  the DEV runtime starts and disabled on stop; no host/process detector exists.
- **Shutdown/forceFlush** race tracer and meter through the same bounded
  timeout. `startDevTrace` remains idempotent, and HMR disposal stops the
  observer and both providers before the next instance starts. A failure in the
  post-provider startup tail (delegate install, SQLite subscribe, shutdown-hook
  registration, or any later step) runs one idempotent rollback: restore the
  no-op facade, disable the observer, stop the subscriber, unregister the hook,
  and bound-close both providers. No initialization error reaches the
  application, and a later start begins from a clean state.
- **SQLite** uses a dedicated `infra/trace/sqlite.ts` subscriber on
  `sqlite.db.query`, independent of the debug-log subscriber. A span is created
  only when a request/job span is already active; start/end are derived from the
  diagnostics duration, and the default attributes are only `db.engine` and
  `db.operation`. `includeRedactedSql=true` adds a 512-char
  `redactBoundValues(...)` form as `db.statement`; expanded SQL and bound
  values are never exported. Vitest never subscribes implicitly.
- **DuckDB** is instrumented at the single architecture boundary
  `runAnalyticsQuery` (all dashboard reads), with a closed operation name
  (`views`, `heatmap`, `counters`, `metric`, `metric_env`, `realtime`,
  `export`); SQL and bound parameters are not recorded. DDL/maintenance
  statements are intentionally outside this boundary.
- **Cache** instruments `through`/`get`/`throughMany` in the registry behavior
  plane. `cache.bucket`, `cache.result`, and `cache.coalesced` are the only
  labels; keys and params never appear in a span or metric.
- **Outbound** wraps the existing `safeFetch` implementation in a CLIENT span
  named `http.client` with `http.client.operation`, method, and status. Call
  sites pass a closed operation vocabulary; URLs, hosts, paths, and query
  strings are never attributes. The OTLP exporters do not use `safeFetch`.
- **Image worker** records queue wait (enqueue→dispatch) and execution
  (dispatch→settle) in `WorkerPool`, plus the same execution boundary for the
  inline DEV transform; only `image.operation`, a coarse `image.size_bucket`,
  and an outcome are labels. Captured spans end exactly once on success,
  worker error, timeout, or pool shutdown.
- **Jobs** record `job.run` in `scheduler-utils` with the fixed registered name
  and the catalog task key when bound. The span wraps the history recorder, so
  nested DB work parents under the job; no entity or notification content is
  recorded.
- **Tests** use real in-memory span exporters and a minimal `MetricReader`
  (the SDK 3.x line no longer ships `InMemoryMetricReader`), and cover privacy,
  parent/child context, no-context SQL drops, success/error, durations, and
  metric attributes without Docker or OpenObserve.

## Frontend RUM

### Initialization and React integration

Mount `useDevRum` once at the root. It reads the optional bootstrap from root
loader data, checks DNT/GPC before importing, and dynamically imports the slim
SDK in an effect after hydration. It renders no DOM and adds no Suspense
boundary, so SSR/hydration output is unchanged. Initialization is idempotent
under React StrictMode and HMR.

Use these privacy/performance defaults:

- `trackResources=true` and `trackLongTasks=true`.
- `trackUserInteractions=false`.
- `sessionReplaySampleRate=0`; never call the replay start API. The slim package
  must keep the recorder out of the bundle entirely.
- `defaultPrivacyLevel='mask'` as defense in depth even though Replay is absent.
- `telemetrySampleRate=0` unless diagnosing the RUM SDK itself.
- No `setUser`, global user context, view context containing path/search/params,
  custom geographic/device enrichment, or browser-log forwarding.
- `sessionSampleRate` defaults to 100 for low-volume development and can be
  lowered by config.

Use `useMatches` to name the active view with the deepest stable React Router
route ID (or a declared route template), never `location.pathname`,
`location.search`, content titles, or route params. Automatic SDK URLs are only
inputs to sanitization; they are not allowed to leave the browser unchanged.

The SDK may generate a random RUM session ID to group one short-lived browser
session. Kobato does not set it, persist a cross-session visitor ID, join it to
`analyticsEventId`, or attach account identity to it.

### Event sanitization and URL policy

All RUM events pass through one synchronous `beforeSend` policy. It uses an
allowlist and fails closed: an unknown event shape, sanitizer exception, or
unrecognized dynamic URL drops the event. A catch block must never return the
original event.

- View events retain route ID/template, timings, Web Vitals, navigation type,
  and coarse transfer sizes.
- Same-origin static `/assets/*` resources may retain their generated path and
  resource type. Known API/resource paths become route/procedure templates.
  Storage, image, draft, search, and other dynamic paths collapse to a fixed
  route family. Query and fragment are always removed.
- Cross-origin resources retain only resource type and, when needed for a known
  first-party asset CDN, the allowlisted origin. Signed URLs and arbitrary
  third-party URLs are dropped.
- Browser errors retain error name, sanitized stack frame locations, and a
  stable application error code when one exists. Replace arbitrary messages
  with a fixed category and remove request/response bodies, source snippets,
  user context, and free-form context. The slim SDK keeps only declared
  modifiable paths, so the raw stack is overwritten with the sanitized frame
  list (or `''`) and the O2 pipeline drops the stack column entirely. Development needs no source-map upload.
- Bound noisy event types per session (initially 500 resource events and 100
  sanitized errors); excess events are dropped, not persisted for retry.

Set `allowedTracingUrls` to a same-origin predicate with only the `tracecontext`
propagator. Exclude the existing analytics beacon, the OpenObserve intake, and
other fire-and-forget telemetry from activity/tracing injection. No baggage,
B3, or Datadog propagation is enabled.

The initial hard document navigation cannot carry a browser-injected
`traceparent`. This iteration therefore guarantees RUM-to-server correlation
for subsequent Fetch/XHR and SPA data requests, not automatic parentage between
the initial RUM document view and the initial SSR trace. Do not invent a
parallel user/session correlation key to hide that limitation.

### Browser transport and CSP

Use the SDK's documented direct OpenObserve transport rather than a custom
Kobato relay. The RUM client token is not the server OTLP credential. Configure
OpenObserve CORS for the exact development origin.

Only when DEV frontend RUM is active, add the validated OpenObserve origin to
the dynamic CSP `connect-src`. Keep `script-src` unchanged and load no CDN
script. Replay remains off, so this feature adds no new worker permission.
Production CSP remains unchanged.

#### Phase 4 implementation notes (frontend RUM)

- **Dependency.** `@openobserve/browser-rum-slim@0.4.3` is the only browser
  telemetry package: one `pnpm-workspace.yaml` catalog entry plus a
  `devDependencies` reference. Its transitive packages are
  `@openobserve/browser-core`, `@openobserve/browser-rum-core`, and
  `@openobserve/js-core`. The full `@openobserve/browser-rum`,
  `@openobserve/browser-logs`, Replay recorder, and CDN script are absent; the
  SDK is bundled and imported dynamically. The lockfile mentions
  `browser-logs` only as the slim package's optional peer metadata (it is not
  installed), and no source module imports it.
- **Real SDK contract.** The package exports `openobserveRum` (a `RumPublicApi`,
  re-exported as `DatadogRum`), `DefaultPrivacyLevel`, and the RUM event types.
  `beforeSend(event, context) => boolean` receives the fully assembled event
  (`RumEvent` = `view | view_update | resource | error | long_task | action |
  vital | transition`; the client never uses the action/vital members). Its
  editable URL fields are `view.url`/`view.referrer` (common) and
  `resource.url`/`error.resource.url`; `_o2.trace_id`/`span_id` are the padded
  32/16-hex W3C ids. The policy builds a fresh allowlisted object and replaces
  the SDK event in place. **SDK 0.4.3 constraint (verified against the actual
  assembly code and pinned by `rum-sdk-assembly.test.ts`):** the slim SDK wraps
  `beforeSend` in `limitModification`, deep-clones the event, and copies back
  ONLY its declared modifiable paths:
  `context`, `view.name`/`view.url`/`view.referrer`,
  `view.performance.lcp.resource_url`, `service`, `version`,
  `resource.url`, `resource.graphql.variables`,
  `resource.request.headers`/`resource.response.headers`,
  `error.message`/`error.stack`/`error.handling_stack`,
  `error.resource.url`/`error.fingerprint`, and
  `long_task.scripts[].source_url`/`invoker`. Deletions of anything else are
  discarded by the SDK. Every declared string path is therefore always written
  with a safe value (an empty string when no safe value exists), and object
  paths get `{}` placeholders so the SDK can clear the original. The
  OpenObserve ingest pipeline remains the authoritative removal boundary for
  non-modifiable fields.
- **View events cannot be dropped.** `shouldSend` ignores `beforeSend`'s
  `false` for `type === 'view'`. Before any operation that can throw, the
  policy overwrites the trusted route identity/fallback (`view.name`,
  `view.url`, `view.referrer`, `context`, `service`, `version`, LCP
  `resource_url`). If the route scope is unavailable or the projection fails,
  it returns `true` and lets the SDK send the minimal safe view; no catch path
  can restore the raw URL/query/fragment. A view is never silently claimed as
  dropped. Other event types still return `false` on failure. `view_update`
  receives the same pre-sanitize if it ever appears, but the browser collector
  does not emit it and SDK 0.4.3 has no modifiable-field table for it.
- **Transport mapping.** `site` is the endpoint **host** (port included),
  `insecureHTTP` is true only for a loopback `http:` endpoint,
  `organizationIdentifier` is the validated organization,
  `apiVersion: 'v1'`, `service: 'kobato'`, `env: 'development'`, and
  `version` is the build `APP_VERSION`. The SDK derives
  `<site>/rum/v1/<organization>/rum`, so the endpoint is never a separate
  "intake URL" setting. The RUM client token is the only credential in the
  browser; `serverAuthorizationHeader` has no path into the bootstrap.
- **Initialization.** `trackResources`/`trackLongTasks` on,
  `trackUserInteractions` off, `sessionReplaySampleRate: 0`,
  `startSessionReplayRecordingManually: true` (no replay API call exists in
  the code), `defaultPrivacyLevel: 'mask'`, `telemetrySampleRate: 0` plus
  `telemetryConfigurationSampleRate`/`telemetryUsageSampleRate: 0`,
  `profilingSampleRate: 0`, `trackAnonymousUser: false`,
  `trackResourceHeaders: false`, `propagateTraceBaggage: false`,
  `compressIntakeRequests: false`, `silentMultipleInit: true`,
  `traceSampleRate: 100`, `traceContextInjection: 'sampled'`, and no
  `setUser`, `setAccount`, `setGlobalContext`, `setViewContext`, geographic or
  device enrichment, browser-log forwarding, Replay start, or source-map
  upload.
- **Activation.** The root loader returns a `rum` key only when
  `currentTraceConfig().frontend` is non-null (DEV + enabled + complete
  server + complete frontend config). Disabled/production responses omit the
  key entirely. `useDevRum` is mounted once in the root `App`, renders
  nothing, and checks DNT/GPC and the strict bootstrap schema **before** the
  dynamic import — a denied browser never requests the SDK chunk. The import
  lives behind `import.meta.env.DEV`, and `startDevRum` is idempotent under
  StrictMode, repeated root revalidations, and HMR (the runtime state is a
  `Symbol.for` page-level slot; a full reload starts a new page runtime). A
  bootstrap that becomes null because the O2 gate was withheld is a temporary
  suspend: consent is revoked but the handle/route/poll stay alive, so the
  same document resumes via `startView` when the gate returns; consent recovery
  is poll-only, and a SPA route change/`startDevRum` while not-granted only
  updates the view name and restarts the poll. DNT/GPC, an
  invalid bootstrap, non-DEV, and real unmount fully stop the SDK/poll and do
  not auto-resume.
- **Route identity.** `useMatches` supplies the deepest route ID and its
  params. Params are used only as a right-to-left segment replacement map to
  derive the declared template (`/posts/:slug`, `/search/:keyword/page/:num`,
  `/admin/posts/:postId/analytics`, …); no pathname, search, params, or title
  is ever sent. The view name is the route ID and `view.url` is
  `<document origin><template>`. A splat route collapses to `/:*`; an
  unusable match becomes the fixed `unknown`/`/unknown` pair.
- **`beforeSend` allowlist.** Common fields: `type`, `date`,
  `application.id`, `service`, `version`, sanitized `o2tags` (only
  `sdk_version`/`env`/`service`/`version`), `session.id/type`,
  `view.id/name/url`, `source: 'browser'`, and the SDK metadata in `_o2`
  (`format_version`, `browser_sdk_version`, `sdk_name`, closed
  `session.plan`/`session_precondition`, numeric sampling rates). Trace ids
  are kept only on resource/error events. The projected clone drops `device`,
  `display`, `connectivity`, `privacy`, `usr`, `account`, `container`,
  `action`, and unknown fields; of those, `context` is modifiable and cleared,
  while the rest are non-modifiable SDK data and must be dropped by the O2
  ingest allowlist. GraphQL variables and request/response headers are cleared
  via their declared modifiable paths. Kobato never calls
  `setUser`/`setAccount`, so those fields are absent in real browser events.
- **Event-specific fields.** View: timings (`time_spent`, `loading_time`,
  `network_settled_time`, DOM milestones, `first_byte`), `loading_type`,
  event counts, and Web Vitals numbers (`cls.score`, `fcp`, `fid`, `inp` and
  its sub-parts; LCP `resource_url` is set to an empty string). Target
  selectors, rects, scroll depth, memory/CPU, and custom timings are removed
  from the clone (non-modifiable selectors/scroll remain SDK data for O2).
  Resource: `type`, `method`, `status_code`, `duration`, phase timings,
  delivery/render-blocking/protocol labels, and power-of-two **bucketed**
  `size`/`transfer_size` (never exact bytes); request/response headers become
  `{}` and GraphQL variables become `''` through the modifiable paths. Error:
  closed `type`, `source`, `handling`, a fixed `<source>_error` message, a
  stable `code` from the domain error's `code` or `http_<status>`,
  `handling_stack`/`fingerprint` cleared to `''`, and same-origin
  `/src|/assets|/node_modules/.vite|/@vite` frame locations only. Long task:
  `duration`, `blocking_duration`, `entry_type`, `is_frozen_frame`, plus
  `scripts[].source_url`/`invoker` cleared to `''`. Exact bytes, headers,
  selectors, raw performance objects, and other non-modifiable fields are
  additionally removed by the O2 pipeline.
- **URL policy.** Query strings and fragments are always removed. A
  same-origin `/assets/<generated>` path (one segment) keeps its exact path.
  oRPC HTTP paths are normalized to one stable dotted procedure template:
  `@orpc/client` joins the procedure path with `/`, so the real
  `/rpc/content/posts/bySlug` and the legacy `/rpc/content.posts.bySlug` both
  become `/rpc/content.posts.bySlug`. Only closed identifier segments
  (`[A-Za-z][A-Za-z0-9_]*`, 2–8 segments) are accepted; empty, encoded,
  mixed slash/dot, hyphenated, or over-deep paths are dropped. Vite DEV module
  sources keep their safe app-authored/generated path: `/src/**` source modules
  with a closed extension allowlist (ts/tsx/js/jsx/mjs/cjs/css/json/svg/images/
  fonts/wasm), the exact `/@vite/client`, `/@vite/env`, `/@react-refresh`
  entries, and `/node_modules/.vite/deps/<file>.js` optimized dependencies.
  `..`/`.` path segments (including encoded ones) are rejected before
  classification; `/@fs`, filesystem roots, source maps, user uploads, and
  arbitrary paths never match. Known dynamic paths fold to
  route/resource families: `/posts/:slug`, `/page/:num`, `/cats/:slug`,
  `/cats/:slug/page/:num`, `/tags/:slug`, `/tags/:slug/feed`,
  `/search/:keyword`, `/search/:keyword/page/:num`, the admin/editor dynamic
  ids, `/admin/:path`, `/editor/:path`, `/api/admin/backup/download/:id`,
  `/api/:endpoint`, `/images/:asset`, `/storage/:key`, `/fonts/:asset`,
  `/fonts-package/:asset`, `/music/:asset`, and a single unknown public
  segment as `/:slug` (only when it decodes to a slug-like value). `.data`
  suffixes classify the base path and re-append `.data`. Cross-origin URLs
  (including S3/signed URLs), credentialed URLs, non-http(s) schemes,
  self-telemetry (`/api/analytics/env`, `/api/analytics/events`), OpenObserve
  intake (`/rum/…`), probes, and unknown multi-segment paths are dropped.
- **Budgets.** 500 resource and 100 error events per SDK session; a session-id
  change resets both counters. Only accepted (sanitized) events consume
  budget, excess events are dropped without retry, and a dropped event is
  left untouched. The counters are a single `kobato.dev-rum.budget`
  `sessionStorage` entry carrying only the SDK session id and two integers, so
  a reload in the same tab continues the cap; blocked storage degrades to the
  in-memory runtime, and HMR keeps the same page-level runtime. A new SDK
  session id overwrites the entry (no unbounded keys).
- **Propagation.** `allowedTracingUrls` is one same-origin predicate with
  `propagatorTypes: ['tracecontext']`; `excludedActivityUrls` excludes the
  analytics beacon/SSE, OpenObserve intake, and `/health`/`/ready`. The
  injected `traceparent`/`tracestate` is exactly what the existing Hono W3C
  extractor consumes. No baggage, B3, Datadog/openobserve propagator, or
  `o2-trace-id` document meta is added, so the initial hard navigation keeps
  its documented lack of browser→server parentage.
- **CSP and CORS.** `buildCspHeader` appends the validated frontend
  `site` origin to `connect-src` only for DEV + active frontend RUM.
  `script-src`, `worker-src`, and production output are unchanged. OpenObserve
  must be configured with
  `ZO_CORS_ALLOWED_ORIGINS=http://localhost:4321` (the exact development
  origin, comma-separated, no wildcard) so the `/rum/v1/<org>/rum` POST passes
  CORS. This is a development-only service setting; Kobato never proxies RUM.
- **Tests.** `rum-sanitizer.test.ts` covers projection fixtures plus
  public/admin/editor routes, slugs, search queries, signed storage URLs,
  cross-origin resources, malformed events, hostile getters, scope failures,
  view fallback, and both caps; `rum-url-policy.test.ts` owns the URL matrix
  and DEV/RPC rejection cases; `rum-budget.test.ts` owns the cap/session/store
  behavior. `rum-sdk-assembly.test.ts` drives the REAL SDK
  `startRumAssembly`/`limitModification` path and proves the view-false
  limitation, the safe view fallback, and modifiable-field copy-back.
  `rum-route.test.ts` pins template derivation; `openobserve-rum.test.ts` pins
  the real init config, transport mapping, tracecontext-only predicate,
  idempotency, and the absence of server credentials. `use-dev-rum.test.tsx`
  proves DNT/GPC/absent bootstrap never request the SDK chunk and StrictMode
  initializes once.
  `tests/unit/arch/production-rum-bundle.test.ts` scans a real production
  build for every OpenObserve/RUM marker, and the source boundary test pins
  the slim-only dependency.

#### Phase 5 implementation notes (OpenObserve integration and real smoke)

- **Container and lifecycle.** `scripts/trace/up.ts` starts the pinned OSS image
  `openobserve/openobserve:v1.1.2` as one loopback-only container
  (`-p 127.0.0.1:<port>:5080`) with a dedicated named volume. It never uses a
  Collector and never touches Kobato's SQLite/DuckDB files or backup/SEA
  assets. `down [--volumes]` stops/removes the container and optionally the
  volume; `status` reports container, dashboards, stream retention, and the
  privacy pipeline. The container is created with
  `ZO_MMDB_DISABLE_DOWNLOAD=true`: O2 `v1.1.2` otherwise downloads ~59 MB of
  MaxMind GeoIP data on startup and blocks `/healthz` until it finishes, which
  made the smoke's stop/start health wait network-dependent (a 44 s first
  restart was observed locally, and a stalled download exceeded the 180 s
  budget). The local stack never consumes GeoIP fields, so disabling the
  download keeps startup offline and deterministic. Normal `pnpm dev`, tests, and builds do not import these
  scripts. Generated credentials live in the worktree's ignored `tmp/openobserve/`
  (mode 0600), never tracked, and are never printed by the tooling. `state.json`
  is parsed by a strict Zod schema (`version`, URL, org, ownership names, port,
  required strings). Container/volume names must match the closed
  `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` grammar; volumes are
  created with `kobato.trace=development`, and `down --volumes` refuses to
  remove any Docker resource whose name or label is not owned by this tooling.
  Corrupt/tampered state therefore cannot target unrelated Docker resources.
- **OTLP wiring.** Server export targets
  `http://127.0.0.1:5080/api/default/v1/traces` and `…/v1/metrics` with the
  `Basic` authorization value from the state file. O2 stores traces in the
  `default` stream (`service_name='kobato'`); metrics split into
  `<metric>_count`/`_sum`/`_bucket` streams (the base histogram stream has no
  rows). `trace:init` writes a ready-to-merge `trace` fragment containing the
  server header, the RUM application id, and a separate RUM client token. The
  RUM SDK sends that token as `?o2-api-key=`; CORS is configured with exact
  development origins only (`http://localhost:<port>` and
  `http://127.0.0.1:<port>`).
- **Retention.** O2 OSS retention is day-granular; 24 hours is not
  representable. `trace:init` sets the minimum per-stream `data_retention: 1`
  (one day) on `_rumdata`, the trace stream, and every Kobato metric stream.
  The server-wide `ZO_COMPACT_DATA_RETENTION_DAYS` fallback has a 3-day
  minimum, so a stream first observed after init keeps that fallback until the
  next `trace:init`. `status` reports the actual value.
- **Dashboards.** Four versioned O2 v8 dashboards live in
  `scripts/trace/assets/dashboards/` and are imported/updated by title:
  Overview, Server, Browser, and Correlation. They use real SQL against the
  stored traces/metrics/RUM, not screenshots. The Browser/Overview INP column
  is `view_inp_us`: O2 flattens the SDK's `view.performance.inp.duration` to
  `view_performance_inp_duration` in nanoseconds, and the VRL divides by 1000
  as a floating value (40,000,000 ns → 40,000 us). A missing interaction is
  `null`, never a fake 0. The Server dashboard also carries an outbound
  `http.client` panel plus `image_queue_duration_sum` and
  `image_execution_duration_sum` panels, and the `cache_lookup_count` panel.
  The exporter uses DELTA temporality, so each `_sum`/`_count` row is one
  export interval's increment; the panels total the increments per minute
  (`sum(value) AS total_*_ms` for images) rather than averaging a mean increment
  or re-summing cumulative snapshots, pinned by the asset contract test. The
  DEV inline path records queue wait 0 by construction so
  the queue stream exists; the smoke validates the stream, query, and
  `total_queue_ms` column, not a real queue wait (the execution duration is
  real and `total_execution_ms` must be positive). LCP/CLS/TTFB use the numeric
  `view_largest_contentful_paint`, `view_cumulative_layout_shift`, and
  `view_first_byte` fields. All RUM nanosecond duration fields used by the
  dashboards (LCP/FCP/TTFB/loading_time/resource_duration/long_task_duration)
  are divided by `1000.0` and aliased `_us`; `view_inp_us` is already
  microseconds. The asset contract test rejects any dashboard query that uses a
  RUM duration without this conversion. Correlation is two tables (RUM
  resources with `_o2_trace_id`, then server spans) because O2 `_search` does
  not join a logs stream to a traces stream in one query; the trace id is the
  join key in the UI.
- **Second privacy boundary (fail-closed allowlist).** The
  `kobato_rum_privacy` realtime pipeline runs `kobato_rum_privacy_drop`
  (`scripts/trace/assets/rum-privacy.vrl`) with `after_flatten: true` on
  `_rumdata`. The VRL copies an explicit allowlist into a fresh `safe` object
  and assigns `. = safe`, so every unnamed field — including a future SDK field
  and a field injected with a deliberate secret — is deleted by construction.
  Preserved: trace/span ids, RUM session/view random ids, route template,
  numeric Web Vitals (plus derived `view_inp_us`), durations/statuses, phase
  timings, power-of-two size buckets, and closed error fields. Removed by
  omission: IP/GeoIP/user-agent/device enrichment, identity/context, headers,
  exact sizes, DOM selectors, raw performance objects, error messages/stacks,
  and all unknown fields. `trace:init` must run before frontend RUM is enabled;
  the browser `limitModification` only copies declared paths, so it cannot be
  the removal boundary.
- **Startup gate (content-level).** `trace:init` computes the SHA-256 of the
  exact canonical `rum-privacy.vrl` content and stores it in the pipeline
  description (`vrl-sha256=...`, plus `allowlist-version=1`); the shared
  `trace-pipeline` contract pins the expected hash and the asset test fails if
  the VRL changes without updating it. On DEV startup, after installing the
  server trace/metrics delegate, `startDevTrace` queries `GET /api/<org>/pipelines`
  and `GET /api/<org>/functions` with the server-only OTLP authorization value.
  It verifies the pipeline name/version/hash description, `enabled === true`,
  source stream `_rumdata`/logs, exactly one input/function/output node and
  exactly two edges (input→function→output; bypass/extra nodes/edges rejected),
  and the function node's `after_flatten=true`. It also hashes the
  **actual stored function body** (after removing O2's ` \n .` sentinel) and
  compares it with the expected hash. The probe has a 1.5 s timeout and never
  throws. Only a successful result activates the process-wide frontend gate
  consumed by the root loader and CSP. A token guard makes cleanup
  runtime-scoped, so an HMR-disposed runtime cannot clear its replacement's
  gate. If O2 is offline at app startup, server traces/metrics still run and
  the frontend bootstrap is absent. A DEV runtime rechecks every 15 s (single
  interval, cleared on stop/HMR, token-scoped) and flips the gate both ways at
  runtime. A DEV-only `/api/dev/rum/status` endpoint returns only
  `{ enabled: boolean }` with `no-store`; the browser polls every 10 s, calls
  the slim SDK `setTrackingConsent('not-granted')` on false/error, stopping
  future assembly, and calls `stopSession()` on the first
  granted→not-granted transition. The slim SDK has no public API to discard an
  already-queued pre-consent batch, so it may flush once. The smoke therefore
  waits for the `_rumdata` row count and latest `_timestamp` to remain
  unchanged for a quiescence window, then asserts no new rows; its tamper body
  preserves all event fields and only invalidates the stored function hash, so
  a missing `date` cannot masquerade as a stopped page. It restores `granted`
  on recovery when DNT/GPC still allow and calls the slim SDK's documented
  manual-view API (`startView(current route id)`) in the same document, so the
  open page resumes collection without reload, navigation, or losing unsaved
  editor input. Maximum detection window is therefore ~25 s (15 s server +
  10 s browser, plus request time), not zero. The status path is excluded from RUM
  activity/tracing and resource events; production mounts no endpoint and the
  production CSP is unchanged. The smoke tampers with the stored function body
  while a browser is open (preserving fields, invalidating only the hash),
  waits for post-flush quiescence, restores the body, and checks that the same
  open editor tab resumes RUM in place via `startView` by polling for the
  editor view (no navigation/reload; unsaved input and the document token are
  unchanged). The final 2026-11-09 smoke run passed this scenario end to end.
- **Real smoke.** `pnpm run trace:smoke` starts throwaway O2 + DEV instances,
  seeds synthetic admin/post data, drives Chromium through a public page, an
  SPA navigation, a same-origin oRPC call, an uncaught error, a real Chromium
  admin login + admin SPA navigation, an editor title save, an image-library
  upload through the admin oRPC client (the DEV inline sharp path; 1.04 s in the run), a scheduled post that
  fires the real `content.scheduled-publish` `job.run`, and a missing-post 404.
  It then queries OpenObserve directly, runs all dashboard panel SQL, injects a
  real RUM event with an unknown secret-bearing field and an injected
  `view_performance_inp_duration=40_000_000`, verifies the unknown field is
  deleted while `_o2_trace_id`, a safe Web Vital, and `view_inp_us=40000`
  survive, and proves no view has a fake 0 INP. Synthetic known values
  (`2_000_000` ns LCP, `1_000_000` ns TTFB, `3_000_000` ns loading time) are
  asserted through the actual overview/browser panel SQL as `2000`, `1000`, and
  `3000` us. A delta-temporality check compares the sparse image
  `_count`/`_sum` point count with the per-collection `event_loop_delay` gauge
  point count, so a cumulative exporter cannot pass without any wall-clock
  timing assertion. It also checks the verified CSP origin, then the failure path:
  stopping O2 while serving, 200 requests for queue/RSS evidence, clean DEV
  shutdown, O2 restart, proof that the outage-window spans were not replayed,
  an offline-startup app boot whose HTML/CSP contain no frontend RUM, and the
  tamper/recover gate check. The final run on 2026-11-09 against the pinned
  image passed all 29 checks (644 server spans, 706 RUM rows, 24 HTTP metric
  rows, 25 dashboard panel queries / 24 with rows, 20.3 MB process-tree RSS
  growth over 200 outage requests, 0 replayed outage spans).
  The two image `_sum` panels returned `total_queue_ms=0` (DEV inline queue)
  and a positive `total_execution_ms` from `sum(value)` over delta increments.
- **Shared metric/stream catalog.** `src/shared/contracts/trace-metrics.ts` is
  the pure metric-name source for the server catalog and script retention
  filters. A contract test derives each metric's O2 stream name and requires it
  to match one of `TRACE_METRIC_STREAM_PREFIXES`, so a new metric cannot be
  silently omitted from retention/status checks.
- **Single telemetry URL predicate.** `rum-url-policy.ts` owns the only
  `/api/analytics/*`, `/health`, `/ready`, and `/rum/` exclusion logic and
  exports the tracing/activity predicates; `openobserve-rum.ts` reuses them
  rather than maintaining a second list.
- **Production bundle guard in CI.** `tests/unit/arch/production-rum-bundle.test.ts`
  scans the real `build/client` and `build/server` output for OpenObserve/RUM
  markers and server OTel implementation markers. Because the ordinary test
  job runs before any build and skips the test, `.github/workflows/ci.yml` now
  runs it explicitly in the build job after `pnpm run build` (push) or
  `pnpm run sea:build` (PR). Local unit runs remain build-free.
- **Local overhead comparison (one run, no universal claim).** The same smoke
  also repeats 5 server requests and 3 browser navigations with telemetry OFF
  after a warm-up. Raw samples (ms) from the final run:
  server ON `[21.2, 19.2, 17.3, 22.2, 20.2]`, OFF
  `[120.6, 31.2, 29, 33.3, 22.6]`; navigation ON
  `[387.9, 380.3, 383.3]`, OFF `[385.5, 371.1, 367.9]`; LCP ON
  `[160, 164, 160]`, OFF `[172, 156, 156]`. Medians: server
  20.2 → 31.2 ms, navigation 383.3 → 371.1 ms, LCP 160 → 156 ms. These are
  single-machine, single-run observations with substantial variance; they are
  not a general overhead guarantee.
- **Verified vs. unverified.** Verified in this environment: O2 1.1.2 OTLP
  traces/metrics ingest, RUM intake, CORS preflight for the exact origin,
  RUM token creation/reuse, 1-day per-stream retention, dashboard import and
  key-panel SQL, pipeline field removal, W3C RUM→server trace correlation,
  Web Vitals/resource/SPA view capture, sanitized error delivery, real admin
  login/SPA navigation, editor save, inline image transform, scheduled
  `job.run`, traced 404, unknown-field deletion, the startup verification gate,
  the O2-offline startup withholding path, content-level function hash + wiring
  verification, the 15 s runtime recheck, the no-store status endpoint,
  converted dashboard units, all secret fixtures absent, and the
  outage/restart behaviour. The tamper→quiescence→same-document `startView`
  recovery scenario is exercised by the smoke but still requires a green full
  rerun after the latest RUM fix. Not covered by the smoke: a genuinely slow
  SQLite query (no safe public scenario was manufactured; the real slow
  operation is the image transform, and SQLite latency is represented by the
  real `db.sqlite.query` spans). The local O2 instance has no MaxMind database,
  so no GeoIP columns were produced to remove end-to-end; the allowlist removes
  them by omission but that branch was not observed with real data. O2
  retention is day-granular, not 24 hours. The overhead samples above are
  local observations, not a universal performance claim.

## Privacy, storage, and retention

The outbound contract permits only technical, low-cardinality fields required
for performance analysis. It forbids raw URLs/query/fragments, cookies,
authorization headers, request/response bodies, IP addresses, full user agent,
account/user/entity IDs, slugs, search text, content titles/bodies, SQL values,
arbitrary exception messages, DOM/text/input captures, and persistent visitor
identifiers.

Use an OpenObserve ingest pipeline as a second, fail-closed allowlist boundary:
only explicitly safe fields are copied into the stored event, so IP/geo/user/
device enrichment and any unexpected field are dropped by default. This
pipeline is not a substitute for the browser and server allowlists, but it is
the mandatory storage-time enforcement point because the slim SDK's
`beforeSend` cannot delete arbitrary fields.

Keep OpenObserve bound to loopback in the documented local setup, with its own
admin credentials and a dedicated development data volume. Configure 24-hour
retention where supported, otherwise the shortest available retention. Trace,
metric, and RUM data never enters Kobato's SQLite/DuckDB files, backup archives,
or the SEA binary. Deleting the development volume deletes the telemetry.

## Failure, backpressure, and lifecycle

Server export uses batch processors with bounded queues and batch sizes, a
short export timeout, and no application-owned persistent retry queue. RUM uses
SDK batching plus the event caps above. Requests, React rendering, loaders, and
actions never await export. When OpenObserve is unavailable, data is dropped;
the site continues normally and emits at most rate-limited safe diagnostics.

`startDevTrace` and browser initialization are idempotent. HMR disposal disables
subscriptions/observers, restores the no-op facade, and performs a bounded flush
and provider shutdown so reloads cannot double-export. Process shutdown uses a
bounded lifecycle hook without delaying the existing database/server teardown
contract. Exporter, sanitizer, and observer failures never propagate into
application execution.

Record a one-time local overhead comparison for representative public, admin,
and editor journeys with telemetry off/on. The hard correctness budget is zero
request blocking and bounded memory; timing results are published with the
implementation rather than hidden behind a universal overhead claim.

## OpenObserve development setup and dashboards

The executable setup is documented in `scripts/trace/README.md`: a single
pinned OSS container, `trace:up`/`down`/`status`/`init`/`smoke` scripts, a
mode-0600 state file in the worktree's ignored `tmp/openobserve/` tree,
exact-origin CORS, and a ready-to-merge config fragment. Normal `pnpm dev`,
unit/integration tests, and production builds must not require Docker or
OpenObserve.

Provision four dashboards:

1. **Overview** — request rate, error rate, P50/P95/P99, slow routes, and
   frontend LCP/INP/CLS/TTFB.
2. **Server** — SSR shell/stream, oRPC, SQLite/DuckDB, cache, outbound, image
   worker, event-loop delay, and representative trace waterfalls.
3. **Browser** — hard/soft navigation, Web Vitals, long tasks, resource timing,
   sanitized errors, and cold/warm cache comparisons by route ID.
4. **Correlation** — RUM resource → same-origin server trace → DB/SSR spans,
   with trace IDs used as exemplars rather than metric labels.

Use synthetic development content for dashboards and verification. No
production data copy is required.

The OSS retention model is day-granular: `trace:init` applies the minimum
per-stream `data_retention: 1` (one day) to `_rumdata`, the OTLP trace stream,
and the Kobato metric streams. A 24-hour value is not representable; the
server-wide fallback enforces a 3-day minimum until the next init pass.

## Implementation plan

1. **Config and exclusion skeleton**
   - Add config schemas/example/env coverage and the browser-safe projection.
   - Add the no-op facade, DEV dynamic entries, dependency catalog entries, and
     production bundle guards.
   - Acceptance: disabled development emits nothing; enabled production remains
     inert and contains no real SDK.
2. **Server request waterfall**
   - Initialize providers/exporters; add Hono, React Router, both oRPC
     transports, SSR shell/stream, W3C extraction, and safe error projection.
   - Add an in-memory exporter/reader harness and lifecycle tests.
3. **Infrastructure spans and metrics**
   - Add SQLite, DuckDB, cache, outbound, image worker, jobs, the bounded metric
     set, and direct OpenObserve export.
   - Verify streamed loaders and the existing `unhandledRejection` behavior are
     unchanged.
4. **Frontend RUM**
   - Add the root bootstrap, lazy slim SDK, DNT/GPC gate, route naming,
     `beforeSend` allowlist, event budgets, CSP/CORS setup, and traceparent
     propagation.
   - Verify no Replay/full RUM/browser-logs package reaches any build.
5. **OpenObserve integration and dashboards**
   - Document local setup and retention; create the four dashboards and ingest
     drop policy.
   - Run real server + browser journeys against OpenObserve, inspect actual
     stored fields, and record the overhead comparison.

All five slices are in this iteration; frontend delivery is not deferred to a
later ADR.

## Verification and acceptance

### Automated, without Docker

- Config tests cover defaults, env coercion, invalid endpoints/credentials,
  partial frontend config, sampling ranges, and production/disable gates.
- Facade tests prove passthrough behavior, async context, error/status mapping,
  idempotent start/stop, and no application throw from telemetry failures.
- Server integration tests use in-memory OTel readers/exporters to verify Hono →
  React Router/oRPC → SQLite/SSR relationships, 304/redirect/error behavior,
  stream completion, and absence of orphan DB spans.
- SQL fixtures include content, email, token, numeric, blob, and quoted values;
  exported spans contain none of them. Raw SQL is absent by default.
- RUM policy tests cover public/admin/editor routes, dynamic slugs, search
  queries, signed asset URLs, arbitrary cross-origin resources, malformed event
  shapes, sanitizer exceptions, DNT/GPC, StrictMode, and event caps.
- The browser SDK is mocked in unit tests; tests assert that denied/disabled
  browsers do not even import it.
- Existing browser/SEA tests assert no RUM requests, no traceparent injection,
  no RUM bootstrap, and unchanged production CSP.
- Production build and SEA bundle scans fail on OTel/OpenObserve SDK or exporter
  inclusion. Standard `pnpm run fmt`, `lint`, `type`, `test`, `build`, and SEA
  smoke/browser suites remain green.

### Real OpenObserve smoke

With the local service running, exercise a public detail page, search, an admin
SPA navigation, an editor save, a slow operation, a failed request, and an
image job. The repeatable `pnpm run trace:smoke` covers the public page, an SPA
navigation, a same-origin oRPC call, an uncaught browser error, a real admin
login + admin SPA navigation, an editor save, a DEV inline image transform, a
scheduled `job.run`, a traced 404, the full Hono/React Router/oRPC/SQLite/SSR
waterfall, metrics, RUM/Web Vitals/resources, dashboard panel queries, the
fail-closed privacy pipeline, a real unknown-field injection, and the
outage/restart path plus a startup gate verification and an O2-offline
frontend-withheld boot and a tamper-reject/recover gate check. It was run
successfully on 2026-11-09 (29/29 checks, O2 `v1.1.2`).

Verified:

- The expected server waterfall and browser RUM/Web Vitals arrive.
- A same-origin Fetch/XHR RUM event opens the corresponding server trace.
- The initial hard-navigation limitation is visible and documented, not
  misrepresented by a false join.
- OpenObserve contains no forbidden fixture values in traces, metrics, RUM,
  errors, resource attributes, or metric labels.
- A real RUM event with a flattened `view_performance_inp_duration=40_000_000`
  is stored as `view_inp_us=40000`; browser views without an interaction are
  `null`, never a fake 0.
- The root loader/CSP expose the O2 origin only after the startup pipeline
  verification succeeds; an offline O2 startup serves the page with no frontend
  bootstrap and no O2 `connect-src`.
- The Server dashboard's outbound, image-queue, and image-execution panels
  execute against real stored metric streams; the two `_sum` panels return
  `total_queue_ms`/`total_execution_ms` from `sum(value)`, and execution is
  positive while the DEV inline queue stays 0.
- Stopping OpenObserve causes no failed user journey, unbounded queue growth,
  or shutdown hang; restarting it resumes later exports without replaying old
  sensitive payloads.

Not covered by the smoke: a genuinely slow SQLite query (the real slow
operation is the inline image transform; SQLite work is represented by real
`db.sqlite.query` spans), GeoIP field removal against real GeoIP data (the
local instance has no MaxMind database), and any universal overhead claim
(the local samples and medians are recorded above). O2 retention is one day
(the OSS minimum), not a literal 24h window. The outage-path process-tree RSS
observation was 20.3 MB growth over 200 requests in the final run.

## Consequences

- Developers get one self-hosted UI for full-stack performance without running
  the Grafana stack or Sentry.
- Frontend support adds a development-only CSP/CORS dependency and a public RUM
  client token; the server OTLP credential remains private.
- Direct export avoids Collector operations but provides no Collector-based
  tail sampling. Development defaults to explicit head/session sampling and
  bounded volume instead.
- The slim SDK and `beforeSend` policy deliberately discard some useful-looking
  context. Missing raw URLs, user identity, DOM state, and full errors are
  expected privacy behavior, not bugs to work around.
- RUM/backend correlation begins with browser-initiated Fetch/XHR. Initial hard
  document loads remain separate server and browser observations.
- SDK upgrades require rerunning the real-payload privacy smoke because an
  upstream field addition can bypass assumptions not covered by the allowlist.
- The no-op facade is a permanent small architectural seam; the real telemetry
  implementation remains development-only.

## Rejected alternatives

- **Tempo/Grafana or Sentry as an additional backend** — OpenObserve already
  covers the required trace, metric, RUM, error, and dashboard surfaces; a second
  platform increases cost and privacy review without answering this requirement
  better.
- **Runtime-only disabling in a production bundle** — an inactive exporter is
  still shipped attack/privacy surface and dependency weight; production must
  physically exclude the implementation.
- **Full Node auto-instrumentation** — it initializes through a preload seam,
  captures fields Kobato does not need, and makes URL/error/resource privacy
  harder to prove. Manual boundary instrumentation is sufficient.
- **Full OpenObserve RUM plus Replay and browser logs** — unnecessary DOM,
  interaction, identity, and error context creates disproportionate privacy and
  performance risk. The slim package is the required browser dependency.
- **A custom same-origin OpenObserve proxy** — it would reimplement a supported
  RUM transport, credential handling, CORS, and backpressure while adding a new
  unauthenticated write perimeter. A dedicated browser RUM token plus strict
  egress sanitization is simpler and uses the supported integration.
- **Mandatory OTel Collector** — useful for tail sampling and centralized
  processing, but unnecessary operational weight for a single local development
  process. Direct OTLP is the default; this ADR does not create another backend
  migration path.
