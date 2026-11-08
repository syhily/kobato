import type { ServerTranslator } from '@/server/infra/i18n'

import { Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  t: ServerTranslator
  receiver: string
  otpCode: string
  expiresMinutes: number
}

export function SignInOtp({ t, receiver, otpCode, expiresMinutes }: Props) {
  return (
    <EmailLayout t={t} receiver={receiver} preview={t.format('email.signInOtp.preview', { otpCode, expiresMinutes })}>
      <Text
        style={{
          fontSize: 16,
          color: light.textSecondary,
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}
        className="dark-text-secondary"
      >
        {t.format('email.signInOtp.body')}
      </Text>

      <div
        style={{
          fontSize: 32,
          fontWeight: 'bold',
          color: light.accentColor,
          letterSpacing: '4px',
          textAlign: 'center',
          padding: '16px 20px',
          backgroundColor: light.cardBg,
          borderRadius: 8,
          margin: '20px 0',
        }}
        className="dark-card dark-cta-text"
      >
        {otpCode}
      </div>

      <Text
        style={{
          fontSize: 13,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '15px 0 0',
        }}
        className="dark-text-muted"
      >
        {t.format('email.signInOtp.note', { expiresMinutes })}
      </Text>
    </EmailLayout>
  )
}

export default SignInOtp
