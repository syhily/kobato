import { beforeEach, describe, expect, it } from 'vitest'

import { signUpInitialAdminWithSession } from '@/server/domains/auth/flows'
import { db } from '@/server/infra/db/pool'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

import { clearAllTables } from './_helpers/integration-db'
import { flushWorkerRedis } from './_helpers/redis'
import { emptySession } from './_helpers/session'

describe('install snapshot debug', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    await flushWorkerRedis()
  })

  it('should seed settings and update snapshot', async () => {
    const session = emptySession()
    const request = new Request('http://localhost/admin/setup', { method: 'POST' })

    const result = await signUpInitialAdminWithSession({
      title: 'My Blog',
      name: 'Admin',
      email: 'admin@example.com',
      password: 'correcthorsebatterystaple',
      session,
      request,
      clientAddress: '127.0.0.1',
    })

    expect(result.ok).toBe(true)

    const bundle = getBlogSettingsBundleSync()
    if (bundle) {
      expect(bundle.siteIdentity?.title).toBe('My Blog')
    }
    expect(bundle).not.toBeNull()
    expect(bundle?.siteIdentity?.title).toBe('My Blog')
  })
})
