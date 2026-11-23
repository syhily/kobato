import {
  MAXMIND_MAX_BYTES,
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
  adminGeoipUploadInput,
  adminGeoipUploadOutputDto,
} from '@kobato/api/contracts/admin/geoip'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminGeoipContract = {
  status: defineProcedure({ method: 'GET', path: '/admin/geoip/status' })
    .input(adminGeoipStatusInput)
    .output(adminGeoipStatusOutputDto),
  update: defineProcedure({ method: 'POST', path: '/admin/geoip/update' })
    .input(adminGeoipUpdateInput)
    .output(adminGeoipUpdateOutputDto),
  upload: defineProcedure(
    { method: 'POST', path: '/admin/maxmind/upload' },
    { requestBodyLimit: { maxBytes: MAXMIND_MAX_BYTES, messageKey: 'common.error.uploadTooLarge' } },
  )
    .input(adminGeoipUploadInput)
    .output(adminGeoipUploadOutputDto),
}
