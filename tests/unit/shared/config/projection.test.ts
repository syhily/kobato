import { describe, expect, it } from 'vitest'

import type { CommentsSettings, MailSettings } from '@/shared/config/types'

import { projectAssetsForAdmin, projectCommentsForAdmin, projectMailForAdmin } from '@/shared/config/projection'

describe('shared/config/projection — projectAssetsForAdmin', () => {
  const baseInput = {
    asset: { host: 'cdn.example.com', scheme: 'https' as const },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'kobato',
      accessKeyId: 'AKIATEST',
      secretAccessKey: '0123456789abcdef',
      forcePathStyle: true,
      urlTemplate: 'https://cdn.example.com/{key}',
    },
    upload: { maxBytes: 1024, jpegQuality: 90 },
    branding: {
      faviconSvg: { etag: 'svg-1' },
      faviconIco: { etag: 'ico-1' },
      appleTouchIcon: undefined,
      icon192: undefined,
      icon512: { etag: '' },
      logoSvg: { etag: 'logo' },
      logoDarkSvg: undefined,
      logoLargeSvg: undefined,
      logoLargeDarkSvg: undefined,
      openGraph: { etag: 'og-1' },
      blogPoster: { etag: 'poster' },
      blogPosterDark: undefined,
      defaultAvatar: undefined,
      robotsTxt: 'User-agent: *\nDisallow: /admin',
    },
  }

  it('returns the asset host/scheme verbatim', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.asset).toEqual({ host: 'cdn.example.com', scheme: 'https' })
  })

  it('passes through configured storage fields', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.storage).toMatchObject({
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'kobato',
      accessKeyId: 'AKIATEST',
      forcePathStyle: true,
      urlTemplate: 'https://cdn.example.com/{key}',
    })
  })

  it('defaults storage booleans to false and strings to empty when undefined', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.storage.enabled).toBe(false)
    expect(out.storage.forcePathStyle).toBe(false)
    expect(out.storage.endpoint).toBe('')
    expect(out.storage.region).toBe('')
    expect(out.storage.bucket).toBe('')
    expect(out.storage.accessKeyId).toBe('')
    expect(out.storage.urlTemplate).toBe('')
  })

  it('masks the secret access key to the last 4 chars when no override is provided', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.secretAccessKeyMask).toBe('cdef')
  })

  it('returns null secret mask when secret is empty', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.secretAccessKeyMask).toBeNull()
  })

  it('uses the provided secret mask override', () => {
    const out = projectAssetsForAdmin(baseInput, 'wxyz')
    expect(out.secretAccessKeyMask).toBe('wxyz')
  })

  it('applies upload defaults when maxBytes/jpegQuality are missing', () => {
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.upload.maxBytes).toBe(8 * 1024 * 1024)
    expect(out.upload.jpegQuality).toBe(82)
  })

  it('projects branding refs into {etag} shape with empty string fallback', () => {
    const out = projectAssetsForAdmin(baseInput)
    expect(out.branding.faviconSvg).toEqual({ etag: 'svg-1' })
    expect(out.branding.faviconIco).toEqual({ etag: 'ico-1' })
    expect(out.branding.appleTouchIcon).toEqual({ etag: '' })
    expect(out.branding.icon192).toEqual({ etag: '' })
    expect(out.branding.icon512).toEqual({ etag: '' })
    expect(out.branding.openGraph).toEqual({ etag: 'og-1' })
  })

  it('passes robotsTxt through, defaulting to empty string when absent', () => {
    expect(projectAssetsForAdmin(baseInput).branding.robotsTxt).toContain('User-agent')
    const out = projectAssetsForAdmin({
      asset: { host: 'h', scheme: 'https' },
      storage: {},
      upload: {},
    })
    expect(out.branding.robotsTxt).toBe('')
  })
})

describe('shared/config/projection — projectMailForAdmin', () => {
  const baseMail: MailSettings = {
    mail: {
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'sk-zeabur-abcd',
      sender: 'noreply@example.com',
      transport: 'smtp',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'postmaster@example.com',
      smtpPass: 'smtp-pass-wxyz',
      smtpSecure: false,
      smtpRequireTls: true,
      smtpRejectUnauthorized: true,
      mailgunDomain: 'mg.example.com',
      mailgunApiKey: 'mg-key-1234',
    },
  }

  it('forwards every non-secret field, including both SMTP TLS flags', () => {
    const out = projectMailForAdmin(baseMail)
    expect(out.mail).toMatchObject({
      enabled: true,
      host: 'api.zeabur.com',
      sender: 'noreply@example.com',
      transport: 'smtp',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'postmaster@example.com',
      smtpSecure: false,
      smtpRequireTls: true,
      smtpRejectUnauthorized: true,
      mailgunDomain: 'mg.example.com',
    })
  })

  it('keeps a stored false for both TLS flags (regression: the route hand-map used to drop them)', () => {
    const out = projectMailForAdmin({
      mail: { ...baseMail.mail, smtpRequireTls: false, smtpRejectUnauthorized: false },
    })
    expect(out.mail.smtpRequireTls).toBe(false)
    expect(out.mail.smtpRejectUnauthorized).toBe(false)
  })

  it('swaps the three secrets for the passed masks and never leaks the raw values', () => {
    const out = projectMailForAdmin(baseMail, {
      apiKeyMask: '••••key',
      smtpPassMask: '••••pass',
      mailgunApiKeyMask: '••••mgkey',
    })
    expect(out.mail.apiKeyMask).toBe('••••key')
    expect(out.mail.smtpPassMask).toBe('••••pass')
    expect(out.mail.mailgunApiKeyMask).toBe('••••mgkey')
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('sk-zeabur-abcd')
    expect(serialized).not.toContain('smtp-pass-wxyz')
    expect(serialized).not.toContain('mg-key-1234')
  })

  it('falls back to the last 4 chars of the raw secret when no mask is passed', () => {
    const out = projectMailForAdmin(baseMail)
    expect(out.mail.apiKeyMask).toBe('abcd')
    expect(out.mail.smtpPassMask).toBe('wxyz')
    expect(out.mail.mailgunApiKeyMask).toBe('1234')
  })

  it('returns null masks when the secrets are unset', () => {
    const out = projectMailForAdmin({
      mail: { ...baseMail.mail, apiKey: undefined, smtpPass: undefined, mailgunApiKey: undefined },
    })
    expect(out.mail.apiKeyMask).toBeNull()
    expect(out.mail.smtpPassMask).toBeNull()
    expect(out.mail.mailgunApiKeyMask).toBeNull()
  })
})

describe('shared/config/projection — projectCommentsForAdmin', () => {
  const baseComments: CommentsSettings = {
    comments: {
      size: 10,
      avatar: { mirror: 'https://gravatar.com/avatar/', sources: ['qq', 'github', 'gravatar'] },
      githubToken: 'ghp-secret-99zz',
      tokenTtlSeconds: 1800,
    },
  }

  it('forwards every non-secret field, including the source order', () => {
    const out = projectCommentsForAdmin(baseComments)
    expect(out.comments.size).toBe(10)
    expect(out.comments.avatar.mirror).toBe('https://gravatar.com/avatar/')
    expect(out.comments.avatar.sources).toEqual(['qq', 'github', 'gravatar'])
    expect(out.comments.tokenTtlSeconds).toBe(1800)
  })

  it('swaps the githubToken for the passed mask and never leaks the raw value', () => {
    const out = projectCommentsForAdmin(baseComments, '••••mask')
    expect(out.comments.githubTokenMask).toBe('••••mask')
    expect(JSON.stringify(out)).not.toContain('ghp-secret-99zz')
    expect('githubToken' in out.comments).toBe(false)
  })

  it('falls back to the last 4 chars of the raw token, or null when unset', () => {
    expect(projectCommentsForAdmin(baseComments).comments.githubTokenMask).toBe('99zz')
    const out = projectCommentsForAdmin({
      comments: { ...baseComments.comments, githubToken: undefined },
    })
    expect(out.comments.githubTokenMask).toBeNull()
  })
})
