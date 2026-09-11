// Bundler plugin: inline static package data files into the server bundle.
// Several bundled packages read data files at runtime in ways the
// single-file ESM SEA binary cannot survive:
//
//   - jsdom's `lib/jsdom/living/css/helpers/computed-style.js` does a
//     module-scope `fs.readFileSync(path.resolve(__dirname, "…"))` — there
//     is no `__dirname` in the bundle, so evaluating the module throws
//     `__dirname is not defined` at boot (and no file would exist anyway).
//   - css-tree's ESM entry files (`lib/data.js`, `lib/data-patch.js`,
//     `lib/version.js`) load JSON through
//     `createRequire(import.meta.url)(…)` — opaque runtime calls the
//     bundler cannot resolve, so they reach the binary verbatim and die
//     with MODULE_NOT_FOUND at boot. Their cjs/ twins use plain `require`
//     with the same specifiers; they are covered too so a resolution-
//     condition flip never reopens the hole.
//
// Every payload is static, so the transform swaps each read for a literal
// carrying the real content (JSON payloads embed verbatim — a JSON text IS
// a JS expression — so consumers still bind objects, not strings).
// Registered in vite.config.ts (the SEA bundle wraps build/server, where
// these packages are already inlined) and in vite.sea.config.ts (in case a
// package is ever externalized into the SEA graph). Every call-site shape
// is pinned by the `inline-package-data` contract test so an upstream
// release changing one fails at upgrade time.

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
   * exactly the module's own resolution semantics.
   */
  dataFile: string
  /** text: embed as a string literal; json: embed the payload verbatim. */
  kind: 'text' | 'json'
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
    name: 'jsdom default stylesheet',
    modulePattern: /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/,
    reads: [
      {
        pattern:
          /fs\.readFileSync\(\s*path\.resolve\(__dirname,\s*["'][^"']*browser\/default-stylesheet\.css["']\),?\s*\{[^}]*\}\s*\)/,
        dataFile: '../../../browser/default-stylesheet.css',
        kind: 'text',
      },
    ],
  },
  {
    name: 'css-tree data patch (esm)',
    modulePattern: /[\\/]css-tree[\\/]lib[\\/]data-patch\.js$/,
    reads: [
      { pattern: /require\(\s*["']\.\.\/data\/patch\.json["']\s*\)/, dataFile: '../data/patch.json', kind: 'json' },
    ],
  },
  {
    name: 'css-tree data patch (cjs)',
    modulePattern: /[\\/]css-tree[\\/]cjs[\\/]data-patch\.cjs$/,
    reads: [
      { pattern: /require\(\s*["']\.\.\/data\/patch\.json["']\s*\)/, dataFile: '../data/patch.json', kind: 'json' },
    ],
  },
  {
    name: 'css-tree data (esm)',
    modulePattern: /[\\/]css-tree[\\/]lib[\\/]data\.js$/,
    reads: [
      {
        pattern: /require\(\s*["']mdn-data\/css\/at-rules\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/at-rules.json',
        kind: 'json',
      },
      {
        pattern: /require\(\s*["']mdn-data\/css\/properties\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/properties.json',
        kind: 'json',
      },
      {
        pattern: /require\(\s*["']mdn-data\/css\/syntaxes\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/syntaxes.json',
        kind: 'json',
      },
    ],
  },
  {
    name: 'css-tree data (cjs)',
    modulePattern: /[\\/]css-tree[\\/]cjs[\\/]data\.cjs$/,
    reads: [
      {
        pattern: /require\(\s*["']mdn-data\/css\/at-rules\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/at-rules.json',
        kind: 'json',
      },
      {
        pattern: /require\(\s*["']mdn-data\/css\/properties\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/properties.json',
        kind: 'json',
      },
      {
        pattern: /require\(\s*["']mdn-data\/css\/syntaxes\.json["']\s*\)/,
        dataFile: 'bare:mdn-data/css/syntaxes.json',
        kind: 'json',
      },
    ],
  },
  {
    name: 'css-tree version (esm)',
    modulePattern: /[\\/]css-tree[\\/]lib[\\/]version\.js$/,
    reads: [{ pattern: /require\(\s*["']\.\.\/package\.json["']\s*\)/, dataFile: '../package.json', kind: 'json' }],
  },
  {
    name: 'css-tree version (cjs)',
    modulePattern: /[\\/]css-tree[\\/]cjs[\\/]version\.cjs$/,
    reads: [{ pattern: /require\(\s*["']\.\.\/package\.json["']\s*\)/, dataFile: '../package.json', kind: 'json' }],
  },
]

function resolveDataFile(id: string, dataFile: string): string {
  if (dataFile.startsWith('bare:')) {
    return createRequire(id).resolve(dataFile.slice('bare:'.length))
  }
  return resolve(dirname(id), dataFile)
}

/** Exported for the contract test. */
export function expectedInlineLiteral(id: string, read: InlineDataRead): string {
  const data = readFileSync(resolveDataFile(id, read.dataFile), 'utf-8')
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
