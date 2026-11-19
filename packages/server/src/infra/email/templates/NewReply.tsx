import type { ServerTranslator } from '@kobato/server/infra/i18n.ts'

import { Hr, Link, Text } from '@kobato/server/infra/email/render.tsx'
import { RawEmailHtml } from '@kobato/server/infra/email/safe-html.tsx'
import { EmailLayout } from '@kobato/server/infra/email/templates/layout/EmailLayout.tsx'
import { light } from '@kobato/server/infra/email/templates/styles/tokens.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

interface Props {
  t: ServerTranslator
  receiver: string
  postTitle: string
  postLink: string
  sourceContent: string
  replyContent: string
  replyLink: string
}

export function NewReply({ t, receiver, postTitle, postLink, sourceContent, replyContent, replyLink }: Props) {
  const resetPasswordLink = `${requireBlogSettingsSection('siteIdentity').website}/admin/signin?action=lostpassword`

  return (
    <EmailLayout t={t} receiver={receiver} preview={t.format('email.newReply.preview', { postTitle })}>
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
        {t.format('email.newReply.title')}
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
        {t.format('email.newReply.contextPrefix')}
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
        {t.format('email.newReply.contextSuffix')}
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: light.textSecondary,
          lineHeight: 1.5,
          margin: '8px 0 6px',
        }}
        className="dark-text-secondary"
      >
        {t.format('email.newReply.sourceLabel')}
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
        <RawEmailHtml
          html={sourceContent}
          className="dark-text-secondary"
          style={{
            fontSize: 16,
            color: light.textSecondary,
            lineHeight: 1.7,
            margin: 0,
          }}
        />
      </div>

      <Text
        style={{
          fontSize: 14,
          color: light.textSecondary,
          lineHeight: 1.5,
          margin: '8px 0 6px',
        }}
        className="dark-text-secondary"
      >
        {t.format('email.newReply.replyLabel')}
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
          html={replyContent}
          className="dark-text-secondary"
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
          href={replyLink}
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
          {t.format('email.newReply.cta')}
        </Link>
      </div>

      <Hr className="dark-border" />

      <Text
        style={{
          fontSize: 16,
          color: light.textMuted,
          lineHeight: 1.5,
          margin: '0 0 10px',
        }}
        className="dark-text-muted"
      >
        {t.format('email.common.commentHistoryNote')}
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

export default NewReply
