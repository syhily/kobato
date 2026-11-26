import { apiContract } from '@kobato/api/contract'
import { isCsrfExemptRpcPath } from '@kobato/server/http/request/csrf-exempt-rpc-path'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'

const EXPECTED_PATHS = [
  '/rpc/public/analytics/recordDeviceEnv',
  '/rpc/admin/backup/download',
  '/rpc/admin/music/proxyCover',
  '/rpc/admin/music/proxyAudio',
  '/rpc/public/webmentions/receive',
  '/rpc/public/observability/rumIntake',
]

function procedurePaths(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}/${key}`
    if (isContractProcedure(value)) {
      return [`/rpc/${path}`]
    }
    return typeof value === 'object' && value !== null ? procedurePaths(value as Record<string, unknown>, path) : []
  })
}

describe('isCsrfExemptRpcPath', () => {
  it.each(EXPECTED_PATHS)('exempts %s', (path) => {
    expect(isCsrfExemptRpcPath(path)).toBe(true)
  })

  it('derives exactly the frozen set and fails closed for every other procedure', () => {
    const paths = procedurePaths(apiContract as unknown as Record<string, unknown>)
    expect(paths.filter(isCsrfExemptRpcPath).sort()).toEqual([...EXPECTED_PATHS].sort())
    expect(isCsrfExemptRpcPath('/rpc/admin/backup/uploadRestore')).toBe(false)
    expect(isCsrfExemptRpcPath('/rpc/public/observability/rumStatus')).toBe(false)
    expect(isCsrfExemptRpcPath('/rpc/admin/backup/download/extra')).toBe(false)
    expect(isCsrfExemptRpcPath('/admin/music/proxyCover')).toBe(false)
  })
})
