import { isWordPressDecoyPath } from '@kobato/server/http/middlewares/wp-decoy'
import { describe, expect, it } from 'vitest'

describe('isWordPressDecoyPath', () => {
  it('matches WordPress probe patterns', () => {
    const probes = [
      '/admin/options.php',
      '/admin/setup-config.php',
      '/wp-content/plugins/x.php',
      '/wp-content/uploads/img.jpg',
      '/wp-includes/wlwmanifest.xml',
      '/cgi-bin',
      '/cgi-bin/test.cgi',
      '/xmlrpc.php',
      '/index.php',
      '/blog/index.php',
    ]
    for (const path of probes) {
      expect(isWordPressDecoyPath(path), path).toBe(true)
    }
  })

  it('preserves the legitimate WordPress-style routes (login, install, SPA shell)', () => {
    expect(isWordPressDecoyPath('/admin/signin')).toBe(false)
    expect(isWordPressDecoyPath('/admin')).toBe(false)

    expect(isWordPressDecoyPath('/admin/setup')).toBe(false)

    expect(isWordPressDecoyPath('/admin/comments')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users/12345')).toBe(false)
  })

  it('ignores unrelated paths', () => {
    const ordinary = [
      '/',
      '/posts/hello',
      '/about',
      '/cats/general',
      '/tags/typescript',
      '/search/foo',
      '/feed',
      '/sitemap.xml',
      '/cgi-binx',
      '/adminx',
    ]
    for (const path of ordinary) {
      expect(isWordPressDecoyPath(path), path).toBe(false)
    }
  })
})
