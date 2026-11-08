import type { ErrorMessageDescriptor, ErrorMessageParams } from '@/shared/contracts/api-error'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

// Uniqueness checks, delete guards, and error formatting shared by categories & tags.
// The entity noun is a MACHINE kind — the catalog's ICU `select` picks the
// localized noun, so the domain never chooses a language or passes prose.

export type TaxonomyEntityKind = 'category' | 'tag'

// Static issue descriptors (no runtime translation at import): the transports
// localize them per request from the typed key.
const NAME_TAKEN_ISSUE = {
  messageKey: 'taxonomy.error.nameTakenIssue',
  fallbackMessage: 'Name is already taken',
} as const satisfies ErrorMessageDescriptor
const SLUG_TAKEN_ISSUE = {
  messageKey: 'taxonomy.error.slugTakenIssue',
  fallbackMessage: 'Slug is already taken',
} as const satisfies ErrorMessageDescriptor

/** First five titles, with an ellipsis when more — the blocked-delete 409 preview. */
export function previewTitles(titles: readonly string[]): string {
  const preview = titles.slice(0, 5).join(', ')
  return titles.length > 5 ? `${preview}…` : preview
}

function duplicateName(name: string, entity: TaxonomyEntityKind): DomainError {
  return new DomainError('CONFLICT', descriptorFor('taxonomy.error.nameTaken', { entity, name }), [
    { ...NAME_TAKEN_ISSUE, path: ['name'] },
  ])
}

function duplicateSlug(slug: string): DomainError {
  return new DomainError('CONFLICT', descriptorFor('taxonomy.error.slugTaken', { slug }), [
    { ...SLUG_TAKEN_ISSUE, path: ['slug'] },
  ])
}

/** The shared NOT_FOUND for a missing taxonomy row (admin mutations + controllers). */
export function taxonomyNotFound(entity: TaxonomyEntityKind): DomainError {
  return new DomainError('NOT_FOUND', descriptorFor('taxonomy.error.notFound', { entity }))
}

export async function ensureUniqueOnCreateTaxonomy<T extends { id: number }>(
  findByName: (name: string) => Promise<T | null>,
  findBySlug: (slug: string) => Promise<T | null>,
  name: string,
  slug: string,
  entity: TaxonomyEntityKind,
): Promise<void> {
  const dupName = await findByName(name)
  if (dupName !== null) {
    throw duplicateName(name, entity)
  }
  const dupSlug = await findBySlug(slug)
  if (dupSlug !== null) {
    throw duplicateSlug(slug)
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
  entity: TaxonomyEntityKind,
): Promise<void> {
  if (newName !== existingName) {
    const dupName = await findByName(newName)
    if (dupName !== null && dupName.id !== id) {
      throw duplicateName(newName, entity)
    }
  }
  if (newSlug !== existingSlug) {
    const dupSlug = await findBySlug(newSlug)
    if (dupSlug !== null && dupSlug.id !== id) {
      throw duplicateSlug(newSlug)
    }
  }
}

// Block-only deletion: refuses while any post references the row. Pass a titles-only
// `listPostTitles`; it gets the whole row — categories key by `row.id`, tags by `row.name`.
export async function deleteAdminTaxonomy<T extends { id: number; name: string }>(
  id: number,
  entity: TaxonomyEntityKind,
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
    const params: ErrorMessageParams = {
      entity,
      name: existing.name,
      count: titles.length,
      preview: previewTitles(titles),
    }
    throw new DomainError('CONFLICT', descriptorFor('taxonomy.error.blockedByPosts', params))
  }

  const removed = await deps.deleteRow(id)
  return removed
}
