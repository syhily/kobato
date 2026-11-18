// Self-update service — orchestrates release lookup, gate evaluation,
// and version comparison. The job state machine lives in `job.ts`.

import type { UpdateCheckResult } from '@kobato/contracts/update.ts'

import { APP_VERSION } from '@kobato/distribution/app.ts'
import { startUpdateJob } from '@kobato/server/domains/update/job.ts'
import { fetchLatestRelease } from '@kobato/server/domains/update/release.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { evaluateSelfUpdateGate } from '@kobato/server/infra/self-update-gate.ts'

// Semver-lite: numeric `x.y.z` triples, pre-release suffixes ignored.
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
    reasons: gate.reasonDescriptors,
  }
}

export async function applyUpdate(): Promise<{ fromVersion: string; toVersion: string }> {
  // Re-check at apply time: the UI's earlier `check` result may be stale.
  const check = await checkForUpdate()
  if (!check.updateAvailable) {
    throw new DomainError('CONFLICT', descriptorFor('update.error.alreadyLatest'))
  }
  if (!check.canSelfUpdate) {
    // The summary stays one typed message; each refusal rides `issues` so the
    // transport folds in the locale's own separator and wording.
    throw new DomainError('FORBIDDEN', descriptorFor('update.error.gateBlocked'), check.reasons)
  }
  startUpdateJob(check.tagName)
  return { fromVersion: check.currentVersion, toVersion: check.latestVersion }
}
