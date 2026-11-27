# `@kobato/tsconfig`

Owns the workspace TypeScript base configuration: configuration-only, no runtime source or internal dependencies. Every
workspace package extends `@kobato/tsconfig/tsconfig.base.json` and declares it as a devDependency.

`tsconfig.base.json` is the single path table (`apps/kobato/tests/arch/package-dag.test.ts` pins it): one
`@kobato/<name>/*` → `<dir>/src/*` row and one `@kobato/<name>/tests/*` → `<dir>/tests/*` row per workspace package
(`@kobato/web-admin` included), plus the app aliases `@/*` / `@tests/*` (the kobato backend app and its tests) and
`@sayaka/*` / `@sayaka/tests/*`. The workspace imports itself through `@kobato/web-admin/<path>`, never through an
alias.
