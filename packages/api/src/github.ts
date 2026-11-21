import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/contracts/github'
import { oc } from '@orpc/contract'

export const githubContract = {
  avatar: oc.route({ method: 'GET', path: '/github/avatar' }).output(githubAvatarOutputSchema),
  release: oc.route({ method: 'GET', path: '/github/release' }).output(githubReleaseOutputSchema),
}
