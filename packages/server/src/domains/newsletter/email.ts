import type { SendResult } from '@kobato/server/infra/email/types.ts'

import { render } from '@kobato/server/infra/email/render.tsx'
import { sendEmail } from '@kobato/server/infra/email/sender.ts'
import ConfirmSubscription from '@kobato/server/infra/email/templates/ConfirmSubscription.tsx'
import { emailTranslator } from '@kobato/server/infra/email/translator.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { createElement } from 'react'

// The only mail a `pending` subscriber ever receives.
export async function sendConfirmSubscription(
  email: string,
  confirmLink: string,
  expiresHours: number,
): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const { newsletter } = requireBlogSettingsSection('newsletter')
  const fromName = newsletter.fromName.trim() !== '' ? newsletter.fromName : siteIdentity.title
  const subjectPrefix = newsletter.subjectPrefix.trim() !== '' ? newsletter.subjectPrefix : siteIdentity.title
  const t = emailTranslator()
  const html = render(
    createElement(ConfirmSubscription, {
      t,
      receiver: email,
      fromName,
      confirmLink,
      expiresHours,
    }),
  )
  return sendEmail(email, t.format('email.newsletterConfirm.subject', { subjectPrefix }), html)
}
