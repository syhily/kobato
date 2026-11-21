import { purgeExpired } from '@kobato/server/domains/auth/verification-tokens'
import { jobDb, registerJob } from '@kobato/server/infra/job-registry'
import { getLogger } from '@kobato/server/infra/logger'
import { nextDailyMaintenanceDelayMs } from '@kobato/server/infra/scheduler-utils'

const log = getLogger('auth.token-purge')

registerJob({
  name: 'auth.token-purge',
  task: { key: 'token-purge', recordHistory: true },
  nextDelayMs: nextDailyMaintenanceDelayMs,
  run: async () => {
    const deleted = await purgeExpired(jobDb())
    if (deleted > 0) {
      log.info('purged expired verification tokens', { deleted })
    }
  },
})
