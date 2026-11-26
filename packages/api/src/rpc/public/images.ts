import {
  calendarImageInputSchema,
  calendarImageOutputSchema,
  imageResolveThumbhashInputSchema,
  imageResolveThumbhashOutputSchema,
  ogImageInputSchema,
  ogImageOutputSchema,
} from '@kobato/api/contracts/public/images'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const imagesContract = {
  resolveThumbhash: defineProcedure({ method: 'GET', path: '/image/resolve-thumbhash' }, { publicRead: true })
    .input(imageResolveThumbhashInputSchema)
    .output(imageResolveThumbhashOutputSchema),
  og: defineProcedure({ method: 'GET', path: '/images/og' }, { publicRead: true })
    .input(ogImageInputSchema)
    .output(ogImageOutputSchema),
  calendar: defineProcedure({ method: 'GET', path: '/images/calendar' }, { publicRead: true })
    .input(calendarImageInputSchema)
    .output(calendarImageOutputSchema),
}
