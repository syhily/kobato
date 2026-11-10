# ADR-0007: Observability: OpenObserve traces, metrics, logs, and browser RUM

- Status: accepted
- Date: 2026-11-10
- Supersedes: the former separate release-capability and browser-RUM-relay ADRs

## Context

Kobato must explain where time goes across the whole user path: browser loading and
interaction, network requests, Hono middleware, React Router loaders and actions,
in-process and HTTP oRPC, SSR streaming, SQLite/DuckDB, caches, outbound fetches, image
workers, background jobs, and server logs. Pino logs and SQLite debug timings alone
cannot reconstruct a waterfall or connect browser metrics to server work.

OpenObserve is the fixed product — traces, metrics, logs, RUM, errors, dashboards, and
source maps in one self-hosted deployment — so no backend selection stays open.
Operators must see their site's latency, errors, and Web Vitals without rebuilding the
binary or editing a config file they may not have. Telemetry is best-effort, bounded,
asynchronous, and never changes request, rendering, navigation, or shutdown
correctness; privacy comes from not collecting sensitive data, not from later
redaction.

## Decision

### Topology

Manual OpenTelemetry instrumentation for the Node server, direct OTLP/HTTP export to
OpenObserve, and the slim browser RUM SDK posted through a same-origin relay. Only W3C
`traceparent`/`tracestate` propagate between browser Fetch/XHR and the server; no
baggage, B3, or Datadog propagation.

```text
Browser ── slim RUM + errors + Web Vitals ──▶ POST /api/rum/intake/rum/v1/<org>/rum
   │  same-origin traceparent on Fetch/XHR      │ server injects the RUM client token
   ▼                                            ▼
Kobato server ─ manual spans + metrics + logs ─▶ OpenObserve (OTLP/HTTP)
                                                  ├─ Traces, Metrics
                                                  ├─ RUM / Errors (_rumdata)
                                                  └─ kobato_logs, Dashboards
```

OpenObserve is external: not embedded in Kobato, not started by the binary, not in SEA
assets, and no OTel Collector is required.

In scope: server traces and a small duration/count metric set; document and SPA
performance, same-origin Fetch/XHR, resources, long tasks, Web Vitals, sanitized
errors; a closed-projection export of the app's own Pino lines. Out of scope: session
replay, DOM or interaction recording, console forwarding, `@openobserve/browser-logs`,
product analytics, joining RUM to the page-view analytics identity,
profiling, alerts, an always-on Collector, arbitrary log ingestion, Node
auto-instrumentation, and tracing process boot. Visitor identity stays out of scope by
default; the only exception is the opt-in, consent-gated coarse forwarding under
"Request identity forwarding" below.

### One configuration source

Runtime configuration lives in the `blog.observability` settings row
(`admin.settings.observability`). `kobato.config.json` has **no** observability keys,
and no environment variable can enable telemetry.
`domains/observability/runtime-manager.ts` hot-applies the row: a fingerprint change
stops and restarts providers, `enabled: false` stops them, and an invalid or unverified
configuration never constructs a provider. Secrets (`password`, `rumClientToken`) are
encrypted under `security.encryptionKey` like every other settings secret. The site name
doubles as the OpenObserve organization **and** the RUM application id; the connection
test lists the organizations the credentials can reach and creates the named one when
absent, never silently reusing another.

Two keyed HMAC fingerprints (`obs2`, purpose `observability`), keyed with
`security.encryptionKey` because they are exposed to the admin UI:

- **CONNECTION** — endpoint, organization, username, password; stored as
  `verifiedFingerprint` after a successful test, and the runtime activates only while it
  matches.
- **RUNTIME** — every pipeline-affecting value (connection fields, sample rate,
  `includeRedactedSql`, logs switch, frontend switch and sample rate); drives restart
  detection only, so flipping a reporting switch after a verified test restarts providers
  without a re-test.

There is no build-time telemetry gate: development and production run the same
semantics, and `import.meta.env.DEV` survives only as the `env` label. The server derives
the OTLP trace, metric, and log URLs from `endpoint` and `organization`; its authorization
value never leaves the process or enters browser configuration, and the server credential
and RUM client token rotate independently. The SEA binary carries the server OTel SDK
(dynamic import; the chunk loads only for a configured site) inside the 230 MB CI budget.

Validation (`shared/config/observability.ts`): `sampleRate` ∈ [0,1] and frontend
`sessionSampleRate` ∈ [0,100]; endpoint URLs reject credentials, query strings, and
fragments, and `organization` is validated against a closed path-segment grammar before
any URL is derived. `isSecureObservabilityOrigin` accepts HTTPS anywhere and plain HTTP
only for loopback and private/reserved IP literals (`http://192.168.x.x:5080`,
`http://10.x`, `http://[fd00::…]`); a public plaintext hop and every hostname stay
rejected, because the ingestion credential rides every server→OpenObserve request and a
hostname cannot be classified without DNS. An enabled but incomplete configuration emits
one safe startup error with field names only and leaves the affected pipeline disabled
without preventing the site from starting. `KOBATO_CONFIG_FILE` is the dev-tooling
config-path seam (the Vite CLI owns `--config`/`-c`); precedence is `--config`/`-c` >
`KOBATO_CONFIG_FILE` > SEA `<execDir>/kobato.config.json` > `<cwd>/kobato.config.json` >
`~/.config/kobato.config.json`, resolved against cwd and applied before the file exists.
It activates nothing.

### Provisioning and verification gate

`admin.observability.testConnection` ensures the organization, probes the version,
installs the RUM privacy pipeline and function, creates or reuses the RUM client token,
imports or updates the four versioned dashboards by title, writes the token back into
the encrypted settings row, and starts the runtime. Every step is idempotent, so the
failure mode is a retry, not a duplicate; an asset-sync failure is reported alongside
`ok: true` and retried through `admin.observability.provision`. The management client
itself already absorbs transient blips: idempotent GETs retry exactly once after a
250 ms backoff on `network`/`timeout` failures (an answered status, even 5xx, is an
upstream decision; mutations never retry). Bundled assets carry a
`provisionedFingerprint`: at boot the server re-provisions when the build's fingerprint
changed, installing new dashboards and pipeline without an admin click and without
overwriting the operator's other OpenObserve objects. The pipeline identity is
content-addressed: the SHA-256 of the canonical `rum-privacy.vrl` is stored in the
pipeline description (`vrl-sha256=…`, `allowlist-version=2`) and pinned by the
`trace-pipeline` contract, whose asset test fails if the VRL changes without updating
it.

After installing the server trace/metrics delegate, the runtime queries
`GET /api/<org>/pipelines` and `GET /api/<org>/functions` with the server-only OTLP
credential and verifies the name/version/hash description, `enabled: true`, source
stream `_rumdata`, exactly one input/function/output node and exactly two edges
(input→function→output; bypass or extra nodes/edges rejected), `after_flatten=true`, and
the SHA-256 of the **actual stored function body** after removing O2's ` \n .` sentinel.
The probe has a 1.5 s timeout and never throws. Only success activates the process-wide
frontend gate consumed by the root loader, the CSP, and the relay; a token guard keeps
cleanup runtime-scoped so an HMR-disposed runtime cannot clear its replacement's gate.
An offline, failed, or stopped pipeline withholds browser RUM and closes the relay at
the same instant, while server traces/metrics/logs keep running.

A single 15 s interval (cleared on stop/HMR) rechecks and flips the gate both ways at
runtime, and the browser polls `/api/rum/status` every 10 s, so the maximum detection
window is about 25 s plus request time, not zero. `/api/rum/status` is mounted in every
build, answers `{ enabled: boolean }` with `no-store`, reads the gate in the handler
because settings changes never re-mount the router, is exempt from the install gate, and
is excluded from HTTP spans and RUM activity/tracing; the former DEV-only
`/api/dev/rum/status` does not exist. Stream retention is opt-in: `observability.retentionDays = 0`
(the default) leaves the operator's OpenObserve policy untouched, while a positive value makes
the server enforce it on every settings save, at boot, and once delayed (60 s) after the
runtime enters `running` — first-ingest-created streams exist only then — with drift-only
writes (OSS granularity is one day); development tooling owns only the 1-day dev-container policy.

### Server instrumentation

Mount the Hono root span after trust-proxy/request-ID setup and before compression so it
covers the complete pipeline. It extracts only W3C trace context, starts the async
context, and finishes after `next()` with method, normalized route template, response
status, and error category; raw path, query, headers, client address, user agent,
session, and viewer identity are never attributes, and `/health`/`/ready` are excluded.

The Hono router only knows the React Router catch-all, so the root React Router middleware
hands its matched un-interpolated `pattern` back through the shared `Request`
(`infra/trace/route-registry.ts`); an unresolvable template collapses to the fixed
`react_router` category. Span names are `http.server`, `rr.document`/`rr.data`,
`orpc.<procedure>`, `ssr.shell`, and `ssr.stream`.

Use the existing root React Router middleware entry for the document/`.data` span;
`next()` returns error responses rather than throwing, so status comes from the response,
and loader/action semantics or streamed loader promises are never changed to finish a
span. Instrument oRPC at the two transport seams with oRPC's official interceptors —
`RPCHandler`'s `clientInterceptors` for the Hono `/rpc/*` bridge and
`createRouterClient`'s `interceptors` for `createSsrCaller` — with procedure names from
the router path, never input data, and no Proxy or monkey-patch. The two kinds carry
`orpc.transport=http|in_process` so an SSR call is not mistaken for an HTTP hop. In
`entry.server.tsx`, separate `ssr.shell` (until shell/all-ready) from `ssr.stream` (until
stream finalization, abort, or error), preserving `streamTimeout`, bot behavior, nonce
handling, and responses.

Add infrastructure spans only at meaningful boundaries, and never record expanded SQL or
bound values, cache keys or parameters, hosts, URLs, paths or query strings, file paths
or storage keys, entity IDs, or notification content:

| Span              | Boundary                                          | Attributes                                                                                                     |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `sqlite.db.query` | `sqlite.db.query` channel, only in an active span | engine, operation, duration; `db.statement` only with `includeRedactedSql=true` (512-char `redactBoundValues`) |
| `db.duckdb.query` | `runAnalyticsQuery`                               | closed operation: `views`, `heatmap`, `counters`, `metric`, `metric_env`, `realtime`, `export`                 |
| `cache.lookup`    | `through`/`get`/`throughMany`                     | bucket, hit/miss, coalesced                                                                                    |
| `http.client`     | `safeFetch`                                       | closed operation, method, status, duration                                                                     |
| `image.worker`    | `WorkerPool` queue wait and execution             | operation, power-of-two size bucket, outcome                                                                   |
| `job.run`         | scheduler registered task                         | catalog task key                                                                                               |

The SQLite subscriber is independent of the debug-log subscriber, Vitest never subscribes
implicitly, and DDL/maintenance stays outside the DuckDB boundary. The OTLP exporters do
not use `safeFetch`. Do not add spans to individual domain functions by default.

The metric catalog in `infra/trace/metrics.ts` is exactly `http.server.duration`,
`http.server.requests`, `http.server.active_requests`, `ssr.shell.duration`,
`ssr.stream.duration`, `db.operation.duration`, `db.operation.count`,
`cache.lookup.count`, `image.queue.duration`, `image.execution.duration`,
`event_loop.delay`, and `rum.relay.outcomes`. Dimensions
are `http.request.method`/`http.route`/`http.response.status_code`, `ssr.outcome`,
`db.engine`/`db.operation`/`db.outcome`, `cache.bucket`/`cache.result`/`cache.coalesced`,
and `image.operation`/`image.size_bucket`/`image.outcome`. An undeclared metric name,
undeclared attribute key, or declared key with an invalid value drops the measurement,
and non-finite values never reach the SDK (counters and histograms also drop negatives;
the up-down counter keeps signed deltas). Export uses
`@opentelemetry/sdk-metrics` with a `PeriodicExportingMetricReader` (10 s interval, 3 s
export timeout) and DELTA temporality, so counters and histograms export only each
interval's increment while up-down counters stay cumulative and OpenObserve stores
`<name>_count`/`<name>_sum` increments. Event-loop delay is an observable gauge over
`perf_hooks` `monitorEventLoopDelay` (20 ms resolution), created only while the runtime
runs. `http.server.active_requests` is an up-down counter labeled by method only (+1/-1
around the request middleware; the route template is unknown while in flight).
`rum.relay.outcomes` counts relay terminal outcomes on the closed vocabulary
`ok`/`upstream_error`/`rate_limited`/`oversized` — the relay's only quantified health
signal (client-shape rejections like 404/414/415 are not relay health). Resource
attributes are limited to `service.name`, `service.version`, and
`deployment.environment`; host, OS, process-command, and environment detectors stay
disabled. Trace IDs, session IDs, URLs, and entity IDs are never metric labels.

Server logs are a deliberately narrow, privacy-projected export of the application's own
Pino lines — a closed record projection, not a general log pipeline. The logs switch is
subordinate to the master switch; a logs-only configuration emits one warning carrying
only `trace.logs.enabled`/`trace.enabled` and stays disabled.

- **Sink seam.** The Pino writable writes stdout first and forwards the exact same
  serialized line to `logger/sink.ts`; the sink cannot affect stdout or the stream
  callback. It installs only into an empty slot, is cleared by identity, and isolates sink
  exceptions with a synchronous re-entry fence (the Writable guard spans its callback so a
  sink that logs cannot recurse). No Pino transport.
- **Projection.** `log-record.ts` is SDK-free with no logger import. It drops lines over
  32 KiB UTF-8, malformed or non-object JSON, `debug`/`trace`/unknown levels,
  marker-bearing (`{E}`/`{/E}`/`[REDACTED]`) messages, and every `scope=trace` record.
  Info/warn/error/fatal map to OTel severity 9/13/17/21. An HTTP record (a `req` object)
  never reads `msg`: its body is one of
  `HTTP request completed`/`HTTP request rejected`/`HTTP request failed` from severity and
  status; other bodies are the static message with control characters stripped, 200 code
  units max. Closed attributes: `log.scope` (validated grammar; `http`/`app` defaults),
  `http.request.method`, `http.response.status_code`, `error.type`, `error.category`.
  Nothing else is read, spread, or traversed.
- **Pipeline.** `logs-runtime.ts` exports OTLP/HTTP to `/v1/logs` with `Authorization`
  plus `stream-name: kobato_logs` (the shared `TRACE_LOG_STREAM` constant),
  `timeoutMillis: 3000`, `concurrencyLimit: 1`, a `BatchLogRecordProcessor` (1024 queue /
  256 batch / 1 s delay / 3 s timeout), and `logRecordLimits` of 8 attributes / 256
  characters. Records carry no explicit context or exception, so the SDK attaches the
  active span's ids.
- **Column contract (OpenObserve v1.1.2).** The `stream-name` header creates an
  independent logs stream (never `_json`); `_search` returns `body`, `severity`,
  `severity_number`, `log_scope`, `http_request_method`, `http_response_status_code`,
  `trace_id`, `span_id`, `service_name`, `service_version`, `deployment_environment`,
  `instrumentation_library_name`/`_version`, `dropped_attributes_count`, and `_timestamp`.
  No `msg`, `req`/`res`, header, URL/query, request id, pid, hostname, or error
  message/stack/cause column exists, and dashboard SQL uses only these.

Correlation: RUM ↔ server trace is exact through W3C `traceparent`/`_o2_trace_id` for
browser-initiated Fetch/XHR (an initial hard navigation has no browser parent); server
trace ↔ server log is exact because the record is emitted inside the request's active
span, so both ids equal the `http.server` span. **Metric ↔ trace is approximate only**:
they share the fixed resource and closed route/status dimensions and a dashboard time
bucket anchors the drill-down, but there is no exemplar or TraceID join.
`trace_id`/`span_id` must never be added as metric labels (unbounded cardinality and
privacy), and log rows must never stand in for metric rows.

### Browser RUM: bootstrap, relay, sanitizer

`@openobserve/browser-rum-slim` is the only browser telemetry package (one
`pnpm-workspace.yaml` catalog entry plus a `devDependencies` reference) with transitive
`browser-core`, `browser-rum-core`, and `js-core`; the full RUM package, `browser-logs`,
the Replay recorder, and any CDN script stay out of the tree and every bundle. The SDK is
bundled and dynamically imported, and `use-rum`'s `import.meta.env.SSR` early return
removes the dynamic-import edge from the server graph, so the SSR/SEA bundle carries no
browser SDK.

The bootstrap from `shared/contracts/trace.ts` carries only
`{ applicationId, service, environment, sessionSampleRate, clientIdentity }` — no
endpoint, organization, or credential. The SDK's mandatory `clientToken` is the public constant
`RUM_RELAY_CLIENT_TOKEN` (`'kobato-relay'`), which never leaves the relay unrewritten;
`resolveTraceConfig` projects the endpoint/organization/token only into the server-side
`frontendRelay`. The root loader emits the `rum` key only when the gate is open and omits
it entirely otherwise.

`useRum` mounts once at the root, renders nothing, checks DNT/GPC and the strict bootstrap
schema **before** the dynamic import (a denied browser never requests the SDK chunk), and
is idempotent under StrictMode, repeated revalidations, and HMR (page-level `Symbol.for`
slot). Consent recovery is poll-only: false/error calls `setTrackingConsent('not-granted')`
and the first granted→not-granted transition calls `stopSession()`; recovery resumes the
same document through `startView(current route id)`, preserving unsaved editor input
without reload or navigation. DNT/GPC, an invalid bootstrap, and a real unmount stop the
SDK and poll without auto-resume.

The relay is the only browser→OpenObserve path: `openobserve-rum.ts::rumIntakeProxyUrl`
rewrites every intake URL onto the document origin, so batches arrive at same-origin
`POST /api/rum/intake/rum/v1/<org>/rum`, handled by `http/resources/rum-intake.ts`:

- reads the same gate entry as the bootstrap (`frontend-gate.ts` carries a server-only
  `FrontendRumRelay` — endpoint, organization, provisioned token);
- fail-closed validates `/rum/v1/<org-segment>/rum` with one organization-grammar segment;
  replay, logs, another apiVersion, or a malformed segment is a 404. The inbound segment is
  discarded — the upstream uses the gate's organization, which the browser never learns;
- caps the query at 4 KiB and the body at 1 MiB (declared length first), with a dedicated
  per-IP bucket (`tryRumIntakeRateLimit`, 240/min);
- vetoes any `content-encoding` other than `identity` with a 415: the body is relayed as
  decoded UTF-8 text and no encoding header is forwarded, so a compressed batch could only
  arrive corrupted upstream (browsers never compress request bodies, so this rejects only
  non-standard clients);
- injects the real token server-side: every inbound `o2-api-key` (placeholder, forged,
  duplicates) is deleted and the provisioned token appended;
- forwards with `safeFetch` (`trustedOrigin` = configured endpoint, 5 s timeout, no
  redirects, operation `observability.rum.relay`), answering `202` on success and a
  detail-free `502` on failure; the upstream URL, status, and token never reach the caller
  or a log line. Every terminal outcome increments the closed-vocabulary
  `rum.relay.outcomes` counter, and rejections carry a backoff hint the SDK may ignore
  (`Retry-After: 60` on 429 — the fixed bucket window — and `Retry-After: 5` on 502);
- attaches request identity only in `forward` mode (see below): `X-Forwarded-For` with
  the trusted-proxy-resolved client address plus the browser's original `User-Agent`. In
  the default `anonymous` mode no identity header leaves the process.

The path is mounted in every build beside `/api/rum/status`, exempt from the install gate,
excluded from HTTP spans (prefix exclusion in `infra/trace/middleware.ts`) and from RUM
activity/tracing/resources (the client URL policy drops `/api/rum/intake`).
`buildCspHeader` never widens `connect-src`: same-origin `'self'` covers the relay, the
OpenObserve origin never appears in a policy, `script-src`/`worker-src` are unchanged, and
OpenObserve needs no `ZO_CORS_ALLOWED_ORIGINS` entry for the site (the dev container keeps
its setting for direct browser→O2 debugging only).

### Request identity forwarding (`observability.frontend.clientIdentity`)

By default (`anonymous`) the relay forwards no request identity, so OpenObserve enriches
every RUM batch from the relay's own peer address — enrichment the privacy pipeline then
drops. Operators who want country-level geography and browser/OS/device-family statistics
can switch to `forward`, a three-sided contract:

- **Relay.** Every relayed batch carries `X-Forwarded-For: <clientAddress>` (the
  trusted-proxy-resolved address from the canonical request context, so a reverse proxy
  chain is already accounted for) and the browser's original `User-Agent`. The relay writes
  a single-value XFF, which is exactly what `RightmostXForwardedFor` selects.
- **OpenObserve.** The deployment must set `ZO_HTTP_REAL_IP_SOURCE=RightmostXForwardedFor`
  so the RUM middleware resolves the forwarded address instead of the relay's TCP peer and
  MaxMind/UA enrichment reflects the visitor. The dev container sets it; production is a
  documented operator step (the admin hint names the variable).
- **Storage.** The VRL allowlist keeps only the coarse outcome — `geo_info_country`,
  `geo_info_country_iso_code`, `user_agent_user_agent_family`, `user_agent_os_family`,
  `user_agent_device_family`, each behind a `!= null` guard so the all-null enrichment of
  `anonymous` mode stores nothing. The raw address, city/lat-long, UA version strings, and
  the raw User-Agent are still dropped by omission.

`forward` is personal-data processing, so the client applies a **strict consent gate**:
while the visitor's persisted decision (`kobato.rum.consent` localStorage, `accepted` /
`declined`) is anything but `accepted`, the `useRum` effect never requests the SDK chunk —
no download, no session, no intake batch. The decision reads as undecided on the server
and the first client render (no hydration flash), the banner (`public.rumConsent.*`)
appears only after the post-mount storage read and never for DNT/GPC visitors, accepting
starts RUM in the same document, declining is permanent until site data is cleared, and a
withdrawal fully stops a running SDK. `clientIdentity` is part of the RUNTIME fingerprint,
so switching modes hot-restarts the pipeline and every new document picks up the mode.

Initialization defaults: `trackResources`/`trackLongTasks` on, `trackUserInteractions` off,
`sessionReplaySampleRate: 0`, `startSessionReplayRecordingManually: true`,
`defaultPrivacyLevel: 'mask'`, telemetry sampling rates 0, `profilingSampleRate: 0`,
`trackAnonymousUser`, `trackResourceHeaders`, `propagateTraceBaggage`, and
`compressIntakeRequests` all false, `silentMultipleInit: true`, `traceSampleRate: 100`,
`traceContextInjection: 'sampled'`. No `setUser`, `setAccount`, `setGlobalContext`, or
`setViewContext`; no geographic or device enrichment, browser log forwarding, Replay start,
or source-map upload. `sessionSampleRate` defaults to 100 and is configurable.

`useMatches` supplies the deepest route ID and its params; params are only a right-to-left
segment replacement map for the declared template (`/posts/:slug`,
`/search/:keyword/page/:num`, `/admin/posts/:postId/analytics`). The view name is the route
ID and `view.url` is `<document origin><template>`; a splat collapses to `/:*`, an unusable
match to `unknown`/`/unknown`. No pathname, search, params, or title is ever sent.

All events pass one synchronous `beforeSend` allowlist that fails closed: an unknown shape,
sanitizer exception, or unrecognized dynamic URL drops the event, and a catch block never
returns the original. The slim SDK wraps `beforeSend` in `limitModification`, deep-clones the
event, and copies back only its declared modifiable paths (`context`,
`view.name`/`view.url`/`view.referrer`, `view.performance.lcp.resource_url`, `service`,
`version`, `resource.url`, `resource.graphql.variables`,
`resource.request.headers`/`response.headers`, `error.message`/`stack`/`handling_stack`,
`error.resource.url`/`fingerprint`, `long_task.scripts[].source_url`/`invoker`). Declared
string paths are always written with a safe value (`''` when none exists), object paths get
`{}`, and everything else is removed by the OpenObserve ingest pipeline. `shouldSend` ignores
`false` for `type === 'view'`, so before any throwing operation the policy overwrites trusted
route identity (`view.name`, `view.url`, `view.referrer`, `context`, `service`, `version`,
LCP `resource_url`); an unavailable route scope returns `true` and sends the minimal safe
view, while other event types return `false` on failure.

| Event     | Kept                                                                                                                                                                                                                                | Removed                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common    | `type`, `date`, `application.id`, `service`, `version`, sanitized `o2tags` (`sdk_version`/`env`/`service`/`version`), `session.id/type`, `view.id/name/url`, `source: 'browser'`, `_o2` metadata (trace ids on resource/error only) | `device`, `display`, `connectivity`, `privacy`, `usr`, `account`, `container`, `action`, unknown fields; headers and GraphQL variables cleared via their paths |
| View      | timings (`time_spent`, `loading_time`, `network_settled_time`, DOM milestones, `first_byte`), `loading_type`, event counts, Web Vitals (`cls.score`, `fcp`, `fid`, `inp` sub-parts; LCP `resource_url` emptied)                     | target selectors, rects, scroll depth, memory/CPU, custom timings                                                                                              |
| Resource  | `type`, `method`, `status_code`, `duration`, phase timings, delivery/render-blocking/protocol labels, power-of-two bucketed `size`/`transfer_size`                                                                                  | exact bytes, request/response headers, GraphQL variables                                                                                                       |
| Error     | closed `type`, `source`, `handling`, fixed `<source>_error` message, stable `code` from the domain error or `http_<status>`, same-origin `/src`, `/assets`, `/node_modules/.vite`, `/@vite` frames only                             | `handling_stack`/`fingerprint` emptied; messages, bodies, context removed                                                                                      |
| Long task | `duration`, `blocking_duration`, `entry_type`, `is_frozen_frame`                                                                                                                                                                    | `scripts[].source_url`, `invoker`                                                                                                                              |

`rum-url-policy.ts` owns telemetry URL classification and the tracing/activity predicates
(`openobserve-rum.ts` reuses them). Query strings and fragments are always removed, and
`..`/`.` segments (including encoded ones) are rejected before classification.

- A same-origin `/assets/<generated>` path of one segment keeps its exact path. oRPC paths
  normalize to one dotted procedure template (both `/rpc/content/posts/bySlug` and the
  legacy form become `/rpc/content.posts.bySlug`), accepting only closed identifier
  segments (`[A-Za-z][A-Za-z0-9_]*`, 2–8 segments); empty, encoded, mixed slash/dot,
  hyphenated, or over-deep paths are dropped.
- Vite dev sources keep app-authored or generated paths: `/src/**` with a closed extension
  allowlist (ts/tsx/js/jsx/mjs/cjs/css/json/svg/images/fonts/wasm), `/@vite/client`,
  `/@vite/env`, `/@react-refresh`, and `/node_modules/.vite/deps/<file>.js`; `/@fs`,
  filesystem roots, source maps, user uploads, and arbitrary paths never match.
- Dynamic paths fold to families: `/posts/:slug`, `/page/:num`, `/cats/:slug`,
  `/cats/:slug/page/:num`, `/tags/:slug`, `/tags/:slug/feed`, `/search/:keyword`,
  `/search/:keyword/page/:num`, admin/editor dynamic ids, `/admin/:path`, `/editor/:path`,
  `/api/admin/backup/download/:id`, `/api/:endpoint`, `/images/:asset`, `/storage/:key`,
  `/fonts/:asset`, `/fonts-package/:asset`, `/music/:asset`, and one unknown public segment
  as `/:slug` only when slug-like. `.data` suffixes classify the base path and re-append
  `.data`.
- Dropped: cross-origin (including S3/signed), credentialed, non-http(s), self-telemetry
  (`/api/analytics/env`, `/api/analytics/events`), `/api/rum/intake`, probes, and unknown
  multi-segment paths.

Budgets: 500 resource and 100 error events per SDK session, reset on a session-id change;
only accepted events consume budget and excess is dropped without retry. State is one
`kobato.dev-rum.budget` `sessionStorage` entry holding the SDK session id and two
integers, so reloads continue the cap; blocked storage degrades to the in-memory runtime
and a new session id overwrites the entry.

`allowedTracingUrls` is one same-origin predicate with `propagatorTypes: ['tracecontext']`;
`excludedActivityUrls` excludes the analytics beacon/SSE, the RUM intake, and
`/health`/`/ready`. The injected `traceparent`/`tracestate` is exactly what the Hono W3C
extractor consumes. The initial hard document navigation cannot carry a browser-injected
`traceparent`, so browser↔server parentage exists for subsequent Fetch/XHR and SPA data
requests only; do not invent a parallel correlation key to hide that. The SDK's random RUM
session id groups one short-lived browser session; Kobato never sets it, persists a
cross-session visitor id, joins it to `analyticsEventId`, or attaches account identity.

### Privacy posture

The outbound contract permits only technical, low-cardinality performance fields. It
forbids raw URLs/query/fragments, cookies, authorization headers, request/response bodies,
IP addresses, full user agent, account/user/entity IDs, slugs, search text, content
titles/bodies, SQL values, arbitrary exception messages, DOM/text/input captures, and
persistent visitor identifiers. The single exception is `forward` mode: the relay then
attaches the client address and User-Agent on the wire so OpenObserve can derive the
coarse enrichments — both are stripped by the storage-time pipeline below and never
persisted.

Storage-time enforcement is the `kobato_rum_privacy` realtime pipeline running
`kobato_rum_privacy_drop` (`src/server/domains/observability/assets/rum-privacy.vrl`) with
`after_flatten: true` on `_rumdata`. The VRL copies an explicit allowlist into a fresh
`safe` object and assigns `. = safe`, so every unnamed field — a future SDK field or a
deliberately injected value included — is deleted by construction. Preserved: trace/span
ids, RUM session/view random ids, route template, numeric Web Vitals (plus `view_inp_us`),
durations/statuses, phase timings, power-of-two size buckets, and closed error fields —
plus, only when populated, the five coarse identity dimensions of `forward` mode.
Removed by omission: the raw IP address, city/lat-long GeoIP detail, UA version strings
and the raw User-Agent, device enrichment, identity/context, headers,
exact sizes, DOM selectors, raw performance objects, error messages/stacks, and unknown
fields. It is not a substitute for the browser and server allowlists, but it is the
mandatory storage-time boundary because `beforeSend` cannot delete arbitrary fields.

OpenObserve stays loopback-bound in the documented local setup, with its own admin
credentials and a dedicated development volume. Telemetry never enters Kobato's
SQLite/DuckDB files, backup archives, or the SEA binary; deleting the development volume
deletes the telemetry.

### Failure isolation and lifecycle

- Requests, rendering, loaders, and actions never await export. Server export uses batch
  processors with bounded queues and batch sizes, a short export timeout, and no
  application-owned persistent retry queue; when OpenObserve is unavailable data is
  dropped, the site continues, and at most rate-limited safe diagnostics are emitted.
- Pipelines fail independently: server signals keep running when only RUM verification
  fails, a failed log pipeline degrades only logs and never rolls back traces/metrics,
  relay failures are isolated per batch (`502` with a closed reason), and browser RUM is
  withheld rather than proxied.
- Silent drops are still VISIBLE: every production exporter is wrapped by
  `infra/trace/export-health.ts`, which records the latest failed export per signal (error
  class name + timestamp, never a message) and clears it on the next success. The runtime
  status projection surfaces it as `runtime.lastExportError`, so the admin panel can warn
  "running but dropping" — the phase alone only reflects start-time success. The token
  guard mirrors the frontend gate: a stopping runtime's final flush cannot clobber its
  HMR replacement's health.
- Stream retention has a third trigger beyond boot and settings save: one delayed pass
  (60 s) after the runtime enters `running`, because streams are created lazily by first
  ingest and earlier passes cannot see them yet. The pass is cancelled on stop and
  rescheduled on restart; the sync itself stays a no-op unless `retentionDays > 0`.
- Start/stop is idempotent. HMR disposal disables subscriptions/observers, restores the
  no-op facade, clears the sink, and performs a bounded provider shutdown that flushes, so
  reloads cannot double-export. Process shutdown uses one bounded hook without delaying the
  existing database/server teardown.
- A post-provider startup failure runs one idempotent rollback (no-op facade, observer off,
  subscriber stopped, hook unregistered, providers bound-closed); no telemetry error reaches
  the application and a later start begins clean.
- `security.encryptionKey` rotation invalidates verification and makes the secrets
  unreadable; the panel reports "unverified" and the admin re-runs the connection test.
  Public rendering is unaffected.

### Development tooling and dashboards

`scripts/trace/` provides `trace:up`, `down [--volumes]`, `status`, `init`, and `smoke`. It
runs the pinned OSS image `openobserve/openobserve:v1.1.2` as one loopback-only container
(`-p 127.0.0.1:<port>:5080`) with a dedicated named volume, no Collector, and
`ZO_MMDB_DISABLE_DOWNLOAD=true` so startup stays offline and deterministic; it never touches
Kobato's SQLite/DuckDB files or SEA assets. Credentials stay in the worktree's ignored
`tmp/openobserve/` (mode 0600, never tracked or printed), container and volume names match
the closed `kobato-openobserve-dev` / `kobato-trace-smoke-<8hex>` grammar, and
`down --volumes` refuses any Docker resource this tooling does not own. Normal `pnpm dev`,
tests, and builds never require Docker or OpenObserve. `trace:init` writes a ready-to-merge
settings fragment but never seeds the database: the password column is encrypted with a key
derived inside the server process, so the script must not duplicate the crypto path.

Four versioned OpenObserve v8 dashboards in `src/server/domains/observability/assets/dashboards/` are imported
or updated by title: **Overview** (rates, percentiles, slow routes, LCP/INP/CLS/TTFB),
**Server** (SSR, oRPC, databases, cache, outbound, image worker, event-loop delay,
in-flight requests, RUM relay outcomes, log
severity by scope, slow `http.server` spans), **Browser** (navigation, Web Vitals, long
tasks, resources, sanitized errors by route ID), and **Correlation** (RUM → spans →
`kobato_logs`). They run real SQL; synthetic development content is sufficient.

- RUM nanosecond durations are divided by `1000.0` and aliased `_us`; `view_inp_us` is
  already microseconds (OpenObserve flattens `view.performance.inp.duration` to
  `view_performance_inp_duration` in ns). A view without an interaction is `null`, never a
  fake 0. The asset contract test rejects any dashboard query using a RUM duration without
  the conversion.
- DELTA temporality means each `_sum`/`_count` row is one export interval's increment;
  panels total increments inside a bucket with `sum(value)`.
- `_search` cannot join logs to traces: Correlation is separate tables (RUM resources with
  `_o2_trace_id`, server spans, `kobato_logs`) keyed by trace/span id in the UI; the
  slow-request table is an approximate drill-down from a metric aggregate.

`pnpm run trace:smoke` drives a public page, SPA navigation, same-origin oRPC call, uncaught
browser error, admin login/navigation, editor save, inline image transform, scheduled
`job.run`, and a traced 404, then queries OpenObserve for the waterfall, metrics, RUM/Web
Vitals, every dashboard panel query, the fail-closed pipeline (real unknown-field
injection), the gate (offline startup, tamper → resume via `startView`), and the outage path
(clean shutdown, restart, no replayed spans or logs), asserting no `trace_id`/`span_id` in
metric rows and only closed log columns.

The production bundle guard `tests/unit/arch/production-rum-bundle.test.ts` scans real
`build/client` and `build/server` output for OpenObserve/RUM and server OTel markers;
`.github/workflows/ci.yml` runs it in the build job after `pnpm run build` (push) or
`pnpm run sea:build` (PR) because the ordinary test job runs before any build. Contract
tests pin that only `runtime.ts` and `logs-runtime.ts` import the server SDK (the latter
statically imported only by `runtime.ts`), that no route or UI component imports the RUM
SDK, that log messages are static, and that the slim package is the only browser telemetry
dependency.

### Rejected alternatives

| Alternative                                      | Why rejected                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo/Grafana or Sentry as an additional backend | OpenObserve already covers traces, metrics, logs, RUM, errors, and dashboards; a second platform adds cost and privacy review                           |
| Enable telemetry once an endpoint is reachable   | Reachability is not consent; the verified connection fingerprint requires an explicit admin test                                                        |
| Direct browser→OpenObserve posting               | Needs a public, CORS-allowlisted endpoint; an internal OpenObserve cannot serve visitors and the token stays in every document                          |
| Forward the SDK path/query verbatim              | Relays arbitrary tracks and organizations (SSRF-shaped writes) and invites duplicate-token ambiguity                                                    |
| Full Node auto-instrumentation                   | Preload seam, unneeded fields, and harder URL/error/resource privacy proofs                                                                             |
| Full RUM plus Replay and browser logs            | Disproportionate privacy and performance risk for unused context                                                                                        |
| Ship the browser RUM SDK eagerly                 | ~140 kB on every page view; the lazy chunk plus the bootstrap gate keeps an unconfigured site at zero                                                   |
| Unconditional server-owned retention             | Silently overrides the operator's instance policy and forces a re-apply on every boot; retention is therefore opt-in (`retentionDays`), never automatic |

## Consequences

- Do not reintroduce `trace.*` config keys, environment-variable activation, a second
  settings surface, direct browser→OpenObserve posting, a browser-visible RUM token,
  `connect-src` widening or an OpenObserve CORS requirement, a DEV-only gate or
  `/api/dev/rum/status`, retention as an always-on server policy (it is opt-in), a Pino
  transport, full RUM/Replay/browser-logs, Node auto-instrumentation, a mandatory Collector,
  or eager browser SDK shipping.
- Missing raw URLs, identity, DOM state, and full error text are expected privacy behavior,
  not bugs to work around.
- The server OTel SDK ships inside the SEA binary (dynamic chunk, loaded only for a
  configured site); the 230 MB CI budget is the guard. The browser SDK stays in its own lazy
  client chunk and never enters the SSR/SEA graph.
- Known limits: no browser parent on an initial hard document load; approximate metric↔trace
  correlation; day-granular OSS retention rather than a literal 24-hour window; GeoIP removal
  proven by omission rather than against real data; and slow SQLite queries represented by
  real `db.sqlite.query` spans, not a manufactured scenario.
- Two OpenObserve writers exist by design: the server upserts the four dashboards and privacy
  pipeline (plus the opt-in stream retention), the dev scripts read assets and write the dev-only
  1-day retention; both are idempotent by title/name.
- An SDK or OpenObserve upgrade requires re-running the real-payload privacy smoke and the
  dashboard asset contract, because an upstream field addition or a flattened-column rename
  can bypass allowlist assumptions; the smoke fails loudly in that case.
- The no-op facade is a permanent seam; the real telemetry implementation stays behind it.
