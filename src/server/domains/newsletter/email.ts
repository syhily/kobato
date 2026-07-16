import { createElement } from 'react'

import type { SendResult } from '@/server/infra/email/types'

import { renderEmail, sendEmail } from '@/server/infra/email/sender'
import ConfirmSubscription from '@/server/infra/email/templates/ConfirmSubscription'
import { requireBlogSettingsSection } from '@/shared/config/getters'

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
  const html = renderEmail(
    createElement(ConfirmSubscription, {
      receiver: email,
      fromName,
      confirmLink,
      expiresHours,
    }),
  )
  return sendEmail(email, `【${subjectPrefix}】请确认你的邮件订阅`, html)
}
