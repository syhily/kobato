import { resolveGfmPipeTableLines } from '@kobato/inkling-internal/nodes/table/table-facts'
import { describe, expect, it } from 'vitest'

describe('table facts: resolveGfmPipeTableLines', function () {
  it('returns no lines for a table without rows', function () {
    const lines = resolveGfmPipeTableLines([], () => '')
    expect(lines).toEqual([])
    expect(lines).not.toContain(undefined)
  })
})
