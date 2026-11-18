import { adminMailSendTestInput, adminMailSendTestOutputDto } from '@kobato/contracts/mail.ts'
import { oc } from '@orpc/contract'

// Admin mail RPC contract — admin base on the server.
export const adminMailContract = {
  sendTest: oc
    .route({ method: 'POST', path: '/admin/mail/send-test' })
    .input(adminMailSendTestInput)
    .output(adminMailSendTestOutputDto),
}
