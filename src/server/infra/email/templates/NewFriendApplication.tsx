import { Hr, Link, Text } from '@/server/infra/email/render'
import { EmailLayout } from '@/server/infra/email/templates/layout/EmailLayout'
import { light } from '@/server/infra/email/templates/styles/tokens'
import { requireBlogSettingsSection } from '@/shared/config/getters'

interface Props {
  website: string
  homepage: string
  description: string | null
  rssUrl: string | null
  reviewLink: string
}

export function NewFriendApplication({ website, homepage, description, rssUrl, reviewLink }: Props) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return (
    <EmailLayout receiver={siteIdentity.author.name} preview={`「${website}」申请交换友链`}>
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
        新友链申请
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
        该申请等待审核，通过后才会在公共页面展示
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
          站名：{website}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: light.textMuted,
            lineHeight: 1.5,
            margin: '0 0 8px',
          }}
          className="dark-text-muted"
        >
          主页：{homepage}
        </Text>
        {description !== null && (
          <Text
            style={{
              fontSize: 14,
              color: light.textMuted,
              lineHeight: 1.5,
              margin: '0 0 8px',
            }}
            className="dark-text-muted"
          >
            简介：{description}
          </Text>
        )}
        {rssUrl !== null && (
          <Text
            style={{
              fontSize: 14,
              color: light.textMuted,
              lineHeight: 1.5,
              margin: 0,
            }}
            className="dark-text-muted"
          >
            RSS：{rssUrl}
          </Text>
        )}
      </div>

      <Hr />

      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Link
          href={reviewLink}
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
          前往审核
        </Link>
      </div>
    </EmailLayout>
  )
}

export default NewFriendApplication
