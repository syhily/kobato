import type { ServerTranslator } from '@kobato/server/infra/i18n.ts'

import { Hr, Link, Text } from '@kobato/server/infra/email/render.tsx'
import { RawEmailHtml } from '@kobato/server/infra/email/safe-html.tsx'
import { EmailLayout } from '@kobato/server/infra/email/templates/layout/EmailLayout.tsx'
import { light } from '@kobato/server/infra/email/templates/styles/tokens.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

// One card line: text rows render `{label}{value}` (first emphasised, rest muted);
// `html` rows carry a pre-sanitised comment body — see `RawEmailHtml`.
export type AdminNotificationRow = { label?: string; value: string } | { html: string }

interface Props {
  t: ServerTranslator
  receiver?: string
  preview: string
  title: string
  contextLine?: { label: string; link: { text: string; href: string } }
  mutedNote?: string
  rows: AdminNotificationRow[]
  cta: { label: string; href: string }
  footerNote?: string
}

// The single layout all admin notification emails render through — a new
// notification type is one data-mapping function, not a new template.
export function AdminNotificationEmail({
  t,
  receiver,
  preview,
  title,
  contextLine,
  mutedNote,
  rows,
  cta,
  footerNote,
}: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout t={t} receiver={receiver ?? siteIdentity.author.name} preview={preview}>
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: light.textPrimary,
          lineHeight: 1.25,
          margin: '0 0 20px',
        }}
        className="dark-text-primary"
      >
        {title}
      </Text>

      {contextLine && (
        <Text
          style={{
            fontSize: 16,
            color: light.textSecondary,
            lineHeight: 1.5,
            margin: '0 0 16px',
          }}
          className="dark-text-secondary"
        >
          {contextLine.label}
          <Link
            href={contextLine.link.href}
            style={{
              color: light.textPrimary,
              textDecoration: 'underline',
              fontWeight: 'bold',
            }}
            className="dark-text-primary"
          >
            {contextLine.link.text}
          </Link>
        </Text>
      )}

      {mutedNote && (
        <Text
          style={{
            fontSize: 16,
            color: light.textMuted,
            lineHeight: 1.5,
            margin: '0 0 16px',
          }}
          className="dark-text-muted"
        >
          {mutedNote}
        </Text>
      )}

      <div
        style={{
          backgroundColor: light.cardBgAlt,
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
        }}
        className="dark-card-alt"
      >
        {rows.map((row, index) => {
          if ('html' in row) {
            return (
              <RawEmailHtml
                key={row.html}
                html={row.html}
                className="dark-text-secondary"
                style={{
                  fontSize: 16,
                  color: light.textSecondary,
                  lineHeight: 1.7,
                  margin: 0,
                }}
              />
            )
          }
          const margin = index === rows.length - 1 ? 0 : '0 0 8px'
          const key = `${row.label ?? ''}${row.value}`
          return index === 0 ? (
            <Text
              key={key}
              style={{
                fontSize: 16,
                color: light.textSecondary,
                lineHeight: 1.7,
                margin,
              }}
              className="dark-text-secondary"
            >
              {row.label}
              {row.value}
            </Text>
          ) : (
            <Text
              key={key}
              style={{
                fontSize: 14,
                color: light.textMuted,
                lineHeight: 1.5,
                margin,
              }}
              className="dark-text-muted"
            >
              {row.label}
              {row.value}
            </Text>
          )
        })}
      </div>

      <Hr className="dark-border" />

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={cta.href}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            padding: '9px 22px 10px',
            backgroundColor: light.ctaBg,
            color: light.ctaText,
            textDecoration: 'none',
            borderRadius: 5,
            fontSize: 16,
          }}
          className="dark-cta"
        >
          {cta.label}
        </Link>
      </div>

      {footerNote && (
        <Text
          style={{
            fontSize: 12,
            color: light.textMuted,
            lineHeight: 1.6,
            margin: '8px 0 0',
          }}
          className="dark-text-muted"
        >
          {footerNote}
        </Text>
      )}
    </EmailLayout>
  )
}

export default AdminNotificationEmail
