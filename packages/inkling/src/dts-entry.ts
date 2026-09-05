// Declaration-bundle entry for scripts/build-types.ts (plan 028).
// The triple-slash references pull ambient module/global declarations
// (svg?react imports, Window.plausible, ImportMeta.env, markdown-it-sub/sup)
// into the generator's program; they have no runtime importable form.
// oxlint-disable typescript/triple-slash-reference -- ambient-only declarations
/// <reference path="./vite-env.d.ts" />
/// <reference path="./markdown/types.d.ts" />
export * from './index'
