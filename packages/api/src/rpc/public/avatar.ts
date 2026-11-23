import { avatarFindInputSchema, avatarFindOutputSchema } from '@kobato/api/contracts/public/avatar'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const avatarContract = {
  find: defineProcedure({ method: 'GET', path: '/avatar/find' }, { publicRead: true })
    .input(avatarFindInputSchema)
    .output(avatarFindOutputSchema),
}
