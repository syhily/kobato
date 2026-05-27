import { DomainError } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'

// Shared helpers for admin taxonomy CRUD (categories & tags). The two
// entity types share structurally identical uniqueness checks, slug
// resolution, delete-block guards, and error formatting. This module
// provides parameterised versions so each domain service stays thin.

/** Shared with the category and tag services: format the "still
 *  referenced by N posts" 409 body shown to the admin on delete. */
export function formatBlockMessage(kind: string, name: string, titles: readonly string[]): string {
  const preview = titles.slice(0, 5).join('、')
  const suffix = titles.length > 5 ? `等 ${titles.length} 篇文章` : `${titles.length} 篇文章`
  return `${kind}「${name}」仍被 ${suffix}引用：${preview}。请先在 MDX frontmatter 中改写后再删除。`
}

// Canonical slug resolution for a taxonomy entity. An explicit non-empty
// value wins; blank / missing falls back to `deriveSlug(name)`. Throws
// 400 when even `deriveSlug` produces an empty string (e.g. a name made
// entirely of emoji / punctuation).
export function resolveSlugForTaxonomy(explicit: string | undefined, name: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const slug = explicit.trim()
    if (!DERIVED_SLUG_PATTERN.test(slug)) {
      throw new DomainError('BAD_REQUEST', 'slug 格式不合法（仅允许小写字母、数字、`-`）。', [
        { message: 'slug 格式不合法', path: ['slug'] },
      ])
    }
    if (slug.length > SLUG_MAX) {
      throw new DomainError('BAD_REQUEST', `slug 长度不得超过 ${SLUG_MAX} 个字符。`, [
        { message: `slug 长度不得超过 ${SLUG_MAX} 个字符`, path: ['slug'] },
      ])
    }
    return slug
  }
  const derived = deriveSlug(name)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从名称推导出 slug，请手动填写。', [
      { message: '名称推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}

// Pre-flight uniqueness guard for create. `entityLabel` is the
// user-facing noun (e.g. "分类", "标签") used in the 409 body.
export async function ensureUniqueOnCreateTaxonomy<T extends { id: bigint }>(
  findByName: (name: string) => Promise<T | null>,
  findBySlug: (slug: string) => Promise<T | null>,
  name: string,
  slug: string,
  entityLabel: string,
): Promise<void> {
  const dupName = await findByName(name)
  if (dupName !== null) {
    throw new DomainError('CONFLICT', `已存在同名${entityLabel}「${name}」`, [
      { message: '名称已被占用', path: ['name'] },
    ])
  }
  const dupSlug = await findBySlug(slug)
  if (dupSlug !== null) {
    throw new DomainError('CONFLICT', `已存在相同 slug「${slug}」`, [{ message: 'Slug 已被占用', path: ['slug'] }])
  }
}

// Pre-flight uniqueness guard for update. Skips the name / slug queries
// when the value hasn't changed.
export async function ensureUniqueOnUpdateTaxonomy<T extends { id: bigint }>(
  findByName: (name: string) => Promise<T | null>,
  findBySlug: (slug: string) => Promise<T | null>,
  id: bigint,
  newName: string,
  existingName: string,
  newSlug: string,
  existingSlug: string,
  entityLabel: string,
): Promise<void> {
  if (newName !== existingName) {
    const dupName = await findByName(newName)
    if (dupName !== null && dupName.id !== id) {
      throw new DomainError('CONFLICT', `已存在同名${entityLabel}「${newName}」`, [
        { message: '名称已被占用', path: ['name'] },
      ])
    }
  }
  if (newSlug !== existingSlug) {
    const dupSlug = await findBySlug(newSlug)
    if (dupSlug !== null && dupSlug.id !== id) {
      throw new DomainError('CONFLICT', `已存在相同 slug「${newSlug}」`, [{ message: 'Slug 已被占用', path: ['slug'] }])
    }
  }
}

// Block-only deletion: refuses to delete a taxonomy row while any post
// still references it. The 409 body lists up to 5 referencing post
// titles so the admin knows which files to fix.
export async function deleteAdminTaxonomy<T extends { name: string }>(
  id: bigint,
  entityLabel: string,
  deps: {
    findById: (id: bigint) => Promise<T | null>
    deleteRow: (id: bigint) => Promise<boolean>
    listPostsBy: (
      name: string,
      opts: { includeHidden: boolean; includeScheduled: boolean },
    ) => Promise<{ title: string }[]>
  },
): Promise<boolean> {
  const existing = await deps.findById(id)
  if (existing === null) {
    return false
  }

  const referencing = await deps.listPostsBy(existing.name, {
    includeHidden: true,
    includeScheduled: true,
  })
  if (referencing.length > 0) {
    throw new DomainError(
      'CONFLICT',
      formatBlockMessage(
        entityLabel,
        existing.name,
        referencing.map((post) => post.title),
      ),
    )
  }

  const removed = await deps.deleteRow(id)
  return removed
}
