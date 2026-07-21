import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { deriveStatusFields, usePagesFilters } from '@/ui/admin/pages/usePagesFilters'

describe('ui/admin/pages/usePagesFilters', () => {
  it('derives the default filters', () => {
    const { filters } = renderHook(usePagesFilters)
    expect(filters.status).toBe('all')
    expect(filters.authorId).toBe('')
  })
})

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
