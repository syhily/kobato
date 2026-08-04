import type { EditorShellDetail, EntityLike, RevisionLike } from '@kobato/ui/admin/editor-shell/editor-shell-types'

import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { localInputValueToIso, parseLocalDateTimeInput } from '@kobato/ui/admin/editor-shell/editor-datetime'
import {
  deriveBaselineRevision,
  deriveBaselineUpdatedAtMs,
  derivePublishState,
  deriveSidebarPublishStatus,
  deriveSidebarRevisionSummary,
  deriveSidebarSaveStatus,
} from '@kobato/ui/admin/editor-shell/editor-shell-derived'
import { describe, expect, it } from 'vitest'

function revision(overrides: Partial<RevisionLike> = {}): RevisionLike {
  return {
    id: 'rev-1',
    revisionNo: 1,
    status: 'draft',
    body: EMPTY_LEXICAL_BODY,
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

  it('parseLocalDateTimeInput shares the same empty/invalid contract', () => {
    expect(parseLocalDateTimeInput('')).toBeNull()
    expect(parseLocalDateTimeInput('not-a-date')).toBeNull()
    expect(parseLocalDateTimeInput('2026-06-01T12:00')?.getTime()).toBe(Date.parse('2026-06-01T12:00'))
  })
})

describe('ui/admin/editor-shell/derivePublishState', () => {
  it('is not-published-yet when no revision exists at all', () => {
    expect(derivePublishState(null, null, true)).toEqual({ kind: 'not-published-yet' })
  })

  it('is unpublished when the entity is not visible, keeping the last published revision number', () => {
    const published = revision({ revisionNo: 2, status: 'published' })
    expect(derivePublishState(published, published, false)).toEqual({
      kind: 'unpublished',
      lastPublishedRevisionNo: 2,
    })
  })

  it('is unpublished with a null revision number when nothing was ever published', () => {
    const draft = revision({ revisionNo: 3, status: 'draft' })
    expect(derivePublishState(draft, null, false)).toEqual({ kind: 'unpublished', lastPublishedRevisionNo: null })
  })

  it('is published-current when the latest revision is the published one', () => {
    const published = revision({ revisionNo: 4, status: 'published' })
    expect(derivePublishState(published, published, true)).toEqual({ kind: 'published-current', revisionNo: 4 })
  })

  it('is draft-ahead when the latest revision is a draft over a published one', () => {
    const draft = revision({ revisionNo: 5, status: 'draft' })
    const published = revision({ revisionNo: 4, status: 'published' })
    expect(derivePublishState(draft, published, true)).toEqual({
      kind: 'draft-ahead',
      draftRevisionNo: 5,
      publishedRevisionNo: 4,
    })
  })

  it('is draft-ahead with a null published number when only drafts exist', () => {
    const draft = revision({ revisionNo: 2, status: 'draft' })
    expect(derivePublishState(draft, null, true)).toEqual({
      kind: 'draft-ahead',
      draftRevisionNo: 2,
      publishedRevisionNo: null,
    })
  })
})

describe('ui/admin/editor-shell/deriveSidebarPublishStatus', () => {
  it('is never-saved in create mode and when nothing was published', () => {
    expect(
      deriveSidebarPublishStatus({ isEditing: false, publishState: { kind: 'not-published-yet' }, publishedAt: '' }),
    ).toBe('never-saved')
    expect(
      deriveSidebarPublishStatus({ isEditing: true, publishState: { kind: 'not-published-yet' }, publishedAt: '' }),
    ).toBe('never-saved')
  })

  it('is offline when unpublished', () => {
    expect(
      deriveSidebarPublishStatus({
        isEditing: true,
        publishState: { kind: 'unpublished', lastPublishedRevisionNo: 2 },
        publishedAt: '',
      }),
    ).toBe('offline')
  })

  it('is scheduled when publishedAt is a future local input value', () => {
    expect(
      deriveSidebarPublishStatus({
        isEditing: true,
        publishState: { kind: 'published-current', revisionNo: 4 },
        publishedAt: '2099-06-01T09:00',
      }),
    ).toBe('scheduled')
  })

  it('is live / live-with-draft-ahead for past publishedAt values', () => {
    expect(
      deriveSidebarPublishStatus({
        isEditing: true,
        publishState: { kind: 'published-current', revisionNo: 4 },
        publishedAt: '2020-06-01T09:00',
      }),
    ).toBe('live')
    expect(
      deriveSidebarPublishStatus({
        isEditing: true,
        publishState: { kind: 'draft-ahead', draftRevisionNo: 5, publishedRevisionNo: 4 },
        publishedAt: '2020-06-01T09:00',
      }),
    ).toBe('live-with-draft-ahead')
  })

  it('treats an unparseable publishedAt as not scheduled', () => {
    expect(
      deriveSidebarPublishStatus({
        isEditing: true,
        publishState: { kind: 'published-current', revisionNo: 4 },
        publishedAt: 'garbage',
      }),
    ).toBe('live')
  })
})

describe('ui/admin/editor-shell/deriveSidebarRevisionSummary', () => {
  it('is null in create mode', () => {
    expect(deriveSidebarRevisionSummary({ isEditing: false, publishState: { kind: 'not-published-yet' } })).toBeNull()
  })

  it('maps not-published-yet to no-revision', () => {
    expect(deriveSidebarRevisionSummary({ isEditing: true, publishState: { kind: 'not-published-yet' } })).toEqual({
      kind: 'no-revision',
    })
  })

  it('maps published-current to the published revision number', () => {
    expect(
      deriveSidebarRevisionSummary({ isEditing: true, publishState: { kind: 'published-current', revisionNo: 4 } }),
    ).toEqual({ kind: 'published-current', revisionNo: 4 })
  })

  it('maps unpublished to the last published revision, or no-revision when none exists', () => {
    expect(
      deriveSidebarRevisionSummary({
        isEditing: true,
        publishState: { kind: 'unpublished', lastPublishedRevisionNo: 2 },
      }),
    ).toEqual({ kind: 'published-current', revisionNo: 2 })
    expect(
      deriveSidebarRevisionSummary({
        isEditing: true,
        publishState: { kind: 'unpublished', lastPublishedRevisionNo: null },
      }),
    ).toEqual({ kind: 'no-revision' })
  })

  it('maps draft-ahead to both revision numbers', () => {
    expect(
      deriveSidebarRevisionSummary({
        isEditing: true,
        publishState: { kind: 'draft-ahead', draftRevisionNo: 5, publishedRevisionNo: 4 },
      }),
    ).toEqual({ kind: 'draft-ahead', draftRevisionNo: 5, publishedRevisionNo: 4 })
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

describe('ui/admin/editor-shell/deriveSidebarSaveStatus', () => {
  const base = {
    isEditing: true,
    isBodyDirty: false,
    isMetaDirty: false,
    displaySaveAtMs: null,
  }

  it('maps a warning shell status to a warning sidebar status', () => {
    expect(
      deriveSidebarSaveStatus({
        ...base,
        status: { kind: 'warning', message: '图片库同步失败，部分图片可能无法正常显示。' },
        displaySaveAtMs: Date.parse('2026-07-10T00:00:00.000Z'),
      }),
    ).toEqual({ kind: 'warning', message: '图片库同步失败，部分图片可能无法正常显示。' })
  })

  it('keeps the warning visible while the draft is dirty, like error and info', () => {
    expect(
      deriveSidebarSaveStatus({
        ...base,
        status: { kind: 'warning', message: 'w' },
        isBodyDirty: true,
      }),
    ).toEqual({ kind: 'warning', message: 'w' })
  })

  it('still projects a clean saved state when no warning is in flight', () => {
    const atMs = Date.parse('2026-07-10T00:00:00.000Z')
    expect(
      deriveSidebarSaveStatus({
        ...base,
        status: { kind: 'saved', at: new Date(atMs) },
        displaySaveAtMs: atMs,
      }),
    ).toEqual({ kind: 'saved', atMs })
  })
})
