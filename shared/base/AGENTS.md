# `@kobato/base`

The dependency floor under `i18n`: one package holding five directories that keep the names of the leaves they were —
`utils`, `auth`, `assets`, `distribution`, `sanitize`. A module is `@kobato/base/<directory>/<module>`, and a module
inside `base` imports another the same way — never relatively. Each directory is a cohesive family; nothing lands at the
root of `src/`, and no module moves directory.

## Direction

`auth` and `utils` may import `@kobato/i18n`; `assets`, `distribution`, and `sanitize` import no workspace package. No
directory imports another, and none of the five imports `settings`, `catalog`, `@kobato/api`, or anything above the
floor — pinned at directory level by `apps/kobato/tests/arch/package-dag.test.ts`. Allowed workspace dep: `@kobato/i18n`
only. No React, no `node:*` value imports but the one under `sanitize/` (the umbrella rules in `shared/AGENTS.md`
apply). Tests mirror the directories — `tests/<directory>/unit/` (`shared-unit`).

## `utils/`

Pure isomorphic helpers with no domain knowledge: URL and slug primitives (`urls`, `safe-url`, `url-schema`, `slug`),
date/id/memo/sampling helpers, `theme-cookie`, `thumbhash`, type guards, the display `format` facade (the ONE surface
for user-visible dates/numbers/byte sizes/durations/DisplayNames — explicit locale + site time zone, cached formatters),
and `http-server-options` (`HTTP_SERVER_OPTIONS`, the frozen Node `http.ServerOptions` every Kobato HTTP listener binds
— kobato's `listenHono` and sayaka's `createHonoServer` — with a type-only `node:http` import and no runtime dependency;
the request deadline is application-level, so `requestTimeout` is `0`).

Never move back here: role/security and the SSRF/passkey network boundary (`auth/`); `toc` (`@kobato/inkling/headless`);
avatar URL rules and the Gravatar mirror policy (`assets/`); app identity (`distribution/app`); Zod helpers, comment
entity parse/serialize, and the `Comments` summary (`@kobato/api/contracts`); `is-bot` (`@kobato/api/client`); session
sort (`apps/kobato/src/ui/sessions`).

The ThumbHash snapshot corpus stays in `tests/utils/fixtures/thumbhash/`.

## `auth/`

Isomorphic authentication and identity primitives.

- `roles.ts` — role vocabulary, ordering, role label message ids.
- `security.ts` — password policy (length bounds, the bcrypt 72-byte ceiling + `passwordWithinBcryptLimit`, complexity
  regex) and Web Crypto token/email primitives. The Zod factory `newPasswordSchema` lives in
  `@kobato/api/contracts/account/self` so wire inputs single-source it.
- `network.ts` — `isBlockedFetchHost` / `isPrivateIp` (SSRF host and CIDR grammar) and `isValidPasskeyDomain` (HTTPS
  public-RP rule); no dependencies. Generic URL formatting stays in `utils/safe-url`.
- `trusted-proxy.ts` — `isValidIp` / `isValidTrustedProxyEntry` / `matchesTrustedProxy` (strict IP grammar and IPv4 CIDR
  trusted-proxy matching); no dependencies. Deliberately separate from `network.ts`'s permissive SSRF parser.
- No session persistence, HTTP guards, React, database, or server-only flows. `escapeHtml` belongs to `sanitize/`.

## `assets/`

Site-owned asset vocabulary: `asset-url` (the ONE asset-URL path grammar — `STORAGE_ROUTE_PREFIX`,
`EMBEDDED_FONT_ROUTE_PREFIX`, `parseAssetUrlPath`, `isOnSiteOrigin`; forward and inverse both derive from it, never
re-implement a fragment), `images` (image kinds, friend-poster host paths/retargeting, `siteOwnedStorageSrc`,
`getImageUrl`), `avatar` (site-wide avatar rule + the `AVATAR_SOURCES` chain), `gravatar` (mirror-host allowlist, preset
URLs, `isAllowedMirrorUrl` — URL policy only; SSRF/DNS enforcement stays in the server), `fonts` (`ResolvedFont(s)`, the
root-loader font payload).

- No storage backend knowledge (drivers and the CDN template live in `@kobato/server/src/domains/storage` /
  `src/infra/storage`); no React; no workspace dependency.

## `distribution/`

Build-time identity and distribution-artifact contracts shared by the runtime and the packaging tools. No workspace
dependency; no Node runtime, filesystem, packaging implementation, RPC DTOs, or React.

- `app.ts` — the compile-time `__APP_*__` application identity.
- `sea-assets.ts` — the only owner of SEA embedded-asset keys and codec vocabulary (writers in `@kobato/pack`, readers
  in `@kobato/server` and the two apps): kobato's SPA rides `client/`, sayaka's public-site build rides `sayaka-client/`
  (the sayaka binary embeds only that prefix plus its manifest), drizzle keeps `drizzle/`, natives `natives/` +
  `natives-meta/`, observability `observability/`, and the embedded worker bundles `worker/`.
- `route-warmup.ts` — client-manifest shape, sentinel, and warmup exclusion patterns shared by build, SSR, and browser
  idle loading.
- `warmup-manifest.ts` — the `warmup-manifest.json` contract, `{ version, tier1, tier2 }` (parse/validate/chunk walk),
  written by the build plugin in `tools/pack` and read by the public site's SSR reader
  (`apps/sayaka/src/server/warmup-manifest.ts`); the workspace warms no routes.
- Tests: `tests/distribution/unit/`. SEA writer/reader pins live in `tools/pack/tests/unit/sea/`; asset-key pins in
  `apps/kobato/tests/arch/`.

## `sanitize/`

The isomorphic DOMPurify stack — the single reason SSR and hydration bytes cannot drift. `config` (per-strategy
allowlists, incl. the server-only `feed` / `comment-email` strategies and the web `comment` strategy), `purify-core`
(every behavioral rule), `sanitize-html` (`sanitizeHtmlString` / `sanitizeHtml`), the engine bindings (`engine.node.ts`
— jsdom; `engine.browser.ts`), `escape-html` (the one `escapeHtml` for attribute-safe interpolation).

- No workspace dependency (dompurify + jsdom are the only externals, both devDependencies).
- `engine.node.ts` is the ONE node exception in the shared umbrella; the `sanitize-html-engine-alias` vite plugin swaps
  it to `engine.browser.ts` in the client bundle (`apps/kobato/tests/arch/client-bundle.test.ts`).
- Tests: `tests/sanitize/unit/` — parity, node, and browser engine suites.
