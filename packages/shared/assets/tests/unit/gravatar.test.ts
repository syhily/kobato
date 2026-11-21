import { GRAVATAR_MIRROR_URLS, isAllowedMirrorUrl } from '@kobato/assets/gravatar'
import { describe, expect, it } from 'vitest'

describe('assets: gravatar mirrors', () => {
  describe('isAllowedMirrorUrl', () => {
    it('accepts known gravatar mirrors over https', () => {
      expect(isAllowedMirrorUrl('https://gravatar.com/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://cn.gravatar.com/avatar/')).toBe(true)
    })

    it('accepts common community gravatar-compatible mirrors', () => {
      expect(isAllowedMirrorUrl('https://cdn.v2ex.com/gravatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://sdn.geekzu.org/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.loli.net/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://cravatar.cn/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://cravatar.com/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://seccdn.libravatar.org/gravatarproxy')).toBe(true)
      expect(isAllowedMirrorUrl('https://weavatar.com/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.webp.se/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.zeruns.com/avatar')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.zeruns.tech/avatar')).toBe(true)
      expect(isAllowedMirrorUrl('https://cdn.sep.cc/avatar')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.w3tt.com/avatar')).toBe(true)
      expect(isAllowedMirrorUrl('https://use.sevencdn.com/avatar')).toBe(true)
    })

    it('keeps every dropdown preset on the allowlist', () => {
      for (const url of GRAVATAR_MIRROR_URLS) {
        expect(isAllowedMirrorUrl(url), url).toBe(true)
      }
    })

    it('rejects non-gravatar hosts', () => {
      expect(isAllowedMirrorUrl('https://example.com/avatar/')).toBe(false)
      expect(isAllowedMirrorUrl('https://evil.com/')).toBe(false)
    })

    it('rejects cloud metadata endpoints', () => {
      expect(isAllowedMirrorUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    })

    it('rejects loopback / private ranges', () => {
      expect(isAllowedMirrorUrl('https://127.0.0.1/')).toBe(false)
      expect(isAllowedMirrorUrl('https://10.0.0.1/')).toBe(false)
      expect(isAllowedMirrorUrl('https://192.168.1.1/')).toBe(false)
    })

    it('rejects http (non-tls) urls', () => {
      expect(isAllowedMirrorUrl('http://gravatar.com/avatar/')).toBe(false)
    })

    it('rejects malformed urls', () => {
      expect(isAllowedMirrorUrl('not-a-url')).toBe(false)
      expect(isAllowedMirrorUrl('')).toBe(false)
    })
  })
})
