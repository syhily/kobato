import {
  adminGeoipStatusInput,
  adminGeoipStatusOutputDto,
  adminGeoipUpdateInput,
  adminGeoipUpdateOutputDto,
} from '@kobato/contracts/geoip.ts'
import { oc } from '@orpc/contract'

// Admin GeoIP RPC contract — admin base on the server.
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
