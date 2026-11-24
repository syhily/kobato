# `@kobato/tsconfig`

Owns the workspace TypeScript base configuration: configuration-only, no runtime source or internal dependencies. Every
workspace package extends `@kobato/tsconfig/tsconfig.base.json` and declares it as a devDependency.
