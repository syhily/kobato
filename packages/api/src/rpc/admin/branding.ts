import { adminBrandingClearInput, adminBrandingClearOutputDto } from '@kobato/api/contracts/branding'
import { oc } from '@orpc/contract'

export const adminBrandingContract = {
  clear: oc
    .route({ method: 'POST', path: '/admin/branding/clear' })
    .input(adminBrandingClearInput)
    .output(adminBrandingClearOutputDto),
}
