import { purgeExpired } from '@kobato/server/domains/auth/verification-tokens.ts'
import { jobDb, registerJob } from '@kobato/server/infra/job-registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { nextDailyMaintenanceDelayMs } from '@kobato/server/infra/scheduler-utils.ts'

const log = getLogger('auth.token-purge')

// Purges verification rows expired for over a day, riding the shared 04:30 maintenance slot.

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
