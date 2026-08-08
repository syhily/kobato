import { Hr, Link, Text } from '@/server/infra/email/render'
import { RawEmailHtml } from '@/server/infra/email/safe-html'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  receiver: string
  postTitle: string
  postLink: string
  commentContent: string
  commentLink: string
}

export function ApprovedComment({ receiver, postTitle, postLink, commentContent, commentLink }: Props) {
  // Anonymous commenters claim their account via the lostpassword reset; built off `siteIdentity.website` to stay in sync.
  const resetPasswordLink = `${requireBlogSettingsSection('siteIdentity').website}/admin/signin?action=lostpassword`

  return (
    <EmailLayout receiver={receiver} preview={`你在《${postTitle}》中的留言已通过审核`}>
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
        你的留言已通过审核
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
        你在《
        <Link
          href={postLink}
          style={{
            color: light.textPrimary,
            textDecoration: 'underline',
            fontWeight: 'bold',
          }}
          className="dark-text-primary"
        >
          {postTitle}
        </Link>
        》中的留言，已经通过审核
      </Text>

      <div
        style={{
          backgroundColor: light.cardBgAlt,
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 16,
        }}
        className="dark-card-alt"
      >
        <RawEmailHtml
          html={commentContent}
          style={{
            fontSize: 16,
            color: light.textSecondary,
            lineHeight: 1.7,
            margin: 0,
          }}
        />
      </div>

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={commentLink}
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
          查看留言
        </Link>
      </div>

      <Hr />

      <Text
        style={{
          fontSize: 16,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '0 0 10px',
        }}
        className="dark-text-muted"
      >
        想要查看与管理你的所有历史评论？通过此链接重置密码登录即可：
      </Text>
      <Link
        href={resetPasswordLink}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 15,
          color: light.textSecondary,
          textDecoration: 'none',
          wordBreak: 'break-all',
        }}
        className="dark-text-secondary"
      >
        {resetPasswordLink}
      </Link>
    </EmailLayout>
  )
}

export default ApprovedComment
