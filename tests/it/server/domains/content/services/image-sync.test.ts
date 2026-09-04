import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { emptyLexicalBody, lexicalBodyWith, lexicalImage, lexicalParagraph } from '#/_helpers/lexical'
import { image as imageTable } from '@/server/infra/db/schema/media'

// No module mocks: real image rows; the stamp is the origin-relative
// site-owned form regardless of the settings snapshot.
const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function quote(children: unknown[]) {
  return { type: 'extended-quote', version: 1, children, direction: 'ltr', format: '', indent: 0 }
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

describe('content/services/image-sync — image-node routing', () => {
  it('no-ops on an empty body', async () => {
    await expect(syncLibraryImageBlocks(db, emptyLexicalBody())).resolves.toBeUndefined()
  })

  it('no-ops on a body with no image nodes', async () => {
    const body = lexicalBodyWith([lexicalParagraph('x')])
    await expect(syncLibraryImageBlocks(db, body)).resolves.toBeUndefined()
    expect(body.root.children[0]).not.toHaveProperty('storagePath')
  })

  it('no-ops when imageId is undefined', async () => {
    const node = lexicalImage({ src: 'https://x/y.jpg' })
    const body = lexicalBodyWith([node])
    await syncLibraryImageBlocks(db, body)
    expect(node.src).toBe('https://x/y.jpg')
  })

  it('collects image nodes nested inside a quote container', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: 'th' })
    const node = lexicalImage({ imageId: String(id) })
    const body = lexicalBodyWith([quote([node])])

    await syncLibraryImageBlocks(db, body)

    expect(node.src).toBe('/storage/p/1.jpg')
    expect(node.storagePath).toBe('p/1.jpg')
    expect(node.thumbhash).toBe('th')
  })

  it('collects image nodes nested inside a list item', async () => {
    const left = await seedImage({ storagePath: 'p/3.jpg' })
    const right = await seedImage({ storagePath: 'p/4.jpg' })
    const leftNode = lexicalImage({ imageId: String(left) })
    const rightNode = lexicalImage({ imageId: String(right) })
    const body = lexicalBodyWith([
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          { type: 'listitem', version: 1, value: 1, direction: 'ltr', format: '', indent: 0, children: [leftNode] },
          { type: 'listitem', version: 1, value: 2, direction: 'ltr', format: '', indent: 0, children: [rightNode] },
        ],
      },
    ])

    await syncLibraryImageBlocks(db, body)

    expect(leftNode.storagePath).toBe('p/3.jpg')
    expect(rightNode.storagePath).toBe('p/4.jpg')
  })

  it('skips image nodes with an empty imageId', async () => {
    const node = lexicalImage({ imageId: '', src: 'keep' })
    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))
    expect(node.src).toBe('keep')
  })

  it('skips image nodes whose imageId is not a valid numeric id', async () => {
    const node = lexicalImage({ imageId: 'not-a-number', src: 'keep' })
    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))
    expect(node.src).toBe('keep')
  })
})

describe('content/services/image-sync — row resolution', () => {
  it('skips a target whose row is missing from the library', async () => {
    const node = lexicalImage({ imageId: '99', src: 'keep-me' })
    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))
    expect(node.src).toBe('keep-me')
    expect(node).not.toHaveProperty('storagePath')
  })

  it('overwrites width/height from the row when present', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', width: 100, height: 200 })
    const node = lexicalImage({ imageId: String(id), width: 1, height: 1 })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(node.width).toBe(100)
    expect(node.height).toBe(200)
  })

  it('skips thumbhash write-back when the row thumbhash is empty', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', thumbhash: '' })
    const node = lexicalImage({ imageId: String(id), thumbhash: 'original' })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(node.thumbhash).toBe('original')
  })

  it('always stamps the origin-relative site-owned src, independent of the CDN base', async () => {
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
    const node = lexicalImage({ imageId: String(id), src: 'https://cdn.legacy.example/p/1.jpg' })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(node.src).toBe('/storage/p/1.jpg')
    expect(node.storagePath).toBe('p/1.jpg')
  })
})

describe('content/services/image-sync — alt write-back', () => {
  it('writes the trimmed alt back to the row when it differs from note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'old' })
    const node = lexicalImage({ imageId: String(id), alt: '  new  ' })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(await imageNote(id)).toBe('new')
  })

  it('writes null when the trimmed alt is empty and differs from note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'had-value' })
    const node = lexicalImage({ imageId: String(id), alt: '   ' })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(await imageNote(id)).toBeNull()
  })

  it('does not write back when the trimmed alt equals the existing note', async () => {
    const id = await seedImage({ storagePath: 'p/1.jpg', note: 'same' })
    const node = lexicalImage({ imageId: String(id), alt: 'same' })

    await syncLibraryImageBlocks(db, lexicalBodyWith([node]))

    expect(await imageNote(id)).toBe('same')
  })
})
