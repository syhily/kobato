import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  INLINE_DATA_CASES,
  expectedInlineLiteral,
  inlinePackageData,
} from '../../../../scripts/sea/inline-package-data.ts'

// Contract test: the server bundle inlines jsdom (the sanitize engine)
// and css-tree (jsdom's CSS parser). Both read static data files at
// runtime in ways the single-file ESM SEA binary cannot survive — a
// module-scope `__dirname` read and `createRequire(import.meta.url)` JSON
// loads. The inline-package-data plugin rewrites those exact call sites;
// this test pins their shape in the INSTALLED packages so an upstream
// release that changes one fails here instead of in the smoke.

/** Real path of an installed package root. */
function packageRoot(name: string): string {
  const requireFromRepo = createRequire(join(process.cwd(), 'package.json'))
  return dirname(realpathSync(requireFromRepo.resolve(`${name}/package.json`)))
}

/** One installed representative file per plugin case. */
const CASE_FILES: [caseName: string, file: string][] = [
  [
    'jsdom default stylesheet',
    join(packageRoot('jsdom'), 'lib', 'jsdom', 'living', 'css', 'helpers', 'computed-style.js'),
  ],
  ['css-tree data patch (esm)', join(packageRoot('css-tree'), 'lib', 'data-patch.js')],
  ['jsdom xhr sync worker path', join(packageRoot('jsdom'), 'lib', 'jsdom', 'living', 'xhr', 'XMLHttpRequest-impl.js')],
  ['css-tree data patch (cjs)', join(packageRoot('css-tree'), 'cjs', 'data-patch.cjs')],
  ['css-tree data (esm)', join(packageRoot('css-tree'), 'lib', 'data.js')],
  ['css-tree data (cjs)', join(packageRoot('css-tree'), 'cjs', 'data.cjs')],
  ['css-tree version (esm)', join(packageRoot('css-tree'), 'lib', 'version.js')],
  ['css-tree version (cjs)', join(packageRoot('css-tree'), 'cjs', 'version.cjs')],
]

describe('contract: inline package data', () => {
  it('every plugin case has exactly one installed representative file', () => {
    const caseNames = INLINE_DATA_CASES.map((entry) => entry.name).sort()
    expect(CASE_FILES.map(([name]) => name).sort()).toEqual(caseNames)
  })

  it.each(CASE_FILES)('the installed module for "%s" still matches the rewrite shape', (name, file) => {
    const source = readFileSync(file, 'utf-8')
    const rewritten = inlinePackageData(source, file)
    expect(rewritten, `${name}: ${file} no longer matches — update scripts/sea/inline-package-data.ts`).not.toBeNull()
    const kase = INLINE_DATA_CASES.find((entry) => entry.name === name)!
    for (const read of kase.reads) {
      expect(read.pattern.test(rewritten!), `${name}: a read survived the rewrite`).toBe(false)
      expect(rewritten!, `${name}: the inlined payload is missing`).toContain(expectedInlineLiteral(file, read))
    }
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
    for (const [, file] of CASE_FILES) {
      expect(() => inlinePackageData('export default {}', file)).toThrow(/no longer matches/)
    }
  })
})
