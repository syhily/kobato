import type { SendResult } from '@kobato/server/infra/email/types'
import type { Logger } from '@kobato/server/infra/logger'
import type { ReactElement } from 'react'

import { render } from '@kobato/server/infra/email/render'
import { sendEmail } from '@kobato/server/infra/email/sender'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'

// Single seam for every notification that goes to the site administrator
// (new comment, webmention, friend application, …). The recipient is
// always the site author and the subject always carries the
// `您的网站【title】` prefix — callers pass only the suffix
// (e.g. `有了新评论`) and the rendered layout element.
export async function sendAdminNotification({
  subject,
  element,
}: {
  /** Subject suffix appended to `您的网站【title】`. */
  subject: string
  element: ReactElement
}): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = render(element)
  return sendEmail(siteIdentity.author.email, `您的网站【${siteIdentity.title}】${subject}`, html)
}

// Admin notifications are fire-and-forget: a mail-pipeline hiccup must
// never fail the action that triggered the notification (the pending
// row / comment is the durable record). `what` is the static log
// fragment, e.g. `new comment` → `failed to send new comment email`.
export function fireAndForgetNotify(promise: Promise<SendResult>, log: Logger, what: string): void {
  void promise.catch((error) => {
    log.error(`failed to send ${what} email`, { error })
  })
}
