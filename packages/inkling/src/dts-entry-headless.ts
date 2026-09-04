// Declaration-bundle entry for the `./headless` subpath, the third input of
// scripts/build-types.ts. See src/dts-entry.ts for the reference block
// rationale.
// oxlint-disable typescript/triple-slash-reference -- ambient-only declarations
/// <reference path="./vite-env.d.ts" />
/// <reference path="./markdown/types.d.ts" />
export * from './headless'
