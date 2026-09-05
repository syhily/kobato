import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Plan 040 import guard: renderer policy — URL validation, template escaping,
 * sanitization — lives behind the render-context seam
 * (src/nodes/base/render-context.ts). Card sources must not import the policy
 * implementation modules directly; they go through the seam. The guard has
 * zero exceptions: the last allowlisted importer (the markdown renderer's
 * `sanitize-html` import) moved onto the seam's `sanitizeBasicHtml` entry.
 */

const POLICY_MODULES = new Set(['is-safe-url', 'escape-html', 'clean-dom', 'sanitize-html'])

const ALLOWED_IS_SAFE_URL_IMPORTERS = ['src/nodes/base/render-context.ts']

// cleanDOM runs only behind the seam's CALLOUT_HTML_CONFIG unwrap-allowlist
// fallback (plan 040 Step 4 STOP condition).
const ALLOWED_CLEAN_DOM_IMPORTERS = ['src/nodes/base/render-context.ts']

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

/** The policy modules (by specifier basename) a source file imports directly. */
function policyImportsOf(file: string): string[] {
  const basenames = importSpecifiers(readFileSync(file, 'utf8')).map((specifier) => specifier.split('/').pop()!)
  return [...new Set(basenames.filter((basename) => POLICY_MODULES.has(basename)))].sort()
}

describe('render policy import guard', () => {
  it('no card source under src/nodes/base/nodes imports policy modules directly', () => {
    const nodesDir = join('src', 'nodes', 'base', 'nodes')
    const offenders: Record<string, string[]> = {}

    for (const name of listSourceFiles(nodesDir)) {
      const imports = policyImportsOf(join(nodesDir, name))
      if (imports.length > 0) {
        offenders[name.split(sep).join('/')] = imports
      }
    }

    expect(offenders).toEqual({})
  })

  it('the seam is the only is-safe-url importer', () => {
    const importers = listSourceFiles('src')
      .map((name) => `src/${name.split(sep).join('/')}`)
      .filter((file) => policyImportsOf(file).includes('is-safe-url'))
      .sort()

    expect(importers).toEqual(ALLOWED_IS_SAFE_URL_IMPORTERS)
  })

  it('the seam is the only clean-dom importer', () => {
    const importers = listSourceFiles('src')
      .map((name) => `src/${name.split(sep).join('/')}`)
      .filter((file) => policyImportsOf(file).includes('clean-dom'))
      .sort()

    expect(importers).toEqual(ALLOWED_CLEAN_DOM_IMPORTERS)
  })
})
