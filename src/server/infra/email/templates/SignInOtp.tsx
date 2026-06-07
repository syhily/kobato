import { Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  receiver: string
  otpCode: string
  expiresMinutes: number
}

export function SignInOtp({ receiver, otpCode, expiresMinutes }: Props) {
  return (
    <EmailLayout receiver={receiver} preview={`你的登录验证码是 ${otpCode}，${expiresMinutes} 分钟内有效`}>
      <Text
        style={{
          fontSize: 16,
          color: light.textSecondary,
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}
        className="dark-text-secondary"
      >
        你正在尝试登录后台管理，请输入以下验证码完成登录：
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
        验证码 {expiresMinutes} 分钟内有效，请勿将验证码告知他人。如非本人操作，请忽略此邮件。
      </Text>
    </EmailLayout>
  )
}

export default SignInOtp
