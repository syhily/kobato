import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/contracts/music'
import { oc } from '@orpc/contract'

export const musicContract = {
  get: oc.route({ method: 'GET', path: '/music/get' }).input(musicGetInputSchema).output(musicGetOutputSchema),
}
