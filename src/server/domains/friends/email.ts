import { createElement } from 'react'

import type { FriendRow } from '@/server/infra/db/types'
import type { AdminNotificationRow } from '@/server/infra/email/templates/AdminNotificationEmail'
import type { SendResult } from '@/server/infra/email/types'

import { sendAdminNotification } from '@/server/infra/email/admin-notification'
import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Sent to the administrator when a visitor submits a friend-link
// application. Fire-and-forget from the apply service: a mail-pipeline
// hiccup must never fail the application — the pending row is the
// durable record.
export async function sendNewFriendApplication(friend: FriendRow): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const rows: AdminNotificationRow[] = [
    { label: '站名：', value: friend.website },
    { label: '主页：', value: friend.homepage },
    ...(friend.description !== null ? [{ label: '简介：', value: friend.description }] : []),
    ...(friend.rssUrl !== null ? [{ label: 'RSS：', value: friend.rssUrl }] : []),
  ]
  return sendAdminNotification({
    subject: '收到了新的友链申请',
    element: createElement(AdminNotificationEmail, {
      preview: `「${friend.website}」申请交换友链`,
      title: '新友链申请',
      mutedNote: '该申请等待审核，通过后才会在公共页面展示',
      rows,
      cta: { label: '前往审核', href: `${siteIdentity.website}/admin/taxonomy/friends` },
    }),
  })
}
