import { imageResolveThumbhashInputSchema, imageResolveThumbhashOutputSchema } from '@kobato/contracts/images.ts'
import { oc } from '@orpc/contract'

// The image RPC contract — the public thumbhash/dimensions resolver.
export const imageContract = {
  resolveThumbhash: oc
    .route({ method: 'GET', path: '/image/resolve-thumbhash' })
    .input(imageResolveThumbhashInputSchema)
    .output(imageResolveThumbhashOutputSchema),
}
