import { createElement } from 'react'

import type { FriendRow } from '@/server/infra/db/types'
import type { AdminNotificationRow } from '@/server/infra/email/templates/AdminNotificationEmail'
import type { SendResult } from '@/server/infra/email/types'

import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { emailTranslator } from '@/server/infra/email/translator'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Sent to the administrator on a friend-link application. Fire-and-forget —
// a mail-pipeline hiccup must never fail the application.
export async function sendNewFriendApplication(friend: FriendRow): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const rows: AdminNotificationRow[] = [
    { label: t.format('email.friendApplication.rowWebsite'), value: friend.website },
    { label: t.format('email.friendApplication.rowHomepage'), value: friend.homepage },
    ...(friend.description !== null
      ? [{ label: t.format('email.friendApplication.rowDescription'), value: friend.description }]
      : []),
    ...(friend.rssUrl !== null ? [{ label: t.format('email.friendApplication.rowRss'), value: friend.rssUrl }] : []),
  ]
  return sendAdminNotification({
    subject: t.format('email.friendApplication.subjectSuffix'),
    element: createElement(AdminNotificationEmail, {
      t,
      preview: t.format('email.friendApplication.preview', { website: friend.website }),
      title: t.format('email.friendApplication.title'),
      mutedNote: t.format('email.friendApplication.mutedNote'),
      rows,
      cta: { label: t.format('email.friendApplication.cta'), href: `${siteIdentity.website}/admin/taxonomy/friends` },
    }),
  })
}
