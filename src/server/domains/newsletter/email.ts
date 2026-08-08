import { createElement } from 'react'

import type { SendResult } from '@/server/infra/email/types'

import { render } from '@/server/infra/email/render'
import { sendEmail } from '@/server/infra/email/sender'
import ConfirmSubscription from '@/server/infra/email/templates/ConfirmSubscription'
import { requireBlogSettingsSection } from '@/shared/config/getters'

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
