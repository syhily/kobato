import { embeddedFontInputSchema, embeddedFontOutputSchema } from '@kobato/api/contracts/public/fonts'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const fontsContract = {
  embedded: defineProcedure({ method: 'GET', path: '/fonts/embedded' }, { publicRead: true })
    .input(embeddedFontInputSchema)
    .output(embeddedFontOutputSchema),
}
