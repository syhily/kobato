# Headless

Kobato can serve an externally deployed frontend: your frontend renders the public site by calling the backend's public
contract over HTTP, while the backend keeps owning data, admin/editor/auth, resources, and analytics. There is no
runtime switch — public procedures are always mounted, and your frontend is simply another caller. The decision record
is [ADR-0009](../adr/0009-optional-headless-frontends.md); the workspace conventions live in the root
[AGENTS.md](../../AGENTS.md) and each package's own `AGENTS.md`.

## Consuming the workspace source

No SDK ships to npm. Consume the workspace packages as source — a pnpm workspace / git dependency on this repository —
and pin the exact commit your backend runs. Every package carries the same version as the backend
(`apps/kobato/package.json` is the source of truth; `pnpm version:sync <version>` repairs drift), so "packages at
version X talk to backend at version X" is the whole compatibility story. Minimum set for a rendering consumer:
`@kobato/api` (contract + client), plus the shared leaves your renderer reads (`@kobato/catalog` for the listing/read
models, `@kobato/inkling/headless` for the document model) — the `contracts/`, `rpc/`, and `client/` subtrees of
`@kobato/api` are React-free and carry no ambient state. `@kobato/api/browser` is the built-in frontend's own assembly
and is not part of this seam.

## The client

```ts
import { createKobatoPublicClient } from '@kobato/api/client/create-client'

const client = createKobatoPublicClient({
  url: 'https://blog.example.com/rpc', // FULL RPC URL, never the site origin
})

const result = await client.content.home({}) // input: { num?: string /* page number */; ifNoneMatch?: string }

switch (result.kind) {
  case 'ok':
    render(result.listing) // remember result.etag for the next request
    break
  case 'not-modified':
    reuseCachedRender(result.etag)
    break
  case 'redirect':
    respondWithRedirect(result.status, result.to) // 301 | 302
    break
}
```

Anonymous public reads work bare — no cookie, no `x-csrf-token` header. The seventeen public-read procedures (all nine
`content.*` reads, plus `comments.loadComments`, `webmentions.list`, `avatar.find`, `github.avatar`, `github.release`,
`images.resolveThumbhash`, `music.get`, `observability.rumStatus`) are exempt from the CSRF double-submit guard.
Eligibility is an explicit per-procedure declaration in `@kobato/api` — `~orpc.meta.publicRead === true` — and the
server derives the exact-path exemption set from that declaration and enforces it: never an HTTP-method rule (the RPC
transport POSTs reads too), never derived from route metadata, and frozen by independent tests on both sides so a new
read gains the exemption only by deliberate opt-in. The exemption matches the canonical paths only: the pre-grouping
aliases (`/rpc/content/home`) were removed and no longer answer. Everything else keeps the full guard: the comment
mutations (`replyComment`/`edit`/`revokeToken`), the comment-token reads (`getRaw`/`myComments`), and the whole
`account`/`admin` surface. The separate `csrfExempt` escape hatch is limited to the anonymous device beacon and
role-guarded binary GETs; it is not anonymous-read eligibility.

- `url` is the FULL RPC URL (`https://host/rpc`), never the site origin. Optional `fetch` and `getHeaders` map onto the
  transport (custom fetch adapter; plain, promise, or per-call headers) — a read-only consumer needs neither.
- `content.bootstrap`'s output carries a `csrfToken`; it pairs with the caller's session cookie and matters only for
  same-origin interactive flows — a read-only consumer can ignore it.
- Document reads (`content.home`, `posts.bySlug`, `pages.bySlug`, listings, search) answer **signal unions** — `ok`,
  `not-modified`, or `redirect`; handle all three. The remaining procedures return their payload directly per schema
  (`bootstrap`, `comments.*`, `avatar.find`, `github.*`, `images.resolveThumbhash`, `music.get`).
- **ETag**: the content listings and detail procedures fingerprint their payload — pass the previous `etag` back as
  `ifNoneMatch` (e.g. `client.content.posts.bySlug({ slug, ifNoneMatch })`); a `not-modified` answer means reuse your
  cached render of that etag.
- Don't assemble your own oRPC `RPCLink`. The `/rpc/*` surface speaks oRPC's RPC protocol (POST + JSON — read procedures
  too) — the REST-style `method`/`path` metadata on each procedure is a compatibility record, not how the transport is
  called. The factory keeps you on the same transport as the built-in browser client.
- The client is React-free and has **no ambient state**: it manages no cookies, no CSRF token, no singleton.

## The stable surface

Only `publicContract` (`@kobato/api/public-contract`) carries the external stability guarantee — seven domains, pinned
key-by-key by
[apps/kobato/tests/arch/public-api-contract.test.ts](../../apps/kobato/tests/arch/public-api-contract.test.ts):

| Domain        | Procedures                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `content`     | `bootstrap`, `home`, `posts.list`, `posts.bySlug`, `pages.bySlug`, `comments.byKey`, `search`, `categories.list`, `archives` |
| `comments`    | `replyComment`, `loadComments`, `getRaw`, `edit`, `revokeToken`, `myComments`                                                |
| `webmentions` | `list`                                                                                                                       |
| `avatar`      | `find`                                                                                                                       |
| `github`      | `avatar`, `release`                                                                                                          |
| `images`      | `resolveThumbhash`                                                                                                           |
| `music`       | `get`                                                                                                                        |

- Reads dominate: the only writes are the three deployed comment mutations (`replyComment`, `edit`, `revokeToken`).
- Do **not** depend on `account` or `admin` procedures — that is workspace surface, free to churn with any release
  (`createKobatoPublicClient` doesn't even expose them at the type level).
- Call the canonical `/rpc/public/<domain>/<procedure>` transport paths — they are the only transport. The pre-grouping
  aliases (`/rpc/content/...` and friends) no longer answer: the server-side alias adapter was removed (ADR-0009 §5), so
  an old URL fails closed — the CSRF guard answers 403 first whenever the request carries no valid token (anonymous or
  not), and only a request with a valid CSRF token reaches the handler and 404s.

## Semantics to honor

- **Live gate**: draft, scheduled (future-dated), and soft-deleted content is invisible to every public read. Draft
  preview (`?draft=true`) is a built-in-frontend capability — external frontends render Live content only.
- **`visible` orthogonality**: publication lifecycle and the `visible` flag are independent; a `visible=false` post
  stays in archives, tag/category listings, search, the sitemap, and feeds — only the home listing and the random/
  featured-style widgets exclude it, while the lifecycle gate applies everywhere.
- **Page views**: a served document records a page view — request a detail/listing only when you actually render it, and
  render-once per served document.
- **SEO**: listing DTOs carry `seo: MetaDescriptor[]` — React Router-shaped meta entries (`{ title }`, `{ name }`,
  `{ property }`, …). Map them onto your framework's meta mechanism; the projection is not neutralized.

## Same-origin proxy reference

When your frontend is the public entry, forward the Kobato-owned paths to the backend (no forwarding middleware ships;
this table is the reference):

| Path                                                    | What it is                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/rpc/*`                                                | oRPC transport (public seam + built-in workspace calls)                            |
| `/storage/*`                                            | Uploaded media (local storage backend)                                             |
| `/images/*`                                             | Asset routes and OG images (`/images/og/*.png`)                                    |
| `/fonts/*`                                              | Embedded font files                                                                |
| `/feed`, `/feed/atom`, `/{cats,tags}/:slug/feed(.atom)` | Feeds                                                                              |
| `/sitemap.xml`                                          | Sitemap                                                                            |
| `/webmention`                                           | Webmention intake (POST, form-encoded `source`/`target`)                           |
| `/api/rum/*`                                            | RUM relay/status (if you embed the RUM SDK)                                        |
| `/robots.txt`, `/manifest.webmanifest`                  | Site-level metadata                                                                |
| `/admin/*`, `/editor/*`                                 | Built-in workspace and auth screens — forward only if you want them on this origin |

Comments are the interactive surface, and they are **same-origin by construction**: anonymous comment authorship rides
the `__comment_tokens` cookie (HttpOnly, `SameSite=Lax`, 7-day), and the comment mutations plus the token reads stay
behind the CSRF double-submit pair (`__csrf` cookie + matching `x-csrf-token` header — the built-in browser assembly in
`@kobato/api/browser` carries it). For a browser-driven frontend, the browser must call the same origin that set those
cookies — forward `/rpc/*` rather than pointing the browser at a different backend origin. `createKobatoPublicClient`
does none of this for you (no ambient state).

**Cross-origin read-only** is the other topology: enable the `security.cors` runtime setting (`{ enabled, origins }`,
exact origins) — a runtime setting managed in the admin console under Security (it has no `kobato.config.json` layer) —
to let the backend answer another origin's browser requests with CORS headers. Because the anonymous public-read
procedures are CSRF-exempt, a foreign origin's browser reads the public contract with CORS alone — never disable
`security.csrf` for this. Credentialed cross-origin calls remain unsupported by policy: session, CSRF, and comment-token
cookies are `SameSite=Lax` and never leave the Kobato origin, so comment writes and token reads work only same-origin. A
server-side consumer (CORS-immune) is equally supported. Full interactive parity means a same-origin deployment.

## Webmention intake and comment tokens

- `POST /webmention` is a plain HTTP resource, deliberately not in `publicContract` — point Webmention senders at the
  backend origin (or your proxied equivalent); `webmentions.list` is the only webmentions RPC.
- The comment-token procedures key off the `__comment_tokens` cookie: `myComments`/`getRaw` read the visitor's pending
  edits, `edit` mutates within the token window, `revokeToken` clears it. Same-origin cookie behavior above applies.
