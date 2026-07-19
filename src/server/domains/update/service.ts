// Self-update service — the interface the admin procedures mount
// (plan 090). Orchestration only: release lookup + gate evaluation +
// version comparison live in their own modules; the job state machine
// lives in `job.ts`.

import type { UpdateCheckResult, UpdateJobStatus } from '@/shared/types/update'

import { evaluateSelfUpdateGate } from '@/server/domains/update/gate'
import { getUpdateJobStatus as readUpdateJobStatus, startUpdateJob } from '@/server/domains/update/job'
import { fetchLatestRelease } from '@/server/domains/update/release'
import { isNewerVersion } from '@/server/domains/update/version'
import { DomainError } from '@/server/infra/http/errors'
import { APP_VERSION } from '@/shared/config/version'

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const gate = evaluateSelfUpdateGate()
  const release = await fetchLatestRelease()
  return {
    currentVersion: APP_VERSION,
    latestVersion: release.tagName.replace(/^v/, ''),
    tagName: release.tagName,
    htmlUrl: release.htmlUrl,
    updateAvailable: isNewerVersion(release.tagName, APP_VERSION),
    canSelfUpdate: gate.canSelfUpdate,
    reasons: gate.reasons,
  }
}

export async function applyUpdate(): Promise<{ fromVersion: string; toVersion: string }> {
  // Re-check at apply time: the UI's earlier `check` result may be stale.
  const check = await checkForUpdate()
  if (!check.updateAvailable) {
    throw new DomainError('CONFLICT', '当前已是最新版本')
  }
  if (!check.canSelfUpdate) {
    throw new DomainError('FORBIDDEN', check.reasons.join('；'))
  }
  startUpdateJob(check.tagName)
  return { fromVersion: check.currentVersion, toVersion: check.latestVersion }
}

export function getUpdateJobStatus(): UpdateJobStatus {
  return readUpdateJobStatus()
}
