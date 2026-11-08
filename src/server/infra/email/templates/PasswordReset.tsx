import type { ServerTranslator } from '@/server/infra/i18n'

import { Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  t: ServerTranslator
  receiver: string
  link: string
}

export function PasswordReset({ t, receiver, link }: Props) {
  return (
    <EmailLayout t={t} receiver={receiver} preview={t.format('email.passwordReset.preview')}>
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
        {t.format('email.passwordReset.title')}
      </Text>

      <Text
        style={{
          fontSize: 16,
          color: light.textSecondary,
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}
        className="dark-text-secondary"
      >
        {t.format('email.passwordReset.body')}
      </Text>

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
          {t.format('email.passwordReset.cta')}
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
        {t.format('email.passwordReset.ignore')}
      </Text>
    </EmailLayout>
  )
}

export default PasswordReset
