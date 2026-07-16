import { Hr, Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  postTitle: string
  postLink: string
  sourceUrl: string
  sourceTitle: string | null
  authorName: string | null
  summary: string | null
}

export function NewWebmention({ postTitle, postLink, sourceUrl, sourceTitle, authorName, summary }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout receiver={siteIdentity.author.name} preview={`《${postTitle}》收到一条新的 Webmention`}>
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
        新 Webmention
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
        目标文章：
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

      <Text
        style={{
          fontSize: 16,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}
        className="dark-text-muted"
      >
        该提及已通过来源校验，等待审核
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
        <Text
          style={{
            fontSize: 16,
            color: light.textSecondary,
            lineHeight: 1.7,
            margin: '0 0 8px',
          }}
          className="dark-text-secondary"
        >
          来源：{sourceTitle ?? sourceUrl}
        </Text>
        {authorName !== null && (
          <Text
            style={{
              fontSize: 14,
              color: light.textMuted,
              lineHeight: 1.5,
              margin: '0 0 8px',
            }}
            className="dark-text-muted"
          >
            作者：{authorName}
          </Text>
        )}
        {summary !== null && (
          <Text
            style={{
              fontSize: 14,
              color: light.textMuted,
              lineHeight: 1.5,
              margin: 0,
            }}
            className="dark-text-muted"
          >
            {summary}
          </Text>
        )}
      </div>

      <Hr />

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={sourceUrl}
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
          查看来源
        </Link>
      </div>
    </EmailLayout>
  )
}

export default NewWebmention
