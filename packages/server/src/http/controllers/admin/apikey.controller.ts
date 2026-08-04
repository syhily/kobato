import { listApiKeys, registerApiKey, revokeApiKey, type ApiKeyRow } from '@kobato/server/domains/apikey/service'
import { adminProc } from '@kobato/server/http/orpc-base'
import { z } from 'zod'

const apiKeyRowOutput = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

/** Row → DTO mapping (dates serialized as ISO strings on the admin wire). */
function toApiKeyRow(key: ApiKeyRow) {
  return {
    id: key.id,
    name: key.name,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  }
}

const list = adminProc
  .route({ method: 'GET', path: '/apikeys/list' })
  .output(z.object({ keys: z.array(apiKeyRowOutput) }))
  .handler(async ({ context }) => {
    const keys = await listApiKeys(context.db)
    return { keys: keys.map(toApiKeyRow) }
  })

const register = adminProc
  .route({ method: 'POST', path: '/apikeys/register' })
  .input(z.object({ name: z.string().min(1).max(80), publicKeyPem: z.string().min(1) }))
  .output(apiKeyRowOutput)
  .handler(async ({ input, context }) => {
    const key = await registerApiKey(context.db, { name: input.name, publicKeyPem: input.publicKeyPem })
    return toApiKeyRow(key)
  })

const revoke = adminProc
  .route({ method: 'POST', path: '/apikeys/revoke' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ revoked: z.boolean() }))
  .handler(async ({ input, context }) => ({ revoked: await revokeApiKey(context.db, input.id) }))

export const adminApiKeyRouter = { list, register, revoke }
