import {
  avatarFindInputSchema,
  avatarFindOutputSchema,
  avatarImageInputSchema,
  avatarImageOutputSchema,
} from '@kobato/api/contracts/public/avatar'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const avatarContract = {
  find: defineProcedure({ method: 'GET', path: '/avatar/find' }, { publicRead: true })
    .input(avatarFindInputSchema)
    .output(avatarFindOutputSchema),
  image: defineProcedure({ method: 'GET', path: '/images/avatar' }, { publicRead: true })
    .input(avatarImageInputSchema)
    .output(avatarImageOutputSchema),
}
