import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { inlinePackageData } from '../../../../scripts/sea/inline-package-data.ts'

// Contract test: the server bundle inlines jsdom (the sanitize engine)
// and css-tree (jsdom's CSS parser). Both read static data files at
// runtime in ways the single-file ESM SEA binary cannot survive — a
// module-scope `__dirname` read and a `createRequire(import.meta.url)`
// JSON load. The inline-package-data plugin rewrites those exact call
// sites; this test pins their shape in the INSTALLED packages so an
// upstream release that changes one fails here instead of in the smoke.

/** Real path of an installed package root. */
function packageRoot(name: string): string {
  const requireFromRepo = createRequire(join(process.cwd(), 'package.json'))
  return dirname(realpathSync(requireFromRepo.resolve(`${name}/package.json`)))
}

const jsdomComputedStyle = join(packageRoot('jsdom'), 'lib', 'jsdom', 'living', 'css', 'helpers', 'computed-style.js')
const csstreeDataPatchEsm = join(packageRoot('css-tree'), 'lib', 'data-patch.js')
const csstreeDataPatchCjs = join(packageRoot('css-tree'), 'cjs', 'data-patch.cjs')

describe('contract: inline package data', () => {
  it('the installed jsdom computed-style.js still matches the rewrite shape', () => {
    const source = readFileSync(jsdomComputedStyle, 'utf-8')
    const rewritten = inlinePackageData(source, jsdomComputedStyle)
    expect(
      rewritten,
      'jsdom computed-style.js has no matching default-stylesheet read — update scripts/sea/inline-package-data.ts',
    ).not.toBeNull()
    expect(rewritten!).not.toContain('__dirname')
    expect(rewritten!).not.toContain('default-stylesheet.css')
  })

  it('the jsdom rewrite inlines the real stylesheet content', () => {
    const source = readFileSync(jsdomComputedStyle, 'utf-8')
    const css = readFileSync(
      join(dirname(jsdomComputedStyle), '..', '..', '..', 'browser', 'default-stylesheet.css'),
      'utf-8',
    )
    expect(css.length).toBeGreaterThan(0)
    expect(inlinePackageData(source, jsdomComputedStyle)).toContain(JSON.stringify(css))
  })

  it.each([
    ['esm', csstreeDataPatchEsm],
    ['cjs', csstreeDataPatchCjs],
  ])('the installed css-tree data-patch (%s) still matches the rewrite shape', (_flavor, file) => {
    const source = readFileSync(file, 'utf-8')
    const rewritten = inlinePackageData(source, file)
    expect(
      rewritten,
      `css-tree ${file} has no matching patch.json require — update scripts/sea/inline-package-data.ts`,
    ).not.toBeNull()
    expect(rewritten!).not.toContain('patch.json')
  })

  it.each([
    ['esm', csstreeDataPatchEsm],
    ['cjs', csstreeDataPatchCjs],
  ])('the css-tree rewrite (%s) inlines the real patch object, not a string', (_flavor, file) => {
    const source = readFileSync(file, 'utf-8')
    const patch = readFileSync(join(dirname(file), '..', 'data', 'patch.json'), 'utf-8')
    expect(patch.length).toBeGreaterThan(0)
    // The payload is embedded verbatim (a JSON payload IS a JS expression),
    // so the consumer still binds an object.
    expect(inlinePackageData(source, file)).toContain(patch)
  })

  it('the plugin leaves other modules untouched', () => {
    expect(
      inlinePackageData(
        'const x = fs.readFileSync(path.resolve(__dirname, "./other.css"))',
        join(process.cwd(), 'src/server/infra/sea.ts'),
      ),
    ).toBeNull()
  })

  it('the plugin throws when a target module drifts instead of passing silently', () => {
    expect(() => inlinePackageData('const defaultStyleSheet = ""', jsdomComputedStyle)).toThrow(/no longer matches/)
    expect(() => inlinePackageData('export default {}', csstreeDataPatchEsm)).toThrow(/no longer matches/)
  })
})
