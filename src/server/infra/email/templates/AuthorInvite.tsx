import type { ServerTranslator } from '@/server/infra/i18n'

import { Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  t: ServerTranslator
  receiver: string
  inviter: string
  link: string
}

export function AuthorInvite({ t, receiver, inviter, link }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')

  return (
    <EmailLayout
      t={t}
      receiver={receiver}
      preview={t.format('email.authorInvite.preview', { inviter, siteTitle: siteIdentity.title })}
    >
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
        {t.format('email.authorInvite.title', { inviter })}
      </Text>

      <div
        style={{
          backgroundColor: light.cardBg,
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
        }}
        className="dark-card"
      >
        <Text
          style={{
            fontSize: 16,
            color: light.textSecondary,
            lineHeight: 1.5,
            margin: 0,
          }}
          className="dark-text-secondary"
        >
          {t.format('email.authorInvite.body')}
        </Text>
      </div>

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={link}
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
          {t.format('email.authorInvite.cta')}
        </Link>
      </div>

      <Text
        style={{
          fontSize: 13,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '10px 0 0',
          wordBreak: 'break-all',
        }}
        className="dark-text-muted"
      >
        {link}
      </Text>

      <Text
        style={{
          fontSize: 16,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '15px 0 0',
        }}
        className="dark-text-muted"
      >
        {t.format('email.authorInvite.ignore')}
      </Text>
    </EmailLayout>
  )
}

export default AuthorInvite
