import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/api/contracts/public/github'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const githubContract = {
  avatar: defineProcedure({ method: 'GET', path: '/github/avatar' }, { publicRead: true }).output(
    githubAvatarOutputSchema,
  ),
  release: defineProcedure({ method: 'GET', path: '/github/release' }, { publicRead: true }).output(
    githubReleaseOutputSchema,
  ),
}
