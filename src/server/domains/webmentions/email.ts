import { createElement } from 'react'

import type { WebmentionRow } from '@/server/infra/db/types'
import type { AdminNotificationRow } from '@/server/infra/email/templates/AdminNotificationEmail'
import type { SendResult } from '@/server/infra/email/types'

import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { emailTranslator } from '@/server/infra/email/translator'

/** Fire-and-forget admin notification when a mention lands in pending; a
 *  mail hiccup must never fail the mention. `updated` marks the demote case. */
export async function sendNewWebmention(
  mention: WebmentionRow,
  target: { title: string; canonicalUrl: string },
  options?: { updated?: boolean },
): Promise<SendResult> {
  const updated = options?.updated === true
  const t = emailTranslator()
  const rows: AdminNotificationRow[] = [
    { label: t.format('email.webmention.rowSource'), value: mention.title ?? mention.sourceUrl },
    ...(mention.authorName !== null
      ? [{ label: t.format('email.webmention.rowAuthor'), value: mention.authorName }]
      : []),
    ...(mention.summary !== null ? [{ value: mention.summary }] : []),
  ]
  return sendAdminNotification({
    subject: t.format(updated ? 'email.webmention.subjectSuffixUpdated' : 'email.webmention.subjectSuffixNew'),
    element: createElement(AdminNotificationEmail, {
      t,
      preview: t.format(updated ? 'email.webmention.previewUpdated' : 'email.webmention.previewNew', {
        title: target.title,
      }),
      title: t.format(updated ? 'email.webmention.titleUpdated' : 'email.webmention.titleNew'),
      contextLine: {
        label: t.format('email.webmention.contextLabel'),
        link: { text: target.title, href: target.canonicalUrl },
      },
      mutedNote: t.format(updated ? 'email.webmention.mutedNoteUpdated' : 'email.webmention.mutedNoteNew'),
      rows,
      cta: { label: t.format('email.webmention.cta'), href: mention.sourceUrl },
    }),
  })
}
