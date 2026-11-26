// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import { trailingSlashNormaliser } from '@sayaka/server/trailing-slash'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

function makeApp() {
  const app = new Hono<Env>()
  app.use(trailingSlashNormaliser)
  app.get('/page/:num', (c) => c.text('page'))
  app.post('/rpc/public/content/home', (c) => c.text('rpc'))
  return app
}

describe('trailingSlashNormaliser', () => {
  it('redirects GET with trailing slashes to the normalised path, preserving the query', async () => {
    const app = makeApp()
    const response = await app.request('/page/2/?a=1')
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('/page/2?a=1')
  })

  it('leaves the root path alone', async () => {
    const app = makeApp()
    const response = await app.request('/')
    expect(response.status).toBe(404)
  })

  it('never redirects the /rpc/ prefix', async () => {
    const app = makeApp()
    const response = await app.request('/rpc/public/content/home', { method: 'POST' })
    expect(response.status).toBe(200)
  })

  it('never redirects non-GET methods', async () => {
    const app = makeApp()
    const response = await app.request('/page/2/', { method: 'POST' })
    expect(response.status).toBe(404)
  })
})
