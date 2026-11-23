import { adminBrandingClearInput, adminBrandingClearOutputDto } from '@kobato/api/contracts/admin/branding'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminBrandingContract = {
  clear: defineProcedure({ method: 'POST', path: '/admin/branding/clear' })
    .input(adminBrandingClearInput)
    .output(adminBrandingClearOutputDto),
}
