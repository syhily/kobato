import { purgeExpired } from '@/server/domains/auth/verification-tokens'
import { jobDb, registerJob } from '@/server/infra/job-registry'
import { getLogger } from '@/server/infra/logger'
import { nextDailyMaintenanceDelayMs } from '@/server/infra/scheduler-utils'

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
