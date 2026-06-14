import { describe, expect, it } from 'vitest'

import type { AdminImageDto } from '@/shared/types/images'

import { buildJustifiedRows } from '@/ui/admin/images/JustifiedImageGrid'

function makeImage(width: number, height: number): AdminImageDto {
  return {
    id: `${width}x${height}`,
    kind: 'generic',
    storagePath: `images/${width}x${height}.jpg`,
    publicUrl: `https://example.com/images/${width}x${height}.jpg`,
    mimeType: 'image/jpeg',
    width,
    height,
    byteSize: 0,
    thumbhash: null,
    uploaderId: null,
    uploaderName: null,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildJustifiedRows', () => {
  it('returns an empty array when there are no images', () => {
    expect(buildJustifiedRows([], 1200, 200, 12)).toEqual([])
  })

  it('returns an empty array when the container width is zero', () => {
    expect(buildJustifiedRows([makeImage(400, 300)], 0, 200, 12)).toEqual([])
  })

  it('fills a full row exactly to the container width', () => {
    const images = [makeImage(400, 300), makeImage(400, 300), makeImage(400, 300)]
    const rows = buildJustifiedRows(images, 1200, 200, 12)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    const totalWidth = row.items.reduce((sum, item) => sum + item.width, 0) + 12 * (row.items.length - 1)
    expect(totalWidth).toBe(1200)
    expect(row.items.every((item) => item.height === row.height)).toBe(true)
  })

  it('keeps the last row left-aligned at the target height when it fits', () => {
    const images = [makeImage(200, 300), makeImage(200, 300)]
    const rows = buildJustifiedRows(images, 1200, 200, 12)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.height).toBe(200)
    expect(row.items[0]!.width).toBeCloseTo((200 * 200) / 300, 0)
  })

  it('scales the row down when adding the next image would slightly exceed the container', () => {
    const images = [makeImage(800, 400), makeImage(800, 400)]
    const rows = buildJustifiedRows(images, 800, 200, 12)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    const totalWidth = row.items.reduce((sum, item) => sum + item.width, 0) + 12 * (row.items.length - 1)
    expect(totalWidth).toBe(800)
    expect(row.height).toBeLessThan(200)
    expect(row.items).toHaveLength(2)
  })

  it('puts a single very wide image in its own scaled row', () => {
    const images = [makeImage(2400, 200)]
    const rows = buildJustifiedRows(images, 800, 200, 12)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.items).toHaveLength(1)
    expect(row.items[0]!.width).toBe(800)
    expect(row.height).toBeLessThan(200)
  })

  it('creates multiple rows when images do not fit in one', () => {
    const images = [makeImage(800, 600), makeImage(800, 600), makeImage(800, 600), makeImage(800, 600)]
    const rows = buildJustifiedRows(images, 800, 200, 12)

    expect(rows.length).toBeGreaterThanOrEqual(2)
    for (const row of rows) {
      const totalWidth = row.items.reduce((sum, item) => sum + item.width, 0) + 12 * (row.items.length - 1)
      expect(totalWidth).toBeLessThanOrEqual(800 + 1)
    }
  })

  it('falls back to a square aspect ratio when dimensions are zero', () => {
    const images = [makeImage(0, 0)]
    const rows = buildJustifiedRows(images, 800, 200, 12)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.items[0]!.width).toBe(200)
    expect(rows[0]!.items[0]!.height).toBe(200)
  })
})
