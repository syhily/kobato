# ADR-0014: OpenObserve as a release capability

- Status: accepted
- Date: 2026-11-10
- Supersedes parts of: [ADR-0012](0012-development-only-openobserve-tracing-and-rum.md)

## Context

ADR-0012 built a development-only observability stack around a local
OpenObserve container: `trace.*` keys in `kobato.config.json` activated server
tracing/metrics/logs, frontend RUM was gated on `import.meta.env.DEV` plus a
runtime pipeline probe, and a production build was inert by construction.

That shape no longer matches the product. Operators of a self-hosted Kobato
run on their own infrastructure and must be able to see their own site's
latency, errors, and Web Vitals without rebuilding the binary or editing a
server-side file they may not even have (the SEA distribution ships no
`package.json`, no `node_modules`, and a config file that is validated
elsewhere). At the same time, the privacy guarantees ADR-0012 established —
no session replay, no credentials in the browser, a fail-closed RUM storage
pipeline — must survive productization unchanged.

The implementation had already migrated in three steps (P1–P3): the
`observability` admin settings section became the only configuration source,
the SEA build started carrying the server OTel SDK, and the admin panel gained
connection test, provisioning, and reporting switches. P4 finished the browser
path. This ADR records the resulting architecture and marks the ADR-0012
decisions it replaces.

## Decision

### One configuration source: the `observability` settings section

Runtime configuration lives in the `blog.observability` settings row
(`admin.settings.observability`). `kobato.config.json` has **no** observability
keys: the former `trace.*` block is gone, and no environment variable can
enable telemetry behind the admin's back. The section is hot-applied by
`domains/observability/runtime-manager.ts`: a fingerprint change stops and
restarts the providers, `enabled: false` stops them, and an invalid/unverified
configuration never constructs a provider. The settings row is written only
through the standard settings write path, so `security.encryptionKey` protects
the secret halves (`password`, `rumClientToken`) like every other secret.

### Site name = independent OpenObserve organization

The configured site name doubles as the OpenObserve organization **and** the
RUM application id. A connection test lists the organizations reachable with
the supplied credentials and creates the named one when absent; it never
silently reuses an unrelated organization. A deployment therefore owns one
organization, and two sites never share a trace/RUM namespace unless the
operator configures the same name deliberately.

### Connection fingerprint as the activation gate

Two keyed HMAC fingerprints (`obs2`, purpose `observability`) split the
concerns:

- **CONNECTION** — endpoint, organization, username, password. Stored as
  `verifiedFingerprint` after a successful test; the runtime only activates
  while it matches.
- **RUNTIME** — every pipeline-affecting value (connection fields, sample
  rate, `includeRedactedSql`, logs switch, frontend switch + sample rate).
  Drives restart detection only, so flipping a reporting switch after a
  verified test restarts the providers without demanding a re-test.

The fingerprint is keyed with `security.encryptionKey` because it is exposed to
the admin UI: a plain hash over the password would be offline-guessable.

### Automatic provisioning, idempotent and upgradeable

`admin.observability.testConnection` does more than prove credentials: it
ensures the organization, probes the version, installs the RUM privacy
pipeline + function, creates/reuses the RUM client token, imports or updates
the four versioned dashboards by title, writes the token back into the
encrypted settings row, and starts the runtime. Everything is idempotent, so
the failure mode is a retry, not a duplicate. A failure of the asset sync is
reported alongside `ok: true` (the connection did succeed) and retried through
`admin.observability.provision`.

Bundled assets carry a `provisionedFingerprint`. At boot, the server compares
the stored value with the build's fingerprint and re-provisions when the
package changed — an upgrade installs new dashboards/pipeline without an admin
click and without overwriting the operator's other OpenObserve objects.

### Production does not force retention

The application never sets OpenObserve stream retention. Retention is an
instance-level operator policy (a production O2 may need weeks; the OSS
minimum granularity is one day), so the server leaves it untouched. The
development tooling in `scripts/trace/` remains the only owner of the 1-day dev
policy, applied by `trace:init` and the smoke.

### Dev and production run the same semantics

There is no build-time telemetry gate. Traces, metrics, logs, and browser RUM
activate from the settings row in development exactly as in production. The
build-time environment (`import.meta.env.DEV`) survives only as the `env`
**label** on the browser bootstrap and on exported resources; it gates nothing.
The browser RUM bootstrap is exposed by the root loader and CSP whenever the
settings candidate exists AND the runtime's pipeline verification passed, in
every build.

One guard remains build-shaped, for a different reason: `use-rum`'s
`import.meta.env.SSR` early return removes the RUM loader's dynamic-import edge
from the server graph, so the SSR/SEA bundle carries no browser SDK. The client
keeps the SDK in its own lazy chunk; a visitor of a site without an active
configuration never downloads it.

### One status endpoint

`/api/rum/status` is mounted in every build, excluded from HTTP traces and RUM
activity, and answers `{enabled: boolean}` with `no-store`; the gate is read in
the handler because settings changes never re-mount the router. It is exempt
from the install gate so a poll always gets an answer. The former DEV-only
`/api/dev/rum/status` is deleted.

## Relationship to ADR-0012

ADR-0012 remains the record of the collection design (span taxonomy, sanitizer
and URL policy, metric catalog, bounded pipelines, privacy posture), which this
ADR keeps verbatim. The following ADR-0012 decisions are **superseded**:

| ADR-0012 statement                                                     | Now                                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `trace.*` in `kobato.config.json` is the activation surface            | the `observability` settings section is; config has no telemetry keys                    |
| "Real collection and reporting code exists only in development builds" | both bundles carry the server SDK; activation is a runtime decision                      |
| "A production build is inert regardless of config"                     | production activates from verified settings                                              |
| Frontend RUM is DEV-only behind `import.meta.env.DEV`                  | build-independent gate: settings candidate + verified pipeline                           |
| CSP widens `connect-src` only in DEV                                   | widened whenever `activeFrontendRum()` is non-null                                       |
| `/api/dev/rum/status` (DEV-only)                                       | `/api/rum/status` (all builds)                                                           |
| Assets (token/pipeline/dashboards) are provisioned by `trace:init`     | the server provisions on connection test + boot upgrade; scripts keep dev retention only |

## Consequences

- **The SEA binary carries the server OTel SDK.** The trace runtime is reached
  through a dynamic import from the domain, so the chunk loads only for a
  configured site, but it is bundled (`build/server` +357 kB raw / +84 kB gzip
  at the P1 measurement). The 230 MB binary budget has ample headroom (~12 MB
  on a 217.9 MB build); the CI build job enforces it.
- **`security.encryptionKey` rotation invalidates the verification.** The
  fingerprints are keyed HMACs, and the encrypted secrets become unreadable at
  the same time. The panel reports "unverified" and the admin re-runs the
  connection test; nothing about the site's public rendering changes.
- **A broken OpenObserve never breaks the site.** Every pipeline failure is
  isolated: server signals keep running when only RUM verification fails, and
  a failed log pipeline degrades only logs. Browser RUM is withheld, not
  proxied.
- **The admin must configure and test the connection before frontend RUM can
  appear**, because that test is what installs the privacy pipeline that the
  run-time probe verifies. An unverified or offline pipeline withholds RUM
  rather than shipping an unverified storage boundary.
- **Two O2 writers are possible by design**: the server upserts the four
  bundled dashboards and the privacy pipeline; the dev scripts only read
  assets (smoke) and write retention. Both upserts are idempotent by
  title/name, so a manual run cannot conflict destructively.
- **The public RUM surface does not grow**: the client token is still
  least-privilege and browser-visible, the server OTLP credential never leaves
  the process, and the sanitizer + fail-closed VRL pipeline remain the
  enforcement points.

## Rejected alternatives

- **Keep the config-file activation and add a production flag.** Two sources
  of truth, a restart requirement for every change, and credentials in a file
  the admin panel cannot manage. Rejected.
- **Enable telemetry by default once an endpoint is reachable.** A reachable
  OpenObserve is not consent; the connection fingerprint requires an explicit
  test by an admin.
- **Let the server own retention.** It would silently override an operator's
  instance policy and force a re-apply on every boot. Retention stays an
  instance-level concern; dev tooling owns only the dev container.
- **Seed the DEV database directly from `trace:init`.** The password column is
  encrypted with a key derived inside the server process, so the script would
  have to parse the DEV config and duplicate the crypto path. Printing the
  non-secret values keeps the secret inside the server's write path.
- **Ship the browser RUM SDK eagerly.** It would add ~140 kB to every page
  view. The lazy chunk plus the bootstrap gate means an unconfigured site
  downloads none of it.
