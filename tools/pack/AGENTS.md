# `@kobato/pack`

Packaging tooling for the single-executable distribution. Nothing here ships inside the product binary.

- `src/sea/` — the SEA pipeline (asset discovery/embedding, injection, smoke/probe/e2e, self-update); its own conventions live in `src/sea/AGENTS.md`.
- `src/release.ts` — version sync and release preparation used by `release:bump` / `release:prepare-next`.
- The root Vite SEA config loads `src/sea/*` by relative path (documented exception in `apps/kobato/tests/arch/package-dag.test.ts`); source imports otherwise use `@kobato/pack/...`.
