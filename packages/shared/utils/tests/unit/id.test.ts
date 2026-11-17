import { idStr } from '@kobato/utils/id.ts'
import { describe, expect, it } from 'vitest'

describe('utils/id — idStr', () => {
  it('stringifies numeric and string ids', () => {
    expect(idStr(42)).toBe('42')
    expect(idStr('42')).toBe('42')
  })
})
