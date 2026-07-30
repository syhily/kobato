import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedCategory(opts: Partial<typeof categoryTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(categoryTable)
    .values({
      name: opts.name ?? `Cat-${Math.random().toString(36).slice(2)}`,
      slug: opts.slug ?? `cat-${Math.random().toString(36).slice(2)}`,
      cover: opts.cover ?? '',
      description: opts.description ?? '',
      sortOrder: opts.sortOrder ?? 0,
      ...opts,
    })
    .returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(opts: Partial<typeof tagTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(tagTable)
    .values({
      name: opts.name ?? `Tag-${Math.random().toString(36).slice(2)}`,
      slug: opts.slug ?? `tag-${Math.random().toString(36).slice(2)}`,
      ...opts,
    })
    .returning({ id: tagTable.id })
  return rows[0]!.id
}

async function seedPublishedPost(
  categoryId?: number | null,
  opts: { title?: string; visible?: boolean; publishedAt?: Date } = {},
): Promise<number> {
  const rows = await db
    .insert(postMetaTable)
    .values({
      slug: `p-${Math.random().toString(36).slice(2)}`,
      title: opts.title ?? 'Post',
      published: true,
      publishedRevisionId: 1,
      publishedAt: opts.publishedAt ?? new Date('2020-01-01'),
      firstPublishedAt: new Date('2020-01-01'),
      categoryId: categoryId ?? null,
      visible: opts.visible ?? true,
    })
    .returning({ id: postMetaTable.id })
  return rows[0]!.id
}

describe('taxonomies/shared — formatBlockMessage', () => {
  it('lists up to 5 titles then summarises', async () => {
    const { formatBlockMessage } = await import('@/server/domains/taxonomies/shared')
    const msg = formatBlockMessage('标签', 'React', ['a', 'b', 'c', 'd', 'e', 'f'])
    expect(msg).toContain('6 篇文章')
    expect(msg).toContain('标签')
  })
  it('uses the "N 篇文章" suffix when fewer than 5', async () => {
    const { formatBlockMessage } = await import('@/server/domains/taxonomies/shared')
    const msg = formatBlockMessage('分类', 'Tech', ['a', 'b'])
    expect(msg).toContain('2 篇文章')
  })
})

describe('taxonomies/shared — ensureUniqueOnCreateTaxonomy', () => {
  it('throws CONFLICT when name already exists', async () => {
    const { ensureUniqueOnCreateTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const dupName = async () => ({ id: 1, name: 'X' }) as never
    const noSlug = async () => null
    await expect(ensureUniqueOnCreateTaxonomy(dupName, noSlug, 'X', 'x', '标签')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('throws CONFLICT when slug already exists', async () => {
    const { ensureUniqueOnCreateTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const noName = async () => null
    const dupSlug = async () => ({ id: 1, name: 'X' }) as never
    await expect(ensureUniqueOnCreateTaxonomy(noName, dupSlug, 'X', 'x', '标签')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('passes when both name and slug are free', async () => {
    const { ensureUniqueOnCreateTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const none = async () => null
    await expect(ensureUniqueOnCreateTaxonomy(none, none, 'X', 'x', '标签')).resolves.toBeUndefined()
  })
})

describe('taxonomies/shared — ensureUniqueOnUpdateTaxonomy', () => {
  it('throws CONFLICT when the new name is taken by another row', async () => {
    const { ensureUniqueOnUpdateTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const dupName = async () => ({ id: 2, name: 'X' }) as never
    const none = async () => null
    await expect(ensureUniqueOnUpdateTaxonomy(dupName, none, 1, 'X', 'Old', 'x', 'x', '标签')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('skips the check when name and slug are unchanged', async () => {
    const { ensureUniqueOnUpdateTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const dup = async () => ({ id: 2 }) as never
    await expect(
      ensureUniqueOnUpdateTaxonomy(dup, dup, 1, 'Same', 'Same', 'same', 'same', '标签'),
    ).resolves.toBeUndefined()
  })
})

describe('taxonomies/shared — deleteAdminTaxonomy', () => {
  it('returns false when the row does not exist', async () => {
    const { deleteAdminTaxonomy } = await import('@/server/domains/taxonomies/shared')
    const r = await deleteAdminTaxonomy(9999, '标签', {
      findById: async () => null,
      deleteRow: async () => false,
      listPostTitles: async () => [],
    })
    expect(r).toBe(false)
  })
  it('throws CONFLICT when posts still reference the taxonomy', async () => {
    const { deleteAdminTaxonomy } = await import('@/server/domains/taxonomies/shared')
    await expect(
      deleteAdminTaxonomy(1, '标签', {
        findById: async () => ({ id: 1, name: 'X' }),
        deleteRow: async () => true,
        listPostTitles: async () => ['Post A'],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('deletes when no posts reference it', async () => {
    const { deleteAdminTaxonomy } = await import('@/server/domains/taxonomies/shared')
    let deleted = false
    const r = await deleteAdminTaxonomy(1, '标签', {
      findById: async () => ({ id: 1, name: 'X' }),
      deleteRow: async () => {
        deleted = true
        return true
      },
      listPostTitles: async () => [],
    })
    expect(r).toBe(true)
    expect(deleted).toBe(true)
  })
})

describe('taxonomies/tags/service — listTagsForAdmin', () => {
  it('returns an empty result when there are no tags', async () => {
    const { listTagsForAdmin } = await import('@/server/domains/taxonomies/tags/service')
    const r = await listTagsForAdmin(db, {})
    expect(r.tags).toEqual([])
    expect(r.total).toBe(0)
  })
  it('returns tags with postCount', async () => {
    await seedTag({ name: 'React', slug: 'react' })
    const { listTagsForAdmin } = await import('@/server/domains/taxonomies/tags/service')
    const r = await listTagsForAdmin(db, {})
    expect(r.tags).toHaveLength(1)
    expect(r.tags[0]?.name).toBe('React')
    expect(r.tags[0]?.postCount).toBe(0)
  })
  it('filters by q against name', async () => {
    await seedTag({ name: 'React', slug: 'react' })
    await seedTag({ name: 'Vue', slug: 'vue' })
    const { listTagsForAdmin } = await import('@/server/domains/taxonomies/tags/service')
    const r = await listTagsForAdmin(db, { q: 'React' })
    expect(r.total).toBe(1)
  })
})

describe('taxonomies/tags/service — upsertAdminTag (create)', () => {
  it('creates a new tag', async () => {
    const { upsertAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    const dto = await upsertAdminTag(db, { name: 'NewTag' })
    expect(dto.name).toBe('NewTag')
    expect(dto.slug).toBe('newtag')
  })
  it('rejects a duplicate name', async () => {
    await seedTag({ name: 'Dup', slug: 'dup' })
    const { upsertAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    await expect(upsertAdminTag(db, { name: 'Dup' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('taxonomies/tags/service — upsertAdminTag (update)', () => {
  it('updates an existing tag', async () => {
    const id = await seedTag({ name: 'Old', slug: 'old' })
    const { upsertAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    const dto = await upsertAdminTag(db, { id, name: 'New' })
    expect(dto.name).toBe('New')
  })
  it('rejects update from a non-admin viewer', async () => {
    const id = await seedTag({ name: 'X', slug: 'x' })
    const { upsertAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    await expect(upsertAdminTag(db, { id, name: 'Y' }, { id: '1', role: 'author' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
  it('throws NOT_FOUND when id does not exist', async () => {
    const { upsertAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    await expect(upsertAdminTag(db, { id: 9999, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('taxonomies/tags/service — deleteAdminTag', () => {
  it('deletes an unreferenced tag', async () => {
    const id = await seedTag({ name: 'Del', slug: 'del' })
    const { deleteAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    expect(await deleteAdminTag(db, id)).toBe(true)
  })
  it('refuses to delete when posts reference the tag', async () => {
    const id = await seedTag({ name: 'Ref', slug: 'ref' })
    const pid = await seedPublishedPost()
    await db.insert(postTag).values({ postId: pid, tagId: id })
    const { deleteAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    await expect(deleteAdminTag(db, id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('blocks on hidden + scheduled references, names them, and never touches image hydration', async () => {
    const id = await seedTag({ name: 'Ref2', slug: 'ref2' })
    const hiddenPid = await seedPublishedPost(undefined, { title: 'Hidden Post', visible: false })
    const scheduledPid = await seedPublishedPost(undefined, {
      title: 'Scheduled Post',
      publishedAt: new Date('2099-01-01'),
    })
    await db.insert(postTag).values([
      { postId: hiddenPid, tagId: id },
      { postId: scheduledPid, tagId: id },
    ])
    const { deleteAdminTag } = await import('@/server/domains/taxonomies/tags/service')
    const error = await deleteAdminTag(db, id).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'CONFLICT' })
    expect((error as Error).message).toContain('Hidden Post')
    expect((error as Error).message).toContain('Scheduled Post')
    // The slim delete guard selects titles only — it must not run the full
    // listing pipeline (whose cover hydration would reach `hydrateImageRefs`
    // and its thumbhash batch query).
    const { hydrateImageRefs } = await import('@/server/domains/images/services/enhance')
    expect(hydrateImageRefs).not.toHaveBeenCalled()
  })
})

describe('taxonomies/tags/service — listAllTags', () => {
  it('returns an empty list when no tags exist', async () => {
    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    expect(await listAllTags(db)).toEqual([])
  })
  it('returns tags with post counts', async () => {
    const t1 = await seedTag({ name: 'React', slug: 'react' })
    const pid = await seedPublishedPost()
    await db.insert(postTag).values({ postId: pid, tagId: t1 })
    const { listAllTags } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await listAllTags(db)
    expect(tags[0]?.name).toBe('React')
    expect(tags[0]?.counts).toBe(1)
  })
})

describe('taxonomies/tags/service — getTagsByNames', () => {
  it('returns an empty array for empty input', async () => {
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    expect(await getTagsByNames(db, [])).toEqual([])
  })
  it('returns tags filtered by names with counts', async () => {
    const t1 = await seedTag({ name: 'React', slug: 'react' })
    const pid = await seedPublishedPost()
    await db.insert(postTag).values({ postId: pid, tagId: t1 })
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    const tags = await getTagsByNames(db, ['React', 'Unknown'])
    expect(tags).toHaveLength(1)
    expect(tags[0]?.name).toBe('React')
    expect(tags[0]?.counts).toBe(1)
  })
  it('returns [] when none of the names match', async () => {
    await seedTag({ name: 'A', slug: 'a' })
    const { getTagsByNames } = await import('@/server/domains/taxonomies/tags/service')
    expect(await getTagsByNames(db, ['Unknown'])).toEqual([])
  })
})

describe('taxonomies/categories/services/mutate — upsertAdminCategory (create)', () => {
  it('creates a new category', async () => {
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    const dto = await upsertAdminCategory(db, { name: 'Tech', cover: '/c.png', description: '' })
    expect(dto.name).toBe('Tech')
    expect(dto.slug).toBe('tech')
  })
  it('rejects a duplicate name', async () => {
    await seedCategory({ name: 'Dup', slug: 'dup' })
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(upsertAdminCategory(db, { name: 'Dup', cover: '', description: '' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('rejects a duplicate slug', async () => {
    await seedCategory({ name: 'Other', slug: 'taken' })
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(
      upsertAdminCategory(db, { name: 'New', slug: 'taken', cover: '', description: '' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('taxonomies/categories/services/mutate — upsertAdminCategory (update)', () => {
  it('updates an existing category', async () => {
    const id = await seedCategory({ name: 'Old', slug: 'old' })
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    const dto = await upsertAdminCategory(db, { id, name: 'New', cover: '/c.png', description: '' })
    expect(dto.name).toBe('New')
  })
  it('throws NOT_FOUND when id does not exist', async () => {
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(upsertAdminCategory(db, { id: 9999, name: 'X', cover: '', description: '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
  it('rejects a name collision with another row', async () => {
    const id = await seedCategory({ name: 'A', slug: 'a' })
    await seedCategory({ name: 'B', slug: 'b' })
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(upsertAdminCategory(db, { id, name: 'B', cover: '', description: '' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('taxonomies/categories/services/mutate — reorderAdminCategories', () => {
  it('reorders categories by orderedIds', async () => {
    const a = await seedCategory({ name: 'A', slug: 'a', sortOrder: 0 })
    const b = await seedCategory({ name: 'B', slug: 'b', sortOrder: 1 })
    const { reorderAdminCategories } = await import('@/server/domains/taxonomies/categories/services/mutate')
    const rows = await reorderAdminCategories(db, [String(b), String(a)])
    expect(rows[0]?.name).toBe('B')
    expect(rows[1]?.name).toBe('A')
  })
  it('rejects duplicate ids', async () => {
    const a = await seedCategory({ name: 'A', slug: 'aa' })
    const { reorderAdminCategories } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(reorderAdminCategories(db, [String(a), String(a)])).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
  it('rejects when the live list differs from the requested ids', async () => {
    const a = await seedCategory({ name: 'A', slug: 'aaa' })
    const { reorderAdminCategories } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(reorderAdminCategories(db, [String(a), '9999'])).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('taxonomies/categories/services/mutate — deleteAdminCategory', () => {
  it('deletes an unreferenced category', async () => {
    const id = await seedCategory({ name: 'Del', slug: 'del' })
    const { deleteAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    expect(await deleteAdminCategory(db, id)).toBe(true)
  })
  it('refuses to delete when posts reference it', async () => {
    const id = await seedCategory({ name: 'Tech', slug: 'tech2' })
    await seedPublishedPost(id)
    const { deleteAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await expect(deleteAdminCategory(db, id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('blocks on hidden + scheduled references and names them in the 409 body', async () => {
    const id = await seedCategory({ name: 'Tech', slug: 'tech3' })
    await seedPublishedPost(id, { title: 'Hidden Post', visible: false })
    await seedPublishedPost(id, { title: 'Scheduled Post', publishedAt: new Date('2099-01-01') })
    const { deleteAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    const error = await deleteAdminCategory(db, id).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'CONFLICT' })
    expect((error as Error).message).toContain('Hidden Post')
    expect((error as Error).message).toContain('Scheduled Post')
  })
  it('returns false when the category does not exist', async () => {
    const { deleteAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    expect(await deleteAdminCategory(db, 9999)).toBe(false)
  })
})

describe('taxonomies/categories — rename cascades to posts with zero post writes', () => {
  it('projects the new name through the id join without touching the post row', async () => {
    const id = await seedCategory({ name: 'Old', slug: 'rename-me' })
    const pid = await seedPublishedPost(id, { title: 'Rename Probe' })
    const before = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { upsertAdminCategory } = await import('@/server/domains/taxonomies/categories/services/mutate')
    await upsertAdminCategory(db, { id, name: 'New', cover: '', description: '' })
    // The public pipeline resolves the display name via category_id…
    const { listPublicPosts } = await import('@/server/domains/posts/services/public-query')
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const metas = await listPublicPosts(db, { categoryId: id })
    const posts = await hydratePostList(db, metas)
    expect(posts[0]?.category).toBe('New')
    // …while the post row itself saw no write: same reference, same updated_at.
    const after = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    expect(after[0]?.categoryId).toBe(id)
    expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt)
  })
})
