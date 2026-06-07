import { Hr, Link, Text } from '@/server/infra/email/render'
import { RawEmailHtml } from '@/server/infra/email/safe-html'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  postTitle: string
  postLink: string
  commentNeedApproval: boolean
  commentContent: string
  commentLink: string
}

export function NewComment({ postTitle, postLink, commentNeedApproval, commentContent, commentLink }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout receiver={siteIdentity.author.name} preview={`在《${postTitle}》中有一条新留言`}>
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
        新留言
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
        留言文章：
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
      </Text>

      {commentNeedApproval && (
        <Text
          style={{
            fontSize: 16,
            color: light.textMuted,
            lineHeight: 1.5,
            margin: '0 0 16px',
          }}
          className="dark-text-muted"
        >
          该留言需要审核
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

      <Hr />

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
    </EmailLayout>
  )
}

export default NewComment
