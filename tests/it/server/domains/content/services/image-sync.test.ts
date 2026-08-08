import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { image as imageTable } from '@/server/infra/db/schema/media'

// No module mocks: real image rows and the real settings snapshot's
// assets.example.com base URL.
const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function img(_key: string, overrides: Record<string, unknown> = {}) {
  return { _type: 'image', _key, src: 'old-src', alt: '', ...overrides } as never
}

async function seedImage(overrides: Partial<typeof imageTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(imageTable)
    .values({
      storagePath: overrides.storagePath ?? `p/${Math.random().toString(36).slice(2)}.jpg`,
      mimeType: 'image/jpeg',
      width: 10,
      height: 20,
      byteSize: 1234,
      ...overrides,
    })
    .returning({ id: imageTable.id })
  return rows[0]!.id
}

async function imageNote(id: number): Promise<string | null> {
  const rows = await db.select({ note: imageTable.note }).from(imageTable).where(eq(imageTable.id, id))
  return rows[0]?.note ?? null
}

describe('content/services/image-sync — collectImageBlocks routing', () => {
  it('no-ops on an empty body', async () => {
    await expect(syncLibraryImageBlocks(db, [])).resolves.toBeUndefined()
  })

  it('no-ops on a body with no image blocks', async () => {
    const body = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'x' }] },
    ] as never
    await expect(syncLibraryImageBlocks(db, body)).resolves.toBeUndefined()
    expect(body[0]).not.toHaveProperty('storagePath')
  })

  it('no-ops when imageId is undefined', async () => {
    const body = [img('i0', { src: 'https://x/y.jpg' })] as never
    await syncLibraryImageBlocks(db, body)
    expect((body[0] as { src: string }).src).toBe('https://x/y.jpg')
  })

  it('collects image blocks nested inside a solution container', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: 'th' })
    const body = [
      {
        _type: 'solution',
        _key: 'sol1',
        children: [img('i1', { imageId: String(id) })],
      },
    ] as never

    await syncLibraryImageBlocks(db, body)

    const block = (body[0] as { children: Array<{ src: string; storagePath: string; thumbhash: string }> }).children[0]!
    expect(block.src).toBe('https://assets.example.com/p/1.jpg')
    expect(block.storagePath).toBe('p/1.jpg')
    expect(block.thumbhash).toBe('th')
  })

  it('collects image blocks nested inside a footnoteDefinition container', async () => {
    const id = await seedImage({ storagePath: 'p/2.jpg', thumbhash: '' })
    const body = [
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [img('i2', { imageId: String(id) })],
      },
    ] as never

    await syncLibraryImageBlocks(db, body)

    const block = (body[0] as { children: Array<{ storagePath: string }> }).children[0]!
    expect(block.storagePath).toBe('p/2.jpg')
  })

  it('collects image blocks from both columns of a twoColumn block', async () => {
    const left = await seedImage({ storagePath: 'p/3.jpg' })
    const right = await seedImage({ storagePath: 'p/4.jpg' })
    const body = [
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [img('i3', { imageId: String(left) })],
        right: [img('i4', { imageId: String(right) })],
      },
    ] as never

    await syncLibraryImageBlocks(db, body)

    const tc = body[0] as {
      left: Array<{ storagePath: string }>
      right: Array<{ storagePath: string }>
    }
    expect(tc.left[0]!.storagePath).toBe('p/3.jpg')
    expect(tc.right[0]!.storagePath).toBe('p/4.jpg')
  })

  it('skips image blocks with an empty imageId', async () => {
    const body = [img('i5', { imageId: '', src: 'keep' })] as never
    await syncLibraryImageBlocks(db, body)
    expect((body[0] as { src: string }).src).toBe('keep')
  })

  it('skips image blocks whose imageId is not a valid numeric id', async () => {
    const body = [img('i6', { imageId: 'not-a-number', src: 'keep' })] as never
    await syncLibraryImageBlocks(db, body)
    expect((body[0] as { src: string }).src).toBe('keep')
  })
})

describe('content/services/image-sync — row resolution', () => {
  it('skips a target whose row is missing from the library', async () => {
    const body = [img('i1', { imageId: '99', src: 'keep-me' })] as never
    await syncLibraryImageBlocks(db, body)
    expect((body[0] as { src: string }).src).toBe('keep-me')
    expect(body[0]).not.toHaveProperty('storagePath')
  })

  it('overwrites width/height from the row when present', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', width: 100, height: 200 })
    const body = [img('i1', { imageId: String(id), width: 1, height: 1 })] as never

    await syncLibraryImageBlocks(db, body)

    const block = body[0] as { width: number; height: number }
    expect(block.width).toBe(100)
    expect(block.height).toBe(200)
  })

  it('skips thumbhash write-back when the row thumbhash is empty', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: '' })
    const body = [img('i1', { imageId: String(id), thumbhash: 'original' })] as never

    await syncLibraryImageBlocks(db, body)

    expect((body[0] as { thumbhash: string }).thumbhash).toBe('original')
  })

  it('leaves src untouched when the asset base URL is unconfigured', async () => {
    // Host '' makes the real getPublicBaseUrl() return null; the it setup's
    // afterEach restores the default bundle automatically.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        asset: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.asset, host: '' },
      },
    })
    const id = await seedImage({ storagePath: 'p/1.jpg' })
    const body = [img('i1', { imageId: String(id), src: 'external' })] as never

    await syncLibraryImageBlocks(db, body)

    const block = body[0] as { src: string; storagePath: string }
    expect(block.src).toBe('external')
    // storagePath is canonicalised regardless of the base-URL configuration.
    expect(block.storagePath).toBe('p/1.jpg')
  })
})

describe('content/services/image-sync — alt write-back', () => {
  it('writes the trimmed alt back to the row when it differs from note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'old' })
    const body = [img('i1', { imageId: String(id), alt: '  new  ' })] as never

    await syncLibraryImageBlocks(db, body)

    expect(await imageNote(id)).toBe('new')
  })

  it('writes null when the trimmed alt is empty and differs from note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'had-value' })
    const body = [img('i1', { imageId: String(id), alt: '   ' })] as never

    await syncLibraryImageBlocks(db, body)

    expect(await imageNote(id)).toBeNull()
  })

  it('does not write back when the trimmed alt equals the existing note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'same' })
    const body = [img('i1', { imageId: String(id), alt: 'same' })] as never

    await syncLibraryImageBlocks(db, body)

    expect(await imageNote(id)).toBe('same')
  })
})
