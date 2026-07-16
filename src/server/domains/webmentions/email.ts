import type { WebmentionRow } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'

import { renderEmail, sendEmail } from '@/server/infra/email/sender'
import NewWebmention from '@/server/infra/email/templates/NewWebmention'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Sent to the administrator when a webmention passes verification and
// lands in the pending queue. Fire-and-forget from the receive service
// (same shape as `sendNewComment`): a mail-pipeline hiccup must never
// fail the mention itself.
export async function sendNewWebmention(
  mention: WebmentionRow,
  target: { title: string; canonicalUrl: string },
): Promise<SendResult> {
  const html = renderEmail(
    NewWebmention({
      postTitle: target.title,
      postLink: target.canonicalUrl,
      sourceUrl: mention.sourceUrl,
      sourceTitle: mention.title,
      authorName: mention.authorName,
      summary: mention.summary,
    }),
  )
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  return sendEmail(siteIdentity.author.email, `您的网站【${siteIdentity.title}】收到了新的 Webmention`, html)
}
