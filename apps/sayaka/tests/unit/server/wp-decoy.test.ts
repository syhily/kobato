// @vitest-environment node
import type { Env } from '@sayaka/server/hono-env'

import { honoWpDecoyMiddleware, isWordPressDecoyPath, NOT_WORDPRESS_STATUS_TEXT } from '@sayaka/server/wp-decoy'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

describe('isWordPressDecoyPath', () => {
  it('flags WordPress and php probes', () => {
    for (const path of ['/wp-content/plugins/x.php', '/wp-includes/js/jquery.js', '/cgi-bin/luci', '/xmlrpc.php']) {
      expect(isWordPressDecoyPath(path), path).toBe(true)
    }
  })

  it('never decoys the legit admin paths or normal pages', () => {
    for (const path of ['/', '/admin', '/admin/signin', '/admin/setup', '/posts/hello', '/feed']) {
      expect(isWordPressDecoyPath(path), path).toBe(false)
    }
  })
})

describe('honoWpDecoyMiddleware', () => {
  it('answers 404 Not WordPress for decoy paths', async () => {
    const app = new Hono<Env>()
    app.use(honoWpDecoyMiddleware)
    app.get('/xmlrpc.php', (c) => c.text('unreachable'))
    const response = await app.request('/xmlrpc.php')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe(NOT_WORDPRESS_STATUS_TEXT)
  })
})
