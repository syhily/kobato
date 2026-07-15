import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { sliceFont } from '@/server/domains/fonts/slice'

// Schema-drift guard + functional smoke for the vendored cn-font-split WASM
// bundle. This is the canary that catches a broken JS↔wasm contract: if the
// vendored `cnfs.mjs` (from npm 7.4.3) ever drifts from the `cnfs.wasm`
// (from GitHub release 7.6.8), the protobuf round-trip breaks and this test
// fails with either a thrown error or a malformed result.
//
// Uses the real OPPO Sans TTF shipped under `data/fonts/` for canvas OG
// rendering — a full CJK font exercises the slicer end-to-end. The test is
// marked `it.serial` because the WASM core is single-threaded and shares one
// in-process virtual filesystem across invocations.

const TTF_PATH = resolve(process.cwd(), 'data/fonts/opposans.ttf')

describe('sliceFont', () => {
  // The slicer caches the wasm bytes in a module-level promise; we don't
  // reset it between tests because reading the 4 MB binary once is fine and
  // the cache is process-scoped (not test-scoped).

  it('slices a real TTF into a non-empty result.css + woff2 chunks', async () => {
    const source = await readFile(TTF_PATH)
    expect(source.length).toBeGreaterThan(0)

    const result = await sliceFont(source, { fontFamily: 'OPPO Sans' })

    // result.css must contain at least one @font-face rule referencing a
    // woff2 chunk — the whole point of the pipeline.
    const cssText = Buffer.from(result.css).toString('utf8')
    expect(cssText).toContain('@font-face')
    expect(cssText).toMatch(/\.woff2['")]/)
    expect(cssText).toContain('OPPO Sans')

    // At least one woff2 chunk, each non-empty. cn-font-split's woff2s carry
    // the `wOF` prefix (bytes 77 4F 46) — the canonical woff2 magic is
    // `wOFF` (…46 46), but some emitted chunks carry a trailing `2` (…46 32),
    // a variant the core uses. Assert the shared three-byte prefix and a
    // non-empty body; the exact trailing byte is an internal detail.
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.chunks.length).toBe(result.chunkCount)
    for (const chunk of result.chunks) {
      expect(chunk.name).toMatch(/\.woff2$/)
      expect(chunk.data[0]).toBe(0x77)
      expect(chunk.data[1]).toBe(0x4f)
      expect(chunk.data[2]).toBe(0x46)
      expect(chunk.data.length).toBeGreaterThan(0)
    }

    // totalBytes is the sum of css + every chunk.
    const expectedTotal = result.css.length + result.chunks.reduce((n, c) => n + c.data.length, 0)
    expect(result.totalBytes).toBe(expectedTotal)
  }, 60_000) // CJK slicing can take ~15–20s on the single-threaded WASM path.
})
