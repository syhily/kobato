# ADR-0006: Dual-track device-environment analytics

- Status: accepted
- Date: 2026-11-07

## Context

The access-events pipeline records only what a bare HTTP request carries:
path, referer, UA string, first Accept-Language token, GeoIP result, and
the UA-derived os/browser/device fields. That leaves the dashboard blind
to the visitor's actual environment — screen and viewport geometry, DPR,
touch capability, color-scheme and motion preferences, network quality,
the full language preference list, and the high-entropy UA Client Hints
(architecture, bitness, form factors, full version list) that
`Accept-CH` already negotiates but nothing persists.

Two hard constraints shape the design:

1. **The DuckDB batcher is pure append.** Every write path
   (`InsertBatcher` → Appender protocol) inserts rows; nothing updates.
   A client-reported environment therefore cannot be backfilled into the
   event row the server already wrote — the beacon arrives seconds after
   the server-side insert, and an UPDATE would race the batcher.
2. **The `access_events` blobsMap is budget-pinned.** The 16 blob slots
   are the Cloudflare-Analytics-Engine-style contract pinned by a
   contract test; blob16 is the reserved slot. Stuffing ~25 new fields
   into the main table is impossible without breaking that contract, and
   most of the new fields are strings/numbers that deserve real columns.

## Decision

**Dual sidecar tables, joined at query time.** Two new append-only
tables sit next to `access_events`, keyed by the event's UUID:

- `device_env_server` — one row per event, written by the enrich
  pipeline in the same batch as the main row: UA-CH high-entropy values
  (`ua_full_version`, `platform`, `platform_version`, `model`, `mobile`,
  `brands` full-version list, `arch`, `bitness`, `form_factors`) and the
  complete `accept_language` preference list (the main table's blob6
  keeps only the first token).
- `device_env_client` — one row per beacon received, keyed by the same
  event id: screen w/h, avail w/h, viewport w/h, DPR, color depth, max
  touch points, pointer/hover, `prefers-color-scheme`,
  `prefers-reduced-motion`, Network Information
  (`effective_type`/`downlink`/`rtt`/`save_data`), locale, timezone,
  `hardware_concurrency`, `device_memory`. Numeric dimensions store raw
  values; panels bucket at query time so bucket edges stay adjustable.

**Event id is minted once per request and published in the loader data.**
The request-context derivation (`RequestFacts.analyticsEventId`) mints a
UUID per request — document and `.data` requests alike. `trackPageView`
runs its gates synchronously and returns the id (or `null` when a gate
drops the visit); the public loaders publish it as loader-data `eid` via
the `createSsrCaller` seam, and the client collector reads the deepest
match's data (`useMatches`) and sends it back with the beacon. Loader
data — not a `<meta>` tag — is the channel because client-side SPA
navigations re-run loaders without re-rendering the document, so a
static meta tag would pin every subsequent beacon to the first page's
event id. Both tracks share one join key without any server-side
correlation guesswork.

**Coverage expands to every public page.** Tracking leaves the
detail-page+home subset and covers archives, tags, search, and every
other public document. All page types count in a single page-view
metric; panels that need content-only views filter on the existing
path/entity dimensions.

**Client collection is static-once + dynamic-per-page.** The collector
(the existing lazy-hydration pattern, no new global script) sends static
fields (screen, hardware concurrency, UA-CH-derived values the server
cannot see) once per browser session via a `sessionStorage` marker, and
dynamic fields (viewport, network, color scheme) on every page view.
Static dimensions are therefore present on a subset of events; panels
aggregate static dimensions over the events that carry them — the
distribution stays correct because static values do not vary within a
session.

**The beacon endpoint is a bare Hono resource route**, not an oRPC
`publicProc`: `sendBeacon` posts `text/plain`, the `/rpc/*` prefix's
`csrfGuard` is the wrong shape for an anonymous fire-and-forget ping,
and `resources/` already hosts non-JSON surfaces. The route carries an
IP rate limit, a small body cap, and a zod contract from
`shared/contracts/analytics.ts`.

**Privacy posture is unchanged or stricter.** `DNT: 1` suppresses the
client beacon entirely while the server-side aggregate page view is
still counted (no new identifier is introduced — no fingerprint, no
cross-session id; the join key is the per-event UUID). Retention matches
the main table: the 180-day job deletes from all three tables and
CHECKPOINTs under the same mutation lock, so no sidecar row can outlive
its event.

**Panels extend the existing 设备 tab.** The new dimensions become new
metrics in the `device` group of `METRIC_GROUPS` (screen resolution,
viewport, DPR, touch capability, color scheme, network effective type) —
no new tab, no new route. The realtime event stream keeps its current
field set; environment data lives in the aggregate panels only.

## Consequences

- New DDL lives beside the `access_events` DDL; a boot-time migration
  creates both tables idempotently (existing installs upgrade in place).
- The enrich pipeline gains a second appender (or a multi-table batch)
  keyed by the same event id; the batcher stays append-only.
- `Accept-CH` gains the high-entropy hints (`Sec-CH-UA-Arch`,
  `Sec-CH-UA-Bitness`, `Sec-CH-UA-Form-Factors`,
  `Sec-CH-UA-Full-Version-List`); first-load requests still arrive
  without hints, so `device_env_server` rows legitimately contain empty
  values for the first hit of a session.
- Static-dimension panels document that they aggregate over the
  beacon-covered subset; totals panels are unaffected.
- The beacon route is the only unauthenticated write surface into the
  analytics store — rate limit, body cap, and contract validation are
  its entire perimeter and are pinned by tests.
- Track coverage expansion changes the page-view volume baseline; this
  is a deliberate, recorded change, not a data bug.
