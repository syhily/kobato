# ADR-0004: Dual-track device-environment analytics

- Status: accepted
- Date: 2026-11-07

## Context

Access events record only what a bare HTTP request carries (path, referer, UA,
first `Accept-Language` token, GeoIP, UA-derived device). Missing: screen/viewport
geometry, DPR, touch, color-scheme and motion preferences, network quality, the full
language list, and high-entropy UA Client Hints from `Accept-CH`.

`InsertBatcher` is pure append, so client values cannot be backfilled into the event
row without racing it. The `access_events` blobsMap is budget-pinned (16 slots,
contract-tested, `blob16` reserved), so new fields cannot go there.

## Decision

**Two append-only sidecar tables, joined at query time by the event UUID.**

- `device_env_server` — one row per event, written by enrich in the same batch:
  UA-CH high-entropy values (`ua_full_version`, `platform`, `platform_version`,
  `model`, `mobile`, `brands` full-version list, `arch`, `bitness`,
  `form_factors`) plus the full `accept_language` list (`blob6` keeps the first token).
- `device_env_client` — one row per beacon, same id: screen/avail/viewport w/h, DPR,
  color depth, touch points, pointer/hover, color scheme, reduced motion, Network
  Information (`effective_type`/`downlink`/`rtt`/`save_data`), locale, timezone,
  `hardware_concurrency`, `device_memory`, `has_static`. Raw numerics; panels
  bucket at query time so edges stay adjustable.

**Join key: one UUID per request, published as loader data.**
`RequestFacts.analyticsEventId` mints it per request (document and `.data`).
`trackPageView` gates synchronously and returns it or `null`; public loaders publish
loader-data `eid` via `createSsrCaller`, and the client collector sends the deepest
`useMatches` id. Not a `<meta>` tag: SPA navigations re-run loaders without
re-rendering the document, so a static tag would pin later beacons to the first page.

**Coverage is every public page** — archives, tags, search, all other public
documents, not just home plus detail. All page types count in one page-view metric;
content-only panels filter on existing path/entity dimensions.

**Client collection is static-once + dynamic-per-page.** The lazy-hydration
collector sends static fields (screen geometry, touch, hardware concurrency) once per
browser session via a `sessionStorage` marker, and dynamic fields (viewport, network,
color scheme) per page view. Static dimensions exist only on `has_static = TRUE`
rows, aggregated over that beacon-covered subset — valid because static values never
vary within a session.

**The beacon is a bare Hono resource route:** `POST /api/analytics/env`
(`src/server/http/resources/analytics.ts`), not an oRPC `publicProc` — `sendBeacon`
is an anonymous fire-and-forget ping, so `/rpc/*`'s `csrfGuard` is the wrong shape.
Perimeter: IP rate limit (120/min), 4 KiB body cap (declared `content-length`
checked first), and `deviceEnvBeaconSchema` in `src/shared/contracts/analytics.ts`.
The id is not validated against `access_events`; a bot-gated or direct-POST id
yields an orphan row the JOIN drops and retention clears.

**Privacy is unchanged or stricter.** `DNT: 1` suppresses the beacon entirely while
the server aggregate page view is still counted. No fingerprint, no cross-session
id; the only key is the per-event UUID. The 180-day job deletes from every table in
`ANALYTICS_TABLES` at one cutoff and `CHECKPOINT`s under the same mutation lock, so
no sidecar row outlives its event.

**Panels extend the existing device tab:** new metrics (`screen`, `viewport`, `dpr`,
`touch`, `colorScheme`, `netEffectiveType`) join the `device` group of `METRIC_GROUPS`
— no new tab, route, or filter surface. The realtime stream keeps its field set;
environment data stays in aggregate panels.

## Consequences

- DDL sits beside `access_events` DDL in
  `src/server/domains/analytics/services/device-env.ts`; a boot-time idempotent
  migration creates both tables, registered in `ANALYTICS_TABLES`.
- Enrich appends a second row keyed by the same id; the batcher stays append-only.
  The beacon has its own batcher and dead-letter path.
- `Accept-CH` advertises `Sec-CH-UA-Arch`, `Sec-CH-UA-Bitness`,
  `Sec-CH-UA-Form-Factors`, `Sec-CH-UA-Full-Version-List`; first-load requests lack
  hints, so `device_env_server` legitimately holds empty values on a first hit.
- Static-dimension panels state the beacon-covered subset; totals are unaffected.
- The beacon route is the only unauthenticated write surface into the analytics
  store; rate limit, body cap, and contract validation are its whole perimeter,
  pinned by tests. Do not widen it.
- Do not reintroduce: UPDATE/backfill into `access_events`, extra blob slots, a
  client fingerprint or session id, a `<meta>`-tag `eid` channel, or an oRPC
  `publicProc` for the beacon.
- Coverage expansion changes the page-view volume baseline by design; not a data bug.
