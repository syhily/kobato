import type { SendResult } from '@kobato/server/infra/email/types.ts'
import type { Logger } from '@kobato/server/infra/logger.ts'
import type { ReactElement } from 'react'

import { render } from '@kobato/server/infra/email/render.tsx'
import { sendEmail } from '@kobato/server/infra/email/sender.ts'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

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
