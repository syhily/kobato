import { describe, expect, it } from 'vitest'

import { resolveGfmPipeTableLines } from '@/nodes/table/table-facts'

// The GFM export policy lives in table-facts (row 0 is always the forged
// header). A rowless table has no pipe-table shape at all — exporting one
// must not leak an undefined line or a degenerate divider.
describe('table facts: resolveGfmPipeTableLines', function () {
  it('returns no lines for a table without rows', function () {
    const lines = resolveGfmPipeTableLines([], () => '')
    expect(lines).toEqual([])
    expect(lines).not.toContain(undefined)
  })
})
