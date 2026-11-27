import type { Plugin } from 'vite'

import { repoRoot } from '@kobato/pack/sea/paths'
import { resolve } from 'node:path'

export function sanitizeEngineAliasPlugin(): Plugin {
  return {
    name: 'sanitize-html-engine-alias',
    enforce: 'pre',
    resolveId: {
      filter: { id: /(^|\/)engine\.node(\.ts)?$/ },
      handler() {
        if (this.environment.name === 'client') {
          return resolve(repoRoot, 'packages/shared/base/src/sanitize/engine.browser.ts')
        }
        return null
      },
    },
  }
}
