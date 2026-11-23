import {
  imageResolveThumbhashInputSchema,
  imageResolveThumbhashOutputSchema,
} from '@kobato/api/contracts/public/images'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const imagesContract = {
  resolveThumbhash: defineProcedure({ method: 'GET', path: '/image/resolve-thumbhash' }, { publicRead: true })
    .input(imageResolveThumbhashInputSchema)
    .output(imageResolveThumbhashOutputSchema),
}
