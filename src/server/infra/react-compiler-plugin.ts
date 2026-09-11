import type { Plugin } from 'vite'

import { transform } from 'oxc-transform-react'

/**
 * React Compiler pass for the client bundle, via the Rust implementation
 * (`oxc-transform-react` — https://oxc.rs/blog/2026-08-18-react-compiler-support).
 *
 * Why a hand-rolled plugin instead of `@vitejs/plugin-react` v6's
 * `react({ compiler: true })`: React Router framework mode ships its own
 * Fast Refresh pipeline (`@react-router/dev` applies `react-refresh/babel`
 * plus its own HMR runtime injection), so adding plugin-react alongside
 * `reactRouter()` double-wraps every component in `$RefreshSig$` and breaks
 * HMR. This plugin runs ONLY the compiler and emits the result with
 * `jsx: 'preserve'` — JSX lowering stays with Vite's native Oxc transform
 * and refresh stays with React Router's pass, exactly the pipeline this app
 * already uses. The one new import the compiler introduces
 * (`react/compiler-runtime`) must stay inside Vite's dep-optimizer pipeline,
 * hence the matching `optimizeDeps.include` entry in `vite.config.ts`.
 *
 * Mirrors `createReactCompilerPlugin` from @vitejs/plugin-react: client
 * environments only (SSR stays uncompiled — memoization is
 * semantics-preserving, so hydration is unaffected), cheap code-level gate,
 * non-fatal diagnostics (bailouts) warn, fatal ones error.
 */

const INCLUDE = /\.[tj]sx?$/
const EXCLUDE = /\/node_modules\//
// Cheap pre-parse gate copied from @vitejs/plugin-react: skip files that
// cannot plausibly contain a component or hook.
const CODE_GATE = /forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/

export function reactCompilerPlugin(): Plugin {
  let sourcemap = true

  return {
    name: 'kobato:react-compiler',
    enforce: 'pre',

    configResolved(config) {
      sourcemap = config.command !== 'build' || !!config.build.sourcemap
    },

    transform: {
      filter: {
        id: {
          include: [INCLUDE],
          exclude: [EXCLUDE],
        },
      },
      async handler(code, id) {
        // SSR/server consumers are intentionally left uncompiled (see above).
        if (this.environment?.config.consumer === 'server') {
          return null
        }
        if (!CODE_GATE.test(code)) {
          return null
        }

        const result = await transform(id.split('?')[0], code, {
          sourcemap,
          jsx: 'preserve',
          reactCompiler: { target: '19' },
        })

        const formatDiagnostic = (error: (typeof result.errors)[number]) =>
          error.codeframe ? `${error.message}\n${error.codeframe}` : error.message

        if (result.fatal) {
          const diagnostics = result.errors.map(formatDiagnostic).join('\n\n')
          this.error(diagnostics || 'React Compiler transform failed.')
        }
        for (const error of result.errors) {
          this.warn(formatDiagnostic(error))
        }

        return {
          code: result.code,
          map: result.map,
        }
      },
    },
  }
}
