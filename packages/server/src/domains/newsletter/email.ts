import type { SendResult } from '@kobato/server/infra/email/types'

import { render } from '@kobato/server/infra/email/render'
import { sendEmail } from '@kobato/server/infra/email/sender'
import ConfirmSubscription from '@kobato/server/infra/email/templates/ConfirmSubscription'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { createElement } from 'react'

// The only mail a `pending` subscriber ever receives. `fromName` /
// `subjectPrefix` fall back to the site title when the newsletter
// section leaves them blank, so the email is always identifiable.
export async function sendConfirmSubscription(
  email: string,
  confirmLink: string,
  expiresHours: number,
): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const { newsletter } = requireBlogSettingsSection('newsletter')
  const fromName = newsletter.fromName.trim() !== '' ? newsletter.fromName : siteIdentity.title
  const subjectPrefix = newsletter.subjectPrefix.trim() !== '' ? newsletter.subjectPrefix : siteIdentity.title
  const html = render(
    createElement(ConfirmSubscription, {
      receiver: email,
      fromName,
      confirmLink,
      expiresHours,
    }),
  )
  return sendEmail(email, `【${subjectPrefix}】请确认你的邮件订阅`, html)
}
