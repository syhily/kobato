import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { inlineJsdomDefaultStylesheet } from '../../../../scripts/sea/inline-jsdom-default-stylesheet.ts'

// Contract test: the SEA bundle inlines jsdom (the server sanitize
// engine), whose computed-style helper reads its default stylesheet from
// `__dirname` at module scope — a boot crash under the single-file ESM
// binary. The inline plugin rewrites that exact call site; this test pins
// the call-site shape in the INSTALLED jsdom so a jsdom release that
// changes it fails here instead of in the smoke.

function jsdomComputedStylePath(): string {
  const requireFromRepo = createRequire(join(process.cwd(), 'package.json'))
  const jsdomRoot = dirname(realpathSync(requireFromRepo.resolve('jsdom/package.json')))
  return join(jsdomRoot, 'lib', 'jsdom', 'living', 'css', 'helpers', 'computed-style.js')
}

describe('contract: jsdom default stylesheet inline', () => {
  it('the installed jsdom computed-style.js still matches the rewrite shape', () => {
    const file = jsdomComputedStylePath()
    const source = readFileSync(file, 'utf-8')
    const rewritten = inlineJsdomDefaultStylesheet(source, file)
    expect(
      rewritten,
      'jsdom computed-style.js has no matching default-stylesheet read — update scripts/sea/inline-jsdom-default-stylesheet.ts',
    ).not.toBeNull()
    expect(rewritten!).not.toContain('__dirname')
    expect(rewritten!).not.toContain('default-stylesheet.css')
  })

  it('the rewrite inlines the real stylesheet content', () => {
    const file = jsdomComputedStylePath()
    const source = readFileSync(file, 'utf-8')
    const css = readFileSync(join(dirname(file), '..', '..', '..', 'browser', 'default-stylesheet.css'), 'utf-8')
    expect(css.length).toBeGreaterThan(0)
    expect(inlineJsdomDefaultStylesheet(source, file)).toContain(JSON.stringify(css))
  })

  it('the plugin leaves other modules untouched', () => {
    expect(
      inlineJsdomDefaultStylesheet(
        'const x = fs.readFileSync(path.resolve(__dirname, "./other.css"))',
        join(process.cwd(), 'src/server/infra/sea.ts'),
      ),
    ).toBeNull()
  })

  it('the plugin throws when the target module drifts instead of passing silently', () => {
    const file = jsdomComputedStylePath()
    expect(() => inlineJsdomDefaultStylesheet('const defaultStyleSheet = ""', file)).toThrow(/no longer matches/)
  })
})
