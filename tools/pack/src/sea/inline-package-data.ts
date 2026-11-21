import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

interface InlineDataRead {
  pattern: RegExp
  dataFile?: string
  kind: 'text' | 'json' | 'path-stub'
}

export interface InlineDataCase {
  name: string
  modulePattern: RegExp
  reads: InlineDataRead[]
}

export const INLINE_DATA_CASES: InlineDataCase[] = [
  {
    name: 'jsdom xhr sync worker path',
    modulePattern: /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/,
    reads: [
      {
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
