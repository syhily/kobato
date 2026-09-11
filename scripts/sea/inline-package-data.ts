// Bundler plugin: inline static package data files into the server bundle.
// Two bundled packages read data files at runtime in ways the single-file
// ESM SEA binary cannot survive:
//
//   - jsdom's `lib/jsdom/living/css/helpers/computed-style.js` does a
//     module-scope `fs.readFileSync(path.resolve(__dirname, "…"))` — there
//     is no `__dirname` in the bundle, so evaluating the module throws
//     `__dirname is not defined` at boot (and no file would exist anyway).
//   - css-tree's `lib/data-patch.js` (and its cjs twin) loads
//     `require('../data/patch.json')` through `createRequire(import.meta.url)`
//     — an opaque runtime call the bundler cannot resolve, so it reaches
//     the binary verbatim and dies with MODULE_NOT_FOUND at boot.
//
// Both payloads are static, so the transform swaps each read for a literal
// carrying the real content. Registered in vite.config.ts (the SEA bundle
// wraps build/server, where these packages are already inlined) and in
// vite.sea.config.ts (in case a package is ever externalized into the SEA
// graph). Every call-site shape is pinned by the `inline-package-data`
// contract test so an upstream release changing one fails at upgrade time.

import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface InlineDataCase {
  /** Contract-test label; also used in the drift error message. */
  name: string
  /** Absolute-path pattern of the module carrying the runtime read. */
  modulePattern: RegExp
  /** The exact upstream read/require, whitespace-tolerant. */
  readPattern: RegExp
  /** Data file to inline, resolved against the matching module's directory. */
  dataFile: string
  /** text: embed as a string literal; json: embed the parsed value verbatim. */
  kind: 'text' | 'json'
}

const CASES: InlineDataCase[] = [
  {
    name: 'jsdom default stylesheet',
    modulePattern: /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/,
    readPattern:
      /fs\.readFileSync\(\s*path\.resolve\(__dirname,\s*["'][^"']*browser\/default-stylesheet\.css["']\),?\s*\{[^}]*\}\s*\)/,
    dataFile: '../../../browser/default-stylesheet.css',
    kind: 'text',
  },
  {
    name: 'css-tree data patch (esm)',
    modulePattern: /[\\/]css-tree[\\/]lib[\\/]data-patch\.js$/,
    readPattern: /require\(\s*["']\.\.\/data\/patch\.json["']\s*\)/,
    dataFile: '../data/patch.json',
    kind: 'json',
  },
  {
    name: 'css-tree data patch (cjs)',
    modulePattern: /[\\/]css-tree[\\/]cjs[\\/]data-patch\.cjs$/,
    readPattern: /require\(\s*["']\.\.\/data\/patch\.json["']\s*\)/,
    dataFile: '../data/patch.json',
    kind: 'json',
  },
]

/**
 * Replace the runtime data read with an inlined literal; null when the
 * module is out of scope. Throws when a module matches but its call-site
 * shape drifted — a silent no-op would resurface as a boot crash under SEA.
 */
export function inlinePackageData(code: string, id: string): string | null {
  const kase = CASES.find((entry) => entry.modulePattern.test(id))
  if (!kase) {
    return null
  }
  if (!kase.readPattern.test(code)) {
    throw new Error(`${kase.name} no longer matches the inline-data shape — update ${import.meta.filename}`)
  }
  const data = readFileSync(resolve(dirname(id), kase.dataFile), 'utf-8')
  // A JSON payload is already a valid JS expression — embed it verbatim so
  // the consumer still receives an object, not a string.
  const literal = kase.kind === 'json' ? data : JSON.stringify(data)
  return code.replace(kase.readPattern, () => literal)
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
