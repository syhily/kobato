import { describe, expect, it } from 'vitest'

import { buildPageFilterFields, deriveStatusFields, type PageFilterFieldKey } from '@/ui/admin/pages/filter-fields'

const fields = buildPageFilterFields([{ id: 'u-1', name: '雨帆' }])

function fieldSpec(key: PageFilterFieldKey) {
  const field = fields.find((f) => f.key === key)
  if (!field || field.kind !== 'options') {
    throw new Error(`expected an options field for ${key}`)
  }
  return field
}

describe('ui/admin/pages/deriveStatusFields', () => {
  it('maps all to the normal (unfiltered) flags', () => {
    expect(deriveStatusFields('all')).toEqual({ deletedStatus: 'normal' })
  })

  it('maps published to published', () => {
    expect(deriveStatusFields('published')).toEqual({ deletedStatus: 'normal', published: true })
  })

  it('maps draft to unpublished', () => {
    expect(deriveStatusFields('draft')).toEqual({ deletedStatus: 'normal', published: false })
  })

  it('maps deleted to the deleted flag only', () => {
    expect(deriveStatusFields('deleted')).toEqual({ deletedStatus: 'deleted' })
  })
})

describe('ui/admin/pages/buildPageFilterFields — toQuery projections', () => {
  it('projects every status value onto the list query input', () => {
    const status = fieldSpec('status')
    expect(status.options.map((o) => [o.value, o.label])).toEqual([
      ['published', '已发布'],
      ['draft', '草稿'],
      ['deleted', '已删除'],
    ])
    expect(status.toQuery('published')).toEqual({ deletedStatus: 'normal', published: true })
    expect(status.toQuery('draft')).toEqual({ deletedStatus: 'normal', published: false })
    expect(status.toQuery('deleted')).toEqual({ deletedStatus: 'deleted' })
  })

  it('projects the author pill onto authorId', () => {
    const author = fieldSpec('author')
    expect(author.options).toEqual([{ value: 'u-1', label: '雨帆' }])
    expect(author.toQuery('u-1')).toEqual({ authorId: 'u-1' })
  })
})
