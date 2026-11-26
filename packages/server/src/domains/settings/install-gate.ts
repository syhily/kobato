import type { Database } from '@kobato/db/sqlite/database'

import { hasAdmin } from '@kobato/db/sqlite/operations/identity/user'

export type InstallState = 'noAdmin' | 'installed'

export async function getInstallState(db: Database): Promise<InstallState> {
  if (!(await hasAdmin(db))) {
    return 'noAdmin'
  }
  return 'installed'
}
