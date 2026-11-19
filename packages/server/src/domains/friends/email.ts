import type { FriendRow } from '@kobato/db/types.ts'
import type { AdminNotificationRow } from '@kobato/server/infra/email/templates/AdminNotificationEmail.tsx'
import type { SendResult } from '@kobato/server/infra/email/types.ts'

import { sendAdminNotification } from '@kobato/server/infra/email/admin-notification.ts'
import { AdminNotificationEmail } from '@kobato/server/infra/email/templates/AdminNotificationEmail.tsx'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { createElement } from 'react'

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
