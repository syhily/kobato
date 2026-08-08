import type { ReactElement } from 'react'

import type { SendResult } from '@/server/infra/email/types'
import type { Logger } from '@/server/infra/logger'

import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Single seam for admin notifications (new comment, webmention, …): recipient
// is always the site author, subject is `您的网站【title】` + the caller's suffix.
export async function sendAdminNotification({
  subject,
  element,
}: {
  subject: string
  element: ReactElement
}): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = render(element)
  return sendEmail(siteIdentity.author.email, `您的网站【${siteIdentity.title}】${subject}`, html)
}

// Fire-and-forget: a mail hiccup must never fail the triggering action.
// `what` is the static log fragment (`new comment` → `failed to send new comment email`).
export function fireAndForgetNotify(promise: Promise<SendResult>, log: Logger, what: string): void {
  void promise.catch((error) => {
    log.error(`failed to send ${what} email`, { error })
  })
}
