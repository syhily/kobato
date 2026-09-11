// Bundler plugin: inline jsdom's default stylesheet into the server bundle.
// jsdom's `lib/jsdom/living/css/helpers/computed-style.js` does a
// module-scope `fs.readFileSync(path.resolve(__dirname, "..../browser/…"))`
// — under the single-file ESM SEA binary there is no `__dirname`, so
// evaluating the inlined module throws `__dirname is not defined` at boot
// (and the file would not exist even with one). The CSS is static, so the
// transform swaps the read for a string literal carrying the real content.
// Registered in vite.config.ts (the SEA bundle wraps build/server, where
// jsdom is already inlined) and vite.sea.config.ts (in case jsdom is ever
// externalized into the SEA graph). The call-site shape is pinned by the
// `jsdom-default-stylesheet` contract test so a jsdom release changing it
// fails at upgrade time.

import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const TARGET_MODULE = /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/

// The exact upstream read, whitespace-tolerant. Pinned by the contract test.
const DEFAULT_STYLESHEET_READ =
  /fs\.readFileSync\(\s*path\.resolve\(__dirname,\s*["'][^"']*browser\/default-stylesheet\.css["']\),?\s*\{[^}]*\}\s*\)/

/**
 * Replace the default-stylesheet read with an inlined literal; null when the
 * module is out of scope. Throws when the module matches but the call-site
 * shape drifted — a silent no-op would resurface as a boot crash under SEA.
 */
export function inlineJsdomDefaultStylesheet(code: string, id: string): string | null {
  if (!TARGET_MODULE.test(id)) {
    return null
  }
  if (!DEFAULT_STYLESHEET_READ.test(code)) {
    throw new Error(
      `jsdom computed-style.js no longer matches the default-stylesheet read shape — update ${import.meta.filename}`,
    )
  }
  const css = readFileSync(resolve(dirname(id), '../../../browser/default-stylesheet.css'), 'utf-8')
  return code.replace(DEFAULT_STYLESHEET_READ, () => JSON.stringify(css))
}

export function inlineJsdomDefaultStylesheetPlugin(): Plugin {
  return {
    name: 'inline-jsdom-default-stylesheet',
    enforce: 'pre',
    transform(code, id) {
      const rewritten = inlineJsdomDefaultStylesheet(code, id)
      if (rewritten === null) {
        return null
      }
      return { code: rewritten, map: null }
    },
  }
}
