import { TZDate } from '@date-fns/tz'
import { getYear } from 'date-fns'

import { Body, Container, Html, Img, Link, Section, Text } from '@/server/infra/email/render'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  receiver: string
  preview?: string
  children: React.ReactNode
}

export function EmailLayout({ receiver, preview, children }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const year = getYear(new TZDate(Date.now(), siteIdentity.timeZone))

  // Optional site icon: use apple-touch-icon when a custom one is uploaded.
  let siteIconUrl: string | undefined
  try {
    const assets = requireBlogSettingsSection('assets')
    const branding = assets.branding
    const hasCustomIcon = branding?.appleTouchIcon?.etag || branding?.faviconIco?.etag
    if (hasCustomIcon) {
      const base = siteIdentity.website.replace(/\/$/, '')
      siteIconUrl = `${base}/apple-touch-icon.png`
    }
  } catch {
    // skip icon when assets section is unavailable
  }

  const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

  return (
    <Html lang={siteIdentity.locale}>
      <Body
        style={{
          margin: 0,
          padding: 0,
          fontFamily,
          backgroundColor: light.bodyBg,
        }}
        className="dark-bg"
      >
        <Container style={{ padding: '30px 20px' }}>
          {/* Preheader — shown in inbox preview */}
          {preview && (
            <div
              style={{
                display: 'none',
                maxHeight: 0,
                overflow: 'hidden',
                ...({ msoHide: 'all' } as Record<string, unknown>),
              }}
            >
              {preview}
            </div>
          )}

          {/* Optional site icon */}
          {siteIconUrl && (
            <Section style={{ textAlign: 'center', marginBottom: 56 }}>
              <Img
                src={siteIconUrl}
                alt={siteIdentity.title}
                width={48}
                height={48}
                style={{ borderRadius: '999px', display: 'inline-block' }}
              />
            </Section>
          )}

          {/* Greeting */}
          <Section>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: light.textPrimary,
                lineHeight: 1.25,
                margin: '0 0 15px',
              }}
              className="dark-text-primary"
            >
              你好，{receiver}
            </Text>
          </Section>

          {/* Main content */}
          <Section>{children}</Section>

          {/* Footer */}
          <Section style={{ paddingTop: 80 }}>
            <Text
              style={{
                fontSize: 11,
                lineHeight: '18px',
                color: light.textMuted,
                margin: '0 0 2px',
              }}
              className="dark-text-muted"
            >
              本邮件为系统自动发出，无法回复。
            </Text>
            <Text
              style={{
                fontSize: 11,
                lineHeight: '18px',
                color: light.textMuted,
                margin: 0,
              }}
              className="dark-text-muted"
            >
              <Link
                href={siteIdentity.website}
                style={{
                  color: light.textMuted,
                  textDecoration: 'underline',
                  fontSize: 11,
                }}
                className="dark-text-muted"
                target="_blank"
                rel="noreferrer"
              >
                {siteIdentity.title}
              </Link>{' '}
              © {year}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
