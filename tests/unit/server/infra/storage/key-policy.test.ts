import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PRIVATE_CACHE_CONTROL,
  DEFAULT_PUBLIC_CACHE_CONTROL,
  cacheControlForVisibility,
  contentTypeForKey,
  defaultCacheControlForKey,
  visibilityForKey,
} from '@/server/infra/storage/key-policy'

describe('storage/key-policy — contentTypeForKey', () => {
  it.each([
    ['images/a.jpg', 'image/jpeg'],
    ['images/a.jpeg', 'image/jpeg'],
    ['images/a.png', 'image/png'],
    ['images/a.gif', 'image/gif'],
    ['images/a.webp', 'image/webp'],
    ['images/a.avif', 'image/avif'],
    ['branding/logo.svg', 'image/svg+xml'],
    ['branding/favicon.ico', 'image/x-icon'],
    ['musics/t.mp3', 'audio/mpeg'],
    ['musics/t.flac', 'audio/flac'],
    ['musics/t.ogg', 'audio/ogg'],
    ['musics/t.m4a', 'audio/mp4'],
    ['fonts/h/x.woff', 'font/woff'],
    ['fonts/h/x.woff2', 'font/woff2'],
    ['fonts/h/x.ttf', 'font/ttf'],
    ['fonts/h/x.otf', 'font/otf'],
    ['fonts/h/result.css', 'text/css; charset=utf-8'],
    ['branding/site.webmanifest', 'application/manifest+json'],
    ['images/meta.json', 'application/json; charset=utf-8'],
    ['backup/kobato.db', 'application/octet-stream'],
    ['backup/kobato.db.gz', 'application/gzip'],
  ])('maps %s to %s', (key, expected) => {
    expect(contentTypeForKey(key)).toBe(expected)
  })

  it('is case-insensitive on the extension', () => {
    expect(contentTypeForKey('images/A.JPG')).toBe('image/jpeg')
    expect(contentTypeForKey('fonts/h/X.WOFF2')).toBe('font/woff2')
  })

  it('falls back to octet-stream for unknown or missing extensions', () => {
    expect(contentTypeForKey('images/a.bmp')).toBe('application/octet-stream')
    expect(contentTypeForKey('images/no-extension')).toBe('application/octet-stream')
    expect(contentTypeForKey('images/.hidden')).toBe('application/octet-stream')
  })
})

describe('storage/key-policy — visibilityForKey', () => {
  it.each(['backup/backup-1.db.gz', 'branding/icon.png', 'audit-log/2026-01.json.gz'])(
    'treats %s as private',
    (key) => {
      expect(visibilityForKey(key)).toBe('private')
    },
  )

  it.each(['images/a.jpg', 'musics/t.mp3', 'fonts/h/x.woff2', 'anything/else.bin'])('treats %s as public', (key) => {
    expect(visibilityForKey(key)).toBe('public')
  })
})

describe('storage/key-policy — cache-control mapping', () => {
  it('maps each visibility class to its immutable default', () => {
    expect(cacheControlForVisibility('public')).toBe(DEFAULT_PUBLIC_CACHE_CONTROL)
    expect(cacheControlForVisibility('private')).toBe(DEFAULT_PRIVATE_CACHE_CONTROL)
  })

  it('derives a key default from the visibility prefix rule', () => {
    expect(defaultCacheControlForKey('backup/b.db.gz')).toBe(DEFAULT_PRIVATE_CACHE_CONTROL)
    expect(defaultCacheControlForKey('images/a.jpg')).toBe(DEFAULT_PUBLIC_CACHE_CONTROL)
  })
})
