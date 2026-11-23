import { adminMailSendTestInput, adminMailSendTestOutputDto } from '@kobato/api/contracts/admin/mail'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminMailContract = {
  sendTest: defineProcedure({ method: 'POST', path: '/admin/mail/send-test' })
    .input(adminMailSendTestInput)
    .output(adminMailSendTestOutputDto),
}
