import { avatarFindInputSchema, avatarFindOutputSchema } from '@kobato/contracts/comments.ts'
import { oc } from '@orpc/contract'

export const avatarContract = {
  find: oc.route({ method: 'GET', path: '/avatar/find' }).input(avatarFindInputSchema).output(avatarFindOutputSchema),
}
