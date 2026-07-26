// Self-update service — orchestrates release lookup, gate evaluation,
// and version comparison. The job state machine lives in `job.ts`.

import type { UpdateCheckResult } from '@/shared/contracts/update'

import { evaluateSelfUpdateGate } from '@/server/domains/update/gate'
import { startUpdateJob } from '@/server/domains/update/job'
import { fetchLatestRelease } from '@/server/domains/update/release'
import { DomainError } from '@/server/infra/http/errors'
import { APP_VERSION } from '@/shared/config/version'

// Semver-lite comparison: strips a leading `v`, compares numeric `x.y.z`
// triples; pre-release suffixes are ignored.
function parseTriple(version: string): [number, number, number] {
  const core = version.replace(/^v/, '').split('-', 2)[0] ?? ''
  const parts = core.split('.')
  const nums: number[] = []
  for (let i = 0; i < 3; i++) {
    const n = Number.parseInt(parts[i] ?? '', 10)
    nums.push(Number.isNaN(n) ? 0 : n)
  }
  return [nums[0]!, nums[1]!, nums[2]!]
}

export function isNewerVersion(latest: string, current: string): boolean {
  const [lx, ly, lz] = parseTriple(latest)
  const [cx, cy, cz] = parseTriple(current)
  if (lx !== cx) {
    return lx > cx
  }
  if (ly !== cy) {
    return ly > cy
  }
  return lz > cz
}

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
