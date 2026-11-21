import type { SendResult } from '@kobato/server/infra/email/types'

import { render } from '@kobato/server/infra/email/render'
import { sendEmail } from '@kobato/server/infra/email/sender'
import ConfirmSubscription from '@kobato/server/infra/email/templates/ConfirmSubscription'
import { emailTranslator } from '@kobato/server/infra/email/translator'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { createElement } from 'react'

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
