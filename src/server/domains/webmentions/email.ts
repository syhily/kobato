import { createElement } from 'react'

import type { WebmentionRow } from '@/server/infra/db/types'
import type { AdminNotificationRow } from '@/server/infra/email/templates/AdminNotificationEmail'
import type { SendResult } from '@/server/infra/email/types'

import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'

// Sent to the administrator when a webmention passes verification and
// lands in the pending queue. Fire-and-forget from the receive service
// (same shape as `sendNewComment`): a mail-pipeline hiccup must never
// fail the mention itself. `updated` marks the demote case (an approved
// mention whose source content changed and now waits for re-review) so
// the admin can tell a fresh mention apart from an update re-review.
export async function sendNewWebmention(
  mention: WebmentionRow,
  target: { title: string; canonicalUrl: string },
  options?: { updated?: boolean },
): Promise<SendResult> {
  const updated = options?.updated === true
  const rows: AdminNotificationRow[] = [
    { label: '来源：', value: mention.title ?? mention.sourceUrl },
    ...(mention.authorName !== null ? [{ label: '作者：', value: mention.authorName }] : []),
    ...(mention.summary !== null ? [{ value: mention.summary }] : []),
  ]
  return sendAdminNotification({
    subject: updated ? 'Webmention 内容已更新，等待重新审核' : '收到了新的 Webmention',
    element: createElement(AdminNotificationEmail, {
      preview: updated
        ? `《${target.title}》的一条 Webmention 内容已更新`
        : `《${target.title}》收到一条新的 Webmention`,
      title: updated ? 'Webmention 已更新' : '新 Webmention',
      contextLine: { label: '目标文章：', link: { text: target.title, href: target.canonicalUrl } },
      mutedNote: updated ? '该提及的内容已更新，已通过来源校验，等待重新审核' : '该提及已通过来源校验，等待审核',
      rows,
      cta: { label: '查看来源', href: mention.sourceUrl },
    }),
  })
}
