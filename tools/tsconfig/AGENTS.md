# `@kobato/tsconfig`

Owns the workspace TypeScript base configuration. This package is configuration-only and has no runtime source or
internal dependencies; every workspace package extends `@kobato/tsconfig/tsconfig.base.json` and declares it as a
devDependency.
