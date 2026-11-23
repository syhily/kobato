import type { RpcProcedureMeta } from '@kobato/api/rpc/define-procedure'

import { apiContract } from '@kobato/api/contract'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'

const EXPECTED_KEYS = [
  'public.analytics.recordDeviceEnv',
  'admin.backup.download',
  'admin.music.proxyCover',
  'admin.music.proxyAudio',
]

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

function csrfExemptMetaOf(leaf: unknown): unknown {
  return (leaf as { '~orpc': { meta: { csrfExempt?: unknown } } })['~orpc'].meta.csrfExempt
}

describe('csrfExempt metadata', () => {
  it('marks exactly the legacy no-CSRF procedures', () => {
    const marked = [...leavesOf(apiContract as unknown as Record<string, unknown>).entries()]
      .filter(([, leaf]) => csrfExemptMetaOf(leaf) === true)
      .map(([key]) => key)
      .sort()
    expect(marked).toEqual([...EXPECTED_KEYS].sort())
  })

  it('pins the literal type and keeps it independent from publicRead', () => {
    expectTypeOf(apiContract.public.analytics.recordDeviceEnv['~orpc'].meta).toMatchTypeOf<RpcProcedureMeta>()
    expectTypeOf(apiContract.admin.backup.download['~orpc'].meta.csrfExempt).toEqualTypeOf<true>()
    expect(apiContract.public.analytics.recordDeviceEnv['~orpc'].meta).toMatchObject({ csrfExempt: true })
    expect('publicRead' in apiContract.public.analytics.recordDeviceEnv['~orpc'].meta).toBe(false)
    // @ts-expect-error — eligibility is the literal true, not a widened boolean
    expectTypeOf(apiContract.admin.backup.download['~orpc'].meta.csrfExempt).toEqualTypeOf<boolean>()
  })
})
