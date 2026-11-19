import { adminMailSendTestInput, adminMailSendTestOutputDto } from '@kobato/contracts/mail.ts'
import { oc } from '@orpc/contract'

export const adminMailContract = {
  sendTest: oc
    .route({ method: 'POST', path: '/admin/mail/send-test' })
    .input(adminMailSendTestInput)
    .output(adminMailSendTestOutputDto),
}
