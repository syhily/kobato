import {
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
} from '@kobato/api/contracts/geoip'
import { oc } from '@orpc/contract'

export const adminGeoipContract = {
  status: oc
    .route({ method: 'GET', path: '/admin/geoip/status' })
    .input(adminGeoipStatusInput)
    .output(adminGeoipStatusOutputDto),
  update: oc
    .route({ method: 'POST', path: '/admin/geoip/update' })
    .input(adminGeoipUpdateInput)
    .output(adminGeoipUpdateOutputDto),
}
