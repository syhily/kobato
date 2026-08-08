import { describe, expect, it } from 'vitest'

import { SEA_BUNDLE_DEFINED_GLOBALS, scanBundleText } from '../../../../scripts/sea/check-bundle.ts'

// An `__APP_*__`/`__SEA_*__` identifier missing from the bundle's define
// table would boot into a bare ReferenceError inside the binary — pin the
// real table and flag any future global added without a define row.

describe('scanBundleText: undefined build-time globals', () => {
  it('passes a bundle with no __APP_/__SEA_ identifiers', () => {
    const text = ['const version = "6.7.1"', 'console.log(version)'].join('\n')
    expect(scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)).toEqual([])
  })

  it('flags an __APP_*__ identifier the SEA define table does not cover', () => {
    const text = 'export const APP_CODENAME = __APP_CODENAME__'
    expect(scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)).toEqual([
      "undefined build-time global remains: __APP_CODENAME__ (not in the bundle's define table)",
    ])
  })

  it('flags every distinct undefined identifier, deduplicating repeats', () => {
    const text = [
      'const name = __APP_CODENAME__',
      'const repo = __SEA_BUILD_CHANNEL__',
      'const again = __APP_CODENAME__',
    ].join('\n')
    const errors = scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)
    expect(errors).toHaveLength(2)
    expect(errors).toContain("undefined build-time global remains: __APP_CODENAME__ (not in the bundle's define table)")
    expect(errors).toContain(
      "undefined build-time global remains: __SEA_BUILD_CHANNEL__ (not in the bundle's define table)",
    )
  })

  it('tolerates every global vite.sea.config.ts actually defines', () => {
    const text = [
      'const cliVersion = __SEA_APP_VERSION__',
      'export const APP_NAME = __APP_NAME__',
      'export const APP_VERSION = __APP_VERSION__',
      'export const APP_DESCRIPTION = __APP_DESCRIPTION__',
      'export const APP_AUTHOR = { name: __APP_AUTHOR_NAME__ }',
      'export const APP_HOMEPAGE = __APP_HOMEPAGE__',
      'export const APP_REPOSITORY = __APP_REPOSITORY__',
    ].join('\n')
    expect(scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)).toEqual([])
  })

  it('pins the define table to the seven globals vite.sea.config.ts declares', () => {
    expect([...SEA_BUNDLE_DEFINED_GLOBALS].sort()).toEqual(
      [
        '__APP_AUTHOR_NAME__',
        '__APP_DESCRIPTION__',
        '__APP_HOMEPAGE__',
        '__APP_NAME__',
        '__APP_REPOSITORY__',
        '__APP_VERSION__',
        '__SEA_APP_VERSION__',
      ].sort(),
    )
  })

  it('ignores identifiers on comment lines', () => {
    const text = ['// mentions __APP_VERSION__ in prose', '/* __APP_NAME__ */', '* __APP_AUTHOR_NAME__'].join('\n')
    expect(scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)).toEqual([])
  })

  it('does not match identifiers without the full __APP_/__SEA_ wrapper', () => {
    const text = ['const APP_VERSION = "x"', 'const __SEA = 1', 'const __APPS_FOO__ = 2'].join('\n')
    expect(scanBundleText(text, SEA_BUNDLE_DEFINED_GLOBALS)).toEqual([])
  })
})
