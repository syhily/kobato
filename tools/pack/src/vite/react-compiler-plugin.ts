import type { Plugin } from 'vite'

import { transform } from 'oxc-transform-react'

const INCLUDE = /\.[tj]sx?$/
const EXCLUDE = /\/node_modules\//
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
