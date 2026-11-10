import type { ReactElement } from 'react'

import type { SendResult } from '@/server/infra/email/types'
import type { Logger } from '@/server/infra/logger'

import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import { emailTranslator } from '@/server/infra/email/translator'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Single seam for admin notifications (new comment, webmention, …): recipient
// is always the site author, subject is `{siteTitle}: {subject}` (localized via
// `email.adminNotification.subject`).
export async function sendAdminNotification({
  subject,
  element,
}: {
  subject: string
  element: ReactElement
}): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = render(element)
  const t = emailTranslator()
  return sendEmail(
    siteIdentity.author.email,
    t.format('email.adminNotification.subject', { siteTitle: siteIdentity.title, subject }),
    html,
  )
}

// Fire-and-forget: a mail hiccup must never fail the triggering action.
// `what` names the notification kind (`new comment` → context `kind`); the
// message stays static so the outbound log projection keeps it.
export function fireAndForgetNotify(promise: Promise<unknown>, log: Logger, what: string): void {
  void promise.catch((error) => {
    log.error('Failed to send admin notification email', { kind: what, error })
  })
}
