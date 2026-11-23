import {
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
} from '@kobato/api/contracts/admin/geoip'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminGeoipContract = {
  status: defineProcedure({ method: 'GET', path: '/admin/geoip/status' })
    .input(adminGeoipStatusInput)
    .output(adminGeoipStatusOutputDto),
  update: defineProcedure({ method: 'POST', path: '/admin/geoip/update' })
    .input(adminGeoipUpdateInput)
    .output(adminGeoipUpdateOutputDto),
}
