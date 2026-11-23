import type { RpcProcedureMeta } from '@kobato/api/rpc/define-procedure'

import { apiContract } from '@kobato/api/contract'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'

const EXPECTED = new Map([
  ['admin.backup.uploadRestore', 1_800_000],
  ['admin.backup.uploadRestoreDecrypt', 1_800_000],
  ['account.setup.restore', 1_800_000],
])

function leavesOf(tree: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (isContractProcedure(value)) {
      leaves.set(path, value)
    } else if (typeof value === 'object' && value !== null) {
      for (const [nestedPath, nestedLeaf] of leavesOf(value as Record<string, unknown>, path)) {
        leaves.set(nestedPath, nestedLeaf)
      }
    }
  }
  return leaves
}

describe('requestTimeoutMs metadata', () => {
  it('marks exactly the three restore procedures with a 30-minute budget', () => {
    const marked = [...leavesOf(apiContract as unknown as Record<string, unknown>).entries()]
      .filter(([, leaf]) => 'requestTimeoutMs' in (leaf as { '~orpc': { meta: object } })['~orpc'].meta)
      .map(
        ([key, leaf]) =>
          [key, (leaf as { '~orpc': { meta: { requestTimeoutMs: number } } })['~orpc'].meta.requestTimeoutMs] as const,
      )
    expect(new Map(marked)).toEqual(EXPECTED)
  })

  it('pins the literal meta type and validates the declaration', () => {
    expectTypeOf(apiContract.admin.backup.uploadRestore['~orpc'].meta).toMatchTypeOf<RpcProcedureMeta>()
    expectTypeOf(apiContract.account.setup.restore['~orpc'].meta.requestTimeoutMs).toEqualTypeOf<number>()
    expect(() => defineProcedure({ method: 'POST', path: '/setup/other' }, { requestTimeoutMs: 0 })).toThrow(RangeError)
    expect(() => defineProcedure({ method: 'POST', path: '/setup/other' }, { requestTimeoutMs: 1.5 })).toThrow(
      RangeError,
    )
  })
})
