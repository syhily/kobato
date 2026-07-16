import { Hr, Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  postTitle: string
  postLink: string
  postSummary?: string
  unsubscribeLink: string
}

export function NewPostNotification({ postTitle, postLink, postSummary, unsubscribeLink }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout receiver={siteIdentity.author.name} preview={`新文章：${postTitle}`}>
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
        新文章发布
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

      {postSummary && (
        <div
          style={{
            backgroundColor: light.cardBgAlt,
            borderRadius: 8,
            padding: '16px 20px',
            marginBottom: 16,
          }}
          className="dark-card-alt"
        >
          <Text
            style={{
              fontSize: 16,
              color: light.textSecondary,
              lineHeight: 1.7,
              margin: 0,
            }}
            className="dark-text-secondary"
          >
            {postSummary}
          </Text>
        </div>
      )}

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={postLink}
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
          阅读全文
        </Link>
      </div>

      <Hr />

      <Text
        style={{
          fontSize: 13,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: 0,
        }}
        className="dark-text-muted"
      >
        你收到这封邮件是因为订阅了「{siteIdentity.title}」的更新。{' '}
        <Link
          href={unsubscribeLink}
          target="_blank"
          rel="noreferrer"
          style={{
            color: light.textMuted,
            textDecoration: 'underline',
            fontSize: 13,
          }}
          className="dark-text-muted"
        >
          退订
        </Link>
      </Text>
    </EmailLayout>
  )
}

export default NewPostNotification
