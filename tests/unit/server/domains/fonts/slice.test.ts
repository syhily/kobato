import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { sliceFont } from '@/server/domains/fonts/slice'

// Schema-drift canary for the vendored cn-font-split WASM bundle: a drift
// between cnfs.mjs (npm 7.4.3) and cnfs.wasm (GitHub 7.6.8) breaks the
// protobuf round-trip. Fixture: Barlow TTF (SIL OFL 1.1), self-contained.

const TTF_PATH = resolve(__dirname, '../../../../fixtures/fonts/Barlow-Regular.ttf')

describe('sliceFont', () => {
  // Each fontSplit call instantiates the wasm fresh — nothing to reset.

  it('slices a real TTF into a non-empty result.css + woff2 chunks', async () => {
    const source = await readFile(TTF_PATH)
    expect(source.length).toBeGreaterThan(0)

    const result = await sliceFont(source, { fontFamily: 'Barlow' })

    const cssText = Buffer.from(result.css).toString('utf8')
    expect(cssText).toContain('@font-face')
    expect(cssText).toMatch(/\.woff2['")]/)
    expect(cssText).toContain('Barlow')

    // woff2 chunks carry the `wOF` prefix (77 4F 46), not always the
    // canonical `wOFF` — assert the shared prefix and a non-empty body.
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.chunks.length).toBe(result.chunkCount)
    for (const chunk of result.chunks) {
      expect(chunk.name).toMatch(/\.woff2$/)
      expect(chunk.data[0]).toBe(0x77)
      expect(chunk.data[1]).toBe(0x4f)
      expect(chunk.data[2]).toBe(0x46)
      expect(chunk.data.length).toBeGreaterThan(0)
    }

    const expectedTotal = result.css.length + result.chunks.reduce((n, c) => n + c.data.length, 0)
    expect(result.totalBytes).toBe(expectedTotal)
  }, 60_000) // Slicing runs on the single-threaded WASM path; keep headroom for slow CI.
})
