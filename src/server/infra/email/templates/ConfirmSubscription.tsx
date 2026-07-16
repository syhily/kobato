import { Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'

interface Props {
  receiver: string
  fromName: string
  confirmLink: string
  expiresHours: number
}

export function ConfirmSubscription({ receiver, fromName, confirmLink, expiresHours }: Props) {
  return (
    <EmailLayout receiver={receiver} preview={`确认订阅来自「${fromName}」的邮件更新`}>
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
        确认你的订阅
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
        你请求订阅「{fromName}」的邮件更新，请点击下方按钮确认订阅（{expiresHours} 小时内有效）：
      </Text>

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={confirmLink}
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
          确认订阅
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
        {confirmLink}
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
        如果你并未请求订阅，请忽略此邮件 —— 未确认前你不会收到任何更新。
      </Text>
    </EmailLayout>
  )
}

export default ConfirmSubscription
