import { DomainError } from '@/server/infra/http/errors'

// Uniqueness checks, delete guards, and error formatting shared by categories & tags.

/** The "still referenced by N posts" 409 body shown on blocked deletes. */
export function formatBlockMessage(kind: string, name: string, titles: readonly string[]): string {
  const preview = titles.slice(0, 5).join('、')
  const suffix = titles.length > 5 ? `等 ${titles.length} 篇文章` : `${titles.length} 篇文章`
  return `${kind}「${name}」仍被 ${suffix}引用：${preview}。请先在引用文章中修改后再删除。`
}

export async function ensureUniqueOnCreateTaxonomy<T extends { id: number }>(
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

export async function ensureUniqueOnUpdateTaxonomy<T extends { id: number }>(
  findByName: (name: string) => Promise<T | null>,
  findBySlug: (slug: string) => Promise<T | null>,
  id: number,
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

// Block-only deletion: refuses while any post references the row. Pass a titles-only
// `listPostTitles`; it gets the whole row — categories key by `row.id`, tags by `row.name`.
export async function deleteAdminTaxonomy<T extends { id: number; name: string }>(
  id: number,
  entityLabel: string,
  deps: {
    findById: (id: number) => Promise<T | null>
    deleteRow: (id: number) => Promise<boolean>
    listPostTitles: (row: T) => Promise<string[]>
  },
): Promise<boolean> {
  const existing = await deps.findById(id)
  if (existing === null) {
    return false
  }

  const titles = await deps.listPostTitles(existing)
  if (titles.length > 0) {
    throw new DomainError('CONFLICT', formatBlockMessage(entityLabel, existing.name, titles))
  }

  const removed = await deps.deleteRow(id)
  return removed
}
