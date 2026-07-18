import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// syncLibraryImageBlocks walks a PortableText body, collects every
// `image` block (including those nested in solution / footnoteDefinition
// / twoColumn containers), resolves library rows by imageId, and writes
// the canonical storagePath/src/alt back. The pure surface is:
//   - collectImageBlocks (private) — covers _type routing for image,
//     solution, footnoteDefinition, twoColumn, and the default no-op.
//   - the main loop's short-circuits (no targets, malformed imageId,
//     missing row, empty thumbhash, absent public base URL, alt-equality).
// We mock the DB + storage helpers so only the branching runs.

const findImagesByIdsMock = vi.hoisted(() => vi.fn())
const updateImageNoteMock = vi.hoisted(() => vi.fn())
const getPublicBaseUrlMock = vi.hoisted(() => vi.fn((): string | null => 'https://cdn.test'))

vi.mock('@/server/infra/db/operations/image', () => ({
  findImagesByIds: findImagesByIdsMock,
  updateImageNote: updateImageNoteMock,
}))
vi.mock('@/server/infra/storage/public-url', () => ({ getPublicBaseUrl: getPublicBaseUrlMock }))

const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')

const fakeDb = {} as NodePgDatabase

function img(_key: string, overrides: Record<string, unknown> = {}) {
  return { _type: 'image', _key, src: 'old-src', alt: '', ...overrides } as never
}

describe('content/services/image-sync — collectImageBlocks routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('returns immediately when the body has no image blocks', async () => {
    await syncLibraryImageBlocks(fakeDb, [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'x' }] } as never,
    ])
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })

  it('collects image blocks nested inside a solution container', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 10, height: 20, thumbhash: 'th', note: null },
    ])
    const body = [
      {
        _type: 'solution',
        _key: 'sol1',
        children: [img('i1', { imageId: '1' })],
      },
    ] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [1n])
    const block = (body[0] as { children: Array<{ src: string; storagePath: string }> }).children[0]!
    expect(block.src).toBe('https://cdn.test/p/1.jpg')
    expect(block.storagePath).toBe('p/1.jpg')
  })

  it('collects image blocks nested inside a footnoteDefinition container', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 2n, storagePath: 'p/2.jpg', width: 1, height: 2, thumbhash: '', note: null },
    ])
    const body = [
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [img('i2', { imageId: '2' })],
      },
    ] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [2n])
  })

  it('collects image blocks from both columns of a twoColumn block', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 3n, storagePath: 'p/3.jpg', width: 3, height: 3, thumbhash: 't3', note: null },
      { id: 4n, storagePath: 'p/4.jpg', width: 4, height: 4, thumbhash: 't4', note: null },
    ])
    const body = [
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [img('i3', { imageId: '3' })],
        right: [img('i4', { imageId: '4' })],
      },
    ] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [3n, 4n])
  })

  it('skips image blocks with an empty imageId', async () => {
    await syncLibraryImageBlocks(fakeDb, [img('i5', { imageId: '' })] as never)
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })

  it('skips image blocks whose imageId is not a valid numeric id', async () => {
    await syncLibraryImageBlocks(fakeDb, [img('i6', { imageId: 'not-a-number' })] as never)
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })
})

describe('content/services/image-sync — row resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('skips a target whose row is missing from the library', async () => {
    findImagesByIdsMock.mockResolvedValue([])
    const body = [img('i1', { imageId: '99', src: 'keep-me' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect((body[0] as { src: string }).src).toBe('keep-me')
    expect(updateImageNoteMock).not.toHaveBeenCalled()
  })

  it('preserves the existing width/height when the row has none', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: null, height: null, thumbhash: null, note: null },
    ])
    const body = [img('i1', { imageId: '1', width: 7, height: 8 })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect((body[0] as { width: number; height: number }).width).toBe(7)
    expect((body[0] as { width: number; height: number }).height).toBe(8)
  })

  it('overwrites width/height from the row when present', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 100, height: 200, thumbhash: null, note: null },
    ])
    const body = [img('i1', { imageId: '1', width: 0, height: 0 })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect((body[0] as { width: number; height: number }).width).toBe(100)
    expect((body[0] as { width: number; height: number }).height).toBe(200)
  })

  it('skips thumbhash write-back when the row thumbhash is empty', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: '', note: null },
    ])
    const body = [img('i1', { imageId: '1', thumbhash: 'original' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect((body[0] as { thumbhash: string }).thumbhash).toBe('original')
  })

  it('leaves src untouched when getPublicBaseUrl returns null', async () => {
    getPublicBaseUrlMock.mockReturnValue(null)
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: null },
    ])
    const body = [img('i1', { imageId: '1', src: 'external' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect((body[0] as { src: string }).src).toBe('external')
  })
})

describe('content/services/image-sync — alt write-back', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('writes the trimmed alt back to the row when it differs from note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'old' },
    ])
    const body = [img('i1', { imageId: '1', alt: '  new  ' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(updateImageNoteMock).toHaveBeenCalledWith(fakeDb, 1n, 'new')
  })

  it('writes null when the trimmed alt is empty and differs from note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'had-value' },
    ])
    const body = [img('i1', { imageId: '1', alt: '   ' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(updateImageNoteMock).toHaveBeenCalledWith(fakeDb, 1n, null)
  })

  it('does not write back when the trimmed alt equals the existing note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'same' },
    ])
    const body = [img('i1', { imageId: '1', alt: 'same' })] as never
    await syncLibraryImageBlocks(fakeDb, body)
    expect(updateImageNoteMock).not.toHaveBeenCalled()
  })

  it('swallows a failed note write-back without throwing', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'old' },
    ])
    updateImageNoteMock.mockRejectedValue(new Error('db down'))
    const body = [img('i1', { imageId: '1', alt: 'changed' })] as never
    await expect(syncLibraryImageBlocks(fakeDb, body)).resolves.toBeUndefined()
  })
})
