import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/api/contracts/public/music'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const musicContract = {
  get: defineProcedure({ method: 'GET', path: '/music/get' }, { publicRead: true })
    .input(musicGetInputSchema)
    .output(musicGetOutputSchema),
}
