# Headless

Kobato's headless mode is a **delivery form**, not a switch: the product ships as two SEA binaries — `kobato`, the
backend, and `sayaka`, the public site — and `sayaka` is nothing but the reference consumer of the backend's public
contract. Your frontend replaces it: render the public site by calling the contract over HTTP, exactly the way sayaka
does. Public procedures are always mounted; there is no runtime toggle. The decision record is
[ADR-0009](../adr/0009-optional-headless-frontends.md); the workspace conventions live in the root
[AGENTS.md](../../AGENTS.md) and each package's own `AGENTS.md`.

## Topology

A deployment runs two processes:

- **`sayaka`** is the listener browsers reach. It renders every public document and serves every public resource by
  calling `kobato` over oRPC, forwards exactly two path families to it (`/rpc/*`; `/admin/*` + `/editor/*`), and answers
  two inbound protocols itself (`POST /webmention`, `POST /api/rum/intake/*`).
- **`kobato`** serves `/rpc/*`, `/health`, `/ready`, and the admin workspace. It can sit on a private address — nothing
  but sayaka (or your server-side code) needs to reach it.

Your frontend can replace sayaka entirely (speak the contract from your server), or sit in front of it (proxy `/rpc/*`
to `kobato`). If a reverse proxy or your frontend stands between browsers and `kobato`, add its address to kobato's
`security.trustedProxies` — rate limits, audit, and analytics key on the visitor address, which only trusted forwarded
headers (`X-Forwarded-For` and friends) can carry. See [Deployment](Deployment.md) for the two-binary install and
[Configuration](Configuration.md) for the config file.

## Consuming the workspace source

No SDK ships to npm. Consume the workspace packages as source — a pnpm workspace / git dependency on this repository —
and pin the exact commit your backend runs. Every package carries the same version as the backend
(`apps/kobato/package.json` is the source of truth; `pnpm version:sync <version>` repairs drift), so "packages at
version X talk to backend at version X" is the whole compatibility story. Minimum set for a rendering consumer:

- `@kobato/api` — the contract tree and the client transport (`contracts/`, `rpc/`, and `client/` are React-free and
  carry no ambient state; `@kobato/api/browser` is the built-in frontend's own assembly and not part of this seam).
- The shared leaves your renderer reads: `@kobato/catalog` for the listing/read models, `@kobato/inkling/headless` for
  the document model.

## The public client

```ts
import { createKobatoPublicClient } from '@kobato/api/client/create-client'

const client = createKobatoPublicClient({
  url: 'https://kobato.example.com/rpc', // FULL RPC URL, never the site origin
})

const answer = await client.content.home({}) // { num?: string; ifNoneMatch?: string }

switch (answer.kind) {
  case 'ok':
    render(answer.listing) // remember answer.etag for the next request
    break
  case 'not-modified':
    reuseCachedRender(answer.etag)
    break
  case 'redirect':
    respondWithRedirect(answer.status, answer.to) // 301 | 302
    break
}
```

- The returned client is typed as `ContractRouterClient<typeof publicContract>` — nothing outside `publicContract`
  (`@kobato/api/public-contract`) is reachable at the type level.
- `url` is the FULL RPC URL (`https://host/rpc`). Optional `fetch` and `getHeaders` map onto the transport — a read-only
  consumer needs neither. The client is React-free with **no ambient state**: it manages no cookies, no CSRF token, no
  singleton. Don't assemble an oRPC `RPCLink` by hand: `/rpc/*` speaks oRPC's RPC protocol (POST + JSON, reads included)
  — the `method`/`path` metadata on each procedure is a compatibility record, not the transport.
- **Tree keys are transport URLs**: `client.content.home` answers at `/rpc/public/content/home`, grouped under
  `/rpc/{public,account,admin}/*`. Regrouping the tree moves the URL — that is why the stable surface is pinned
  key-by-key (see below).

## The server assembly (rendering from your server)

Server-side rendering needs a **request-scoped** client that forwards what `kobato`'s perimeter needs to derive the same
facts it derives for sayaka — cookies, user agent, accepted languages, and the visitor's address — and relays
`Set-Cookie` back:

```ts
import { getClientAddress } from '@kobato/api/client/client-address'
import { createKobatoServerClient } from '@kobato/api/client/create-server-client'

const { client, responseHeaders } = createKobatoServerClient({
  url: 'http://127.0.0.1:4321/rpc', // kobato's full RPC URL (private address is fine)
  request: inboundRequest, // forwards an allowlisted header set (cookie, user-agent, accept-language, …)
  clientAddress: getClientAddress(inboundRequest, directPeerIp, trustedProxies),
  analyticsEventId: crypto.randomUUID(), // optional; sent as x-kobato-analytics-event on every call
})

// after rendering, relay what kobato set onto your response:
for (const cookie of responseHeaders.getSetCookie()) {
  outgoingResponse.headers.append('Set-Cookie', cookie)
}
```

Cookies travel as real headers on both hops — never inside the JSON payload. `analyticsEventId` is the join key between
kobato's server-side page view and the browser's device beacon (sayaka mints one UUID per document request;
`ANALYTICS_EVENT_HEADER` lives in `@kobato/api/client/analytics-event`). `isBot` (`@kobato/api/client/is-bot`) is the
User-Agent heuristic kobato's analytics use.

## Signal unions and conditional requests

Document reads — `content.home`, `content.posts.list`, `content.posts.bySlug`, `content.pages.bySlug`, `content.search`,
`content.archives`, `content.categories.list` — answer a **signal union**, never a bare payload:
`{ kind: 'ok', etag, … }`, `{ kind: 'not-modified', etag }`, or `{ kind: 'redirect', to, status }`. Handle all three.
Conditional requests are procedure input: pass the previous `etag` as `ifNoneMatch`
(`client.content.posts.bySlug({ slug, ifNoneMatch })`) and a `not-modified` answer means reuse your cached render.

Everything else returns its payload directly: `content.bootstrap`, `comments.*`, `likes.*`, `friends.apply`,
`notifications.*`, `newsletter.*`, `webmentions.*`, `avatar.find`, `github.*`, `images.resolveThumbhash`, `music.get`.

## Bootstrap and the interactive surface

`content.bootstrap` is the one call that carries document-level state for free:

```ts
const boot = await client.content.bootstrap({ scope: 'public' }) // workspace documents ask for 'workspace'

if (boot.installState === 'noAdmin') {
  // no admin exists yet — sayaka 303s every public URL to /admin/setup
}
// boot.csrfToken pairs with the caller's session cookie for same-origin interactive flows
// boot.rum is the RUM bootstrap (null while the relay gate is inactive)
// boot.currentUser.email is the signed-in viewer (null when anonymous)
```

The interactive procedures — likes (`likes.increase`/`decrease`/`validate`), `friends.apply`,
`newsletter.subscribe`/`confirm`/`unsubscribe`, the viewer-session `notifications.*`, and the signed-in own-comment
writes (`comments.updateOwn`/`requestDeleteOwn`/`cancelDeleteOwn`) — are same-origin cookie + CSRF by construction: the
browser must call the origin that set the cookies. Anonymous public reads need neither.

## The stable surface

Only `publicContract` carries the external stability guarantee — eighteen domains, pinned key-by-key by
[apps/kobato/tests/arch/public-api-contract.test.ts](../../apps/kobato/tests/arch/public-api-contract.test.ts):

| Domain          | Procedures                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `content`       | `bootstrap`, `home`, `posts.list`, `posts.bySlug`, `pages.bySlug`, `comments.byKey`, `search`, `categories.list`, `archives`      |
| `comments`      | `replyComment`, `loadComments`, `getRaw`, `edit`, `revokeToken`, `myComments`, `updateOwn`, `requestDeleteOwn`, `cancelDeleteOwn` |
| `likes`         | `increase`, `decrease`, `validate`                                                                                                |
| `friends`       | `apply`                                                                                                                           |
| `notifications` | `list`, `unreadCount`, `markRead`, `markUnread`, `thread`, `reply`                                                                |
| `newsletter`    | `subscribe`, `confirm`, `unsubscribe`                                                                                             |
| `webmentions`   | `list`, `receive`                                                                                                                 |
| `avatar`        | `find`, `image`                                                                                                                   |
| `github`        | `avatar`, `release`                                                                                                               |
| `images`        | `resolveThumbhash`, `og`, `calendar`                                                                                              |
| `music`         | `get`                                                                                                                             |
| `branding`      | `asset`                                                                                                                           |
| `fonts`         | `embedded`                                                                                                                        |
| `storage`       | `object`                                                                                                                          |
| `analytics`     | `recordDeviceEnv`                                                                                                                 |
| `observability` | `rumStatus`, `rumIntake`                                                                                                          |
| `feeds`         | `rss`, `atom`                                                                                                                     |
| `sitemap`       | `xml`                                                                                                                             |

Anonymous public reads (twenty-six procedures: all nine `content.*` reads plus `comments.loadComments`,
`webmentions.list`, `avatar.find`, `github.avatar`, `github.release`, `images.resolveThumbhash`, `music.get`,
`observability.rumStatus`, the `feeds.*` and `sitemap.xml` document-like resources, and the images/branding/fonts/
storage binary families) are exempt from the CSRF double-submit guard and work bare. Eligibility is an explicit
per-procedure declaration in `@kobato/api` (`~orpc.meta.publicRead === true`), derived fail-closed by the server, and
frozen by independent tests on both sides — a new read gains the exemption only by deliberate opt-in. Everything else
keeps the full guard.

## Resource procedures and the streaming caveat

The resources the public origin serves are procedures too: `feeds.rss` / `feeds.atom` (input
`{ category?, tag?, ifNoneMatch? }`), `sitemap.xml`, the Open Graph and calendar images (`images.og`,
`images.calendar`), avatar images (`avatar.image`), the branding assets (`branding.asset`), embedded fonts
(`fonts.embedded`), and storage objects (`storage.object`). Document-like ones answer the same signal unions as the
content reads; binary ones answer an `ok` envelope carrying the body plus content type/ETag/cache profile, and honor the
same `not-modified`/`redirect` signals.

**Streaming caveat**: `fonts.embedded` and `storage.object` answer a top-level `ReadableStream` — their status and
metadata (Range validators included) travel on the RPC response headers, which `createKobatoServerClient` captures via
`takeResourceStream('public.fonts.embedded')`. That transport exists because an envelope with a nested stream is not
serializable in oRPC and the standard client buffers byte bodies. External consumers should not call these two
procedures at all: fetch the resource from the public origin URL (`/fonts/embedded/*`, `/storage/*`) as a plain HTTP
GET.

## What is workspace surface

Everything outside `publicContract` is workspace surface, free to churn with any release: the whole `admin` subtree and
the rest of `account` (`self`, `passkey`, the `auth` ceremony, `setup`, the "my comments" workspace reads). Do not
depend on it; `createKobatoPublicClient` does not expose it at the type level. Sayaka itself reaches a small frozen set
of `admin` procedures for in-place moderation and notification composition — that set carries no external guarantee.

## Cross-origin read-only policy

A server-side consumer calls `kobato` directly and needs no CORS at all. Browser-side interaction is same-origin by
policy; the one switch is the `security.cors` runtime setting (`{ enabled, origins }`, exact origins, managed in the
admin console under Security — it has no `kobato.config.json` layer), which lets another origin's browser perform
anonymous public reads. Because those reads are CSRF-exempt, CORS alone is enough — never disable `security.csrf` for
this. Credentialed cross-origin calls are unsupported: session, CSRF, and comment-token cookies are `SameSite=Lax` and
never leave the Kobato origin. Full interactive parity means a same-origin deployment; an external frontend supplies its
own routing to one (see the forwarding description in [Deployment](Deployment.md) for the two path families that bind
the workspace to the site origin).

## sayaka is the reference consumer

Sayaka is not a special client: it renders and serves every public URL from `publicContract` and the server assembly
above — nothing it gets is unavailable to you. When you find a gap, it shows up in sayaka first, during development;
public behavior is testable in one place (`pnpm run split:smoke`, the sayaka suites) however many external frontends
exist. Framework coupling already present in the wire is accepted: listing DTOs carry `seo: MetaDescriptor[]` (React
Router meta descriptors) — map them onto your framework's meta mechanism.

## Semantics to honor

- **Live gate**: draft, scheduled (future-dated), and soft-deleted content is invisible to every public read. Draft
  preview (`?draft=true`) is a built-in-frontend capability behind a viewer session — external frontends render Live
  content only.
- **`visible` orthogonality**: publication lifecycle and the `visible` flag are independent; a `visible=false` post
  stays in archives, tag/category listings, search, the sitemap, and feeds — only the home listing and the
  random/featured-style widgets exclude it, while the lifecycle gate applies everywhere.
- **Page views**: a served document records a page view — request a detail/listing only when you actually render it, and
  render-once per served document.
