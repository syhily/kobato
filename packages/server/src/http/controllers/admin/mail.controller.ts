import { adminMailContract } from '@kobato/api/admin/mail.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'
import { sendTestMail } from '@kobato/server/infra/email/sender.ts'
import { ORPCError } from '@orpc/server'

const impl = implementAdmin(adminMailContract)

const sendTest = impl.sendTest.handler(async ({ input, context }) => {
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

export const adminMailRouter = impl.router({ sendTest })
