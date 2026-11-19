import type { SendResult } from '@kobato/server/infra/email/types.ts'
import type { Logger } from '@kobato/server/infra/logger.ts'
import type { ReactElement } from 'react'

import { render } from '@kobato/server/infra/email/render.tsx'
import { sendEmail } from '@kobato/server/infra/email/sender.ts'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'

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

export function fireAndForgetNotify(promise: Promise<unknown>, log: Logger, what: string): void {
  void promise.catch((error) => {
    log.error('Failed to send admin notification email', { kind: what, error })
  })
}
