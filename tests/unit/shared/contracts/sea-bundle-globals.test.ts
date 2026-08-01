import { describe, expect, it } from 'vitest'

import { scanBundleText } from '../../../../scripts/sea/check-bundle.ts'

// The bundle scan's reverse direction: an `__APP_*__`/`__SEA_*__`
// identifier left in a bundle whose vite `define` table does not cover it
// would boot into a bare ReferenceError inside the binary. The concrete
// trap: vite.sea.config.ts defines only `__SEA_APP_VERSION__`, while
// src/shared/config/version.ts consumes six `__APP_*__` globals defined
// only in vite.config.ts — the day any SEA bundle graph imports that
// module, this scan must fail the build.

const SEA_DEFINE_TABLE = ['__SEA_APP_VERSION__']

describe('scanBundleText: undefined build-time globals', () => {
  it('passes a bundle with no __APP_/__SEA_ identifiers', () => {
    const text = ['const version = "6.7.1"', 'console.log(version)'].join('\n')
    expect(scanBundleText(text, SEA_DEFINE_TABLE)).toEqual([])
  })

  it('flags an __APP_*__ identifier the SEA define table does not cover', () => {
    const text = 'export const APP_VERSION = __APP_VERSION__'
    expect(scanBundleText(text, SEA_DEFINE_TABLE)).toEqual([
      "undefined build-time global remains: __APP_VERSION__ (not in the bundle's define table)",
    ])
  })

  it('flags every distinct undefined identifier, deduplicating repeats', () => {
    const text = ['const name = __APP_NAME__', 'const repo = __APP_REPOSITORY__', 'const again = __APP_NAME__'].join(
      '\n',
    )
    const errors = scanBundleText(text, SEA_DEFINE_TABLE)
    expect(errors).toHaveLength(2)
    expect(errors).toContain("undefined build-time global remains: __APP_NAME__ (not in the bundle's define table)")
    expect(errors).toContain(
      "undefined build-time global remains: __APP_REPOSITORY__ (not in the bundle's define table)",
    )
  })

  it('tolerates identifiers covered by the define table', () => {
    // `__SEA_APP_VERSION__` is in vite.sea.config.ts's define table — a
    // leftover mention (e.g. inside a string literal) is not an undefined
    // global.
    const text = 'const marker = "__SEA_APP_VERSION__"'
    expect(scanBundleText(text, SEA_DEFINE_TABLE)).toEqual([])
  })

  it('ignores identifiers on comment lines', () => {
    const text = ['// mentions __APP_VERSION__ in prose', '/* __APP_NAME__ */', '* __APP_AUTHOR_NAME__'].join('\n')
    expect(scanBundleText(text, SEA_DEFINE_TABLE)).toEqual([])
  })

  it('does not match identifiers without the full __APP_/__SEA_ wrapper', () => {
    const text = ['const APP_VERSION = "x"', 'const __SEA = 1', 'const __APPS_FOO__ = 2'].join('\n')
    expect(scanBundleText(text, SEA_DEFINE_TABLE)).toEqual([])
  })
})
