import { brandingAssetInputSchema, brandingAssetOutputSchema } from '@kobato/api/contracts/public/branding'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const brandingContract = {
  asset: defineProcedure({ method: 'GET', path: '/branding/asset' }, { publicRead: true, installGateExempt: true })
    .input(brandingAssetInputSchema)
    .output(brandingAssetOutputSchema),
}
