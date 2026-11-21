import { sliceFont } from '@kobato/server/domains/fonts/slice'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TTF_PATH = join(import.meta.dirname, '../../../../fixtures/fonts/Barlow-Regular.ttf')

describe('sliceFont', () => {
  it('slices a real TTF into a non-empty result.css + woff2 chunks', async () => {
    const source = await readFile(TTF_PATH)
    expect(source.length).toBeGreaterThan(0)

    const result = await sliceFont(source, { fontFamily: 'Barlow' })

    const cssText = Buffer.from(result.css).toString('utf8')
    expect(cssText).toContain('@font-face')
    expect(cssText).toMatch(/\.woff2['")]/)
    expect(cssText).toContain('Barlow')

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
  }, 60_000)
})
