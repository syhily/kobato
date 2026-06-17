import { describe, expect, it } from 'vitest'

import { injectWarmupChunks } from '@/client/components/route-warmup-inject'

const SENTINEL = '__ROUTE_WARMUP_CHUNKS__'

describe('injectWarmupChunks', () => {
  it('injects the chunk list into a backtick-quoted sentinel (real oxc-minifier output)', () => {
    // Shape produced by `routeWarmupPlugin`'s nested build.
    const script = `(function(){var e=\`${SENTINEL}\`;function t(e){return e.length}t(e)})();`
    const chunks = ['/assets/a.js', '/assets/b.js']

    const out = injectWarmupChunks(script, chunks)

    expect(out).not.toContain(SENTINEL)
    // The placeholder (quotes included) is replaced by the JSON array literal.
    expect(out).toContain('var e=["/assets/a.js","/assets/b.js"]')
    // The rest of the script is preserved verbatim.
    expect(out).toContain('function t(e){return e.length}t(e)})();')
  })

  it.each([
    ['backtick', '`'],
    ['single', "'"],
    ['double', '"'],
  ])('matches a %s-quoted sentinel (consuming the quotes)', (_name, quote) => {
    const script = `e=${quote}${SENTINEL}${quote}`
    expect(injectWarmupChunks(script, ['/x.js'])).toBe('e=["/x.js"]')
  })

  it('does not expand `$` sequences in chunk paths (function replacement)', () => {
    // A naive string replacement would turn `$1` into a backreference.
    const chunks = ['/a?$1=2&b=$&c']
    const out = injectWarmupChunks(`e=\`${SENTINEL}\``, chunks)
    expect(out).toBe('e=["/a?$1=2&b=$&c"]')
  })

  it('returns the script unchanged when the sentinel is absent', () => {
    const script = 'var e=[];'
    expect(injectWarmupChunks(script, ['/a.js'])).toBe(script)
  })

  it('injects an empty array when there are no chunks', () => {
    expect(injectWarmupChunks(`e=\`${SENTINEL}\``, [])).toBe('e=[]')
  })
})
