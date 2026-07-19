import { DomainError } from '@/server/infra/http/errors'

// Shared helpers for admin taxonomy CRUD (categories & tags). The two
// entity types share structurally identical uniqueness checks, slug
// resolution, delete-block guards, and error formatting. This module
// provides parameterised versions so each domain service stays thin.

/** Shared with the category and tag services: format the "still
 *  referenced by N posts" 409 body shown to the admin on delete. */
export function formatBlockMessage(kind: string, name: string, titles: readonly string[]): string {
  const preview = titles.slice(0, 5).join('、')
  const suffix = titles.length > 5 ? `等 ${titles.length} 篇文章` : `${titles.length} 篇文章`
  return `${kind}「${name}」仍被 ${suffix}引用：${preview}。请先在引用文章中修改后再删除。`
}

// Pre-flight uniqueness guard for create. `entityLabel` is the
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
// titles so the admin knows which posts to fix. `listPostTitles` is a
// deliberately slim seam (titles only, full inclusion gate) — the guard
// must not pay for the full listing pipeline (tag batch, revision join,
// cover/thumbhash hydration) just to name the referencing posts.
export async function deleteAdminTaxonomy<T extends { name: string }>(
  id: bigint,
  entityLabel: string,
  deps: {
    findById: (id: bigint) => Promise<T | null>
    deleteRow: (id: bigint) => Promise<boolean>
    listPostTitles: (name: string) => Promise<string[]>
  },
): Promise<boolean> {
  const existing = await deps.findById(id)
  if (existing === null) {
    return false
  }

  const titles = await deps.listPostTitles(existing.name)
  if (titles.length > 0) {
    throw new DomainError('CONFLICT', formatBlockMessage(entityLabel, existing.name, titles))
  }

  const removed = await deps.deleteRow(id)
  return removed
}
