import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  INLINE_DATA_CASES,
  expectedInlineLiteral,
  inlinePackageData,
} from '../../../../scripts/sea/inline-package-data.ts'

// Contract test: the server bundle inlines jsdom (the sanitize engine), which
// resolves its sync-XHR worker path at module scope — a code path the server
// never takes, but the resolve must not throw inside the single-file ESM SEA
// binary. The plugin rewrites the exact call site; this test pins its shape in
// the INSTALLED package so an upstream release that changes it fails here
// instead of in the smoke.

function packageRoot(name: string): string {
  const requireFromRepo = createRequire(join(process.cwd(), 'package.json'))
  return dirname(realpathSync(requireFromRepo.resolve(`${name}/package.json`)))
}

const CASE_FILES: [caseName: string, file: string][] = [
  ['jsdom xhr sync worker path', join(packageRoot('jsdom'), 'lib', 'jsdom', 'living', 'xhr', 'XMLHttpRequest-impl.js')],
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
