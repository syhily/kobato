import { authFlowOutputSchema } from '@kobato/api/contracts/account/auth'
import {
  BACKUP_FILE_MAX_BYTES,
  setupInstallInput,
  setupRestoreInput,
  setupRestoreOutputSchema,
  setupStatusInput,
  setupStatusOutputSchema,
  setupVerifyTokenInput,
  setupVerifyTokenOutputSchema,
} from '@kobato/api/contracts/account/setup'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const accountSetupContract = {
  status: defineProcedure({ method: 'GET', path: '/setup/status' })
    .input(setupStatusInput)
    .output(setupStatusOutputSchema),
  verifyToken: defineProcedure({ method: 'POST', path: '/setup/verify-token' })
    .input(setupVerifyTokenInput)
    .output(setupVerifyTokenOutputSchema),
  install: defineProcedure({ method: 'POST', path: '/setup/install' })
    .input(setupInstallInput)
    .output(authFlowOutputSchema),
  restore: defineProcedure(
    { method: 'POST', path: '/setup/restore' },
    {
      requestTimeoutMs: 30 * 60_000,
      requestBodyLimit: { maxBytes: BACKUP_FILE_MAX_BYTES, messageKey: 'backup.error.uploadTooLarge' },
      installGateExempt: true,
    },
  )
    .input(setupRestoreInput)
    .output(setupRestoreOutputSchema),
}
