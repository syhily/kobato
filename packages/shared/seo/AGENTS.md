# `@kobato/seo`

Isomorphic meta-tag builders for SSR documents. Owner of: `meta` (`routeMeta` / `bundleFromMatches` / `metaWithFallback` — meta built over the root loader's `matches` and its `i18n` payload) and `og-image` (`ogImagePathForSlug`).

- Allowed deps: `@kobato/settings`, `@kobato/i18n`, `@kobato/utils`. `MetaDescriptor` arrives as an erased react-router `import type` (not a React import).
- Consumers: the app's routes and `src/seo/title-meta`, plus the server's feed/OG renderers. `@kobato/web-admin` deliberately does NOT depend on this leaf (title resolution lives in the app layer).
- Tests: `tests/unit/` + `tests/snaps/` (umbrella `shared-unit` / `shared-snaps` projects — see `packages/shared/tests/AGENTS.md`).
