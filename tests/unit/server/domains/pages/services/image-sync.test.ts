import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InklingImageCardNode, InklingSolutionNode } from '@/shared/inkling/schema'

import { inklingDocumentWithBlocks } from '#/_helpers/inkling'

// syncLibraryImageBlocks walks an Inkling document, collects every
// `image-card` block (including those nested in solution / footnoteDefinition
// / twoColumn containers), resolves library rows by imageId, and writes
// the canonical storagePath/src/alt back. The pure surface is:
//   - collectImageCards (private) — covers type routing for image-card,
//     solution, footnote-definition, two-column, and the default no-op.
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

const { syncLibraryImageBlocks } = await import('@/server/domains/pages/services/image-sync')

const fakeDb = {} as NodePgDatabase

function img(_key: string, overrides: Record<string, unknown> = {}): InklingImageCardNode {
  return { type: 'image-card', version: 1, key: _key, src: 'old-src', alt: '', ...overrides }
}

function doc(...blocks: Parameters<typeof inklingDocumentWithBlocks>[0]) {
  return inklingDocumentWithBlocks(blocks)
}

describe('pages/services/image-sync — collectImageCards routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('returns immediately when the body has no image blocks', async () => {
    await syncLibraryImageBlocks(
      fakeDb,
      doc({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [{ type: 'text', version: 1, text: 'x' }],
      }),
    )
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })

  it('collects image blocks nested inside a solution container', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 10, height: 20, thumbhash: 'th', note: null },
    ])
    const document = doc({
      type: 'solution',
      version: 1,
      key: 'sol1',
      children: [img('i1', { imageId: '1' })],
    })
    await syncLibraryImageBlocks(fakeDb, document)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [1n])
    const block = (document.root.children[0] as InklingSolutionNode).children[0] as InklingImageCardNode
    expect(block.src).toBe('https://cdn.test/p/1.jpg')
    expect(block.storagePath).toBe('p/1.jpg')
  })

  it('collects image blocks nested inside a footnoteDefinition container', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 2n, storagePath: 'p/2.jpg', width: 1, height: 2, thumbhash: '', note: null },
    ])
    const document = doc({
      type: 'footnote-definition',
      version: 1,
      key: 'fn1',
      targetKey: 'fn1',
      index: 1,
      children: [img('i2', { imageId: '2' })],
    })
    await syncLibraryImageBlocks(fakeDb, document)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [2n])
  })

  it('collects image blocks from both columns of a twoColumn block', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 3n, storagePath: 'p/3.jpg', width: 3, height: 3, thumbhash: 't3', note: null },
      { id: 4n, storagePath: 'p/4.jpg', width: 4, height: 4, thumbhash: 't4', note: null },
    ])
    const document = doc({
      type: 'two-column',
      version: 1,
      key: 'tc1',
      left: [img('i3', { imageId: '3' })],
      right: [img('i4', { imageId: '4' })],
    })
    await syncLibraryImageBlocks(fakeDb, document)
    expect(findImagesByIdsMock).toHaveBeenCalledWith(fakeDb, [3n, 4n])
  })

  it('skips image blocks with an empty imageId', async () => {
    await syncLibraryImageBlocks(fakeDb, doc(img('i5', { imageId: '' })))
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })

  it('skips image blocks whose imageId is not a valid numeric id', async () => {
    await syncLibraryImageBlocks(fakeDb, doc(img('i6', { imageId: 'not-a-number' })))
    expect(findImagesByIdsMock).not.toHaveBeenCalled()
  })
})

describe('pages/services/image-sync — row resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('skips a target whose row is missing from the library', async () => {
    findImagesByIdsMock.mockResolvedValue([])
    const document = doc(img('i1', { imageId: '99', src: 'keep-me' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect((document.root.children[0] as InklingImageCardNode).src).toBe('keep-me')
    expect(updateImageNoteMock).not.toHaveBeenCalled()
  })

  it('preserves the existing width/height when the row has none', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: null, height: null, thumbhash: null, note: null },
    ])
    const document = doc(img('i1', { imageId: '1', width: 7, height: 8 }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect((document.root.children[0] as InklingImageCardNode).width).toBe(7)
    expect((document.root.children[0] as InklingImageCardNode).height).toBe(8)
  })

  it('overwrites width/height from the row when present', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 100, height: 200, thumbhash: null, note: null },
    ])
    const document = doc(img('i1', { imageId: '1', width: 0, height: 0 }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect((document.root.children[0] as InklingImageCardNode).width).toBe(100)
    expect((document.root.children[0] as InklingImageCardNode).height).toBe(200)
  })

  it('skips thumbhash write-back when the row thumbhash is empty', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: '', note: null },
    ])
    const document = doc(img('i1', { imageId: '1', thumbhash: 'original' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect((document.root.children[0] as InklingImageCardNode).thumbhash).toBe('original')
  })

  it('leaves src untouched when getPublicBaseUrl returns null', async () => {
    getPublicBaseUrlMock.mockReturnValue(null)
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: null },
    ])
    const document = doc(img('i1', { imageId: '1', src: 'external' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect((document.root.children[0] as InklingImageCardNode).src).toBe('external')
  })
})

describe('pages/services/image-sync — alt write-back', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicBaseUrlMock.mockReturnValue('https://cdn.test')
    updateImageNoteMock.mockResolvedValue(undefined)
  })

  it('writes the trimmed alt back to the row when it differs from note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'old' },
    ])
    const document = doc(img('i1', { imageId: '1', alt: '  new  ' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect(updateImageNoteMock).toHaveBeenCalledWith(fakeDb, 1n, 'new')
  })

  it('writes null when the trimmed alt is empty and differs from note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'had-value' },
    ])
    const document = doc(img('i1', { imageId: '1', alt: '   ' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect(updateImageNoteMock).toHaveBeenCalledWith(fakeDb, 1n, null)
  })

  it('does not write back when the trimmed alt equals the existing note', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'same' },
    ])
    const document = doc(img('i1', { imageId: '1', alt: 'same' }))
    await syncLibraryImageBlocks(fakeDb, document)
    expect(updateImageNoteMock).not.toHaveBeenCalled()
  })

  it('swallows a failed note write-back without throwing', async () => {
    findImagesByIdsMock.mockResolvedValue([
      { id: 1n, storagePath: 'p/1.jpg', width: 1, height: 1, thumbhash: null, note: 'old' },
    ])
    updateImageNoteMock.mockRejectedValue(new Error('db down'))
    const document = doc(img('i1', { imageId: '1', alt: 'changed' }))
    await expect(syncLibraryImageBlocks(fakeDb, document)).resolves.toBeUndefined()
  })
})
