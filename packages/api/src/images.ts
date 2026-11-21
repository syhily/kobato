import { imageResolveThumbhashInputSchema, imageResolveThumbhashOutputSchema } from '@kobato/contracts/images'
import { oc } from '@orpc/contract'

export const imagesContract = {
  resolveThumbhash: oc
    .route({ method: 'GET', path: '/image/resolve-thumbhash' })
    .input(imageResolveThumbhashInputSchema)
    .output(imageResolveThumbhashOutputSchema),
}
