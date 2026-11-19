import { musicGetInputSchema, musicGetOutputSchema } from '@kobato/contracts/music.ts'
import { oc } from '@orpc/contract'

export const musicContract = {
  get: oc.route({ method: 'GET', path: '/music/get' }).input(musicGetInputSchema).output(musicGetOutputSchema),
}
