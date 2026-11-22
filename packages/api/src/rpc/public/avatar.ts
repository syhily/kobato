import { avatarFindInputSchema, avatarFindOutputSchema } from '@kobato/api/contracts/comments'
import { oc } from '@orpc/contract'

export const avatarContract = {
  find: oc.route({ method: 'GET', path: '/avatar/find' }).input(avatarFindInputSchema).output(avatarFindOutputSchema),
}
