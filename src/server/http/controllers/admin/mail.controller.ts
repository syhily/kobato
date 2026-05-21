import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { adminProc } from '@/server/http/orpc-base'
import { sendTestMail } from '@/server/infra/email/sender'

const sendTest = adminProc
  .route({ method: 'POST', path: '/admin/mail/send-test' })
  .input(z.object({ to: z.email() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const result = await sendTestMail(input.to)
    if (!result.ok) {
      if (result.reason === 'unconfigured') {
        throw new ORPCError('BAD_REQUEST', { message: result.message })
      }
      if (result.reason === 'upstream') {
        throw new ORPCError('BAD_GATEWAY', { message: result.message })
      }
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: result.message })
    }
    recordAuditEventFromContext(context, {
      action: 'test_mail_sent',
      resourceType: 'mail',
      details: { email: input.to },
    })
    return { success: true }
  })

export const adminMailRouter = { sendTest }
