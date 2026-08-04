import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { image as imageTable } from '@kobato/server/infra/db/schema/media'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// No mocks at the module boundary: the image rows are real, the public base
// URL comes from the real settings snapshot (TEST_BLOG_SETTINGS_BUNDLE's
// assets.example.com), so the id batch lookup, the block rewriting, and the
// alt→note write-back all run against the engine.
const { syncLibraryImageBlocks } = await import('@kobato/server/domains/content/services/image-sync')
import type { LexicalBody } from '@kobato/shared/lexical/schema'

const EMPTY_LEXICAL_BODY: LexicalBody = {
  root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children: [] },
}

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function img(_key: string, overrides: Record<string, unknown> = {}) {
  return { type: 'image', version: 1, src: 'old-src', alt: '', ...overrides } as never
}

// The sync walker consumes the canonical Lexical shape; fixtures stay
// arrays and wrap at the call (the image nodes are shared references, so
// the in-place mutations remain observable through the array).
function asRoot(children: unknown[]): never {
  return { root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children } } as never
}

// Container nodes need the element base fields for the Lexical walker.
function base(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { direction: null, format: '', indent: 0, version: 1, ...extra }
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
    await expect(syncLibraryImageBlocks(db, EMPTY_LEXICAL_BODY)).resolves.toBeUndefined()
  })

  it('no-ops on a body with no image blocks', async () => {
    const body = [
      base({
        type: 'paragraph',
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'x', type: 'text', version: 1 }],
      }),
    ] as never
    await expect(syncLibraryImageBlocks(db, asRoot(body))).resolves.toBeUndefined()
    expect(body[0]).not.toHaveProperty('storagePath')
  })

  it('no-ops when imageId is undefined', async () => {
    const body = [img('i0', { src: 'https://x/y.jpg' })] as never
    await syncLibraryImageBlocks(db, asRoot(body))
    expect((body[0] as { src: string }).src).toBe('https://x/y.jpg')
  })

  it('collects image blocks nested inside a solution container', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: 'th' })
    const body = [base({ type: 'solution', children: [img('i1', { imageId: String(id) })] })] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    const block = (body[0] as { children: Array<{ src: string; storagePath: string; thumbhash: string }> }).children[0]!
    expect(block.src).toBe('https://assets.example.com/p/1.jpg')
    expect(block.storagePath).toBe('p/1.jpg')
    expect(block.thumbhash).toBe('th')
  })

  it('collects image blocks nested inside a footnoteDefinition container', async () => {
    const id = await seedImage({ storagePath: 'p/2.jpg', thumbhash: '' })
    const body = [
      base({ type: 'footnoteDefinition', index: 1, children: [img('i2', { imageId: String(id) })] }),
    ] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    const block = (body[0] as { children: Array<{ storagePath: string }> }).children[0]!
    expect(block.storagePath).toBe('p/2.jpg')
  })

  it('collects image blocks from both columns of a twoColumn block', async () => {
    const left = await seedImage({ storagePath: 'p/3.jpg' })
    const right = await seedImage({ storagePath: 'p/4.jpg' })
    const body = [
      base({
        type: 'twoColumn',
        children: [
          base({ type: 'twoColumnPane', side: 'left', children: [img('i3', { imageId: String(left) })] }),
          base({ type: 'twoColumnPane', side: 'right', children: [img('i4', { imageId: String(right) })] }),
        ],
      }),
    ] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    const tc = body[0] as {
      children: Array<{ children: Array<{ storagePath: string }> }>
    }
    expect(tc.children[0]!.children[0]!.storagePath).toBe('p/3.jpg')
    expect(tc.children[1]!.children[0]!.storagePath).toBe('p/4.jpg')
  })

  it('skips image blocks with an empty imageId', async () => {
    const body = [img('i5', { imageId: '', src: 'keep' })] as never
    await syncLibraryImageBlocks(db, asRoot(body))
    expect((body[0] as { src: string }).src).toBe('keep')
  })

  it('skips image blocks whose imageId is not a valid numeric id', async () => {
    const body = [img('i6', { imageId: 'not-a-number', src: 'keep' })] as never
    await syncLibraryImageBlocks(db, asRoot(body))
    expect((body[0] as { src: string }).src).toBe('keep')
  })
})

describe('content/services/image-sync — row resolution', () => {
  it('skips a target whose row is missing from the library', async () => {
    const body = [img('i1', { imageId: '99', src: 'keep-me' })] as never
    await syncLibraryImageBlocks(db, asRoot(body))
    expect((body[0] as { src: string }).src).toBe('keep-me')
    expect(body[0]).not.toHaveProperty('storagePath')
  })

  it('overwrites width/height from the row when present', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', width: 100, height: 200 })
    const body = [img('i1', { imageId: String(id), width: 1, height: 1 })] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    const block = body[0] as { width: number; height: number }
    expect(block.width).toBe(100)
    expect(block.height).toBe(200)
  })

  it('skips thumbhash write-back when the row thumbhash is empty', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: '' })
    const body = [img('i1', { imageId: String(id), thumbhash: 'original' })] as never

    await syncLibraryImageBlocks(db, asRoot(body))

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

    await syncLibraryImageBlocks(db, asRoot(body))

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

    await syncLibraryImageBlocks(db, asRoot(body))

    expect(await imageNote(id)).toBe('new')
  })

  it('writes null when the trimmed alt is empty and differs from note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'had-value' })
    const body = [img('i1', { imageId: String(id), alt: '   ' })] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    expect(await imageNote(id)).toBeNull()
  })

  it('does not write back when the trimmed alt equals the existing note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'same' })
    const body = [img('i1', { imageId: String(id), alt: 'same' })] as never

    await syncLibraryImageBlocks(db, asRoot(body))

    expect(await imageNote(id)).toBe('same')
  })
})
