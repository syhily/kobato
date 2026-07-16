import { createElement } from 'react'

import type { FriendRow } from '@/server/infra/db/types'
import type { SendResult } from '@/server/infra/email/types'

import { renderEmail, sendEmail } from '@/server/infra/email/sender'
import NewFriendApplication from '@/server/infra/email/templates/NewFriendApplication'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Sent to the administrator when a visitor submits a friend-link
// application. Fire-and-forget from the apply service (same shape as
// `sendNewComment`): a mail-pipeline hiccup must never fail the
// application — the pending row is the durable record.
export async function sendNewFriendApplication(friend: FriendRow): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = renderEmail(
    createElement(NewFriendApplication, {
      website: friend.website,
      homepage: friend.homepage,
      description: friend.description,
      rssUrl: friend.rssUrl,
      reviewLink: `${siteIdentity.website}/admin/taxonomy/friends`,
    }),
  )
  return sendEmail(siteIdentity.author.email, `您的网站【${siteIdentity.title}】收到了新的友链申请`, html)
}
