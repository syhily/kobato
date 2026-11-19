# `@kobato/pack`

Packaging tooling for the single-executable distribution. Nothing here ships inside the product binary.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe/e2e, self-update); its own conventions live in `src/sea/AGENTS.md`.
- `src/release.ts` — version sync and release preparation used by `release:bump` / `release:prepare-next`.
- Build-time configs import the plugins through `@kobato/pack/sea/*` (the root and `apps/kobato` package.json files declare the workspace link); the one relative import left is the build-output entry (`src/sea/server-entry.ts` pulling the built app bundle).
