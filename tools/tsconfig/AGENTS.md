# `@kobato/tsconfig`

Owns the workspace TypeScript base configuration: configuration-only, no runtime source or internal dependencies. Every
workspace package extends `@kobato/tsconfig/tsconfig.base.json` and declares it as a devDependency.

`tsconfig.base.json` is the single path table (`apps/kobato/tests/arch/package-dag.test.ts` pins it): one
`@kobato/<name>/*` → `<dir>/src/*` row and one `@kobato/<name>/tests/*` → `<dir>/tests/*` row per workspace package plus
the app aliases `@/*` / `@tests/*` (the kobato app's `apps/kobato` source — the workspace SPA and the backend entry —
and its tests) and `@sayaka/*` / `@sayaka/tests/*`: an app imports itself through its aliases, a package through its own
`@kobato/<name>/<path>` row, never through a relative specifier.
