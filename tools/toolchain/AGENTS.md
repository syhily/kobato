# `@kobato/toolchain`

Shared build/test configuration and the app's build-time Vite plugins. Nothing here ships in a product runtime graph.

## Layout

```
toolchain/
├── tsconfig.base.json   # THE single workspace path table (root/app tsconfigs only extend it)
├── oxlint.config.ts     # root oxlint config wrapper
├── oxfmt.config.ts      # root oxfmt config wrapper
└── src/vite/            # build-time Vite plugins consumed only by vite.config.ts
    ├── react-compiler-plugin.ts
    └── route-warmup.ts
```

- `src/vite/` plugins are BUILD code: only a `vite.config.ts` (or a test of that config) may import them, and a product `src/` module never does. The job that shipped these from `packages/server/src/infra/` was a pre-split leftover — do not move them back.
- `route-warmup.ts` reads the manifest contract from `@kobato/distribution/warmup-manifest` and the wire constants from `@kobato/distribution/route-warmup`; it resolves the browser entry through `import.meta.url` (never `process.cwd()`).
- This package declares every workspace edge it imports (`dependencies`) and every tool it runs (`devDependencies`); tests import it through `@kobato/toolchain/src/vite/*.ts`.
- The root `tsconfig.json` and `apps/inkling-demo/tsconfig.json` extend `tsconfig.base.json`; no other package declares a `paths` table.
