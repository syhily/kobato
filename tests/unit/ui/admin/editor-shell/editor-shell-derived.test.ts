import { describe, expect, it } from 'vitest'

import type { EditorShellDetail, EntityLike, RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'

import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
  localInputValueToIso,
  parseLocalDateTime,
} from '@/ui/admin/editor-shell/editor-shell-derived'

function revision(overrides: Partial<RevisionLike> = {}): RevisionLike {
  return {
    id: 'rev-1',
    revisionNo: 1,
    status: 'draft',
    body: [],
    clientRevisionToken: 'tok-1',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function detail(overrides: Partial<EditorShellDetail<EntityLike>> = {}): EditorShellDetail<EntityLike> {
  return {
    entity: { id: 'e1', slug: 's', updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: null },
    latestRevision: null,
    publishedRevision: null,
    ...overrides,
  }
}

describe('ui/admin/editor-shell/localInputValueToIso', () => {
  it.each([
    ['', null],
    ['not-a-date', null],
    ['2026-13-40T99:99', null],
  ])('maps %j to the no-value sentinel', (input, expected) => {
    expect(localInputValueToIso(input)).toBe(expected)
  })

  it('parses a local-tz picker value into an ISO timestamp', () => {
    const iso = localInputValueToIso('2026-06-01T12:00')
    expect(iso).not.toBeNull()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // Round-trip: the ISO denotes the same instant as the picker value.
    expect(Date.parse(iso!)).toBe(Date.parse('2026-06-01T12:00'))
  })

  it('parseLocalDateTime shares the same empty/invalid contract', () => {
    expect(parseLocalDateTime('')).toBe(Number.NaN)
    expect(parseLocalDateTime('not-a-date')).toBe(Number.NaN)
    expect(parseLocalDateTime('2026-06-01T12:00')).toBe(Date.parse('2026-06-01T12:00'))
  })
})

describe('ui/admin/editor-shell/deriveBaselineRevision', () => {
  it('returns null without detail (create mode)', () => {
    expect(deriveBaselineRevision(undefined)).toBeNull()
  })

  it('prefers the latest revision over the published one', () => {
    const latest = revision({ id: 'rev-latest', revisionNo: 3, status: 'draft' })
    const published = revision({ id: 'rev-published', revisionNo: 2, status: 'published' })
    expect(deriveBaselineRevision(detail({ latestRevision: latest, publishedRevision: published }))).toBe(latest)
  })

  it('falls back to the published revision when no draft exists', () => {
    const published = revision({ id: 'rev-published', status: 'published' })
    expect(deriveBaselineRevision(detail({ publishedRevision: published }))).toBe(published)
  })

  it('returns null when the entity has no revisions at all', () => {
    expect(deriveBaselineRevision(detail())).toBeNull()
  })
})

describe('ui/admin/editor-shell/deriveBaselineUpdatedAtMs', () => {
  it('returns null without detail (create mode)', () => {
    expect(deriveBaselineUpdatedAtMs(undefined)).toBeNull()
  })

  it('reads the latest revision timestamp when both revisions exist', () => {
    const latest = revision({ updatedAt: '2026-07-10T00:00:00.000Z' })
    const published = revision({ updatedAt: '2026-07-05T00:00:00.000Z', status: 'published' })
    expect(deriveBaselineUpdatedAtMs(detail({ latestRevision: latest, publishedRevision: published }))).toBe(
      Date.parse('2026-07-10T00:00:00.000Z'),
    )
  })

  it('reads the published revision timestamp when no draft exists', () => {
    const published = revision({ updatedAt: '2026-07-05T00:00:00.000Z', status: 'published' })
    expect(deriveBaselineUpdatedAtMs(detail({ publishedRevision: published }))).toBe(
      Date.parse('2026-07-05T00:00:00.000Z'),
    )
  })

  it('falls back to the entity updatedAt when both revisions are null', () => {
    expect(deriveBaselineUpdatedAtMs(detail())).toBe(Date.parse('2026-07-01T00:00:00.000Z'))
  })

  it('returns null when the winning timestamp is unparseable', () => {
    expect(deriveBaselineUpdatedAtMs(detail({ entity: { ...detail().entity, updatedAt: 'garbage' } }))).toBeNull()
  })
})
