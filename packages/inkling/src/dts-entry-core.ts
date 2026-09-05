// Declaration-bundle entry for the `./core` subpath (plan C5), the second
// input of scripts/build-types.ts. See src/dts-entry.ts for the reference
// block rationale.
// oxlint-disable typescript/triple-slash-reference -- ambient-only declarations
/// <reference path="./vite-env.d.ts" />
/// <reference path="./markdown/types.d.ts" />
export * from './core'
