import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'

const updateUserById = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/users/services/admin', () => ({
  fetchAdminUserDto: vi.fn(),
  listUsersForAdmin: vi.fn(),
  softDeleteUserWithGuard: vi.fn(),
  toAdminUserDto: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  restoreUserById: vi.fn(),
  updateUserById,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEventFromContext: vi.fn(),
}))

const { RPCHandler } = await import('@orpc/server/fetch')
const { adminUsersCrudRouter } = await import('@/server/http/controllers/admin/users-crud.controller')
const handler = new RPCHandler(adminUsersCrudRouter)

async function call(path: string, input: unknown) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makeAuthedCtx({ role: 'admin' }) },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

describe('admin users-crud controller', () => {
  beforeEach(() => {
    updateUserById.mockReset()
    updateUserById.mockResolvedValue({ id: 1 })
  })

  describe('update', () => {
    it('accepts a valid HTTPS link', async () => {
      const response = await call('/update', {
        id: '1',
        name: 'Alice',
        link: 'https://example.com',
      })
      expect(response.status).toBe(200)
      const body = await parseRpcJson<{ success: boolean }>(response)
      expect(body.success).toBe(true)
      expect(updateUserById).toHaveBeenCalledWith(
        expect.anything(),
        1,
        expect.objectContaining({ link: 'https://example.com' }),
      )
    })

    it('rejects a javascript: scheme link with a validation error', async () => {
      const response = await call('/update', {
        id: '1',
        link: 'javascript:alert(1)',
      })
      expect(response.status).toBe(400)
      const body = (await response.json()) as {
        json: { data: { issues: Array<{ message: string }> } }
      }
      expect(body.json.data.issues[0]!.message).toMatch(/http/i)
    })

    it('passes only the fields present in the input to the service', async () => {
      const response = await call('/update', {
        id: '1',
        name: 'Alice',
      })
      expect(response.status).toBe(200)
      expect(updateUserById).toHaveBeenCalledWith(expect.anything(), 1, { name: 'Alice' })
      expect(updateUserById).not.toHaveBeenCalledWith(
        expect.anything(),
        1,
        expect.objectContaining({ email: expect.anything() }),
      )
    })
  })
})
