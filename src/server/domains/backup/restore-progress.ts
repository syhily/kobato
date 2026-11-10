import type { RestoreProgressDto } from '@/shared/types/backup'

import { peekRestoreJobPhase } from '@/server/domains/backup/restore-machine'

/**
 * Pre-claim staging progress (decrypt / extract), merged with the restore
 * machine's post-claim phases by the restore-progress endpoint. Staging runs
 * BEFORE the slot is claimed, so the machine cannot report it. A single active
 * slot: a concurrent staging goes unreported (`beginStagingProgress` = false)
 * rather than interleaving meaningless percentages.
 */

interface StagingProgress {
  stage: 'decrypting' | 'extracting'
  doneBytes: number
  totalBytes: number | null
}

let claimed = false
let staging: StagingProgress | null = null

/** Claim the staging slot; false when another staging owns it. */
export function beginStagingProgress(): boolean {
  if (claimed) {
    return false
  }
  claimed = true
  staging = null
  return true
}

/** Report a byte total for the current leg. */
export function reportStagingProgress(
  stage: 'decrypting' | 'extracting',
  doneBytes: number,
  totalBytes: number | null,
): void {
  if (!claimed) {
    return
  }
  staging = { stage, doneBytes, totalBytes }
}

export function endStagingProgress(): void {
  claimed = false
  staging = null
}

/** Test seam: drop in-flight staging state between cases. */
export function resetStagingProgress(): void {
  endStagingProgress()
}

/** Non-consuming merged read: staging first (pre-claim), then the machine's
 *  running/terminal phase (peeked, so polling never eats the one-shot report). */
export function peekRestoreProgress(): RestoreProgressDto {
  if (staging !== null) {
    const percent =
      staging.totalBytes !== null && staging.totalBytes > 0
        ? Math.min(99, Math.round((staging.doneBytes / staging.totalBytes) * 100))
        : null
    return { stage: staging.stage, percent }
  }
  const machine = peekRestoreJobPhase()
  if (machine.phase === 'idle') {
    return { stage: 'idle', percent: null }
  }
  return { stage: machine.phase, percent: null, error: machine.error }
}
