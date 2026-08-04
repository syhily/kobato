import { Link, Text } from '@kobato/server/infra/email/render'
import { EmailLayout } from '@kobato/server/infra/email/templates/layout/EmailLayout'
import { light } from '@kobato/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'

interface Props {
  receiver: string
  inviter: string
  link: string
}

export function AuthorInvite({ receiver, inviter, link }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')

  return (
    <EmailLayout receiver={receiver} preview={`${inviter} 邀请你成为《${siteIdentity.title}》的作者`}>
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
        {inviter} 邀请你成为站点作者
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
          你将获得作者权限，可以发布和管理文章。请点击下方按钮接受邀请（7 天内有效）。
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
          接受邀请
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
        如果你并未收到此邀请，请忽略此邮件。
      </Text>
    </EmailLayout>
  )
}

export default AuthorInvite
