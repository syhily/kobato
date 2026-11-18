import { githubAvatarOutputSchema, githubReleaseOutputSchema } from '@kobato/contracts/github.ts'
import { oc } from '@orpc/contract'

// The github RPC contract — version-badge surface over the upstream repository.
export const githubContract = {
  avatar: oc.route({ method: 'GET', path: '/github/avatar' }).output(githubAvatarOutputSchema),
  release: oc.route({ method: 'GET', path: '/github/release' }).output(githubReleaseOutputSchema),
}
