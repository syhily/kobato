import { Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  receiver: string
  link: string
  expiresMinutes: number
}

export function SignInLink({ receiver, link, expiresMinutes }: Props) {
  return (
    <EmailLayout receiver={receiver} preview={`你请求登录账号，链接 ${expiresMinutes} 分钟内有效`}>
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
        登录你的账号
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
        你请求登录账号，请点击下方按钮完成登录（{expiresMinutes} 分钟内有效，仅可使用一次）：
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
          登录
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
        如果你并未请求登录，请忽略此邮件。
      </Text>
    </EmailLayout>
  )
}

export default SignInLink
