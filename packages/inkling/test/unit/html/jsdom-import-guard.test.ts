import { readdirSync, readFileSync } from 'node:fs'
import { sep } from 'node:path'

/**
 * Headless-DOM-port import guard: `src/html/headless-dom.ts` is the only
 * module in the package that may reference jsdom (static or dynamic import).
 * Every other conversion module resolves its DOM through the port's
 * `resolveHeadlessDom`, so the optional jsdom peer stays out of the browser
 * bundle and out of every load path except the lazy one.
 */

const ALLOWED_JSDOM_IMPORTERS = ['src/html/headless-dom.ts']

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
}

/** Static, side-effect, and dynamic import specifiers of a source file. */
function importSpecifiers(source: string): string[] {
  const statics = source.matchAll(/(?:^|\s)from\s+['"]([^'"]+)['"]/g)
  const sideEffects = source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  const dynamics = source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)
  return [...statics, ...sideEffects, ...dynamics].map((match) => match[1])
}

function importsJsdom(file: string): boolean {
  return importSpecifiers(readFileSync(file, 'utf8')).some(
    (specifier) => specifier === 'jsdom' || specifier.startsWith('jsdom/'),
  )
}

describe('jsdom import guard', () => {
  it('headless-dom.ts is the only jsdom importer in src', () => {
    const importers = listSourceFiles('src')
      .map((name) => `src/${name.split(sep).join('/')}`)
      .filter(importsJsdom)
      .sort()

    expect(importers).toEqual(ALLOWED_JSDOM_IMPORTERS)
  })
})
