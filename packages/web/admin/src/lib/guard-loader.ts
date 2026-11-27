import type { Role } from '@kobato/auth/roles'

import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'

interface GuardLoaderArgs {
  request: Request
}

export function guardLoader(min: Role): (args: GuardLoaderArgs) => Promise<null> {
  return async ({ request }: GuardLoaderArgs): Promise<null> => {
    const boot = await awaitRootBootstrap()
    requireRoleFromBootstrap(boot, min, { pathname: new URL(request.url).pathname })
    return null
  }
}
