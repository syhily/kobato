import { TZDate } from '@date-fns/tz'
import { getYear } from 'date-fns'
import { useState } from 'react'

import type { RichTextTag, ServerTranslator } from '@/server/infra/i18n'

import { Body, Container, Html, Link, Section, Text } from '@/server/infra/email/render'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  /** Explicit site-locale translator (see `emailTranslator`). */
  t: ServerTranslator
  receiver: string
  preview?: string
  children: React.ReactNode
}

interface FooterSiteLinkProps {
  href: string
  children: React.ReactNode
}

/** Footer copyright link: only the site name is linked; the © year stays plain text. */
function FooterSiteLink({ href, children }: FooterSiteLinkProps) {
  return (
    <Link
      href={href}
      style={{
        color: light.textMuted,
        textDecoration: 'underline',
        fontSize: 11,
      }}
      className="dark-text-muted"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </Link>
  )
}

/** Bind the site URL into the ICU `<siteLink>` tag renderer. */
function siteLinkRenderer(href: string): RichTextTag {
  return (chunks) => <FooterSiteLink href={href}>{chunks}</FooterSiteLink>
}

export function EmailLayout({ t, receiver, preview, children }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const [year] = useState(() => getYear(new TZDate(Date.now(), siteIdentity.timeZone)))

  const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

  return (
    <Html lang={t.locale}>
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

          {/* Brand masthead */}
          <Section
            style={{
              textAlign: 'center',
              paddingTop: 8,
              paddingBottom: 28,
              marginBottom: 40,
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: light.borderColor,
            }}
            className="dark-border"
          >
            <Link
              href={siteIdentity.website}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                fontSize: 28,
                fontWeight: 'bold',
                color: light.accentColor,
                textDecoration: 'none',
                letterSpacing: '0.04em',
              }}
              className="dark-cta-text"
            >
              {siteIdentity.title}
            </Link>
          </Section>

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
              {t.format('email.common.greeting', { receiver })}
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
              {t.format('email.common.automaticNotice')}
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
              {t.formatRich('email.common.copyright', {
                siteTitle: siteIdentity.title,
                year,
                siteLink: siteLinkRenderer(siteIdentity.website),
              })}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
