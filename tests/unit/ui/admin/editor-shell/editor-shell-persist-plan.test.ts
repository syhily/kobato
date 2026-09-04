import { describe, expect, it } from 'vitest'
// Pure save-planner tests: every wire-payload and status-transition decision
// the persist module makes, verified without rendering React.

import type { AdminRevisionDto, SaveBodyOutput } from '@/shared/contracts/revision'

import { emptyLexicalBody } from '#/_helpers/lexical'
import {
  planBodySave,
  planCreatePublishedAt,
  planDraftSave,
  planPublish,
  verdictBodySave,
} from '@/ui/admin/editor-shell/editor-shell-persist-plan'

function block(key: string, text: string) {
  return { _type: 'block' as const, _key: key, children: [{ _type: 'span' as const, _key: `${key}-s`, text }] }
}

function makeRevision(overrides: Partial<AdminRevisionDto> = {}): AdminRevisionDto {
  return {
    id: 'rev-1',
    revisionNo: 1,
    status: 'draft',
    body: emptyLexicalBody(),
    imageSources: [],
    headings: [],
    authorId: null,
    clientRevisionToken: 'tok-1',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function savedPayload(overrides: Partial<AdminRevisionDto> = {}, warning?: string): SaveBodyOutput {
  return { status: 'saved', revision: makeRevision(overrides), ...(warning !== undefined ? { warning } : {}) }
}

function conflictPayload(expectedToken = 'tok-server'): SaveBodyOutput {
  return { status: 'conflict', latest: makeRevision(), expectedToken }
}

const NOW = new Date('2026-07-10T12:00:00.000Z')

describe('ui/admin/editor-shell/editor-shell-persist-plan — verdictBodySave', () => {
  it('classifies a conflict payload with the server expected token', () => {
    expect(verdictBodySave(conflictPayload('tok-9'))).toEqual({ kind: 'conflict', expectedToken: 'tok-9' })
  })

  it('classifies a saved payload with the revision and optional warning', () => {
    const revision = makeRevision()
    expect(verdictBodySave(savedPayload())).toEqual({ kind: 'saved', revision, warning: undefined })
    expect(verdictBodySave(savedPayload({}, 'w'))).toEqual({ kind: 'saved', revision, warning: 'w' })
  })
})

describe('ui/admin/editor-shell/editor-shell-persist-plan — planBodySave', () => {
  it('conflict: carries the token, never consumes the pending snapshot', () => {
    const plan = planBodySave(conflictPayload('tok-7'), [block('b1', 'x')], NOW)
    expect(plan).toEqual({ kind: 'conflict', expectedToken: 'tok-7' })
  })

  it('clean save: saved status, revision race payload, consumes a pending manual snapshot', () => {
    const revision = makeRevision()
    const plan = planBodySave(savedPayload(), [block('b1', 'x')], NOW)
    expect(plan).toEqual({
      kind: 'saved',
      status: { kind: 'saved', at: NOW },
      revision,
      consumePendingSnapshot: true,
    })
  })

  it('clean save without a pending snapshot (autosave flush) does not touch the baseline', () => {
    const plan = planBodySave(savedPayload(), null, NOW)
    expect(plan.kind).toBe('saved')
    expect(plan.kind === 'saved' && plan.consumePendingSnapshot).toBe(false)
  })

  it('saved-with-warning surfaces the warning status instead of a saved tick', () => {
    const plan = planBodySave(savedPayload({}, '图片库同步失败。'), null, NOW)
    expect(plan).toMatchObject({ kind: 'saved', status: { kind: 'warning', message: '图片库同步失败。' } })
  })
})

describe('ui/admin/editor-shell/editor-shell-persist-plan — planDraftSave', () => {
  const base = {
    pickerPublishedAt: '',
    serverPublishedAtIso: null,
    now: Date.parse('2026-07-10T12:00:00.000Z'),
    body: [block('b1', 'same')],
    lastSavedBody: [block('b1', 'same')],
  }

  it('passes the picker ISO through when the picker holds a value', () => {
    const plan = planDraftSave({ ...base, pickerPublishedAt: '2025-01-01T00:00' })
    expect(plan.publishedAt).toBe(new Date('2025-01-01T00:00').toISOString())
  })

  it('sends publishedAt: null when the picker is cleared on a server-scheduled entity', () => {
    const plan = planDraftSave({ ...base, serverPublishedAtIso: '2099-06-01T12:00:00.000Z' })
    expect(plan.publishedAt).toBeNull()
  })

  it('omits publishedAt when the picker is cleared and the server holds no schedule', () => {
    expect(planDraftSave(base).publishedAt).toBeUndefined()
  })

  it('a past server publishedAt is a fact, not a schedule — cleared picker omits the field', () => {
    const plan = planDraftSave({ ...base, serverPublishedAtIso: '2026-01-01T00:00:00.000Z' })
    expect(plan.publishedAt).toBeUndefined()
  })

  it('arms one banner leg when the body is clean, two when it diverged', () => {
    const clean = planDraftSave(base)
    expect(clean.bodyDiverged).toBe(false)
    expect(clean.bannerLegs).toBe(1)

    const diverged = planDraftSave({ ...base, body: [block('b2', 'new text')] })
    expect(diverged.bodyDiverged).toBe(true)
    expect(diverged.bannerLegs).toBe(2)
  })
})

describe('ui/admin/editor-shell/editor-shell-persist-plan — planCreatePublishedAt', () => {
  it('omits the field on an empty picker so the server default applies', () => {
    expect(planCreatePublishedAt('')).toBeUndefined()
  })

  it('passes a set picker through as ISO', () => {
    expect(planCreatePublishedAt('2025-01-01T00:00')).toBe(new Date('2025-01-01T00:00').toISOString())
  })
})

describe('ui/admin/editor-shell/editor-shell-persist-plan — planPublish', () => {
  it('includes the picker ISO in the wire call and adopts it optimistically', () => {
    const plan = planPublish({ pickerPublishedAt: '2099-06-01T12:00', nowIso: '2026-07-10T12:00:00.000Z' })
    const iso = new Date('2099-06-01T12:00').toISOString()
    expect(plan.publishedAtField).toBe(iso)
    expect(plan.optimisticServerPublishedAtIso).toBe(iso)
  })

  it('omits the field on an empty picker and optimistically publishes "now"', () => {
    const plan = planPublish({ pickerPublishedAt: '', nowIso: '2026-07-10T12:00:00.000Z' })
    expect(plan.publishedAtField).toBeUndefined()
    expect(plan.optimisticServerPublishedAtIso).toBe('2026-07-10T12:00:00.000Z')
  })
})
