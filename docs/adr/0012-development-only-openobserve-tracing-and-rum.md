# ADR-0012: Development-only OpenObserve tracing and privacy-minimized frontend RUM

- Status: proposed
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

The activation matrix is:

| Condition                                  | Result                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| Any production build, regardless of config | No provider, exporter, RUM initialization, or report |
| DEV + `trace.enabled=false`                | No-op                                                |
| DEV + enabled + valid server config        | Server traces/metrics                                |
| Above + valid frontend config              | Browser RUM is offered to the root loader            |
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
  IDs, metrics, and lifecycle. Before initialization and in production it is a
  pass-through/no-op.
- `runtime.ts` — DEV-only provider, propagator, batch processors, bounded
  queues, and OTLP exporters. It installs the facade delegate.
- `sanitize.ts` — the server attribute allowlist and error projector.
- `sqlite.ts` — the Trace-specific diagnostics-channel subscriber.
- `middleware.ts` — Hono request lifecycle, mounted by the HTTP perimeter.

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

Use the existing root React Router middleware entry for a document/`.data`
span. React Router `next()` returns error responses rather than throwing, so
status comes from the response. Do not change loader/action semantics or await
streamed loader promises merely to finish a span.

Instrument oRPC at the two existing transport seams:

- The Hono `/rpc/*` bridge wraps the actual network procedure.
- `createSsrCaller` wraps the in-process procedure invocation.

Procedure names come from the known API router/procedure path, never input
data. The two kinds carry `orpc.transport=http|in_process` so an SSR call is
not mistaken for an HTTP hop.

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
  user context, and free-form context. Development needs no source-map upload.
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

## Privacy, storage, and retention

The outbound contract permits only technical, low-cardinality fields required
for performance analysis. It forbids raw URLs/query/fragments, cookies,
authorization headers, request/response bodies, IP addresses, full user agent,
account/user/entity IDs, slugs, search text, content titles/bodies, SQL values,
arbitrary exception messages, DOM/text/input captures, and persistent visitor
identifiers.

Use an OpenObserve ingest pipeline as a second boundary to drop any forbidden
or unexpected RUM fields, including IP/geo/user/device enrichment if supplied
by the SDK or derived at intake. This pipeline is not a substitute for the
browser and server allowlists.

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

Document a single-container OpenObserve development command and an optional
`trace:up` convenience script. Normal `pnpm dev`, unit/integration tests, and
production builds must not require Docker or OpenObserve.

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
SPA navigation, an editor save, a slow query, a failed request, and an image
job. Verify:

- The expected server waterfall and browser RUM/Web Vitals arrive.
- A same-origin Fetch/XHR RUM event opens the corresponding server trace.
- The initial hard-navigation limitation is visible and documented, not
  misrepresented by a false join.
- OpenObserve contains no forbidden fixture values in traces, metrics, RUM,
  errors, resource attributes, or metric labels.
- Stopping OpenObserve causes no failed user journey, unbounded queue, or
  shutdown hang; restarting it resumes later exports without replaying old
  sensitive payloads.

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
