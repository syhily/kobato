import { Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  receiver: string
  link: string
}

export function PasswordReset({ receiver, link }: Props) {
  return (
    <EmailLayout receiver={receiver} preview="你请求重置登录密码，15 分钟内有效">
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
        重置你的密码
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
        你请求重置登录密码，请点击下方按钮重置密码（15 分钟内有效）：
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
          重置密码
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
        如果你并未请求重置密码，请忽略此邮件。
      </Text>
    </EmailLayout>
  )
}

export default PasswordReset
