import {
  BRANDING_UPLOAD_MAX_BYTES,
  adminBrandingClearInput,
  adminBrandingClearOutputDto,
  adminBrandingUploadInput,
  adminBrandingUploadOutputDto,
} from '@kobato/api/contracts/admin/branding'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminBrandingContract = {
  clear: defineProcedure({ method: 'POST', path: '/admin/branding/clear' })
    .input(adminBrandingClearInput)
    .output(adminBrandingClearOutputDto),
  upload: defineProcedure(
    { method: 'POST', path: '/admin/branding/upload' },
    { requestBodyLimit: { maxBytes: BRANDING_UPLOAD_MAX_BYTES, messageKey: 'common.error.uploadTooLarge' } },
  )
    .input(adminBrandingUploadInput)
    .output(adminBrandingUploadOutputDto),
}
