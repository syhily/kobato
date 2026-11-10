// Bundler plugin: inline static package data files into the server bundle.
// Bundled packages reach for files at runtime in ways a single-file ESM SEA
// binary cannot survive; every payload is static. JSON embeds verbatim (a JSON
// text IS a JS expression) so consumers still bind objects, not strings.
// Call-site shapes are pinned by the `inline-package-data` contract test so an
// upstream release changing one fails at upgrade time.

import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

interface InlineDataRead {
  /** The exact upstream read/require, whitespace-tolerant. */
  pattern: RegExp
  /**
   * File to inline. A relative path resolves against the matching module's
   * directory; a `bare:` prefix resolves with `createRequire(id)`, i.e.
   * exactly the module's own resolution semantics. Unused for `path-stub`.
   */
  dataFile?: string
  /**
   * text: embed as a string literal; json: embed the payload verbatim; path-stub:
   * replace a `require.resolve(...)` with a placeholder absolute path — the
   * module-scope resolve must merely not throw, the file is never opened (see
   * the jsdom case below).
   */
  kind: 'text' | 'json' | 'path-stub'
}

export interface InlineDataCase {
  /** Contract-test label; also used in the drift error message. */
  name: string
  /** Absolute-path pattern of the module carrying the runtime reads. */
  modulePattern: RegExp
  reads: InlineDataRead[]
}

export const INLINE_DATA_CASES: InlineDataCase[] = [
  {
    name: 'jsdom xhr sync worker path',
    modulePattern: /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/,
    reads: [
      {
        // Module-scope `require.resolve("./xhr-sync-worker.js")`; the Worker
        // is constructed only for SYNC XHR, which the sanitize engine never
        // performs — a loud placeholder path is enough.
        pattern: /require\.resolve\(\s*["']\.\/xhr-sync-worker\.js["']\s*\)/,
        kind: 'path-stub',
      },
    ],
  },
]

function resolveDataFile(id: string, dataFile: string): string {
  if (dataFile.startsWith('bare:')) {
    return createRequire(id).resolve(dataFile.slice('bare:'.length))
  }
  return resolve(dirname(id), dataFile)
}

export function expectedInlineLiteral(id: string, read: InlineDataRead): string {
  if (read.kind === 'path-stub') {
    return JSON.stringify('/__sea_unavailable__/xhr-sync-worker.js')
  }
  const data = readFileSync(resolveDataFile(id, read.dataFile!), 'utf-8')
  return read.kind === 'json' ? data : JSON.stringify(data)
}

/**
 * Replace the runtime data reads with inlined literals; null when the
 * module is out of scope. Throws when a module matches but any call-site
 * shape drifted — a silent no-op would resurface as a boot crash under SEA.
 */
export function inlinePackageData(code: string, id: string): string | null {
  const kase = INLINE_DATA_CASES.find((entry) => entry.modulePattern.test(id))
  if (!kase) {
    return null
  }
  let rewritten = code
  for (const read of kase.reads) {
    if (!read.pattern.test(rewritten)) {
      throw new Error(`${kase.name} no longer matches the inline-data shape — update ${import.meta.filename}`)
    }
    rewritten = rewritten.replace(read.pattern, () => expectedInlineLiteral(id, read))
  }
  return rewritten
}

export function inlinePackageDataPlugin(): Plugin {
  return {
    name: 'inline-package-data',
    enforce: 'pre',
    transform(code, id) {
      const rewritten = inlinePackageData(code, id)
      if (rewritten === null) {
        return null
      }
      return { code: rewritten, map: null }
    },
  }
}
