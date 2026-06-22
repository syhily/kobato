# Sanitizer coexistence: `sanitize-html` + `dompurify`

> **Status:** implemented
> **Date:** 2026-06-22
> **Scope:** client-side HTML sanitization, browser bundle hygiene

## Background

A class of `Module "…" has been externalized for browser compatibility` warnings
flood the browser dev console on article pages. They were previously masked by a
larger flood of React key warnings (fixed separately) and surfaced once those
were resolved.

## Root cause

`sanitize-html` is a Node-targeted sanitizer. Its `style`-attribute parsing goes
through `postcss`, which in turn imports `source-map-js`, `path`, `fs`, and
`url` — all Node built-ins that do not exist in the browser. Vite externalizes
them to empty stubs and warns on every access.

### Client-side call sites (5)

| #   | File                                                  | Strategy | HTML source                         | SSR?                              |
| --- | ----------------------------------------------------- | -------- | ----------------------------------- | --------------------------------- |
| 1   | `src/ui/inkling/render/blocks/CodeBlock.tsx`          | `shiki`  | server shiki output (pre-sanitized) | **yes**                           |
| 2   | `src/ui/inkling/render/marks/MathMark.tsx` (×2)       | `math`   | server KaTeX MathML (pre-sanitized) | **yes**                           |
| 3   | `src/ui/inkling/editor/cards/math-card-component.tsx` | `math`   | `orpc.admin.renders.math` (fetched) | **yes** (component mounts in SSR) |
| 4   | `src/ui/admin/audit/AuditLogRow.tsx`                  | `shiki`  | server audit log (pre-sanitized)    | **yes**                           |
| 5   | `src/ui/inkling/editor/plugins/PastePlugin.tsx`       | custom   | **untrusted clipboard**             | **no** (browser-only)             |

Sites 1–4 feed sanitized output into `dangerouslySetInnerHTML` and the input is
already server-sanitized (`sanitizeShikiHtml` / `sanitizeMathml` in
`src/server/render/inkling/sanitize.ts`). The client call is defense-in-depth.

Site 5 (`PastePlugin`) is the **only** site that sanitizes genuinely untrusted
input (the user's clipboard). It is browser-only — it never runs during SSR.

### Server-only call sites (2, out of scope)

| File                                    | Purpose                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `src/server/render/inkling/sanitize.ts` | `sanitizeInklingFeedHtml`, `sanitizeMathml`, `sanitizeShikiHtml` |
| `src/server/render/feed/generator.tsx`  | `sanitizeFeedHtml` for RSS/Atom                                  |

These run in Node and have no browser-bundle problem. They **stay on
`sanitize-html`** — `sanitize-html` is a pure-JS parser with no `jsdom`
dependency, which is explicitly why it was chosen (see the comment in
`generator.tsx:56-60`).

## Design decision: coexistence

Two libraries, each used where it is strongest:

```
                ┌─────────────────────────────────────────────────┐
                │              Browser bundle                      │
                │                                                  │
  PastePlugin ──┼─▶ dompurify   (untrusted input, browser-only)    │
  (site 5)      │                                                  │
                │  CodeBlock / MathMark / AuditLogRow ─────────────┼─▶ no
                │  (sites 1–4)                                     │   client-side
                │                                                  │   sanitize at all
                └─────────────────────────────────────────────────┘   (see §"Why
                                      ▲                                 sites 1–4
                                      │                                 drop the
                              React hydration                         client call)
                                      ▲
                                      │
                ┌─────────────────────────────────────────────────┐
                │              Server (Node)                       │
                │                                                  │
  All server    │  sanitize-html  (feed, prerender, SSR render)    │
  call sites    │                                                  │
                └─────────────────────────────────────────────────┘
```

### Why not `dompurify` on the server

`dompurify` is DOM-only. On Node it needs a fake DOM. The only server-safe
option is **`jsdom`** — `happy-dom` is officially flagged as unsafe with
dompurify (happy-dom issue #1403 documents concrete XSS bypasses). Pulling
`jsdom` (~3 MB, heavy) into the SSR runtime:

- bloats the Docker image and the server bundle,
- slows SSR hot paths (every code block / math block parses through a
  full DOM rather than `sanitize-html`'s streaming `htmlparser2`),
- gains nothing, because the server already has a working pure-JS sanitizer.

The existing comment in `generator.tsx` makes this explicit:

> `sanitize-html` is a pure-JS parser (no jsdom dependency), which closes the
> bypasses the previous regex chain had.

### Why not a single library on both sides (hydration trap)

The tempting "clean" option — `sanitize-html` on server, `dompurify` on client,
behind the same `sanitizeHtml(html, strategy)` facade — **breaks hydration**.

React compares the `__html` string during hydration. `sanitize-html` and
`dompurify` serialize differently in harmless but observable ways (attribute
ordering, self-closing vs void tags, entity escaping, whitespace handling). Any
divergence fires:

```
Warning: Prop `dangerouslySetInnerHTML` did not match. Server: "…" Client: "…"
```

…on **every** code block and math block on every article page, then forces a
client re-render. That trades one class of console warning for a worse one.

### Why sites 1–4 drop the client-side call entirely

Sites 1–4 render **already-sanitized** HTML from trusted server sources:

| Site              | Server sanitizer that already ran            | Persisted?                                  |
| ----------------- | -------------------------------------------- | ------------------------------------------- |
| CodeBlock         | `sanitizeShikiHtml` in `prerender.ts`        | yes — `highlightedHtml` stored on the block |
| MathMark          | `sanitizeMathml` in SSR renderer / prerender | yes — `mathml` stored on the node           |
| math-card preview | `orpc.admin.renders.math` (server endpoint)  | n/a — fresh per render                      |
| AuditLogRow       | server audit pipeline                        | yes — `detailsHtml` on the DTO              |

The client-side `sanitizeHtml` was defense-in-depth against a compromised server
or a hand-crafted PT body. Removing it is acceptable because:

1. The server sanitizer is the authoritative boundary and is not being removed.
2. The browser sees only server-produced, server-sanitized HTML — there is no
   untrusted input path that reaches these `dangerouslySetInnerHTML` sites
   without first passing through the server sanitizer.
3. Keeping a client sanitizer here requires keeping `sanitize-html` (Node-only,
   broken in browser) or `dompurify` (which would then need `jsdom` on the server
   to avoid the hydration trap). Neither is worth it for a redundant layer.

**The only genuine client-sanitization need is `PastePlugin`** (site 5), which
handles raw clipboard HTML that never touches the server before Lexical parses
it. That is where `dompurify` earns its place.

## Implementation plan

### 1. Add `dompurify` dependency

```jsonc
// package.json — devDependencies (per project convention: non-native runtime
// deps go in devDeps; the prod Docker image resolves them from the lockfile)
"dompurify": "^3.2.0"
```

`dompurify` 3.x ships its own TypeScript types — no `@types/dompurify` needed.

### 2. Replace `sanitize-html` with `dompurify` in `PastePlugin`

`src/ui/inkling/editor/plugins/PastePlugin.tsx` is browser-only (it attaches a
`paste` event listener in a `useEffect`). Rewrite `sanitisePastedHtml`:

```tsx
import DOMPurify from 'dompurify'

// Allow-list kept in sync with the editor's registered node set
// (InklingArticleEditor.ARTICLE_NODES).
const PASTE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'a',
    'img',
    'span',
    'sup',
    'sub',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
  // img must not allow data: — see the comment that was already here.
  // DOMPurify has no per-tag URI filter, so we enforce it in a hook.
  ALLOW_DATA_ATTR: false,
}

// Restrict img src to http(s) only (mirrors the old allowedSchemesByTag).
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'src' && data.attrValue.startsWith('data:')) {
    data.keepAttr = false
  }
})

function sanitisePastedHtml(html: string): string {
  return DOMPurify.sanitize(html, PASTE_CONFIG) as string
}
```

> **Implementation note (discovered during build):** the `DOMPurify` default
> export is a **factory** (`createDOMPurify(window)`), not a pre-bound
> singleton. Its `.sanitize` / `.addHook` methods only exist after it has been
> constructed against a `window`. Calling `DOMPurify.addHook(...)` at module
> top-level — as the snippet above shows — works in the browser (where
> `dompurify` auto-binds to the global `window` on import) but yields an inert
> instance (`isSupported === false`, no methods) under Node / SSR, crashing
> every Node-environment test that transitively imports the editor shell with
> `TypeError: default.addHook is not a function`.
>
> The shipped implementation therefore uses the factory form explicitly and
> **lazily initializes** a single instance on first call, inside the browser
> `useEffect` call path where `window` is guaranteed present:
>
> ```tsx
> import createDOMPurify, { type DOMPurify as DOMPurifyInstance } from 'dompurify'
>
> let purify: DOMPurifyInstance | null = null
>
> function getPurify(): DOMPurifyInstance {
>   if (purify !== null) return purify
>   const instance = createDOMPurify(window)
>   instance.addHook('uponSanitizeAttribute', (_node, data) => {
>     if (data.attrName === 'src' && data.attrValue.startsWith('data:')) data.keepAttr = false
>   })
>   purify = instance
>   return instance
> }
>
> function sanitisePastedHtml(html: string): string {
>   return getPurify().sanitize(html, PASTE_CONFIG) as string
> }
> ```
>
> This preserves the exact behavioral parity below while keeping the module
> SSR-safe.

**Behavioral parity checklist** (vs the old `sanitize-html` config):

| Old `sanitize-html` option                         | `dompurify` equivalent            | Notes                                                                                                |
| -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `allowedTags`                                      | `ALLOWED_TAGS`                    | direct map                                                                                           |
| `allowedAttributes.a` / `.img` / `.code` / `.span` | `ALLOWED_ATTR` (union)            | DOMPurify has no per-tag attr config; the union is safe because the tag allow-list is already narrow |
| `allowedSchemes: ['http','https','mailto']`        | `ALLOWED_URI_REGEXP`              |                                                                                                      |
| `allowedSchemesByTag.img: ['http','https']`        | `uponSanitizeAttribute` hook      | strips `data:` on `<img src>`                                                                        |
| `allowProtocolRelative: false`                     | `ALLOWED_URI_REGEXP` rejects `//` | the regex requires a scheme                                                                          |
| `allowedStyles: {}` (drop all inline styles)       | not in `ALLOWED_ATTR`             | `style` is omitted → stripped                                                                        |
| `disallowedTagsMode: 'discard'`                    | default behavior                  | DOMPurify discards by default                                                                        |

### 3. Remove client-side `sanitizeHtml` calls from sites 1–4

These four files stop importing and calling `sanitizeHtml`. The already-sanitized
HTML from the server goes straight into `dangerouslySetInnerHTML`:

| File                                                  | Change                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `src/ui/inkling/render/blocks/CodeBlock.tsx`          | drop the import; use `node.highlightedHtml` directly     |
| `src/ui/inkling/render/marks/MathMark.tsx`            | drop the import; use `mathml` directly (both call sites) |
| `src/ui/inkling/editor/cards/math-card-component.tsx` | drop the import; use the `html` state directly           |
| `src/ui/admin/audit/AuditLogRow.tsx`                  | drop the import; use `row.detailsHtml` directly          |

### 4. Retire or scope down `src/ui/lib/sanitize-html.ts`

After step 3, the only production caller of `@/ui/lib/sanitize-html` is gone.
Two options:

- **(a) Delete it.** The module, its 5 strategies, and its test file
  (`tests/unit/ui/lib/sanitize-html.test.ts`) are removed. The `'email'`,
  `'audit'`, and `'preview'` strategies were already test-only with no
  production caller. Clean cut.
- **(b) Keep it for tests only.** If snapshot or integration tests still need a
  Node-environment sanitizer, keep the module but mark it server/test-only.

**Recommendation: (a) delete.** Nothing in `src/` imports it after step 3. The
server has its own `src/server/render/inkling/sanitize.ts`. If a test needs
sanitization it should use the same library the production code uses
(`dompurify` in `happy-dom` test environment, or the server module on the Node
side).

### 5. Remove `sanitize-html` and `@types/sanitize-html` from `package.json`

After confirming no `src/` import remains:

```jsonc
// remove from devDependencies
- "sanitize-html": "^2.17.5",
- "@types/sanitize-html": "^2.16.1",
```

**⚠️ Pre-check:** the two server files (`src/server/render/inkling/sanitize.ts`,
`src/server/render/feed/generator.tsx`) still use `sanitize-html`. If we remove
the package, those must migrate first. Two sub-options:

- **Keep `sanitize-html`** as a server-only dependency. The package stays in
  `devDependencies`; only the browser import is removed. Vite never bundles it
  for the client. **This is the minimal-risk path and matches the coexistence
  decision.**
- **Migrate server call sites too** (to `dompurify` + `jsdom`). Larger change,
  SSR perf cost, not recommended in this pass.

**Recommendation: keep `sanitize-html` in `devDependencies`.** The server uses
it; the client no longer imports it. No package.json change for
`sanitize-html`. Only **add** `dompurify`.

### 6. Update / remove tests

| Test file                                            | Action                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/ui/lib/sanitize-html.test.ts`            | **Delete** (module removed in step 4a)                                                                                                                            |
| `tests/unit/ui/inkling/editor/paste-plugin.test.tsx` | Keep; verify it still passes with the `dompurify`-based `PastePlugin`. The existing assertions (mounts without throwing, registers listener) are library-agnostic |

Added focused cases to `paste-plugin.test.tsx` ("strips `<script>`",
"strips `javascript:` hrefs", "strips `data:` img src", "strips inline event
handlers", "rejects protocol-relative URLs"). These run under
`@vitest-environment happy-dom`.

**⚠️ happy-dom caveat (discovered during implementation):** DOMPurify's
_element retention_ is unreliable under happy-dom — its DOM interfaces cause
DOMPurify to over-drop otherwise-valid elements (e.g. `<p>safe</p>` serializes
to just `safe`). This is the same happy-dom unsafety §"Why not dompurify on
the server" flags. DOMPurify's _removal_ of dangerous content, by contrast,
works reliably under happy-dom.

Because `sanitisePastedHtml` only ever runs in a real browser (it is called
from a `useEffect`-bound paste listener), the happy-dom retention quirk is a
test-only artifact. The paste tests therefore assert **only the
security-critical removal properties** (the contract the function exists to
enforce) and deliberately do not assert retention of specific tags or
attribute serialization — those assertions would pass or fail based on the
test DOM rather than on production behavior.

### 7. Vite config — no change needed

`sanitize-html` stays in `devDependencies`; the server bundle imports it via
`ssr.noExternal: true`. The client bundle no longer imports it, so Vite has
nothing to externalize. The warnings disappear without touching `vite.config.ts`.

If any stray client import of `sanitize-html` survives (e.g. a missed call
site), Vite will still warn — that is the desired behavior (it catches
regressions).

## Verification

```bash
pnpm run type    # TypeScript clean
pnpm run lint    # oxlint clean
pnpm run fmt     # oxfmt clean
pnpm run test    # all green, including paste-plugin tests
pnpm run build   # client bundle no longer imports sanitize-html
```

Manual check in the browser dev console:

1. Open any article page with code blocks and math.
2. Confirm **zero** `Module "…" has been externalized` warnings.
3. Confirm **zero** `dangerouslySetInnerHTML did not match` hydration warnings.
4. In the editor, paste rich HTML from a web page / Word doc.
5. Confirm the paste is sanitized (no `<script>`, no `javascript:` links, no
   `data:` images) and Lexical parses it into the expected node structure.

## Out of scope

- Server sanitizer migration (`sanitize-html` → `dompurify` + `jsdom`).
  Deliberately deferred — no browser-bundle benefit, SSR perf cost.
- The `'email'`, `'audit'`, `'preview'` strategies in
  `@/ui/lib/sanitize-html` (test-only, deleted with the module).

## Risk register

| Risk                                                                                    | Likelihood                                                 | Mitigation                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A client `sanitizeHtml` call site is missed, leaving a `sanitize-html` browser import   | Low — grep after the change                                | Vite will warn in dev; CI `build` will surface it                                                                     |
| Removing the client sanitizer exposes an XSS if the server sanitizer has a bug          | Low — server sanitizer is battle-tested and stays in place | The server sanitizer is the authoritative boundary; it is not being changed                                           |
| `dompurify` default config is more permissive than the old `sanitize-html` paste config | Medium                                                     | Explicit `ALLOWED_TAGS` / `ALLOWED_ATTR` / `ALLOWED_URI_REGEXP` + the `data:` hook; paste test cases verify stripping |
| `PastePlugin` `dompurify` import pulls in unwanted code                                 | Low — `dompurify` is ~20 KB, tree-shakeable                | Acceptable; far smaller than `sanitize-html` + `postcss` + `source-map-js`                                            |
